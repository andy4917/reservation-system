import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import type {
  FetchSheetSnapshotSummary,
  SavedManualScanAnchor,
  SheetReadFailureCategory
} from "../contracts/provider.js";
import { applyManualScanAnchorToSyncConfig, loadManualScanAnchor } from "./scanAnchorStore.js";

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
  source: "env-json" | "unconfigured";
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

function countRows(value: unknown) {
  return Array.isArray(value) ? value.filter((entry) => Number.isInteger(entry)).length : 0;
}

function normalizeIssueCodes(validationIssues: unknown[]) {
  return validationIssues
    .map((issue) => (isRecord(issue) ? normalizeText(issue.code || "") : ""))
    .filter(Boolean);
}

function countIssuesBySeverity(validationIssues: unknown[], severity: "error" | "warn") {
  return validationIssues.filter((issue) => isRecord(issue) && normalizeText(issue.severity || "") === severity).length;
}

function classifyValidationFailure(issueCodes: string[]): SheetReadFailureCategory {
  const upperCodes = issueCodes.map((code) => code.toUpperCase());
  if (
    upperCodes.some((code) =>
      code.includes("UNPARSEABLE") || code.includes("CURRENT_EXCEEDS") || code.includes("UNKNOWN_COLOR") || code.includes("PARSE")
    )
  ) {
    return "value-parse";
  }
  if (upperCodes.some((code) => code.includes("MAPPING") || code.includes("ALIAS") || code.includes("IDENTITY") || code.includes("ROOM_MAP"))) {
    return "mapping";
  }
  if (upperCodes.length > 0) return "sheet-structure";
  return "none";
}

function classifyErrorFailure(message: string, source = ""): SheetReadFailureCategory {
  const text = `${source} ${message}`.toLowerCase();
  if (
    text.includes("token") ||
    text.includes("auth") ||
    text.includes("credential") ||
    text.includes("permission") ||
    text.includes("forbidden") ||
    text.includes("401") ||
    text.includes("403") ||
    text.includes("bridge-unavailable") ||
    text.includes("sheet-unconfigured")
  ) {
    return "access";
  }
  if (text.includes("unparseable") || text.includes("parse") || text.includes("unknown_color") || text.includes("current_exceeds")) {
    return "value-parse";
  }
  if (text.includes("mapping") || text.includes("alias") || text.includes("identity")) {
    return "mapping";
  }
  return "sheet-structure";
}

function createSummaryBase(query: { startDate: string; endDate: string }, overrides?: Partial<FetchSheetSnapshotSummary>): FetchSheetSnapshotSummary {
  const providerValueDays = overrides?.providerValueDays || { NAVER: 0, STATION: 0 };
  return {
    spreadsheetId: "",
    sheetName: "",
    startDate: normalizeText(query.startDate),
    endDate: normalizeText(query.endDate),
    readMode: "none",
    retryReason: null,
    retryTrace: [],
    failureCategory: "none",
    failureDetail: "",
    reservationBlockCount: 0,
    validationIssueCount: 0,
    inventoryRows: {
      NAVER: null,
      STATION: null
    },
    providerValueDays,
    anchorSummary: {
      namedRangeCount: 0,
      metadataCount: 0,
      hasScanConfigNamedRange: false,
      hasRoomMapNamedRange: false,
      hasMetadataScanConfig: false
    },
    hintSummary: {
      fingerprint: "",
      roomMapCount: 0,
      scanMode: "unknown",
      manualMode: false,
      hasRoomTypeMap: false
    },
    validationSummary: {
      providerKey: "",
      issueCount: 0,
      errorCount: 0,
      warningCount: 0,
      issueCodes: [],
      hasTypeMismatch: false,
      hasPartitionMismatch: false,
      hasInsufficientRows: false,
      providerValueRawCount: 0,
      providerValueParsedCount: 0
    },
    coverage: {
      dateCount: 0,
      inventoryRowsDetected: {
        NAVER: false,
        STATION: false
      },
      inventoryValueRowsDetected: {
        NAVER: false,
        STATION: false
      },
      inventoryDataRowCounts: {
        NAVER: 0,
        STATION: 0
      },
      providerValueDays,
      reservationBlockCount: 0
    },
    ...overrides
  };
}

