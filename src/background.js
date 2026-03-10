"use strict";

if (typeof importScripts === "function") {
  try {
    importScripts("shared/entryPolicy.js");
  } catch (_error) {
    // Tests may run without extension worker import support.
  }
}

const EXPORT_COOKIE_MESSAGE = "inventory.auth.exportCookies";
const IMPORT_COOKIE_MESSAGE = "inventory.auth.importCookies";
const SECURE_ENCRYPT_MESSAGE = "inventory.secure.encrypt";
const SECURE_DECRYPT_MESSAGE = "inventory.secure.decrypt";
const BRIDGE_GET_CONTEXT_MESSAGE = "inventory.bridge.getContext";
const BRIDGE_DOM_SNAPSHOT_MESSAGE = "inventory.bridge.domSnapshot";
const ENTRY_POLICY = globalThis.InventoryEntryPolicy || {};
const SECURE_DB_NAME = "inventory-secure-store";
const SECURE_DB_VERSION = 1;
const SECURE_KEY_STORE = "keys";
const SECURE_KEY_ID = "sync-config-aes-gcm-v1";

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeCookie(item) {
  if (!isObject(item)) return null;
  const name = String(item.name || "").trim();
  const value = item.value === null || item.value === undefined ? "" : String(item.value);
  const domain = String(item.domain || "").trim();
  if (!name || !domain) return null;

  const path = String(item.path || "/").trim() || "/";
  const secure = item.secure === true;
  const url = String(item.url || `${secure ? "https" : "http"}://${domain.replace(/^\./, "")}${path}`).trim();
  if (!/^https?:\/\//i.test(url)) return null;

  const cookie = {
    name,
    value,
    domain,
    path,
    secure,
    httpOnly: item.httpOnly === true,
    sameSite: String(item.sameSite || "unspecified").trim() || "unspecified",
    session: item.session === true,
    url
  };

  if (item.storeId !== undefined && item.storeId !== null && String(item.storeId).trim()) {
    cookie.storeId = String(item.storeId).trim();
  }
  if (item.partitionKey !== undefined && item.partitionKey !== null) {
    cookie.partitionKey = item.partitionKey;
  }
  if (Number.isFinite(Number(item.expirationDate)) && Number(item.expirationDate) > 0) {
    cookie.expirationDate = Number(item.expirationDate);
  }
  return cookie;
}

function dedupeCookies(cookies) {
  const seen = new Set();
  const out = [];
  (Array.isArray(cookies) ? cookies : []).forEach((item) => {
    const cookie = normalizeCookie(item);
    if (!cookie) return;
    const key = [
      cookie.storeId || "",
      cookie.domain,
      cookie.path,
      cookie.name,
      cookie.partitionKey ? JSON.stringify(cookie.partitionKey) : ""
    ].join("::");
    if (seen.has(key)) return;
    seen.add(key);
    out.push(cookie);
  });
  return out;
}

function openSecureDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SECURE_DB_NAME, SECURE_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SECURE_KEY_STORE)) {
        db.createObjectStore(SECURE_KEY_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Failed to open secure DB."));
  });
}

async function readStoredCryptoKey() {
  const db = await openSecureDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SECURE_KEY_STORE, "readonly");
    const store = tx.objectStore(SECURE_KEY_STORE);
    const request = store.get(SECURE_KEY_ID);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error || new Error("Failed to read secure key."));
  });
}

async function writeStoredCryptoKey(key) {
  const db = await openSecureDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SECURE_KEY_STORE, "readwrite");
    const store = tx.objectStore(SECURE_KEY_STORE);
    const request = store.put(key, SECURE_KEY_ID);
    request.onsuccess = () => resolve(key);
    request.onerror = () => reject(request.error || new Error("Failed to persist secure key."));
  });
}

async function getOrCreateCryptoKey() {
  const existing = await readStoredCryptoKey();
  if (existing) return existing;
  const created = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
  await writeStoredCryptoKey(created);
  return created;
}

