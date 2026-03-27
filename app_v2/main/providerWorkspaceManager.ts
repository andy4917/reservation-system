import path from "node:path";
import { fileURLToPath } from "node:url";
import electron from "electron";
import type { BrowserWindow as ElectronBrowserWindow } from "electron";
import type {
  AppBranch,
  AppProvider,
  AppProviderBrowserState,
  AppProviderOperatingSnapshot,
  AppWingsLoginInput
} from "../../src/desktop/app-v2-contracts.js";
import { APP_PROVIDERS } from "../../src/desktop/app-v2-contracts.js";
import { waitForWingsLoginOperatingState } from "./providerOperatingWaiter.js";
import { bootstrapWingsBrowserSession } from "./wingsSessionBootstrap.js";

const { BrowserWindow, session } = electron;
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const appIconPath = path.resolve(currentDir, "..", "..", "..", "icons", "icon128.png");

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

interface ProviderStorageEntry {
  key: string;
  value: string;
}

interface ProviderStorageSnapshot {
  localStorage: ProviderStorageEntry[];
  sessionStorage: ProviderStorageEntry[];
}

interface ProviderSessionCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite: string;
  session: boolean;
  url: string;
  expirationDate?: number;
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
    storageSnapshotReadState: "not-read",
    storageSnapshotError: null,
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

