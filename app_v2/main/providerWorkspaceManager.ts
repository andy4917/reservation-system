import electron from "electron";
import type { BrowserWindow as ElectronBrowserWindow } from "electron";
import type { AppProvider, AppProviderBrowserState } from "../../src/desktop/app-v2-contracts.js";
import { APP_PROVIDERS } from "../../src/desktop/app-v2-contracts.js";

const { BrowserWindow } = electron;

interface ProviderWorkspaceConfig {
  provider: AppProvider;
  label: string;
  partition: string;
  startUrl: string;
  cookieScopeUrls: string[];
}

interface ProviderWorkspaceRecord {
  window: ElectronBrowserWindow | null;
  state: AppProviderBrowserState;
}

const PROVIDER_CONFIG: Record<AppProvider, ProviderWorkspaceConfig> = {
  "wings-pms": {
    provider: "wings-pms",
    label: "Wings",
    partition: "persist:app-v2-wings",
    startUrl: "https://pms.sanhait.com/",
    cookieScopeUrls: ["https://pms.sanhait.com/"]
  },
  "naver-partner": {
    provider: "naver-partner",
    label: "Naver",
    partition: "persist:app-v2-naver",
    startUrl: "https://partner.booking.naver.com/",
    cookieScopeUrls: ["https://partner.booking.naver.com/", "https://new.smartplace.naver.com/"]
  },
  "admin-station": {
    provider: "admin-station",
    label: "Station",
    partition: "persist:app-v2-station",
    startUrl: "https://admin.admin-stationbyuhc.com/",
    cookieScopeUrls: ["https://admin.admin-stationbyuhc.com/"]
  }
};

const workspaceRecords = new Map<AppProvider, ProviderWorkspaceRecord>();
const DEFAULT_PROVIDER_LOAD_TIMEOUT_MS = 15000;

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getProviderConfig(provider: AppProvider) {
  return PROVIDER_CONFIG[provider];
}