function bytesToBase64(bytes) {
  let binary = "";
  const list = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  for (let i = 0; i < list.length; i += 1) binary += String.fromCharCode(list[i]);
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(String(value || ""));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

async function encryptSecureValue(message) {
  const key = await getOrCreateCryptoKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plainBytes = new TextEncoder().encode(JSON.stringify(message?.value ?? null));
  const cipherBuffer = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plainBytes);
  return {
    secure: {
      version: 1,
      algorithm: "AES-GCM",
      keyId: SECURE_KEY_ID,
      iv: bytesToBase64(iv),
      ciphertext: bytesToBase64(new Uint8Array(cipherBuffer))
    }
  };
}

async function decryptSecureValue(message) {
  const secure = message?.secure;
  if (!secure || typeof secure !== "object") return { value: null };
  const key = await getOrCreateCryptoKey();
  const iv = base64ToBytes(secure.iv);
  const cipherBytes = base64ToBytes(secure.ciphertext);
  const plainBuffer = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipherBytes);
  const text = new TextDecoder().decode(plainBuffer);
  return { value: JSON.parse(text) };
}

function getAllCookies(details) {
  return new Promise((resolve, reject) => {
    chrome.cookies.getAll(details, (cookies) => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message || "Failed to load cookies."));
        return;
      }
      resolve(Array.isArray(cookies) ? cookies : []);
    });
  });
}

function setCookie(details) {
  return new Promise((resolve, reject) => {
    chrome.cookies.set(details, (cookie) => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message || "Failed to set cookie."));
        return;
      }
      resolve(cookie || null);
    });
  });
}

async function exportCookies(message) {
  const urls = Array.isArray(message?.urls)
    ? message.urls.map((url) => String(url || "").trim()).filter(Boolean)
    : [];
  const storeId = String(message?.storeId || "").trim() || undefined;
  const cookieBatches = await Promise.all(
    urls.map((url) => getAllCookies(storeId ? { url, storeId } : { url }))
  );
  return { cookies: dedupeCookies(cookieBatches.flat()) };
}

async function importCookies(message) {
  const cookies = dedupeCookies(message?.cookies);
  const applied = [];
  const failed = [];

  for (const cookie of cookies) {
    try {
      const result = await setCookie({
        url: cookie.url,
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path,
        secure: cookie.secure,
        httpOnly: cookie.httpOnly,
        sameSite: cookie.sameSite,
        expirationDate: cookie.session ? undefined : cookie.expirationDate,
        storeId: cookie.storeId,
        partitionKey: cookie.partitionKey
      });
      if (result) {
        applied.push(normalizeCookie(result) || cookie);
      } else {
        applied.push(cookie);
      }
    } catch (error) {
      failed.push({
        name: cookie.name,
        domain: cookie.domain,
        path: cookie.path,
        error: error?.message || String(error)
      });
    }
  }

  return {
    appliedCount: applied.length,
    failedCount: failed.length,
    applied,
    failed
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const type = String(message?.type || "").trim();
  if (!type) return false;

  if (type === EXPORT_COOKIE_MESSAGE) {
    exportCookies(message)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  if (type === IMPORT_COOKIE_MESSAGE) {
    importCookies(message)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  if (type === SECURE_ENCRYPT_MESSAGE) {
    encryptSecureValue(message)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  if (type === SECURE_DECRYPT_MESSAGE) {
    decryptSecureValue(message)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  if (type === BRIDGE_GET_CONTEXT_MESSAGE) {
    sendResponse({
      ok: true,
      context: {
        tabId: Number(sender?.tab?.id || 0) || null,
        url: String(sender?.tab?.url || ""),
        host: (() => {
          try {
            return new URL(String(sender?.tab?.url || "")).host || "";
          } catch (_error) {
            return "";
          }
        })(),
        entrySupport:
          typeof ENTRY_POLICY.detectEntrySupportByUrl === "function"
            ? ENTRY_POLICY.detectEntrySupportByUrl(sender?.tab?.url || "")
            : null
      }
    });
    return false;
  }

  return false;
});
