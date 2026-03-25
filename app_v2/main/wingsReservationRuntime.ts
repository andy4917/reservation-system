import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import {
  fetchWithProviderSession,
  getProviderBrowserStorageSnapshot,
  getProviderSessionCookies
} from "./providerWorkspaceManager.js";
import { runWithRuntimeGlobalsExclusive } from "./runtimeExclusive.js";
import { buildStableWingsRuntimeCacheKey } from "./runtimeSafety.js";

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

interface RuntimeAuthBundle {
  cookies: SessionCookie[];
  cookieHeader: string;
  csrfToken: string;
  authorization: string;
  role: string;
  sourceHost: string;
  capturedAt: string;
}

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const runtimeScriptRelativePaths = [
  "src/constants.js",
  "src/scan/normalize.js",
  "src/pms/wings.adapter.js",
  "src/engine/rules.js",
  "src/io/pms.fetch.js",
];

let cachedModules: { normalize: any; pmsFetch: any } | null = null;
let cachedConfigKey = "";
let cachedRuntimeAssetRoot: string | null = null;
let cachedConfigState: {
  source: string;
  syncConfig: Record<string, unknown> | null;
  configuredBranches: string[];
  errors: string[];
} | null = null;

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function buildCookieHeader(cookies: SessionCookie[]) {
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}

function inferCsrfTokenFromCookies(cookies: SessionCookie[]) {
  for (const cookie of cookies) {
    const name = normalizeText(cookie.name).toLowerCase();
    if (name.includes("csrf") || name.includes("xsrf")) {
      return normalizeText(cookie.value);
    }
  }
  return "";
}

function normalizeBearerToken(value: unknown) {
  return normalizeText(value).replace(/^Bearer\s+/i, "").trim();
}

function detectRuntimeAssetRoot() {
  if (cachedRuntimeAssetRoot) return cachedRuntimeAssetRoot;
  // Resolve from module path first, then resources root; this keeps runtime imports working in dev, portable, and asar installs.
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
  return runtimeScriptRelativePaths.map((relativePath) => path.join(assetRoot, relativePath));
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
      if (/token|auth|jwt|bearer|access|refresh/i.test(key)) {
        collectJwtCandidates(item, bucket, depth + 1);
      }
    }
    for (const item of Object.values(value)) {
      collectJwtCandidates(item, bucket, depth + 1);
    }
  }
}

function resolveBearerToken(snapshot: StorageSnapshot) {
  const bucket = new Set<string>();
  for (const entry of [...snapshot.localStorage, ...snapshot.sessionStorage]) {
    collectJwtCandidates(entry.value, bucket);
  }
  return normalizeBearerToken([...bucket][0] || "");
}

function loadScript(filePath: string) {
  const code = fs.readFileSync(filePath, "utf8");
  vm.runInThisContext(code, { filename: filePath });
}