function buildSheetSnapshotSummary(
  snapshot: Record<string, unknown>,
  query: { startDate: string; endDate: string },
  config: SheetRuntimeConfigState
): FetchSheetSnapshotSummary {
  const scan = isRecord(snapshot?.scan) ? snapshot.scan : {};
  const scanValidation = isRecord(scan.validation) ? scan.validation : {};
  const validationIssues = Array.isArray(scanValidation.issues) ? scanValidation.issues : [];
  const inventoryRows = isRecord(scan.inventoryRows) ? scan.inventoryRows : {};
  const inventoryValueRows = isRecord(scan.inventoryValueRows) ? scan.inventoryValueRows : {};
  const inventoryDataRows = isRecord(scan.inventoryDataRows) ? scan.inventoryDataRows : {};
  const readHints = isRecord(snapshot?.readHints) ? snapshot.readHints : {};
  const anchorSummary = isRecord(readHints.anchorSummary) ? readHints.anchorSummary : {};
  const trace = isRecord(snapshot?.trace) ? snapshot.trace : {};
  const retryTrace = Array.isArray(trace.retryTrace)
    ? trace.retryTrace.filter((entry): entry is string => typeof entry === "string" && Boolean(entry.trim()))
    : [];
  const providerValueDays = {
    NAVER: countProviderValueDays(snapshot?.naverValues),
    STATION: countProviderValueDays(snapshot?.stationValues)
  };
  const issueCodes = normalizeIssueCodes(validationIssues);
  const errorCount = countIssuesBySeverity(validationIssues, "error");
  const warningCount = countIssuesBySeverity(validationIssues, "warn");
  const failureIssueCodes = errorCount > 0 ? issueCodes : [];

  return createSummaryBase(query, {
    spreadsheetId: normalizeText(snapshot?.spreadsheetId || config.syncConfig?.spreadsheet || ""),
    sheetName: normalizeText(snapshot?.sheetName || config.syncConfig?.sheetName || ""),
    readMode: normalizeText(scan.fetchMode || "unknown"),
    retryReason: retryTrace.length > 0 ? retryTrace[retryTrace.length - 1] : null,
    retryTrace,
    failureCategory: classifyValidationFailure(failureIssueCodes),
    failureDetail: failureIssueCodes.join(", "),
    reservationBlockCount: Number(scan.reservationBlockCount || 0) || 0,
    validationIssueCount: validationIssues.length,
    inventoryRows: {
      NAVER: Number(inventoryRows.NAVER || 0) || null,
      STATION: Number(inventoryRows.STATION || 0) || null
    },
    providerValueDays,
    anchorSummary: {
      namedRangeCount: Number(anchorSummary.namedRangeCount || 0) || 0,
      metadataCount: Number(anchorSummary.metadataCount || 0) || 0,
      hasScanConfigNamedRange: anchorSummary.hasScanConfigNamedRange === true,
      hasRoomMapNamedRange: anchorSummary.hasRoomMapNamedRange === true,
      hasMetadataScanConfig: anchorSummary.hasMetadataScanConfig === true
    },
    hintSummary: {
      fingerprint: normalizeText(readHints.fingerprint || ""),
      roomMapCount: Number(readHints.roomMapCount || 0) || 0,
      scanMode: normalizeText(scan.mode || "unknown"),
      manualMode: normalizeText(scan.mode || "").toLowerCase() === "manual",
      hasRoomTypeMap: Number(readHints.roomMapCount || 0) > 0
    },
    validationSummary: {
      providerKey: normalizeText(scanValidation.providerKey || ""),
      issueCount: validationIssues.length,
      errorCount,
      warningCount,
      issueCodes,
      hasTypeMismatch: scanValidation.hasTypeMismatch === true,
      hasPartitionMismatch: scanValidation.hasPartitionMismatch === true,
      hasInsufficientRows: scanValidation.hasInsufficientRows === true,
      providerValueRawCount: Number(scanValidation.providerValueRawCount || 0) || 0,
      providerValueParsedCount: Number(scanValidation.providerValueParsedCount || 0) || 0
    },
    coverage: {
      dateCount: Number(scan.dateCount || 0) || 0,
      inventoryRowsDetected: {
        NAVER: typeof inventoryRows.NAVER === "number" && Number.isInteger(inventoryRows.NAVER),
        STATION: typeof inventoryRows.STATION === "number" && Number.isInteger(inventoryRows.STATION)
      },
      inventoryValueRowsDetected: {
        NAVER: typeof inventoryValueRows.NAVER === "number" && Number.isInteger(inventoryValueRows.NAVER),
        STATION: typeof inventoryValueRows.STATION === "number" && Number.isInteger(inventoryValueRows.STATION)
      },
      inventoryDataRowCounts: {
        NAVER: countRows(inventoryDataRows.NAVER),
        STATION: countRows(inventoryDataRows.STATION)
      },
      providerValueDays,
      reservationBlockCount: Number(scan.reservationBlockCount || 0) || 0
    }
  });
}

