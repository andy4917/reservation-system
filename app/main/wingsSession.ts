import { BrowserWindow, session } from "electron";
import { upsertLocalBridgePayload } from "./bridgeServer.js";
import { buildWingsAppBridgePayload } from "./wingsSessionPayload.js";

const WINGS_SESSION_PARTITION = "persist:wings-pms-auth";
const WINGS_LOGIN_URL = "https://pms.sanhait.com/";

let wingsWindow: BrowserWindow | null = null;
let syncTimer: NodeJS.Timeout | null = null;

function clearScheduledSync() {
  if (syncTimer) {
    clearTimeout(syncTimer);
    syncTimer = null;
  }
}

function scheduleSessionSync(delayMs = 400) {
  clearScheduledSync();
  syncTimer = setTimeout(() => {
    syncTimer = null;
    void captureWingsSession();
  }, delayMs);
}

function getWingsSession() {
  return session.fromPartition(WINGS_SESSION_PARTITION);
}

async function readWingsCookies() {
  const cookies = await getWingsSession().cookies.get({ url: WINGS_LOGIN_URL });
  return cookies.map((cookie) => ({
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain,
    path: cookie.path,
    secure: cookie.secure,
    httpOnly: cookie.httpOnly,
    sameSite: cookie.sameSite,
    session: cookie.session,
    expirationDate: cookie.expirationDate,
    url: `${cookie.secure ? "https" : "http"}://${String(cookie.domain || "").replace(/^\./, "")}${cookie.path || "/"}`
  }));
}

async function readPageHints() {
  if (!wingsWindow || wingsWindow.isDestroyed()) return {};
  try {
    return await wingsWindow.webContents.executeJavaScript(
      `(() => {
        const normalizeText = (value) => typeof value === "string" ? value.trim() : "";
        const readStorage = (storage) => {
          const items = [];
          if (!storage || typeof storage.length !== "number") return items;
          for (let index = 0; index < storage.length; index += 1) {
            const key = storage.key(index);
            if (!key) continue;
            items.push(normalizeText(storage.getItem(key)));
          }
          return items;
        };
        const jwtRe = /eyJ[a-zA-Z0-9_-]+\\.[a-zA-Z0-9._-]+\\.[a-zA-Z0-9._-]+/;
        const storageValues = [...readStorage(window.localStorage), ...readStorage(window.sessionStorage)];
        let bearerToken = "";
        for (const value of storageValues) {
          const jwt = value.match(jwtRe);
          if (jwt && jwt[0]) {
            bearerToken = jwt[0];
            break;
          }
          if (/^Bearer\\s+/i.test(value)) {
            bearerToken = value.replace(/^Bearer\\s+/i, "").trim();
            break;
          }
        }
        const meta = document.querySelector('meta[name*="csrf" i], meta[name*="xsrf" i]');
        const metaToken = normalizeText(meta && meta.getAttribute("content"));
        const cookieMatch = String(document.cookie || "").match(/(?:^|;\\s*)(?:x-csrf-token|xsrf-token|csrf-token|csrf_token|csrftoken)=([^;]+)/i);
        const csrfToken = metaToken || (cookieMatch && cookieMatch[1] ? decodeURIComponent(cookieMatch[1]) : "");
        const bodyText = normalizeText(document.body && (document.body.innerText || document.body.textContent) || "");
        const roleMatch = bodyText.match(/\\b(OWNER|PARTNER|MANAGER|ADMIN)\\b/i);
        return {
          csrfToken,
          bearerToken,
          role: roleMatch && roleMatch[1] ? roleMatch[1].toUpperCase() : "",
          title: normalizeText(document.title)
        };
      })()`,
      true
    );
  } catch (_error) {
    return {};
  }
}

function attachWindowListeners(windowRef: BrowserWindow) {
  const currentSession = windowRef.webContents.session;
  currentSession.cookies.removeAllListeners("changed");
  currentSession.cookies.on("changed", (_event, cookie) => {
    if (!String(cookie.domain || "").includes("sanhait.com")) return;
    scheduleSessionSync();
  });
  windowRef.webContents.on("did-finish-load", () => scheduleSessionSync(0));
  windowRef.webContents.on("did-navigate", () => scheduleSessionSync());
  windowRef.webContents.on("did-navigate-in-page", () => scheduleSessionSync());
  windowRef.on("closed", () => {
    clearScheduledSync();
    wingsWindow = null;
  });
}

export async function openWingsLoginWindow() {
  if (wingsWindow && !wingsWindow.isDestroyed()) {
    wingsWindow.show();
    wingsWindow.focus();
    return {
      ok: true,
      opened: false,
      url: wingsWindow.webContents.getURL() || WINGS_LOGIN_URL
    };
  }

  wingsWindow = new BrowserWindow({
    width: 1280,
    height: 920,
    autoHideMenuBar: true,
    title: "Wings Login",
    webPreferences: {
      partition: WINGS_SESSION_PARTITION,
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  attachWindowListeners(wingsWindow);
  await wingsWindow.loadURL(WINGS_LOGIN_URL);
  wingsWindow.show();
  wingsWindow.focus();
  return {
    ok: true,
    opened: true,
    url: wingsWindow.webContents.getURL() || WINGS_LOGIN_URL
  };
}

export async function captureWingsSession() {
  const cookies = await readWingsCookies();
  const hints = await readPageHints();
  const url =
    wingsWindow && !wingsWindow.isDestroyed() && wingsWindow.webContents.getURL()
      ? wingsWindow.webContents.getURL()
      : WINGS_LOGIN_URL;
  const title =
    normalizeTitle(
      hints && typeof hints === "object" && "title" in hints ? String((hints as { title?: string }).title || "") : ""
    ) ||
    (wingsWindow && !wingsWindow.isDestroyed() ? wingsWindow.getTitle() : "Wings PMS");
  const payload = buildWingsAppBridgePayload({
    url,
    title,
    cookies,
    hints: hints as { csrfToken?: string; bearerToken?: string; role?: string }
  });
  if (payload.authSummary.cookieCount > 0 || payload.authSummary.hasBearer) {
    upsertLocalBridgePayload(payload);
  }
  return {
    ok: true,
    sessionAvailable: payload.authSummary.cookieCount > 0 || payload.authSummary.hasBearer,
    authSummary: payload.authSummary,
    url: payload.url
  };
}

function normalizeTitle(value: string) {
  return value.trim();
}
