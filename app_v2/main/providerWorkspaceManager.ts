import electron from "electron";
import type { BrowserWindow as ElectronBrowserWindow } from "electron";
import type { AppProvider, AppProviderBrowserState, AppProviderOption } from "../../src/desktop/app-v2-contracts.js";
import type { AppWingsLoginAttemptSnapshot, AppWingsLoginSettings } from "../../src/desktop/app-v2-contracts.js";
import { APP_PROVIDERS, getAppProviderOption } from "../../src/desktop/app-v2-contracts.js";
import fs from "node:fs/promises";
import path from "node:path";
import { loadSettingsSnapshot } from "./settingsStore.js";

const { BrowserWindow, app } = electron;

interface ProviderWorkspaceRecord {
  window: ElectronBrowserWindow | null;
  state: AppProviderBrowserState;
}

interface SessionCookieShape {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite: string;
  session: boolean;
  expirationDate?: number;
}

const workspaceRecords = new Map<AppProvider, ProviderWorkspaceRecord>();
const DEFAULT_PROVIDER_LOAD_TIMEOUT_MS = 15000;
const WINGS_LOGIN_LOG_FILE_NAME = "app-v2-wings-login-log.jsonl";

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getProviderConfig(provider: AppProvider): AppProviderOption {
  return getAppProviderOption(provider);
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

function getWingsLoginLogPath() {
  return path.join(app.getPath("userData"), WINGS_LOGIN_LOG_FILE_NAME);
}

async function appendWingsLoginLog(entry: Record<string, string>) {
  await fs.mkdir(path.dirname(getWingsLoginLogPath()), { recursive: true });
  await fs.appendFile(getWingsLoginLogPath(), `${JSON.stringify(entry)}\n`, "utf8");
}

function hasWingsCredentials(settings: AppWingsLoginSettings | null | undefined) {
  return Boolean(settings?.loginId && settings?.password);
}

function buildCookieHeader(cookies: SessionCookieShape[]) {
  return cookies
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");
}

function inferCsrfToken(cookies: SessionCookieShape[]) {
  const preferred = ["x-csrf-token", "xsrf-token", "csrf-token", "csrf_token", "csrftoken", "xsrftoken"];
  for (const key of preferred) {
    const found = cookies.find((cookie) => cookie.name.toLowerCase() === key);
    if (found?.value) return found.value;
  }
  return "";
}

function normalizeBearerToken(value: unknown) {
  return normalizeText(value).replace(/^Bearer\s+/i, "").trim();
}

function looksLikeJwt(value: string) {
  return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value.trim());
}

async function exportProviderCookies(provider: AppProvider): Promise<SessionCookieShape[]> {
  const record = getRecord(provider);
  if (!record.window || record.window.isDestroyed()) return [];
  const config = getProviderConfig(provider);
  const seen = new Map<string, SessionCookieShape>();
  for (const scopeUrl of config.cookieScopeUrls) {
    const cookies = await record.window.webContents.session.cookies.get({ url: scopeUrl });
    for (const cookie of cookies) {
      const key = `${cookie.name};${cookie.domain};${cookie.path}`;
      seen.set(key, {
        name: cookie.name,
        value: cookie.value ?? "",
        domain: cookie.domain ?? "",
        path: cookie.path ?? "/",
        secure: cookie.secure === true,
        httpOnly: cookie.httpOnly === true,
        sameSite: String(cookie.sameSite || "unspecified"),
        session: cookie.session === true,
        expirationDate: typeof cookie.expirationDate === "number" ? cookie.expirationDate : undefined,
      });
    }
  }
  return Array.from(seen.values());
}

async function readStorageSnapshot(provider: AppProvider) {
  return executeProviderReadScript<Record<string, string>>(provider, `
    (() => {
      const out = {};
      const pull = (storage, prefix) => {
        if (!storage) return;
        for (let index = 0; index < storage.length; index += 1) {
          const key = storage.key(index);
          if (!key) continue;
          try {
            out[prefix + key] = String(storage.getItem(key) || "");
          } catch {
            continue;
          }
        }
      };
      pull(window.localStorage, "local:");
      pull(window.sessionStorage, "session:");
      return out;
    })()
  `);
}

function inferStationAuthorization(storageSnapshot: Record<string, string>) {
  for (const value of Object.values(storageSnapshot)) {
    const trimmed = normalizeText(value);
    if (!trimmed) continue;
    if (looksLikeJwt(trimmed)) return `Bearer ${trimmed}`;
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      const candidate = normalizeBearerToken(
        parsed.accessToken ?? parsed.authorization ?? parsed.token ?? parsed.bearer ?? "",
      );
      if (candidate) return `Bearer ${candidate}`;
    } catch {
      continue;
    }
  }
  return "";
}