function buildFailedSheetSummary(
  query: { startDate: string; endDate: string },
  config: SheetRuntimeConfigState,
  source: string,
  error: string
): FetchSheetSnapshotSummary {
  return createSummaryBase(query, {
    spreadsheetId: normalizeText(config.syncConfig?.spreadsheet || ""),
    sheetName: normalizeText(config.syncConfig?.sheetName || ""),
    readMode: source === "sheet-unconfigured" ? "unconfigured" : "failed",
    failureCategory: classifyErrorFailure(error, source),
    failureDetail: normalizeText(error || source),
    hintSummary: {
      fingerprint: "",
      roomMapCount: 0,
      scanMode: "unknown",
      manualMode: false,
      hasRoomTypeMap: false
    }
  });
}

async function buildEffectiveSyncConfigForQuery(
  config: SheetRuntimeConfigState,
  query: { startDate: string; endDate: string; branch?: string }
) {
  if (!config.syncConfig) return null;
  const branch = normalizeText(query.branch || "");
  const spreadsheetId = normalizeText(config.syncConfig.spreadsheet || "");
  const sheetName = normalizeText(config.syncConfig.sheetName || "");
  if (!branch || !spreadsheetId || !sheetName) {
    return {
      syncConfig: config.syncConfig,
      manualScanAnchor: null as SavedManualScanAnchor | null
    };
  }
  const manualScanAnchor = await loadManualScanAnchor({
    branch,
    sheetRef: {
      spreadsheetId,
      sheetName,
      sheetId: null,
      timezone: "Asia/Seoul"
    }
  });
  return {
    syncConfig: applyManualScanAnchorToSyncConfig(config.syncConfig, manualScanAnchor),
    manualScanAnchor
  };
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

export async function fetchSheetSnapshot(query: { startDate: string; endDate: string; branch?: string }) {
  const config = loadSheetRuntimeConfig();
  if (!config.syncConfig) {
    const error = config.errors.join(" | ") || "Sheet sync config is not set.";
    return {
      source: "sheet-unconfigured",
      snapshot: null,
      summary: buildFailedSheetSummary(query, config, "sheet-unconfigured", error),
      error
    };
  }
  const { sheetsFetch } = loadSheetRuntimeModules();
  const effectiveConfig = await buildEffectiveSyncConfigForQuery(config, query);
  const effectiveSyncConfig = effectiveConfig?.syncConfig || config.syncConfig;
  let snapshot: Record<string, unknown>;
  try {
    try {
      snapshot = await sheetsFetch.fetchSheetSnapshot(effectiveSyncConfig, query, false, false, {
        bypassCache: true
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/401|invalid authentication credentials|NeedToken|token refresh/i.test(message)) {
        snapshot = await sheetsFetch.fetchSheetSnapshot(effectiveSyncConfig, query, true, false, {
          bypassCache: true
        });
      } else {
        throw error;
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      source: "sheet-api-error",
      snapshot: null,
      summary: buildFailedSheetSummary(query, config, "sheet-api-error", message),
      error: message
    };
  }
  return {
    source: "sheet-api",
    snapshot,
    summary: buildSheetSnapshotSummary(snapshot, query, config),
    error: ""
  };
}

export const __testSheetRuntimeInternals = {
  buildSheetSnapshotSummary,
  buildFailedSheetSummary,
  buildEffectiveSyncConfigForQuery
};

export function __resetSheetRuntimeForTests() {
  cachedModules = null;
  cachedConfigKey = "";
  cachedConfigState = null;
}