function readProviderLoadTimeoutMs() {
  const value = Number(process.env.UHS_APP_V2_PROVIDER_LOAD_TIMEOUT_MS || DEFAULT_PROVIDER_LOAD_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_PROVIDER_LOAD_TIMEOUT_MS;
}

function buildEmptyState(provider: AppProvider): AppProviderBrowserState {
  const config = getProviderConfig(provider);
  return {
    provider,
    owner: "electron-main",
    partition: config.partition,
    label: config.label,
    startUrl: config.startUrl,
    windowState: "closed",
    pageState: "idle",
    currentUrl: null,
    currentPath: null,
    currentHost: null,
    title: null,
    cookieCount: 0,
    providerCookieCount: 0,
    lastError: null,
    lastLoadedAt: null,
    lastLoadStartedAt: null,
    lastLoadFinishedAt: null,
    lastLoadFailedAt: null
  };
}

function getRecord(provider: AppProvider) {
  const existing = workspaceRecords.get(provider);
  if (existing) return existing;
  const next = { window: null, state: buildEmptyState(provider) };
  workspaceRecords.set(provider, next);
  return next;
}

function readHost(currentUrl: string | null) {
  if (!currentUrl) return null;
  try {
    return new URL(currentUrl).host || null;
  } catch {
    return null;
  }
}

function readPath(currentUrl: string | null) {
  if (!currentUrl) return null;
  try {
    return new URL(currentUrl).pathname || "/";
  } catch {
    return null;
  }
}

async function readCookieCount(provider: AppProvider) {
  const record = getRecord(provider);
  if (!record.window || record.window.isDestroyed()) return 0;
  const cookies = await record.window.webContents.session.cookies.get({});
  return cookies.length;
}

async function readProviderCookieCount(provider: AppProvider) {
  const record = getRecord(provider);
  if (!record.window || record.window.isDestroyed()) return 0;
  const config = getProviderConfig(provider);
  const cookieKeys = new Set<string>();
  for (const scopeUrl of config.cookieScopeUrls) {
    const cookies = await record.window.webContents.session.cookies.get({ url: scopeUrl });
    for (const cookie of cookies) {
      cookieKeys.add(`${cookie.name};${cookie.domain};${cookie.path}`);
    }
  }
  return cookieKeys.size;
}

async function refreshProviderState(provider: AppProvider): Promise<AppProviderBrowserState> {
  const record = getRecord(provider);
  const currentWindow = record.window;
  if (!currentWindow || currentWindow.isDestroyed()) {
    record.window = null;
    record.state = { ...record.state, windowState: "closed", pageState: "idle" };
    return record.state;
  }

  const currentUrl = normalizeText(currentWindow.webContents.getURL()) || null;
  const currentPath = readPath(currentUrl);
  const title = normalizeText(currentWindow.getTitle()) || record.state.label;
  const currentHost = readHost(currentUrl);
  const cookieCount = await readCookieCount(provider);
  const providerCookieCount = await readProviderCookieCount(provider);
  const isLoading = typeof currentWindow.webContents.isLoading === "function" && currentWindow.webContents.isLoading();
  const pageState = record.state.lastError ? "error" : isLoading ? "loading" : currentUrl ? "loaded" : "idle";
  const lastLoadedAt = pageState === "loaded" ? new Date().toISOString() : record.state.lastLoadedAt;

  record.state = {
    ...record.state,
    currentUrl,
    currentPath,
    currentHost,
    title,
    cookieCount,
    providerCookieCount,
    pageState,
    windowState: currentWindow.isVisible() ? "visible" : "hidden",
    lastLoadedAt
  };
  return record.state;
}

function attachWindowListeners(provider: AppProvider, windowRef: ElectronBrowserWindow) {
  const record = getRecord(provider);
  windowRef.on("show", () => {
    record.state = { ...record.state, windowState: "visible" };
  });
  windowRef.on("hide", () => {
    record.state = { ...record.state, windowState: "hidden" };
  });
  windowRef.on("closed", () => {
    record.window = null;
    record.state = { ...buildEmptyState(provider), lastError: record.state.lastError };
  });
  windowRef.webContents.on("did-start-loading", () => {
    record.state = {
      ...record.state,
      pageState: "loading",
      lastError: null,
      lastLoadStartedAt: new Date().toISOString()
    };
  });
  windowRef.webContents.on("did-finish-load", () => {
    const now = new Date().toISOString();
    record.state = {
      ...record.state,
      pageState: "loaded",
      lastError: null,
      lastLoadedAt: now,
      lastLoadFinishedAt: now
    };
    void refreshProviderState(provider);
  });
  windowRef.webContents.on("did-fail-load", (_event, _code, description) => {
    record.state = {
      ...record.state,
      lastError: normalizeText(description) || "navigation-failed",
      pageState: "error",
      lastLoadFailedAt: new Date().toISOString()
    };
  });
}

async function loadProviderStartUrl(windowRef: ElectronBrowserWindow, startUrl: string) {
  const timeoutMs = readProviderLoadTimeoutMs();
  let timer: NodeJS.Timeout | null = null;
  try {
    await Promise.race([
      windowRef.loadURL(startUrl),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`navigation-timeout:${timeoutMs}`));
        }, timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function ensureProviderBrowser(provider: AppProvider): Promise<AppProviderBrowserState> {
  const record = getRecord(provider);
  if (record.window && !record.window.isDestroyed()) {
    return refreshProviderState(provider);
  }

  const config = getProviderConfig(provider);
  const windowRef = new BrowserWindow({
    show: false,
    width: 1280,
    height: 900,
    autoHideMenuBar: true,
    title: `${config.label} Workspace`,
    webPreferences: {
      partition: config.partition,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  record.window = windowRef;
  record.state = { ...buildEmptyState(provider), windowState: "hidden" };
  attachWindowListeners(provider, windowRef);

  try {
    await loadProviderStartUrl(windowRef, config.startUrl);
  } catch (error) {
    if (!windowRef.isDestroyed()) {
      windowRef.webContents.stop();
    }
    record.state = {
      ...record.state,
      lastError: error instanceof Error ? error.message : String(error),
      pageState: "error",
      lastLoadFailedAt: new Date().toISOString()
    };
  }

  return refreshProviderState(provider);
}

export async function getProviderBrowserState(provider: AppProvider): Promise<AppProviderBrowserState> {
  return refreshProviderState(provider);
}

export async function listProviderBrowsers(): Promise<AppProviderBrowserState[]> {
  return Promise.all(APP_PROVIDERS.map((provider) => refreshProviderState(provider)));
}

export async function openProviderBrowser(provider: AppProvider): Promise<AppProviderBrowserState> {
  await ensureProviderBrowser(provider);
  const record = getRecord(provider);
  record.window?.show();
  record.window?.focus();
  return refreshProviderState(provider);
}

export async function hideProviderBrowser(provider: AppProvider): Promise<AppProviderBrowserState> {
  const record = getRecord(provider);
  record.window?.hide();
  return refreshProviderState(provider);
}

export async function reloadProviderBrowser(provider: AppProvider): Promise<AppProviderBrowserState> {
  await ensureProviderBrowser(provider);
  const record = getRecord(provider);
  record.window?.webContents.reload();
  return refreshProviderState(provider);
}

export function destroyProviderBrowsers() {
  for (const record of workspaceRecords.values()) {
    if (record.window && !record.window.isDestroyed()) {
      record.window.destroy();
    }
  }
  workspaceRecords.clear();
}
