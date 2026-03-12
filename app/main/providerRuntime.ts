import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { getLatestBridgeAuthBundle, getLatestBridgeContext } from "./bridgeServer.js";

type NormalizeModule = {
  normalizeText: (value: unknown) => string;
  mergeHeaders: (target: Record<string, string>, source: Record<string, string>) => Record<string, string>;
  toPlainHeaders: (input: unknown) => Record<string, string>;
  buildCookieHeaderFromCookies: (cookies: unknown[]) => string;
  createSessionRequestContext?: (providerType: string) => unknown;
};

type PmsFetchModule = {
  fetchProviderRows: (
    providerType: string,
    query: { startDate: string; endDate: string }
  ) => Promise<Array<Record<string, unknown>>>;
};

interface ProviderRuntimeModules {
  normalize: NormalizeModule;
  pmsFetch: PmsFetchModule;
}

interface ProviderRuntimeDiagnostics {
  source: "bridge-auth-bundle" | "unconfigured";
  availableProviders: string[];
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const runtimeScriptPaths = [
  "src/constants.js",
  "src/scan/normalize.js",
  "src/report/report.format.js",
  "src/engine/rules.js",
  "src/pms/wings.adapter.js",
  "src/io/pms.fetch.js"
].map((relativePath) => path.join(repoRoot, relativePath));

let cachedModules: ProviderRuntimeModules | null = null;

function buildStorageStub() {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    key(index: number) {
      return Array.from(store.keys())[index] || null;
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
    }
  };
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function ensureGlobals() {
  const runtimeGlobal = globalThis as typeof globalThis & Record<string, unknown>;
  if (!runtimeGlobal.window) {
    Object.defineProperty(globalThis, "window", {
      value: {
        localStorage: buildStorageStub(),
        sessionStorage: buildStorageStub()
      },
      configurable: true
    });
  }
  if (!runtimeGlobal.location) {
    Object.defineProperty(globalThis, "location", {
      value: {
        host: "partner.booking.naver.com",
        href: "https://partner.booking.naver.com/",
        pathname: "/",
        hash: ""
      },
      configurable: true
    });
  }
  if (!runtimeGlobal.InventoryEntryPolicy) {
    Object.defineProperty(globalThis, "InventoryEntryPolicy", {
      value: {
        detectProviderTypeFromHost(host: unknown) {
          const text = normalizeText(host).toLowerCase();
          if (text.includes("partner.booking.naver.com")) return "naver-partner";
          if (text.includes("admin.admin-stationbyuhc.com")) return "admin-station";
          return "";
        }
      },
      configurable: true
    });
  }
}

function loadScript(filePath: string) {
  const code = fs.readFileSync(filePath, "utf8");
  vm.runInThisContext(code, { filename: filePath });
}

function setLocationForProvider(providerType: string) {
  const current = getLatestBridgeContext(providerType as "naver-partner" | "admin-station" | "wings-pms");
  const fallback =
    providerType === "admin-station"
      ? "https://admin.admin-stationbyuhc.com/admin/branch/18/calendar"
      : "https://partner.booking.naver.com/businesses/1356779";
  const nextUrl = normalizeText(current.url || "") || fallback;
  const url = new URL(nextUrl);
  Object.defineProperty(globalThis, "location", {
    value: {
      host: url.host,
      href: url.toString(),
      pathname: url.pathname,
      hash: url.hash,
      search: url.search
    },
    configurable: true
  });
}

function applyBridgeAuthBundles(normalizeModule: NormalizeModule) {
  const root = globalThis as typeof globalThis & {
    App?: {
      runtime?: Record<string, unknown>;
      scan?: { normalize?: NormalizeModule };
    };
  };
  root.App = root.App || {};
  root.App.runtime = root.App.runtime || {};
  const authBundles: Record<string, unknown> = {};
  const naverBundle = getLatestBridgeAuthBundle("naver-partner");
  const stationBundle = getLatestBridgeAuthBundle("admin-station");
  if (naverBundle) {
    authBundles["naver-partner"] = {
      cookies: Array.isArray(naverBundle.cookies) ? naverBundle.cookies : [],
      cookieHeader: normalizeText(naverBundle.material?.cookieHeader || ""),
      csrfToken: normalizeText(naverBundle.material?.csrfToken || ""),
      role: normalizeText(naverBundle.material?.role || "")
    };
  }
  if (stationBundle) {
    authBundles["admin-station"] = {
      accessToken: normalizeText(stationBundle.material?.bearerToken || ""),
      authorization: normalizeText(
        stationBundle.material?.bearerToken ? `Bearer ${stationBundle.material.bearerToken}` : ""
      )
    };
  }
  root.App.runtime.syncConfigCache = {
    ...(root.App.runtime.syncConfigCache || {}),
    authBundles
  };
  root.App.scan = root.App.scan || {};
  root.App.scan.normalize = root.App.scan.normalize || normalizeModule;
  root.App.scan.normalize.createSessionRequestContext = (providerType: string) => {
    const bundle = authBundles[providerType] as Record<string, unknown> | undefined;
    const sessionContext = {
      async build(_requestUrl: URL, init: Record<string, unknown> = {}) {
        const headers: Record<string, string> = {};
        normalizeModule.mergeHeaders(headers, normalizeModule.toPlainHeaders(init.headers));
        if (providerType === "admin-station") {
          const authorization = normalizeText(bundle?.authorization || bundle?.accessToken || "");
          if (authorization) {
            headers.Authorization = authorization.startsWith("Bearer ") ? authorization : `Bearer ${authorization}`;
          }
          return { ...init, headers, credentials: "omit" };
        }
        if (providerType === "naver-partner") {
          const cookieHeader =
            normalizeText(bundle?.cookieHeader || "") ||
            normalizeModule.buildCookieHeaderFromCookies(Array.isArray(bundle?.cookies) ? (bundle?.cookies as unknown[]) : []);
          if (cookieHeader) headers.Cookie = cookieHeader;
          if (normalizeText(bundle?.csrfToken || "")) headers["x-csrf-token"] = normalizeText(bundle?.csrfToken || "");
          if (normalizeText(bundle?.role || "")) headers["x-booking-naver-role"] = normalizeText(bundle?.role || "");
          return { ...init, headers, credentials: "include" };
        }
        return { ...init, headers, credentials: init.credentials || "include" };
      },
      async buildVariants(requestUrl: URL, init: Record<string, unknown> = {}) {
        return [await sessionContext.build(requestUrl, init)];
      }
    };
    return sessionContext;
  };
}

function loadProviderRuntimeModules(): ProviderRuntimeModules {
  if (cachedModules) return cachedModules;
  ensureGlobals();
  const root = globalThis as typeof globalThis & {
    App?: {
      scan?: { normalize?: NormalizeModule };
      io?: { pmsFetch?: PmsFetchModule };
    };
  };
  root.App = root.App || {};
  const normalizePath = runtimeScriptPaths[1];
  for (const filePath of runtimeScriptPaths) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Provider runtime script not found: ${filePath}`);
    }
    loadScript(filePath);
    if (filePath === normalizePath) {
      const normalizeModule = root.App?.scan?.normalize;
      if (!normalizeModule?.normalizeText || !normalizeModule?.mergeHeaders || !normalizeModule?.toPlainHeaders) {
        throw new Error("Provider normalize runtime is not available.");
      }
      applyBridgeAuthBundles(normalizeModule);
    }
  }
  const normalize = root.App?.scan?.normalize;
  const pmsFetch = root.App?.io?.pmsFetch;
  if (!normalize || !pmsFetch?.fetchProviderRows) {
    throw new Error("Provider runtime is not available.");
  }
  cachedModules = { normalize, pmsFetch };
  return cachedModules;
}

export function getProviderRuntimeDiagnostics(): ProviderRuntimeDiagnostics {
  const providers = ["naver-partner", "admin-station"].filter((provider) => Boolean(getLatestBridgeAuthBundle(provider as never)));
  return {
    source: providers.length > 0 ? "bridge-auth-bundle" : "unconfigured",
    availableProviders: providers
  };
}

export async function fetchProviderRowsLive(
  providerType: "naver-partner" | "admin-station",
  query: { startDate: string; endDate: string }
) {
  loadProviderRuntimeModules();
  setLocationForProvider(providerType);
  const { pmsFetch } = loadProviderRuntimeModules();
  const rows = await pmsFetch.fetchProviderRows(providerType, query);
  return {
    source: "provider-api",
    rows: Array.isArray(rows) ? rows : []
  };
}

export function __resetProviderRuntimeForTests() {
  cachedModules = null;
}