async function readProviderScopedCookies(provider: AppProvider): Promise<ProviderSessionCookie[]> {
  const record = getRecord(provider);
  if (!record.window || record.window.isDestroyed()) return [];
  const config = getProviderConfig(provider);
  const cookieMap = new Map<string, ProviderSessionCookie>();
  for (const scopeUrl of config.cookieScopeUrls) {
    const cookies = await record.window.webContents.session.cookies.get({ url: scopeUrl });
    for (const cookie of cookies) {
      const key = `${cookie.name};${cookie.domain};${cookie.path}`;
      if (cookieMap.has(key)) continue;
      cookieMap.set(key, {
        name: String(cookie.name || ""),
        value: String(cookie.value || ""),
        domain: String(cookie.domain || ""),
        path: String(cookie.path || "/"),
        secure: cookie.secure === true,
        httpOnly: cookie.httpOnly === true,
        sameSite: String(cookie.sameSite ?? "unspecified"),
        session: cookie.session === true,
        url: `${cookie.secure ? "https" : "http"}://${String(cookie.domain || "").replace(/^\./, "")}${cookie.path || "/"}`,
        expirationDate: Number.isFinite(cookie.expirationDate) ? Number(cookie.expirationDate) : undefined,
      });
    }
  }
  return [...cookieMap.values()];
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
    record.state = {
      ...buildEmptyState(provider),
      lastError: record.state.lastError
    };
  });
  windowRef.webContents.on("did-start-loading", () => {
    record.state = {
      ...record.state,
      pageState: "loading",
      lastError: null,
      storageSnapshotReadState: "not-read",
      storageSnapshotError: null,
      lastLoadStartedAt: new Date().toISOString()
    };
  });
  windowRef.webContents.on("did-finish-load", () => {
    const now = new Date().toISOString();
    record.state = {
      ...record.state,
      pageState: "loaded",
      lastError: null,
      storageSnapshotReadState: "not-read",
      storageSnapshotError: null,
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

export async function ensureProviderBrowser(provider: AppProvider, branchHint?: AppBranch): Promise<AppProviderBrowserState> {
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
    icon: appIconPath,
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
    if (provider === "wings-pms") {
      await bootstrapWingsBrowserSession(windowRef, branchHint);
    }
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

export async function loginWingsSession(input: AppWingsLoginInput): Promise<AppProviderOperatingSnapshot> {
  const provider = "wings-pms";
  await ensureProviderBrowser(provider);
  const record = getRecord(provider);
  const windowRef = record.window;
  if (!windowRef || windowRef.isDestroyed()) {
    throw new Error("Wings provider window is not available.");
  }
  void input;
  if (typeof windowRef.show === "function") windowRef.show();
  if (typeof windowRef.focus === "function") windowRef.focus();
  return waitForWingsLoginOperatingState(provider, () => refreshProviderState(provider));
}


export async function getProviderBrowserState(provider: AppProvider): Promise<AppProviderBrowserState> {
  return refreshProviderState(provider);
}

export async function getProviderBrowserStorageSnapshot(provider: AppProvider): Promise<ProviderStorageSnapshot> {
  const record = getRecord(provider);
  const windowRef = record.window;
  if (!windowRef || windowRef.isDestroyed()) {
    record.state = {
      ...record.state,
      storageSnapshotReadState: "not-read",
      storageSnapshotError: null
    };
    return {
      localStorage: [],
      sessionStorage: [],
    };
  }

  try {
    const snapshot = await windowRef.webContents.executeJavaScript(
      `(() => {
        const readStorage = (storage) => {
          const entries = [];
          if (!storage) return entries;
          for (let index = 0; index < storage.length; index += 1) {
            try {
              const key = String(storage.key(index) || "").trim();
              if (!key) continue;
              const value = String(storage.getItem(key) || "");
              entries.push({ key, value });
            } catch (_error) {
              continue;
            }
          }
          return entries;
        };
        return {
          localStorage: readStorage(window.localStorage),
          sessionStorage: readStorage(window.sessionStorage),
        };
      })()`,
      true,
    );
    const toEntries = (value: unknown): ProviderStorageEntry[] =>
      Array.isArray(value)
        ? value
            .filter((entry) => Boolean(entry) && typeof entry === "object")
            .map((entry) => ({
              key: normalizeText((entry as { key?: unknown }).key || ""),
              value: typeof (entry as { value?: unknown }).value === "string" ? (entry as { value: string }).value : "",
            }))
            .filter((entry) => Boolean(entry.key))
        : [];
    const entries = {
      localStorage: toEntries((snapshot as { localStorage?: unknown })?.localStorage),
      sessionStorage: toEntries((snapshot as { sessionStorage?: unknown })?.sessionStorage),
    };
    record.state = {
      ...record.state,
      storageSnapshotReadState: "ok",
      storageSnapshotError: null
    };
    return entries;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    record.state = {
      ...record.state,
      storageSnapshotReadState: "error",
      storageSnapshotError: message || "provider-storage-snapshot-failed"
    };
    return {
      localStorage: [],
      sessionStorage: [],
    };
  }
}

export async function getProviderSessionCookies(provider: AppProvider): Promise<ProviderSessionCookie[]> {
  return readProviderScopedCookies(provider);
}

export async function fetchWithProviderSession(
  provider: AppProvider,
  input: string | URL,
  init?: Record<string, unknown>,
  branchHint?: AppBranch,
) {
  const config = getProviderConfig(provider);
  await ensureProviderBrowser(provider, branchHint);
  const record = getRecord(provider);
  const sessionRef = record.window?.webContents.session ?? session.fromPartition(config.partition);
  return sessionRef.fetch(String(input), init as Parameters<typeof sessionRef.fetch>[1]);
}

export async function fetchWithProviderPageContext(
  provider: AppProvider,
  input: string | URL,
  init?: Record<string, unknown>,
  branchHint?: AppBranch,
) {
  await ensureProviderBrowser(provider, branchHint);
  const record = getRecord(provider);
  const windowRef = record.window;
  if (!windowRef || windowRef.isDestroyed()) {
    throw new Error(`provider-window-unavailable:${provider}`);
  }
  const request = {
    url: String(input),
    method: String(init?.method || "GET").toUpperCase(),
    headers:
      init?.headers && typeof init.headers === "object"
        ? Object.fromEntries(
            Object.entries(init.headers as Record<string, unknown>).map(([key, value]) => [key, String(value ?? "")]),
          )
        : {},
    body: typeof init?.body === "string" ? init.body : null,
  };
  const payload = JSON.stringify(request);
  return windowRef.webContents.executeJavaScript(
    `(() => {
      const request = ${payload};
      return fetch(request.url, {
        method: request.method,
        headers: request.headers,
        body: request.method === "GET" ? undefined : request.body,
        credentials: "include"
      }).then(async (response) => ({
        ok: response.ok,
        status: response.status,
        url: response.url,
        headers: {
          contentType: response.headers.get("content-type") || ""
        },
        text: await response.text()
      }));
    })()`,
    true,
  ) as Promise<{
    ok: boolean;
    status: number;
    url: string;
    headers: { contentType: string };
    text: string;
  }>;
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
