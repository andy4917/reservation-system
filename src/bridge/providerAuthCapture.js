"use strict";

(() => {
  const ProviderAuthCapture = (globalThis.InventoryProviderAuthCapture = globalThis.InventoryProviderAuthCapture || {});

  function normalizeText(value) {
    return String(value ?? "").trim();
  }

  function readStorageCandidates(storage) {
    const values = [];
    if (!storage || typeof storage.length !== "number") return values;
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (!key) continue;
      const value = storage.getItem(key);
      values.push({ key, value });
    }
    return values;
  }

  function pickBearerToken() {
    const jwtRe = /eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+/;
    const candidates = [...readStorageCandidates(window.localStorage), ...readStorageCandidates(window.sessionStorage)];
    for (const candidate of candidates) {
      const value = normalizeText(candidate.value);
      if (!value) continue;
      const jwt = value.match(jwtRe);
      if (jwt?.[0]) return jwt[0];
      if (/bearer/i.test(value) && value.length > 20) return value.replace(/^Bearer\s+/i, "").trim();
    }
    return "";
  }

  function pickCsrfToken() {
    const meta = document.querySelector('meta[name*="csrf" i], meta[name*="xsrf" i]');
    const metaContent = normalizeText(meta?.getAttribute("content"));
    if (metaContent) return metaContent;
    const cookieMatch = String(document.cookie || "").match(/(?:^|;\s*)(?:x-csrf-token|xsrf-token|csrf-token|csrf_token|csrftoken)=([^;]+)/i);
    return cookieMatch?.[1] ? decodeURIComponent(cookieMatch[1]) : "";
  }

  function pickNaverRole() {
    const bodyText = normalizeText(document.body?.innerText || "");
    const roleMatch = bodyText.match(/\b(OWNER|PARTNER|MANAGER)\b/);
    if (roleMatch?.[1]) return roleMatch[1];
    const candidates = [...readStorageCandidates(window.localStorage), ...readStorageCandidates(window.sessionStorage)];
    for (const candidate of candidates) {
      const value = normalizeText(candidate.value);
      if (/^(OWNER|PARTNER|MANAGER)$/i.test(value)) return value.toUpperCase();
    }
    return "";
  }

  function collectHints(providerType) {
    if (providerType === "naver-partner") {
      return {
        csrfToken: pickCsrfToken(),
        role: pickNaverRole()
      };
    }
    if (providerType === "admin-station") {
      return {
        authorization: pickBearerToken()
      };
    }
    return {};
  }

  ProviderAuthCapture.collectHints = collectHints;
})();