function inferNaverRole(storageSnapshot: Record<string, string>) {
  for (const [key, value] of Object.entries(storageSnapshot)) {
    const keyText = key.toLowerCase();
    if (!keyText.includes("role")) continue;
    const parsed = normalizeText(value);
    if (parsed) return parsed;
  }
  return "";
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

export async function attemptWingsLogin(): Promise<AppWingsLoginAttemptSnapshot> {
  const settings = await loadSettingsSnapshot();
  const wingsLogin = settings.config?.wingsLogin ?? null;
  if (!hasWingsCredentials(wingsLogin)) {
    return {
      attempted: false,
      submitted: false,
      summary: "저장된 WINGS 로그인 정보가 없습니다.",
      loginId: wingsLogin?.loginId ?? "",
      loggedAt: null,
    };
  }
  const storedLogin = wingsLogin as AppWingsLoginSettings;

  await ensureProviderBrowser("wings-pms");
  const loggedAt = new Date().toISOString();
  const result = await executeProviderReadScript<{ submitted: boolean; reason?: string }>(
    "wings-pms",
    `
      (() => {
        const loginId = ${JSON.stringify(storedLogin.loginId)};
        const password = ${JSON.stringify(storedLogin.password)};
        const textMatch = (value) => typeof value === "string" && /id|user|email|login/i.test(value);
        const findIdInput = () => {
          const inputs = Array.from(document.querySelectorAll("input"));
          return inputs.find((input) => {
            const element = input;
            const type = String(element.getAttribute("type") || "").toLowerCase();
            const name = String(element.getAttribute("name") || "");
            const id = String(element.getAttribute("id") || "");
            const placeholder = String(element.getAttribute("placeholder") || "");
            return type !== "password" && [name, id, placeholder].some(textMatch);
          }) || null;
        };
        const findPasswordInput = () =>
          Array.from(document.querySelectorAll("input")).find((input) => String(input.getAttribute("type") || "").toLowerCase() === "password") || null;
        const submitButton =
          Array.from(document.querySelectorAll("button, input[type='submit']")).find((element) => {
            const text = (element.textContent || element.getAttribute("value") || "").toLowerCase();
            return /로그인|login|sign in|확인/.test(text);
          }) || null;

        const idInput = findIdInput();
        const passwordInput = findPasswordInput();
        if (!idInput || !passwordInput) {
          return { submitted: false, reason: "login-fields-not-found" };
        }
        const setNativeValue = (element, value) => {
          const prototype = Object.getPrototypeOf(element);
          const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
          if (descriptor && typeof descriptor.set === "function") descriptor.set.call(element, value);
          else element.value = value;
          element.dispatchEvent(new Event("input", { bubbles: true }));
          element.dispatchEvent(new Event("change", { bubbles: true }));
        };
        setNativeValue(idInput, loginId);
        setNativeValue(passwordInput, password);
        if (submitButton instanceof HTMLElement) {
          submitButton.click();
          return { submitted: true };
        }
        passwordInput.form?.requestSubmit?.();
        return { submitted: true };
      })()
    `,
  );

  await appendWingsLoginLog({
    loggedAt,
    loginId: storedLogin.loginId,
    submitted: result.submitted ? "yes" : "no",
    reason: result.reason || "",
  });

  return {
    attempted: true,
    submitted: result.submitted === true,
    summary: result.submitted === true ? "저장된 WINGS 로그인 정보로 PMS 로그인을 시도했습니다." : `WINGS 로그인 시도 실패: ${result.reason || "unknown"}`,
    loginId: storedLogin.loginId,
    loggedAt,
  };
}

export async function getProviderBrowserState(provider: AppProvider): Promise<AppProviderBrowserState> {
  return refreshProviderState(provider);
}

export async function executeProviderReadScript<T>(provider: AppProvider, script: string): Promise<T> {
  const record = getRecord(provider);
  if (!record.window || record.window.isDestroyed()) {
    throw new Error(`${provider} provider window is not available`);
  }
  return record.window.webContents.executeJavaScript(script, true) as Promise<T>;
}

export async function exportProviderSessionBridgeBundle(provider: AppProvider): Promise<Record<string, unknown>> {
  await ensureProviderBrowser(provider);
  const cookies = await exportProviderCookies(provider);
  const cookieHeader = buildCookieHeader(cookies);
  const storageSnapshot = await readStorageSnapshot(provider).catch(() => ({}));

  if (provider === "admin-station") {
    const authorization = inferStationAuthorization(storageSnapshot);
    if (!authorization) {
      throw new Error("station session token could not be derived from current browser session");
    }
    return {
      providerType: provider,
      cookies,
      cookieHeader,
      authorization,
    };
  }

  if (provider === "naver-partner") {
    if (!cookieHeader) {
      throw new Error("naver session cookies are missing");
    }
    const csrfToken = inferCsrfToken(cookies);
    const role = inferNaverRole(storageSnapshot);
    return {
      providerType: provider,
      cookies,
      cookieHeader,
      csrfToken,
      role,
    };
  }

  return {
    providerType: provider,
    cookies,
    cookieHeader,
  };
}

export async function listProviderBrowsers(): Promise<AppProviderBrowserState[]> {
  return Promise.all(APP_PROVIDERS.map((provider) => refreshProviderState(provider)));
}

export async function primeProviderBrowsers(): Promise<AppProviderBrowserState[]> {
  return Promise.all(APP_PROVIDERS.map((provider) => ensureProviderBrowser(provider)));
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
