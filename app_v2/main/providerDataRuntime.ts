import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import type { AppProvider } from "../../src/desktop/app-v2-contracts.js";
import {
  fetchWithProviderPageContext,
  fetchWithProviderSession,
  getProviderBrowserState,
  getProviderBrowserStorageSnapshot,
  getProviderSessionCookies,
} from "./providerWorkspaceManager.js";
import type { ProviderSourceAccessProvider, ProviderSourceAccessState } from "./providerSourceReadiness.js";
import { runWithRuntimeGlobalsExclusive } from "./runtimeExclusive.js";

type ProviderDataRuntimeProvider = ProviderSourceAccessProvider;

interface StorageEntry {
  key: string;
  value: string;
}

interface StorageSnapshot {
  localStorage: StorageEntry[];
  sessionStorage: StorageEntry[];
}

interface SessionCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite: string;
  session: boolean;
  url: string;
}

interface ProviderSessionMaterial {
  provider: ProviderDataRuntimeProvider;
  source: string;
  contextUrl: string | null;
  cookies: SessionCookie[];
  cookieHeader: string;
  csrfToken: string;
  role: string;
  authorization: string;
  accessToken: string;
  sessionAvailable: boolean;
  storageSnapshot: StorageSnapshot;
  sessionSignals: string[];
}

interface NaverRoleResolution {
  role: string;
  confidence: "certain" | "uncertain";
  source: string;
  notes: string[];
}

interface StationTokenResolution {
  token: string;
  confidence: "certain" | "uncertain";
  source: string;
  notes: string[];
}

const PROVIDER_RUNTIME_PROVIDERS: ProviderDataRuntimeProvider[] = ["naver-partner", "admin-station"];
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const runtimeScriptPaths = [
  "src/constants.js",
  "src/scan/normalize.js",
  "src/report/report.format.js",
  "src/engine/rules.js",
  "src/pms/wings.adapter.js",
  "src/io/pms.fetch.js",
];

let cachedModules: { normalize: any; pmsFetch: any } | null = null;
let cachedAuthFingerprint = "";
let cachedRuntimeAssetRoot: string | null = null;

function detectRuntimeAssetRoot() {
  if (cachedRuntimeAssetRoot) return cachedRuntimeAssetRoot;
  // App code can run from source, portable build, or electron-builder asar root.
  // Resolve from the module directory outward so runtime scripts are found by package layout.
  const candidateRoots = [path.resolve(currentDir, "..", "..", "..")];
  if (process.resourcesPath) candidateRoots.push(path.resolve(process.resourcesPath));

  for (const root of candidateRoots) {
    if (fs.existsSync(path.join(root, "src", "constants.js")) && fs.existsSync(path.join(root, "src", "io", "pms.fetch.js"))) {
      cachedRuntimeAssetRoot = root;
      return cachedRuntimeAssetRoot;
    }
  }

  cachedRuntimeAssetRoot = candidateRoots[0];
  return cachedRuntimeAssetRoot;
}

function buildRuntimeScriptPaths() {
  const assetRoot = detectRuntimeAssetRoot();
  return runtimeScriptPaths.map((relativePath) => path.join(assetRoot, relativePath));
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeBearerToken(value: unknown) {
  return normalizeText(value).replace(/^Bearer\s+/i, "").trim();
}

function buildStorageStub() {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    key(index: number) {
      return [...store.keys()][index] || null;
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key) || null : null;
    },
    setItem(key: string, value: string) {
      store.set(String(key), String(value));
    },
    removeItem(key: string) {
      store.delete(String(key));
    },
    clear() {
      store.clear();
    },
  };
}

function hydrateStorage(storage: ReturnType<typeof buildStorageStub>, entries: StorageEntry[]) {
  storage.clear();
  for (const entry of entries) {
    storage.setItem(entry.key, entry.value);
  }
}

