import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { getLatestBridgeAuthBundle, getLatestBridgeContext } from "./bridgeServer.js";

type NormalizeModule = {
  sanitizeSyncConfig: (raw: unknown) => Record<string, unknown>;
  convertHarToWingsPmsConfig: (rawHar: unknown) => {
    preset?: Record<string, unknown>;
    url?: string;
    bundle?: Record<string, unknown>;
    matchedPath?: string;
  } | null;
};

type PmsFetchModule = {
  fetchProviderReservations: (
    providerType: string,
    query: { startDate: string; endDate: string },
    syncConfig?: Record<string, unknown> | null
  ) => Promise<Record<string, unknown>>;
  fetchWingsLiveContract: (
    providerType: string,
    request: Record<string, unknown>,
    syncConfig?: Record<string, unknown> | null
  ) => Promise<Record<string, unknown>>;
  getSupportedWingsLiveContracts: () => string[];
};

interface WingsRuntimeModules {
  normalize: NormalizeModule;
  pmsFetch: PmsFetchModule;
}

interface WingsRuntimeConfigState {
  source: "env-json" | "har-env" | "bridge-auth-bundle" | "unconfigured";
  syncConfig: Record<string, unknown> | null;
  configuredBranches: string[];
  errors: string[];
}

interface WingsSessionState {
  status: "unknown" | "healthy" | "recovering" | "failed";
  lastCheckAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  recoveryAttempts: number;
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const runtimeScriptPaths = [
  "src/constants.js",
  "src/scan/normalize.js",
  "src/pms/wings.adapter.js",
  "src/engine/rules.js",
  "src/io/pms.fetch.js"
].map((relativePath) => path.join(repoRoot, relativePath));

let cachedModules: WingsRuntimeModules | null = null;
let cachedConfigKey = "";
let cachedConfigState: WingsRuntimeConfigState | null = null;
let sessionState: WingsSessionState = {
  status: "unknown",
  lastCheckAt: null,
  lastSuccessAt: null,
  lastFailureAt: null,
  lastErrorCode: null,
  lastErrorMessage: null,
  recoveryAttempts: 0
};

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

function normalizeBranch(value: unknown) {
  const text = normalizeText(value);
  return text || "";
}

function cloneSessionState() {
  return { ...sessionState };
}

function updateSessionState(patch: Partial<WingsSessionState>) {
  sessionState = {
    ...sessionState,
    ...patch
  };
}

function loadWingsRuntimeModules(): WingsRuntimeModules {
  if (cachedModules) return cachedModules;

  const root = globalThis as typeof globalThis & {
    App?: {
      scan?: { normalize?: NormalizeModule };
      io?: { pmsFetch?: PmsFetchModule };
    };
  };

  root.App = root.App || {};
  runtimeScriptPaths.forEach((filePath) => {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Wings runtime script not found: ${filePath}`);
    }
    loadScript(filePath);
  });

  const normalize = root.App?.scan?.normalize;
  const pmsFetch = root.App?.io?.pmsFetch;
  if (!normalize?.sanitizeSyncConfig || !normalize?.convertHarToWingsPmsConfig) {
    throw new Error("Wings normalize runtime is not available.");
  }
  if (!pmsFetch?.fetchProviderReservations || !pmsFetch?.fetchWingsLiveContract) {
    throw new Error("Wings PMS fetch runtime is not available.");
  }

  cachedModules = { normalize, pmsFetch };
  return cachedModules;
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

function readJsonObjectFromFileEnv(name: string) {
  const filePath = normalizeText(process.env[name]);
  if (!filePath) return null;
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return isRecord(parsed) ? parsed : null;
  } catch (error) {
    throw new Error(`${name} could not be loaded: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function buildRuntimeAuthBundle() {
  const direct = readJsonObjectFromEnv("UHS_WINGS_AUTH_BUNDLE_JSON");
  if (direct) return direct;
  const fromFile = readJsonObjectFromFileEnv("UHS_WINGS_AUTH_BUNDLE_PATH");
  if (fromFile) return fromFile;
  const bridgeBundle = getLatestBridgeAuthBundle("wings-pms");
  return bridgeBundle && typeof bridgeBundle === "object" ? bridgeBundle : null;
}

function hasLiveBridgeSession() {
  return getLatestBridgeContext("wings-pms")?.sessionAvailable === true;
}

function mergePmsAuthBundle(baseBundle: Record<string, unknown> | null, authBundle: Record<string, unknown> | null) {
  const base = isRecord(baseBundle) ? baseBundle : {};
  const auth = isRecord(authBundle) ? authBundle : {};
  const material = isRecord(auth.material) ? auth.material : {};
  const cookies = Array.isArray(auth.cookies) ? auth.cookies : Array.isArray(base.cookies) ? base.cookies : [];
  return {
    ...base,
    cookies,
    cookieHeader: normalizeText(material.cookieHeader || auth.cookieHeader || base.cookieHeader),
    csrfToken: normalizeText(material.csrfToken || auth.csrfToken || base.csrfToken),
    authorization: normalizeText(
      material.bearerToken
        ? `Bearer ${material.bearerToken}`
        : auth.authorization || base.authorization
    ),
    role: normalizeText(material.role || auth.role || base.role),
    sourceHost: normalizeText(auth.sourceHost || base.sourceHost),
    capturedAt: normalizeText(auth.capturedAt || base.capturedAt)
  };
}

function collectHarBranchEntriesFromEnv() {
  const configured = readJsonObjectFromEnv("UHS_WINGS_HAR_BRANCHES_JSON");
  if (configured && Array.isArray(configured.branches)) {
    return configured.branches
      .filter((entry): entry is Record<string, unknown> => isRecord(entry))
      .map((entry) => ({
        branch: normalizeBranch(entry.branch || entry.name || entry.branchName),
        harPath: normalizeText(entry.harPath || entry.path || entry.file)
      }))
      .filter((entry) => entry.branch && entry.harPath);
  }

  return [
    { branch: "GANGNAM", harPath: normalizeText(process.env.UHS_WINGS_HAR_GANGNAM) },
    { branch: "COEX", harPath: normalizeText(process.env.UHS_WINGS_HAR_COEX) }
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
    path.join(homeDir, "바탕 화면")
  ];
}

function collectHarBranchEntriesFromDefaults() {
  const directories = buildDefaultHarDirectoryCandidates();
  if (directories.length === 0) return [];
  return [
    {
      branch: "GANGNAM",
      harPath: getExistingHarPath(
        directories.map((directory) => path.join(directory, "pms.sanhait.com.ACCOUNT gangnam.har"))
      )
    },
    {
      branch: "COEX",
      harPath: getExistingHarPath(
        directories.map((directory) => path.join(directory, "pms.sanhait.com.ACCOUNT coex.har"))
      )
    }
  ].filter((entry) => entry.branch && entry.harPath);
}

function getConfigCacheKey() {
  const bridgeBundle = getLatestBridgeAuthBundle("wings-pms");
  return JSON.stringify({
    sync: normalizeText(process.env.UHS_WINGS_SYNC_CONFIG_JSON),
    bundle: normalizeText(process.env.UHS_WINGS_AUTH_BUNDLE_JSON),
    bundlePath: normalizeText(process.env.UHS_WINGS_AUTH_BUNDLE_PATH),
    bridgeBundleAt: normalizeText(bridgeBundle?.capturedAt || ""),
    harBranches: normalizeText(process.env.UHS_WINGS_HAR_BRANCHES_JSON),
    gangnamHar: normalizeText(process.env.UHS_WINGS_HAR_GANGNAM),
    coexHar: normalizeText(process.env.UHS_WINGS_HAR_COEX)
  });
}

function loadWingsRuntimeConfig(): WingsRuntimeConfigState {
  const cacheKey = getConfigCacheKey();
  if (cachedConfigState && cachedConfigKey === cacheKey) return cachedConfigState;

  const { normalize } = loadWingsRuntimeModules();
  const directConfig = readJsonObjectFromEnv("UHS_WINGS_SYNC_CONFIG_JSON");
  const runtimeAuthBundle = buildRuntimeAuthBundle();
  if (directConfig) {
    const sanitized = normalize.sanitizeSyncConfig(directConfig);
    if (runtimeAuthBundle && Array.isArray(sanitized.pmsBranchProfiles)) {
      sanitized.pmsBranchProfiles = sanitized.pmsBranchProfiles.map((profile: unknown) => {
        if (!isRecord(profile)) return profile;
        return {
          ...profile,
          pmsAuthBundle: mergePmsAuthBundle(
            isRecord(profile.pmsAuthBundle) ? profile.pmsAuthBundle : null,
            runtimeAuthBundle
          )
        };
      });
    }
    cachedConfigKey = cacheKey;
    cachedConfigState = {
      source: runtimeAuthBundle ? "bridge-auth-bundle" : "env-json",
      syncConfig: sanitized,
      configuredBranches: Array.isArray(directConfig.pmsBranchProfiles)
        ? directConfig.pmsBranchProfiles
            .filter((entry): entry is Record<string, unknown> => isRecord(entry))
            .map((entry) => normalizeBranch(entry.branch || entry.branchName || entry.branchKey))
            .filter(Boolean)
        : [],
      errors: []
    };
    return cachedConfigState;
  }

  const harEntries = collectHarBranchEntriesFromEnv();
  const resolvedHarEntries = harEntries.length > 0 ? harEntries : collectHarBranchEntriesFromDefaults();
  const profiles: Array<Record<string, unknown>> = [];
  const errors: string[] = [];
  resolvedHarEntries.forEach(({ branch, harPath }) => {
    if (!fs.existsSync(harPath)) {
      errors.push(`HAR not found for ${branch}: ${harPath}`);
      return;
    }
    try {
      const rawHar = fs.readFileSync(harPath, "utf8");
      const converted = normalize.convertHarToWingsPmsConfig(rawHar);
      if (!converted?.url || !converted?.bundle) {
        errors.push(`HAR conversion did not produce a read-only request for ${branch}: ${harPath}`);
        return;
      }
      profiles.push({
        branch,
        pmsReservationUrl: converted.url,
        pmsPreset: isRecord(converted.preset) ? converted.preset : {},
        pmsAuthBundle: mergePmsAuthBundle(isRecord(converted.bundle) ? converted.bundle : null, runtimeAuthBundle)
      });
    } catch (error) {
      errors.push(`Failed to load ${branch} HAR: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  cachedConfigKey = cacheKey;
  cachedConfigState = {
    source: profiles.length > 0 ? (runtimeAuthBundle ? "bridge-auth-bundle" : "har-env") : "unconfigured",
    syncConfig:
      profiles.length > 0
        ? normalize.sanitizeSyncConfig({
            pmsBranchProfiles: profiles
          })
        : null,
    configuredBranches: profiles
      .map((profile) => normalizeBranch(profile.branch))
      .filter(Boolean),
    errors
  };
  return cachedConfigState;
}

export function getWingsRuntimeDiagnostics() {
  const { pmsFetch } = loadWingsRuntimeModules();
  const config = loadWingsRuntimeConfig();
  return {
    source: config.source,
    configuredBranches: [...config.configuredBranches],
    supportedContracts: pmsFetch.getSupportedWingsLiveContracts(),
    errors: [...config.errors],
    session: cloneSessionState()
  };
}

function extractErrorCode(error: unknown) {
  return normalizeText((error as { code?: unknown })?.code || "");
}

function extractErrorMessage(error: unknown) {
  return normalizeText((error as { message?: unknown })?.message || String(error || ""));
}

function shouldRetryWithFreshAuth(error: unknown) {
  const code = extractErrorCode(error);
  return code === "AUTH_EXPIRED_SSO_REDIRECT" || code === "NON_JSON_UPSTREAM_RESPONSE";
}

function looksUnavailableResult(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const source = normalizeText((value as { source?: unknown }).source || "");
  return source === "unavailable";
}

function extractUnavailableResultMessage(value: unknown) {
  if (!value || typeof value !== "object") return "";
  return normalizeText((value as { error?: unknown }).error || "");
}

async function runWithManagedSession<T>(factory: (syncConfig: Record<string, unknown> | null) => Promise<T>) {
  const firstConfig = loadWingsRuntimeConfig();
  const bridgeSessionActive = hasLiveBridgeSession();
  updateSessionState({
    lastCheckAt: new Date().toISOString(),
    ...(bridgeSessionActive
      ? {
          status: "unknown",
          lastErrorCode: null,
          lastErrorMessage: null
        }
      : {})
  });
  try {
    const result = await factory(firstConfig.syncConfig);
    if (!bridgeSessionActive) {
      if (looksUnavailableResult(result)) {
        updateSessionState({
          status: "failed",
          lastFailureAt: new Date().toISOString(),
          lastErrorCode: "NON_JSON_UPSTREAM_RESPONSE",
          lastErrorMessage: extractUnavailableResultMessage(result) || "Live request returned unavailable."
        });
      } else {
        updateSessionState({
          status: "healthy",
          lastSuccessAt: new Date().toISOString(),
          lastErrorCode: null,
          lastErrorMessage: null
        });
      }
    }
    return result;
  } catch (error) {
    if (bridgeSessionActive) {
      throw error;
    }
    if (!shouldRetryWithFreshAuth(error)) {
      updateSessionState({
        status: "failed",
        lastFailureAt: new Date().toISOString(),
        lastErrorCode: extractErrorCode(error) || "UNKNOWN_ERROR",
        lastErrorMessage: extractErrorMessage(error)
      });
      throw error;
    }

    updateSessionState({
      status: "recovering",
      lastFailureAt: new Date().toISOString(),
      lastErrorCode: extractErrorCode(error) || "AUTH_EXPIRED_SSO_REDIRECT",
      lastErrorMessage: extractErrorMessage(error),
      recoveryAttempts: sessionState.recoveryAttempts + 1
    });
    cachedConfigKey = "";
    cachedConfigState = null;
    const retryConfig = loadWingsRuntimeConfig();
    try {
      const result = await factory(retryConfig.syncConfig);
      updateSessionState({
        status: "healthy",
        lastSuccessAt: new Date().toISOString(),
        lastErrorCode: null,
        lastErrorMessage: null
      });
      return result;
    } catch (retryError) {
      updateSessionState({
        status: "failed",
        lastFailureAt: new Date().toISOString(),
        lastErrorCode: extractErrorCode(retryError) || "SESSION_RECOVERY_FAILED",
        lastErrorMessage: extractErrorMessage(retryError)
      });
      throw retryError;
    }
  }
}

export async function fetchWingsReservations(query: { startDate: string; endDate: string }) {
  const { pmsFetch } = loadWingsRuntimeModules();
  return runWithManagedSession((syncConfig) => pmsFetch.fetchProviderReservations("wings-pms", query, syncConfig));
}

export async function fetchWingsLiveContract(request: Record<string, unknown>) {
  const { pmsFetch } = loadWingsRuntimeModules();
  return runWithManagedSession((syncConfig) => pmsFetch.fetchWingsLiveContract("wings-pms", request, syncConfig));
}

export function __resetWingsRuntimeForTests() {
  cachedModules = null;
  cachedConfigKey = "";
  cachedConfigState = null;
  sessionState = {
    status: "unknown",
    lastCheckAt: null,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    recoveryAttempts: 0
  };
  const root = globalThis as typeof globalThis & { App?: unknown };
  delete root.App;
}