function loadWingsRuntimeModules() {
  if (cachedModules) return cachedModules;
  const runtimeGlobal = globalThis as Record<string, any>;
  runtimeGlobal.App = runtimeGlobal.App || {};
  for (const filePath of buildRuntimeScriptPaths()) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Wings runtime script not found: ${filePath}`);
    }
    loadScript(filePath);
  }
  const normalize = runtimeGlobal.App?.scan?.normalize;
  const pmsFetch = runtimeGlobal.App?.io?.pmsFetch;
  if (!normalize?.sanitizeSyncConfig || !normalize?.convertHarToWingsPmsConfig) {
    throw new Error("Wings normalize runtime is not available.");
  }
  if (!pmsFetch?.fetchProviderReservations) {
    throw new Error("Wings PMS fetch runtime is not available.");
  }
  cachedModules = { normalize, pmsFetch };
  return cachedModules;
}

function readJsonObjectFromEnv(name: string) {
  const raw = normalizeText(process.env[name]);
  if (!raw) return null;
  const parsed = JSON.parse(raw);
  return isRecord(parsed) ? parsed : null;
}

function readJsonObjectFromFileEnv(name: string) {
  const filePath = normalizeText(process.env[name]);
  if (!filePath) return null;
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw);
  return isRecord(parsed) ? parsed : null;
}

async function buildRuntimeAuthBundle(): Promise<RuntimeAuthBundle | null> {
  const [cookies, storageSnapshot] = await Promise.all([
    getProviderSessionCookies("wings-pms"),
    getProviderBrowserStorageSnapshot("wings-pms"),
  ]);
  const cookieHeader = buildCookieHeader(cookies);
  const csrfToken = inferCsrfTokenFromCookies(cookies);
  const bearerToken = resolveBearerToken(storageSnapshot);
  if (!cookieHeader && !bearerToken) return null;
  return {
    cookies,
    cookieHeader,
    csrfToken,
    authorization: bearerToken ? `Bearer ${bearerToken}` : "",
    role: "",
    sourceHost: "pms.sanhait.com",
    capturedAt: new Date().toISOString(),
  };
}

function mergePmsAuthBundle(baseBundle: unknown, authBundle: RuntimeAuthBundle | null) {
  const base = isRecord(baseBundle) ? baseBundle : {};
  const auth = authBundle || null;
  return {
    ...base,
    cookies: auth?.cookies || (Array.isArray(base.cookies) ? base.cookies : []),
    cookieHeader: normalizeText(auth?.cookieHeader || base.cookieHeader),
    csrfToken: normalizeText(auth?.csrfToken || base.csrfToken),
    authorization: normalizeText(auth?.authorization || base.authorization),
    role: normalizeText(auth?.role || base.role),
    sourceHost: normalizeText(auth?.sourceHost || base.sourceHost),
    capturedAt: normalizeText(auth?.capturedAt || base.capturedAt),
  };
}

function collectHarBranchEntriesFromEnv() {
  const configured = readJsonObjectFromEnv("UHS_WINGS_HAR_BRANCHES_JSON");
  if (configured && Array.isArray(configured.branches)) {
    return configured.branches
      .filter((entry) => isRecord(entry))
      .map((entry) => ({
        branch: normalizeText(entry.branch || entry.name || entry.branchName),
        harPath: normalizeText(entry.harPath || entry.path || entry.file),
      }))
      .filter((entry) => entry.branch && entry.harPath);
  }
  return [
    { branch: "GANGNAM", harPath: normalizeText(process.env.UHS_WINGS_HAR_GANGNAM) },
    { branch: "COEX", harPath: normalizeText(process.env.UHS_WINGS_HAR_COEX) },
  ].filter((entry) => entry.branch && entry.harPath);
}

function getExistingHarPath(candidates: string[]) {
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  return "";
}

function buildDefaultHarDirectoryCandidates() {
  const homeDir = normalizeText(process.env.USERPROFILE || process.env.HOME);
  if (!homeDir) return [];
  return [
    path.join(homeDir, "OneDrive", "Desktop"),
    path.join(homeDir, "OneDrive", "바탕 화면"),
    path.join(homeDir, "Desktop"),
    path.join(homeDir, "바탕 화면"),
  ];
}

function collectHarBranchEntriesFromDefaults() {
  const directories = buildDefaultHarDirectoryCandidates();
  if (directories.length === 0) return [];
  return [
    {
      branch: "GANGNAM",
      harPath: getExistingHarPath(directories.map((directory) => path.join(directory, "pms.sanhait.com.ACCOUNT gangnam.har"))),
    },
    {
      branch: "COEX",
      harPath: getExistingHarPath(directories.map((directory) => path.join(directory, "pms.sanhait.com.ACCOUNT coex.har"))),
    },
  ].filter((entry) => entry.branch && entry.harPath);
}

async function getConfigCacheKey() {
  const runtimeAuthBundle = await buildRuntimeAuthBundle();
  return buildStableWingsRuntimeCacheKey({
    sync: normalizeText(process.env.UHS_WINGS_SYNC_CONFIG_JSON),
    harBranches: normalizeText(process.env.UHS_WINGS_HAR_BRANCHES_JSON),
    gangnamHar: normalizeText(process.env.UHS_WINGS_HAR_GANGNAM),
    coexHar: normalizeText(process.env.UHS_WINGS_HAR_COEX),
    authBundle: runtimeAuthBundle,
  });
}

async function loadWingsRuntimeConfig() {
  const cacheKey = await getConfigCacheKey();
  if (cachedConfigState && cachedConfigKey === cacheKey) return cachedConfigState;

  const { normalize } = loadWingsRuntimeModules();
  const directConfig = readJsonObjectFromEnv("UHS_WINGS_SYNC_CONFIG_JSON") || readJsonObjectFromFileEnv("UHS_WINGS_SYNC_CONFIG_PATH");
  const runtimeAuthBundle = await buildRuntimeAuthBundle();
  if (directConfig) {
    const sanitized = normalize.sanitizeSyncConfig(directConfig);
    if (runtimeAuthBundle && Array.isArray(sanitized.pmsBranchProfiles)) {
      sanitized.pmsBranchProfiles = sanitized.pmsBranchProfiles.map((profile: unknown) => {
        if (!isRecord(profile)) return profile;
        return {
          ...profile,
          pmsAuthBundle: mergePmsAuthBundle(profile.pmsAuthBundle, runtimeAuthBundle),
        };
      });
    }
    cachedConfigKey = cacheKey;
    cachedConfigState = {
      source: runtimeAuthBundle ? "app-provider-browser" : "env-json",
      syncConfig: sanitized,
      configuredBranches: Array.isArray(sanitized.pmsBranchProfiles)
        ? sanitized.pmsBranchProfiles
            .filter((entry: unknown) => isRecord(entry))
            .map((entry: Record<string, unknown>) => normalizeText(entry.branch || entry.branchName || entry.branchKey))
            .filter(Boolean)
        : [],
      errors: [],
    };
    return cachedConfigState;
  }

  const resolvedHarEntries = collectHarBranchEntriesFromEnv();
  const harEntries = resolvedHarEntries.length > 0 ? resolvedHarEntries : collectHarBranchEntriesFromDefaults();
  const profiles: Array<Record<string, unknown>> = [];
  const errors: string[] = [];
  for (const { branch, harPath } of harEntries) {
    if (!fs.existsSync(harPath)) {
      errors.push(`HAR not found for ${branch}: ${harPath}`);
      continue;
    }
    try {
      const rawHar = fs.readFileSync(harPath, "utf8");
      const converted = normalize.convertHarToWingsPmsConfig(rawHar);
      if (!converted?.url || !converted?.bundle) {
        errors.push(`HAR conversion did not produce a read-only request for ${branch}: ${harPath}`);
        continue;
      }
      profiles.push({
        branch,
        pmsReservationUrl: converted.url,
        pmsPreset: isRecord(converted.preset) ? converted.preset : {},
        pmsAuthBundle: mergePmsAuthBundle(converted.bundle, runtimeAuthBundle),
      });
    } catch (error) {
      errors.push(`Failed to load ${branch} HAR: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  cachedConfigKey = cacheKey;
  cachedConfigState = {
    source: profiles.length > 0 ? (runtimeAuthBundle ? "app-provider-browser" : "har-env") : "unconfigured",
    syncConfig: profiles.length > 0 ? normalize.sanitizeSyncConfig({ pmsBranchProfiles: profiles }) : null,
    configuredBranches: profiles.map((profile) => normalizeText(profile.branch)).filter(Boolean),
    errors,
  };
  return cachedConfigState;
}

export async function fetchWingsReservations(query: Record<string, unknown>) {
  return runWithRuntimeGlobalsExclusive(async () => {
    const { pmsFetch } = loadWingsRuntimeModules();
    const runtimeConfig = await loadWingsRuntimeConfig();
    const originalFetch = globalThis.fetch;
    const branchHint = normalizeText(query?.branch);
    globalThis.fetch = ((input: string | URL, init?: Record<string, unknown>) =>
      fetchWithProviderSession("wings-pms", input, init, branchHint === "COEX" || branchHint === "GANGNAM" ? branchHint : undefined)) as typeof fetch;
    try {
      return await pmsFetch.fetchProviderReservations("wings-pms", query, runtimeConfig.syncConfig);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
}
