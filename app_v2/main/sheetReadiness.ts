import type {
  AppSettingsSnapshot,
  AppSheetReadinessSnapshot
} from "../../src/desktop/app-v2-contracts.js";

const DEFAULT_SHEET_READINESS_TIMEOUT_MS = 15000;
const DEFAULT_SHEET_READINESS_RETRY_COUNT = 2;
const DEFAULT_SHEET_READINESS_RETRY_DELAY_MS = 250;
const SPREADSHEET_ID_RE = /^[A-Za-z0-9_-]{40,120}$/;
const SPREADSHEET_URL_RE = /\/spreadsheets(?:\/u\/\d+)?\/d\/([A-Za-z0-9_-]{40,120})/i;

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function buildSnapshot(
  status: AppSheetReadinessSnapshot["status"],
  summary: string,
  options: Partial<Omit<AppSheetReadinessSnapshot, "checkedAt" | "status" | "summary">> = {}
): AppSheetReadinessSnapshot {
  return {
    checkedAt: new Date().toISOString(),
    status,
    summary,
    spreadsheetId: options.spreadsheetId ?? null,
    sheetName: options.sheetName ?? null,
    accessMode: options.accessMode ?? "none",
    lastError: options.lastError ?? null
  };
}

function readEnv(name: string) {
  return normalizeText(process.env[name] || "");
}

function extractSpreadsheetId(value: string | null) {
  const text = normalizeText(value || "");
  if (!text) return null;
  if (SPREADSHEET_ID_RE.test(text)) return text;
  const match = text.match(SPREADSHEET_URL_RE);
  return match?.[1] || null;
}

function resolveConfiguredSheetNames(settings: AppSettingsSnapshot["config"]) {
  const tabs = settings?.sheetTabs
    ? [settings.sheetTabs.gangnam, settings.sheetTabs.coex, settings.sheetTabs.seolleung, settings.sheetTabs.samseong]
    : [];
  const names = tabs.map((value) => normalizeText(value)).filter(Boolean);
  if (names.length > 0) {
    return names;
  }
  const fallback = normalizeText(settings?.sheetName || "");
  return fallback ? [fallback] : [];
}

function readSheetReadinessTimeoutMs() {
  const value = Number(process.env.UHS_APP_V2_SHEET_READINESS_TIMEOUT_MS || DEFAULT_SHEET_READINESS_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_SHEET_READINESS_TIMEOUT_MS;
}

function readSheetReadinessRetryCount() {
  const value = Number(process.env.UHS_APP_V2_SHEET_READINESS_RETRY_COUNT || DEFAULT_SHEET_READINESS_RETRY_COUNT);
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : DEFAULT_SHEET_READINESS_RETRY_COUNT;
}

function readSheetReadinessRetryDelayMs() {
  const value = Number(process.env.UHS_APP_V2_SHEET_READINESS_RETRY_DELAY_MS || DEFAULT_SHEET_READINESS_RETRY_DELAY_MS);
  return Number.isFinite(value) && value >= 0 ? value : DEFAULT_SHEET_READINESS_RETRY_DELAY_MS;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientFetchError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }
  return error.name === "AbortError" || String(error.message).includes("aborted");
}

async function fetchWithTimeout(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), readSheetReadinessTimeoutMs());
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchWithRetry(url: string, init: RequestInit) {
  const maxAttempts = Math.max(1, readSheetReadinessRetryCount());
  const baseDelay = readSheetReadinessRetryDelayMs();
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fetchWithTimeout(url, init);
    } catch (error) {
      lastError = error;
      const isLastAttempt = attempt >= maxAttempts;
      if (isLastAttempt || !isTransientFetchError(error)) {
        throw error;
      }
      if (baseDelay > 0) {
        await sleep(baseDelay * attempt);
      }
    }
  }

  throw lastError;
}

function resolveTokenInputs() {
  const accessToken = readEnv("UHS_GOOGLE_ACCESS_TOKEN") || readEnv("GOOGLE_ACCESS_TOKEN");
  if (accessToken) {
    return { accessToken, accessMode: "access-token" as const };
  }

  const refreshToken = readEnv("UHS_GOOGLE_REFRESH_TOKEN") || readEnv("GOOGLE_REFRESH_TOKEN");
  const clientId = readEnv("UHS_GOOGLE_CLIENT_ID") || readEnv("GOOGLE_CLIENT_ID");
  const clientSecret = readEnv("UHS_GOOGLE_CLIENT_SECRET") || readEnv("GOOGLE_CLIENT_SECRET");
  if (!refreshToken || !clientId || !clientSecret) {
    return { accessToken: "", accessMode: "none" as const };
  }

  return {
    refreshToken,
    clientId,
    clientSecret,
    accessToken: "",
    accessMode: "refresh-token" as const
  };
}