function ensureGlobals() {
  const runtimeGlobal = globalThis as Record<string, unknown>;
  if (!runtimeGlobal.window) {
    runtimeGlobal.window = {
      localStorage: buildStorageStub(),
      sessionStorage: buildStorageStub(),
    };
  }
  const windowObject = runtimeGlobal.window as {
    localStorage?: ReturnType<typeof buildStorageStub>;
    sessionStorage?: ReturnType<typeof buildStorageStub>;
  };
  if (!windowObject.localStorage) windowObject.localStorage = buildStorageStub();
  if (!windowObject.sessionStorage) windowObject.sessionStorage = buildStorageStub();
}

function hydrateRuntimeGlobals(provider: ProviderDataRuntimeProvider, contextUrl: string | null, snapshot: StorageSnapshot) {
  ensureGlobals();
  const runtimeGlobal = globalThis as Record<string, unknown>;
  const windowObject = runtimeGlobal.window as {
    localStorage: ReturnType<typeof buildStorageStub>;
    sessionStorage: ReturnType<typeof buildStorageStub>;
  };
  hydrateStorage(windowObject.localStorage, snapshot.localStorage);
  hydrateStorage(windowObject.sessionStorage, snapshot.sessionStorage);

  const fallbackUrl =
    provider === "naver-partner" ? "https://partner.booking.naver.com/" : "https://admin.admin-stationbyuhc.com/";
  const nextUrl = normalizeText(contextUrl) || fallbackUrl;
  const url = new URL(nextUrl);
  runtimeGlobal.location = {
    host: url.host,
    href: url.toString(),
    pathname: url.pathname,
    hash: url.hash,
    search: url.search,
  };
}

function loadScript(filePath: string) {
  const code = fs.readFileSync(filePath, "utf8");
  vm.runInThisContext(code, { filename: filePath });
}

