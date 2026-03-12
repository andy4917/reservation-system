import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

type NormalizeModule = {
  sanitizeSyncConfig: (raw: unknown) => Record<string, unknown>;
};

type SheetsFetchModule = {
  fetchSheetSnapshot: (
    syncConfig: Record<string, unknown>,
    query: { startDate: string; endDate: string },
    forceRefreshToken?: boolean,
    useFullRange?: boolean,
    options?: Record<string, unknown> | null
  ) => Promise<Record<string, unknown>>;
};

interface SheetRuntimeModules {
  normalize: NormalizeModule;
  sheetsFetch: SheetsFetchModule;
}

interface SheetRuntimeConfigState {
  source: "env-json" | "token-file-default" | "unconfigured";
  syncConfig: Record<string, unknown> | null;
  errors: string[];
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const runtimeScriptPaths = [
  "src/constants.js",
  "src/scan/normalize.js",
  "src/engine/noteKey.js",
  "src/report/report.format.js",
  "src/engine/rules.js",
  "src/scan/blockBuilder.js",
  "src/scan/aggregator.js",
  "src/io/sheets.fetch.js"
].map((relativePath) => path.join(repoRoot, relativePath));

let cachedModules: SheetRuntimeModules | null = null;
let cachedConfigKey = "";
let cachedConfigState: SheetRuntimeConfigState | null = null;

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

function ensureBrowserLikeGlobals() {
  const runtimeGlobal = globalThis as typeof globalThis & Record<string, unknown>;
  if (!("window" in runtimeGlobal) || !runtimeGlobal.window) {
    const localStorage = buildStorageStub();
    const sessionStorage = buildStorageStub();
    Object.defineProperty(globalThis, "window", {
      value: { localStorage, sessionStorage },
      configurable: true
    });
  }
  if (!("location" in runtimeGlobal) || !runtimeGlobal.location) {
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
  if (!("chrome" in runtimeGlobal) || !runtimeGlobal.chrome) {
    Object.defineProperty(globalThis, "chrome", {
      value: {},
      configurable: true
    });
  }
  if (!("InventoryEntryPolicy" in runtimeGlobal) || !runtimeGlobal.InventoryEntryPolicy) {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readJsonObjectFromEnv(name: string) {
  const raw = normalizeText(process.env[name]);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return isRecord(parsed) ? parsed : null;
  } catch (error) {
    throw new Error(`${name} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function readTokenFileDefaults() {
  const tokenPath = path.join(repoRoot, ".google_oauth_token.json");
  if (!fs.existsSync(tokenPath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(tokenPath, "utf8"));
    if (!isRecord(parsed)) return null;
    return {
      accessToken: normalizeText(parsed.access_token || parsed.accessToken || ""),
      refreshToken: normalizeText(parsed.refresh_token || parsed.refreshToken || ""),
      clientId: normalizeText(parsed.client_id || parsed.clientId || ""),
      clientSecret: normalizeText(parsed.client_secret || parsed.clientSecret || ""),
      accessTokenExpiresAt: Number(parsed.expires_at || parsed.expiresAt || 0) || 0
    };
  } catch (error) {
    throw new Error(`Failed to load .google_oauth_token.json: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function getConfigCacheKey() {
  return JSON.stringify({
    sync: normalizeText(process.env.UHS_SYNC_CONFIG_JSON)
  });
}

function loadSheetRuntimeModules(): SheetRuntimeModules {
  if (cachedModules) return cachedModules;
  ensureBrowserLikeGlobals();
  const root = globalThis as typeof globalThis & {
    App?: {
      scan?: { normalize?: NormalizeModule };
      io?: { sheetsFetch?: SheetsFetchModule };
    };
  };
  root.App = root.App || {};
  runtimeScriptPaths.forEach((filePath) => {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Sheet runtime script not found: ${filePath}`);
    }
    loadScript(filePath);
  });
  const normalize = root.App?.scan?.normalize;
  const sheetsFetch = root.App?.io?.sheetsFetch;
  if (!normalize?.sanitizeSyncConfig) {
    throw new Error("Sheet normalize runtime is not available.");
  }
  if (!sheetsFetch?.fetchSheetSnapshot) {
    throw new Error("Sheet fetch runtime is not available.");
  }
  cachedModules = { normalize, sheetsFetch };
  return cachedModules;
}

function loadSheetRuntimeConfig(): SheetRuntimeConfigState {
  const cacheKey = getConfigCacheKey();
  if (cachedConfigState && cachedConfigKey === cacheKey) return cachedConfigState;
  const { normalize } = loadSheetRuntimeModules();
  const directConfig = readJsonObjectFromEnv("UHS_SYNC_CONFIG_JSON");
  const errors: string[] = [];

  if (directConfig) {
    cachedConfigKey = cacheKey;
    cachedConfigState = {
      source: "env-json",
      syncConfig: normalize.sanitizeSyncConfig(directConfig),
      errors
    };
    return cachedConfigState;
  }

  try {
    const tokenDefaults = readTokenFileDefaults();
    if (tokenDefaults) {
      cachedConfigKey = cacheKey;
      cachedConfigState = {
        source: "token-file-default",
        syncConfig: normalize.sanitizeSyncConfig(tokenDefaults),
        errors
      };
      return cachedConfigState;
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  cachedConfigKey = cacheKey;
  cachedConfigState = {
    source: "unconfigured",
    syncConfig: null,
    errors
  };
  return cachedConfigState;
}

function countProviderValueDays(values: unknown) {
  if (!values || typeof values !== "object" || Array.isArray(values)) return 0;
  return Object.keys(values).length;
}

export function getSheetRuntimeDiagnostics() {
  const config = loadSheetRuntimeConfig();
  const spreadsheetId = normalizeText(config.syncConfig?.spreadsheet || "");
  const sheetName = normalizeText(config.syncConfig?.sheetName || "");
  return {
    source: config.source,
    configured: Boolean(config.syncConfig),
    spreadsheetId,
    sheetName,
    errors: [...config.errors]
  };
}

export async function fetchSheetSnapshot(query: { startDate: string; endDate: string }) {
  const config = loadSheetRuntimeConfig();
  if (!config.syncConfig) {
    return {
      source: "sheet-unconfigured",
      snapshot: null,
      summary: null,
      error: config.errors.join(" | ")
    };
  }
  const { sheetsFetch } = loadSheetRuntimeModules();
  let snapshot: Record<string, unknown>;
  try {
    snapshot = await sheetsFetch.fetchSheetSnapshot(config.syncConfig, query, false, false, {
      bypassCache: true
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/401|invalid authentication credentials|NeedToken|token refresh/i.test(message)) {
      snapshot = await sheetsFetch.fetchSheetSnapshot(config.syncConfig, query, true, false, {
        bypassCache: true
      });
    } else {
      throw error;
    }
  }
  const scan = isRecord(snapshot?.scan) ? snapshot.scan : {};
  const scanValidation = isRecord(scan.validation) ? scan.validation : {};
  const validationIssues = Array.isArray(scanValidation.issues) ? scanValidation.issues : [];
  const inventoryRows = isRecord(scan.inventoryRows) ? scan.inventoryRows : {};
  const summary = {
    spreadsheetId: normalizeText(snapshot?.spreadsheetId || config.syncConfig.spreadsheet || ""),
    sheetName: normalizeText(snapshot?.sheetName || config.syncConfig.sheetName || ""),
    startDate: normalizeText(query.startDate),
    endDate: normalizeText(query.endDate),
    readMode: normalizeText(scan.fetchMode),
    reservationBlockCount: Number(scan.reservationBlockCount || 0) || 0,
    validationIssueCount: validationIssues.length,
    inventoryRows: {
      NAVER: Number(inventoryRows.NAVER || 0) || null,
      STATION: Number(inventoryRows.STATION || 0) || null
    },
    providerValueDays: {
      NAVER: countProviderValueDays(snapshot?.naverValues),
      STATION: countProviderValueDays(snapshot?.stationValues)
    }
  };
  return {
    source: "sheet-api",
    snapshot,
    summary,
    error: ""
  };
}

export function __resetSheetRuntimeForTests() {
  cachedModules = null;
  cachedConfigKey = "";
  cachedConfigState = null;
}