async function refreshAccessToken(refreshToken: string, clientId: string, clientSecret: string) {
  const body = new URLSearchParams();
  body.set("grant_type", "refresh_token");
  body.set("refresh_token", refreshToken);
  body.set("client_id", clientId);
  body.set("client_secret", clientSecret);

  const response = await fetchWithRetry("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`google-token-refresh-failed:${response.status}:${text.slice(0, 160)}`);
  }
  const payload = (await response.json()) as { access_token?: string };
  const accessToken = normalizeText(payload?.access_token || "");
  if (!accessToken) {
    throw new Error("google-token-refresh-missing-access-token");
  }
  return accessToken;
}

async function resolveSheetAccessToken() {
  const tokenState = resolveTokenInputs();
  if (tokenState.accessMode === "access-token" && tokenState.accessToken) {
    return tokenState;
  }
  if (tokenState.accessMode !== "refresh-token") {
    return tokenState;
  }
  const accessToken = await refreshAccessToken(tokenState.refreshToken, tokenState.clientId, tokenState.clientSecret);
  return { accessToken, accessMode: tokenState.accessMode };
}

export async function evaluateSheetReadiness(settings: AppSettingsSnapshot): Promise<AppSheetReadinessSnapshot> {
  if (!settings.isConfigured || !settings.config) {
    return buildSnapshot("needs-settings", "스프레드시트와 시트명을 먼저 저장해야 합니다.");
  }

  const spreadsheetId = extractSpreadsheetId(settings.config.spreadsheet);
  const configuredSheetNames = resolveConfiguredSheetNames(settings.config);
  const primarySheetName = configuredSheetNames[0] || null;
  if (!spreadsheetId || configuredSheetNames.length === 0) {
    return buildSnapshot("invalid-settings", "저장된 시트 설정이 유효하지 않습니다.", {
      spreadsheetId,
      sheetName: primarySheetName
    });
  }

  let tokenState;
  try {
    tokenState = await resolveSheetAccessToken();
  } catch (error) {
    return buildSnapshot("needs-auth", "Google Sheets 인증을 준비해야 합니다.", {
      spreadsheetId,
      sheetName: primarySheetName,
      accessMode: "refresh-token",
      lastError: error instanceof Error ? error.message : String(error)
    });
  }

  if (!tokenState.accessToken) {
    return buildSnapshot("needs-auth", "Google Sheets 인증이 없어 sheet-live를 확인할 수 없습니다.", {
      spreadsheetId,
      sheetName: primarySheetName,
      accessMode: tokenState.accessMode
    });
  }

  try {
    const response = await fetchWithRetry(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`,
      {
        headers: {
          Authorization: `Bearer ${tokenState.accessToken}`
        }
      }
    );

    if (response.status === 401 || response.status === 403) {
      const text = await response.text();
      return buildSnapshot("needs-auth", "Google Sheets 인증이 유효하지 않습니다.", {
        spreadsheetId,
        sheetName: primarySheetName,
        accessMode: tokenState.accessMode,
        lastError: text.slice(0, 160) || `google-auth-failed:${response.status}`
      });
    }
    if (!response.ok) {
      const text = await response.text();
      return buildSnapshot("error", "Google Sheets 메타데이터 조회에 실패했습니다.", {
        spreadsheetId,
        sheetName: primarySheetName,
        accessMode: tokenState.accessMode,
        lastError: `google-sheet-readiness-failed:${response.status}:${text.slice(0, 160)}`
      });
    }

    const payload = (await response.json()) as {
      sheets?: Array<{ properties?: { title?: string } }>;
    };
    const titles = Array.isArray(payload?.sheets)
      ? payload.sheets.map((sheet) => normalizeText(sheet?.properties?.title || "")).filter(Boolean)
      : [];
    const missingSheetName = configuredSheetNames.find((sheetName) => !titles.includes(sheetName));
    if (missingSheetName) {
      return buildSnapshot("missing-sheet", "설정한 시트명이 Google Sheets 메타데이터에 없습니다.", {
        spreadsheetId,
        sheetName: missingSheetName,
        accessMode: tokenState.accessMode,
        lastError: `missing-sheet:${missingSheetName}`
      });
    }

    return buildSnapshot("ready", "Google Sheets read-only 접근이 준비되었습니다.", {
      spreadsheetId,
      sheetName: primarySheetName,
      accessMode: tokenState.accessMode
    });
  } catch (error) {
    return buildSnapshot("error", "Google Sheets readiness check 중 예외가 발생했습니다.", {
      spreadsheetId,
      sheetName: primarySheetName,
      accessMode: tokenState.accessMode,
      lastError: error instanceof Error ? error.message : String(error)
    });
  }
}