function loadProviderRuntimeModules() {
  if (cachedModules) return cachedModules;
  ensureGlobals();
  const runtimeGlobal = globalThis as Record<string, any>;
  runtimeGlobal.App = runtimeGlobal.App || {};
  for (const filePath of buildRuntimeScriptPaths()) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Provider runtime script not found: ${filePath}`);
    }
    loadScript(filePath);
  }
  const normalize = runtimeGlobal.App?.scan?.normalize;
  const pmsFetch = runtimeGlobal.App?.io?.pmsFetch;
  if (!normalize || !pmsFetch?.fetchProviderRows) {
    throw new Error("Provider runtime is not available.");
  }
  cachedModules = { normalize, pmsFetch };
  return cachedModules;
}

function buildCookieHeaderFromCookies(cookies: SessionCookie[]) {
  return cookies
    .map((cookie) => {
      const name = normalizeText(cookie.name);
      if (!name) return "";
      return `${name}=${String(cookie.value ?? "")}`;
    })
    .filter(Boolean)
    .join("; ");
}

function inferCsrfTokenFromCookies(cookies: SessionCookie[]) {
  const preferred = ["x-csrf-token", "xsrf-token", "csrf-token", "csrf_token", "csrftoken", "xsrftoken"];
  for (const cookie of cookies) {
    const key = normalizeText(cookie.name).toLowerCase();
    if (!key) continue;
    if (preferred.includes(key) || key.includes("csrf") || key.includes("xsrf")) {
      return normalizeText(cookie.value);
    }
  }
  return "";
}

function parseJsonMaybe(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function looksLikeJwt(text: string) {
  return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(text);
}

function parseJwtPayload(token: string) {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  const payloadPart = parts[1] || "";
  if (!payloadPart) return null;
  const padded = payloadPart.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payloadPart.length / 4) * 4, "=");
  try {
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

function collectJwtCandidates(value: unknown, bucket: Set<string>, depth = 0) {
  if (depth > 5 || value === null || value === undefined) return;
  if (typeof value === "string") {
    const text = value.trim();
    if (!text) return;
    const bearer = text.match(/^Bearer\s+(.+)$/i);
    if (bearer?.[1] && looksLikeJwt(bearer[1])) bucket.add(bearer[1].trim());
    if (looksLikeJwt(text)) bucket.add(text);
    const matches = text.match(/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g);
    if (matches) {
      for (const token of matches) {
        if (looksLikeJwt(token)) bucket.add(token.trim());
      }
    }
    const parsed = parseJsonMaybe(text);
    if (parsed !== null) collectJwtCandidates(parsed, bucket, depth + 1);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectJwtCandidates(item, bucket, depth + 1);
    return;
  }
  if (typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (item === null || item === undefined) continue;
      if (/token|auth|jwt|bearer|access|refresh/i.test(key)) {
        collectJwtCandidates(item, bucket, depth + 1);
      }
    }
    for (const item of Object.values(value)) {
      collectJwtCandidates(item, bucket, depth + 1);
    }
  }
}

function collectStorageTokenCandidates(snapshot: StorageSnapshot) {
  const candidates: Array<{ token: string; key: string; sourceName: string }> = [];
  for (const [sourceName, entries] of [
    ["localStorage", snapshot.localStorage],
    ["sessionStorage", snapshot.sessionStorage],
  ] as const) {
    for (const entry of entries) {
      const bucket = new Set<string>();
      collectJwtCandidates(entry.value, bucket);
      for (const token of bucket) {
        candidates.push({ token, key: entry.key, sourceName });
      }
    }
  }
  return candidates;
}

function collectCookieTokenCandidates(cookies: SessionCookie[]) {
  const candidates: Array<{ token: string; key: string; sourceName: string }> = [];
  for (const cookie of cookies) {
    const key = normalizeText(cookie.name).toLowerCase();
    const value = normalizeText(cookie.value);
    if (!key || !value) continue;
    if (!/access|auth|authorization|token|bearer|jwt/i.test(key)) continue;

    const bucket = new Set<string>();
    collectJwtCandidates(value, bucket);
    for (const token of bucket) {
      candidates.push({ token, key: cookie.name, sourceName: `cookie:${cookie.name}` });
    }
    const parsed = parseJsonMaybe(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const tokenFromJson = normalizeText((parsed as { accessToken?: string }).accessToken || (parsed as { token?: string }).token);
      if (tokenFromJson) {
        collectJwtCandidates(tokenFromJson, bucket);
        for (const token of bucket) {
          candidates.push({ token, key: cookie.name, sourceName: `cookie:${cookie.name}:json` });
        }
      }
    }
  }
  return candidates;
}

function scoreTokenCandidate(candidate: { token: string; key: string; sourceName: string }) {
  const hint = `${candidate.sourceName}:${candidate.key}`.toLowerCase();
  let score = 0;
  if (hint.includes("access")) score += 60;
  if (hint.includes("authorization")) score += 50;
  if (hint.includes("auth")) score += 30;
  if (hint.includes("token")) score += 20;
  if (hint.includes("refresh")) score -= 120;

  const payload = parseJwtPayload(candidate.token);
  const exp = Number(payload?.exp);
  if (Number.isFinite(exp)) {
    const nowSec = Math.floor(Date.now() / 1000);
    if (exp > nowSec) score += 120;
    else score -= 300;
  }
  const iat = Number(payload?.iat);
  if (Number.isFinite(iat) && Number.isFinite(exp) && exp > iat) {
    const ttl = exp - iat;
    if (ttl >= 60 * 60 * 24 * 25) score -= 40;
    if (ttl <= 60 * 60 * 24 * 21) score += 20;
  }
  return score;
}

function resolveStationAccessTokenWithSignal(snapshot: StorageSnapshot, cookies: SessionCookie[]): StationTokenResolution {
  const candidates = [
    ...collectStorageTokenCandidates(snapshot).map((candidate) => ({
      ...candidate,
      score: scoreTokenCandidate(candidate),
    })),
    ...collectCookieTokenCandidates(cookies).map((candidate) => ({
      ...candidate,
      score: scoreTokenCandidate(candidate),
    })),
  ];

  if (!candidates.length) {
    return { token: "", confidence: "uncertain", source: "none", notes: ["admin-station-token:missing"] };
  }

  const bestByToken = new Map<string, { token: string; key: string; sourceName: string; score: number }>();
  for (const candidate of candidates) {
    const previous = bestByToken.get(candidate.token);
    if (!previous || candidate.score > previous.score) {
      bestByToken.set(candidate.token, candidate);
    }
  }

  const sorted = [...bestByToken.values()].sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    if (right.sourceName !== left.sourceName) return right.sourceName.localeCompare(left.sourceName);
    return right.key.localeCompare(left.key);
  });

  const winner = sorted[0];
  const runnerUp = sorted[1];
  if (winner.score < 80) {
    return {
      token: "",
      confidence: "uncertain",
      source: `${winner.sourceName}:${winner.key}`,
      notes: [`admin-station-token:low-confidence-${winner.score}`],
    };
  }

  if (runnerUp && winner.score - runnerUp.score < 25) {
    return {
      token: "",
      confidence: "uncertain",
      source: "ambiguous-station-token",
      notes: [
        `admin-station-token:ambiguous:${winner.token}:${winner.score}:${winner.sourceName}->${runnerUp.token}:${runnerUp.score}:${runnerUp.sourceName}`,
      ],
    };
  }

  return {
    token: normalizeBearerToken(winner.token),
    confidence: "certain",
    source: `${winner.sourceName}:${winner.key}`,
    notes: [],
  };
}

function resolveNaverRoleHintWithSignal(snapshot: StorageSnapshot, cookies: SessionCookie[]): NaverRoleResolution {
  const candidates: Array<{ role: string; score: number; source: string }> = [];

  for (const [sourceName, entries] of [
    ["localStorage", snapshot.localStorage],
    ["sessionStorage", snapshot.sessionStorage],
  ] as const) {
    for (const entry of entries) {
      const key = normalizeText(entry.key).toLowerCase();
      const value = normalizeText(entry.value);
      if (!key || !value) continue;
      if (!/user.?role|account.?role|role|permission|authority/i.test(key)) continue;

      const matchFromRaw = value.match(/\b(OWNER|MANAGER|STAFF|ADMIN)\b/i);
      if (matchFromRaw?.[1]) {
        candidates.push({ role: String(matchFromRaw[1]).toUpperCase(), score: 110, source: `${sourceName}:${entry.key}` });
      }
      const parsed = parseJsonMaybe(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const roleFromJson = normalizeText((parsed as { role?: string }).role || (parsed as { userRole?: string }).userRole);
        if (roleFromJson) {
          const matchFromJson = roleFromJson.match(/\b(OWNER|MANAGER|STAFF|ADMIN)\b/i);
          if (matchFromJson?.[1]) {
            candidates.push({
              role: String(matchFromJson[1]).toUpperCase(),
              score: 120,
              source: `${sourceName}:${entry.key}:json`,
            });
          }
        }
      }
    }
  }

  for (const cookie of cookies) {
    const key = normalizeText(cookie.name).toLowerCase();
    const value = normalizeText(cookie.value);
    if (!key || !value) continue;
    if (!/user.?role|account.?role|role|permission|authority/i.test(key)) continue;
    const parsed = parseJsonMaybe(value);
    const values = [value, normalizeText((parsed as { role?: string })?.role), normalizeText((parsed as { userRole?: string })?.userRole)];
    for (const raw of values.filter(Boolean)) {
      const match = String(raw).match(/\b(OWNER|MANAGER|STAFF|ADMIN)\b/i);
      if (match?.[1]) {
        candidates.push({ role: String(match[1]).toUpperCase(), score: 90, source: `cookie:${cookie.name}` });
      }
    }
  }

  if (!candidates.length) {
    return { role: "", confidence: "uncertain", source: "none", notes: ["naver-role:uncertain-no-source"] };
  }

  const best = candidates.sort((left, right) => right.score - left.score)[0];
  if (!best.role) {
    return { role: "", confidence: "uncertain", source: "none", notes: ["naver-role:uncertain-empty"] };
  }
  return { role: best.role, confidence: "certain", source: best.source, notes: [] };
}

async function buildAppProviderSessionMaterial(provider: ProviderDataRuntimeProvider): Promise<ProviderSessionMaterial> {
  const [browserState, cookies, storageSnapshot] = await Promise.all([
    getProviderBrowserState(provider),
    getProviderSessionCookies(provider),
    getProviderBrowserStorageSnapshot(provider),
  ]);
  const currentUrl = normalizeText(browserState.currentUrl || "");
  const cookieHeader = buildCookieHeaderFromCookies(cookies);
  if (provider === "naver-partner") {
    const csrfToken = inferCsrfTokenFromCookies(cookies);
    const roleResolution = resolveNaverRoleHintWithSignal(storageSnapshot, cookies);
    let source = roleResolution.confidence === "certain" ? "app-provider-browser" : "app-provider-browser:naver-role-uncertain";
    const role = roleResolution.role;
    const sessionSignals = [...roleResolution.notes];
    if (!cookieHeader) {
      sessionSignals.push("naver-session:missing-cookie-header");
      source = "unconfigured";
    }
    return {
      provider,
      source,
      contextUrl: currentUrl || (cookieHeader ? "https://partner.booking.naver.com/" : null),
      cookies,
      cookieHeader,
      csrfToken,
      role,
      authorization: "",
      accessToken: "",
      sessionAvailable: Boolean(cookieHeader),
      sessionSignals,
      storageSnapshot,
    };
  }

  const tokenResolution = resolveStationAccessTokenWithSignal(storageSnapshot, cookies);
  const accessToken = tokenResolution.token;
  const authorization = accessToken ? `Bearer ${accessToken}` : "";
  return {
    provider,
    source: authorization ? "app-provider-browser" : "unconfigured",
    contextUrl: currentUrl || (authorization ? "https://admin.admin-stationbyuhc.com/" : null),
    cookies,
    cookieHeader,
    csrfToken: "",
    role: "",
    authorization,
    accessToken,
    sessionAvailable: Boolean(authorization) && tokenResolution.confidence === "certain",
    sessionSignals: tokenResolution.confidence === "certain" ? [] : tokenResolution.notes,
    storageSnapshot,
  };
}

async function buildResolvedProviderSessionMap() {
  const entries = await Promise.all(
    PROVIDER_RUNTIME_PROVIDERS.map(async (provider) => [provider, await buildAppProviderSessionMaterial(provider)] as const),
  );
  return Object.fromEntries(entries) as Record<ProviderDataRuntimeProvider, ProviderSessionMaterial>;
}

function buildAuthFingerprint(materials: Record<ProviderDataRuntimeProvider, ProviderSessionMaterial>) {
  return JSON.stringify(
    Object.fromEntries(
      PROVIDER_RUNTIME_PROVIDERS.map((provider) => [
        provider,
        {
          source: materials[provider].source,
          contextUrl: materials[provider].contextUrl,
          cookieHeader: materials[provider].cookieHeader,
          csrfToken: materials[provider].csrfToken,
          role: materials[provider].role,
          authorization: materials[provider].authorization,
        },
      ]),
    ),
  );
}

function applyResolvedAuthBundles(normalizeModule: any, materials: Record<ProviderDataRuntimeProvider, ProviderSessionMaterial>) {
  const runtimeGlobal = globalThis as Record<string, any>;
  runtimeGlobal.App = runtimeGlobal.App || {};
  runtimeGlobal.App.runtime = runtimeGlobal.App.runtime || {};
  const authBundles: Record<string, Record<string, unknown>> = {};

  const naverMaterial = materials["naver-partner"];
  if (naverMaterial?.sessionAvailable) {
    authBundles["naver-partner"] = {
      cookies: naverMaterial.cookies,
      cookieHeader: naverMaterial.cookieHeader,
      csrfToken: naverMaterial.csrfToken,
      role: naverMaterial.role,
      contextUrl: naverMaterial.contextUrl || "",
    };
  }

  const stationMaterial = materials["admin-station"];
  if (stationMaterial?.sessionAvailable) {
    authBundles["admin-station"] = {
      accessToken: stationMaterial.accessToken,
      authorization: stationMaterial.authorization,
      contextUrl: stationMaterial.contextUrl || "",
    };
  }

  runtimeGlobal.App.runtime.syncConfigCache = {
    ...(runtimeGlobal.App.runtime.syncConfigCache || {}),
    authBundles,
  };
  runtimeGlobal.App.scan = runtimeGlobal.App.scan || {};
  runtimeGlobal.App.scan.normalize = runtimeGlobal.App.scan.normalize || normalizeModule;
  runtimeGlobal.App.scan.normalize.createSessionRequestContext = (providerType: ProviderDataRuntimeProvider) => {
    const bundle = authBundles[providerType] || {};
    const sessionContext = {
      async build(_requestUrl: string, init: Record<string, unknown> = {}) {
        const headers: Record<string, string> = {};
        normalizeModule.mergeHeaders(headers, normalizeModule.toPlainHeaders(init.headers));
        const contextUrl = normalizeText(bundle.contextUrl || "");
        const contextOrigin = (() => {
          try {
            return contextUrl ? new URL(contextUrl).origin : "";
          } catch {
            return "";
          }
        })();
        if (contextUrl) headers.Referer = contextUrl;
        if (contextOrigin) headers.Origin = contextOrigin;
        if (providerType === "admin-station") {
          const authorization = normalizeText(bundle.authorization || bundle.accessToken || "");
          if (authorization) {
            headers.Authorization = authorization.startsWith("Bearer ") ? authorization : `Bearer ${authorization}`;
          }
          return { ...init, headers, credentials: "omit" };
        }
        const cookieHeader = normalizeText(bundle.cookieHeader || "") || normalizeModule.buildCookieHeaderFromCookies(bundle.cookies || []);
        if (cookieHeader) headers.Cookie = cookieHeader;
        if (normalizeText(bundle.csrfToken || "")) headers["x-csrf-token"] = normalizeText(bundle.csrfToken || "");
        if (normalizeText(bundle.role || "")) headers["x-booking-naver-role"] = normalizeText(bundle.role || "");
        return { ...init, headers, credentials: "include" };
      },
      async buildVariants(requestUrl: string, init: Record<string, unknown> = {}) {
        return [await sessionContext.build(requestUrl, init)];
      },
    };
    return sessionContext;
  };
}

function ensureFreshProviderRuntimeModules(materials: Record<ProviderDataRuntimeProvider, ProviderSessionMaterial>) {
  const nextFingerprint = buildAuthFingerprint(materials);
  if (!cachedModules || cachedAuthFingerprint !== nextFingerprint) {
    cachedModules = null;
    cachedAuthFingerprint = nextFingerprint;
  }
  const modules = loadProviderRuntimeModules();
  applyResolvedAuthBundles(modules.normalize, materials);
  return modules;
}

export async function readProviderSourceAccessState(
  providerType: ProviderDataRuntimeProvider,
): Promise<ProviderSourceAccessState> {
  const material = await buildAppProviderSessionMaterial(providerType);
  return {
    provider: providerType,
    sessionAvailable: material.sessionAvailable,
    source: material.source,
    sessionSignals: [...(material.sessionSignals || [])],
  };
}

export async function fetchProviderRowsLive(
  providerType: ProviderDataRuntimeProvider,
  query: Record<string, unknown>,
): Promise<{ source: string; rows: unknown[] }> {
  return runWithRuntimeGlobalsExclusive(async () => {
    const resolvedMap = await buildResolvedProviderSessionMap();
    const material = resolvedMap[providerType];
    if (!material.sessionAvailable) {
      const reason = material.sessionSignals?.length ? ` (${material.sessionSignals.join(", ")})` : "";
      throw new Error(`Provider app session is not available for ${providerType}.${reason}`);
    }

    hydrateRuntimeGlobals(providerType, material.contextUrl, material.storageSnapshot);
    const { pmsFetch } = ensureFreshProviderRuntimeModules(resolvedMap);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL, init?: Record<string, unknown>) => {
      try {
        const pageResponse = await fetchWithProviderPageContext(providerType, input, init);
        return {
          ok: pageResponse.ok,
          status: pageResponse.status,
          url: pageResponse.url,
          headers: {
            get(name: string) {
              return String(name).toLowerCase() === "content-type" ? pageResponse.headers.contentType : "";
            }
          },
          async text() {
            return pageResponse.text;
          }
        };
      } catch (_error) {
        return fetchWithProviderSession(providerType, input, init);
      }
    }) as typeof fetch;
    try {
      const rows = await pmsFetch.fetchProviderRows(providerType, query, { readOnly: true });
      return {
        source: material.source,
        rows: Array.isArray(rows) ? rows : [],
      };
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
}
