"use strict";

(() => {
  const AuthBridge = (globalThis.InventoryAuthBridge = globalThis.InventoryAuthBridge || {});
  const PROVIDER_URLS = {
    "naver-partner": ["https://partner.booking.naver.com/", "https://api-partner.booking.naver.com/"],
    "admin-station": ["https://admin.admin-stationbyuhc.com/", "https://api.admin-stationbyuhc.com/"],
    "wings-pms": ["https://pms.sanhait.com/"]
  };

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

    return {
      name,
      value,
      domain,
      path,
      secure,
      httpOnly: item.httpOnly === true,
      sameSite: String(item.sameSite || "unspecified").trim() || "unspecified",
      session: item.session === true,
      url,
      storeId: item.storeId !== undefined && item.storeId !== null ? String(item.storeId).trim() || undefined : undefined,
      partitionKey: item.partitionKey !== undefined && item.partitionKey !== null ? item.partitionKey : undefined,
      expirationDate: Number.isFinite(Number(item.expirationDate)) && Number(item.expirationDate) > 0 ? Number(item.expirationDate) : undefined
    };
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

  function summarizeAuthState(cookies, extra = {}) {
    const list = dedupeCookies(cookies);
    return {
      cookieCount: list.length,
      domains: [...new Set(list.map((cookie) => cookie.domain))].slice(0, 8),
      hasBearer: Boolean(extra.authorization || extra.bearerToken),
      hasCsrf: Boolean(extra.csrfToken),
      hasRole: Boolean(extra.role)
    };
  }

  function buildCookieHeader(cookies) {
    return dedupeCookies(cookies)
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join("; ");
  }

  function inferCsrfTokenFromCookies(cookies) {
    const preferred = ["x-csrf-token", "xsrf-token", "csrf-token", "csrf_token", "csrftoken", "xsrftoken"];
    const list = dedupeCookies(cookies);
    for (const cookie of list) {
      const key = String(cookie?.name || "").trim().toLowerCase();
      if (preferred.includes(key) || key.includes("csrf") || key.includes("xsrf")) {
        return String(cookie?.value || "").trim();
      }
    }
    return "";
  }

  function normalizeBearerToken(value) {
    return String(value || "").trim().replace(/^Bearer\s+/i, "").trim();
  }

  function buildProviderAuthBundle(provider, payload = {}) {
    const cookies = dedupeCookies(payload.cookies || []);
    const cookieHeader = buildCookieHeader(cookies);
    const csrfToken = String(payload.csrfToken || inferCsrfTokenFromCookies(cookies) || "").trim();
    const role = String(payload.role || "").trim();
    const bearerToken = normalizeBearerToken(payload.authorization || payload.bearerToken || payload.accessToken);

    const material = {};
    if (cookieHeader) material.cookieHeader = cookieHeader;
    if (csrfToken) material.csrfToken = csrfToken;
    if (role) material.role = role;
    if (bearerToken) material.bearerToken = bearerToken;

    return {
      provider,
      capturedAt: new Date().toISOString(),
      sourceHost: String(payload.sourceHost || "").trim() || undefined,
      sourceUrls: PROVIDER_URLS[provider] || [],
      cookies,
      material
    };
  }

  function summarizeAuthBundle(bundle) {
    return summarizeAuthState(bundle?.cookies || [], bundle?.material || {});
  }

  AuthBridge.isObject = isObject;
  AuthBridge.normalizeCookie = normalizeCookie;
  AuthBridge.dedupeCookies = dedupeCookies;
  AuthBridge.summarizeAuthState = summarizeAuthState;
  AuthBridge.buildCookieHeader = buildCookieHeader;
  AuthBridge.inferCsrfTokenFromCookies = inferCsrfTokenFromCookies;
  AuthBridge.normalizeBearerToken = normalizeBearerToken;
  AuthBridge.buildProviderAuthBundle = buildProviderAuthBundle;
  AuthBridge.summarizeAuthBundle = summarizeAuthBundle;
})();
