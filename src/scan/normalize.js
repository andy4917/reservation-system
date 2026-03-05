(() => {
  "use strict";

  const root = globalThis;
  const App = (root.App = root.App || {});
  App.scan = App.scan || {};
  const ns = (App.scan.normalize = App.scan.normalize || {});
  const C = App.constants || {};
  const {
    FIXED_NAVER_BUSINESS_ID,
    FIXED_STATION_BRANCH_ID,
    NAVER_COOKIE_EXPORT_URLS,
    PREF_KEY,
    SYNC_CFG_KEY,
    SYNC_APPLY_KEY,
    SYNC_FEATURE_KEY_LEGACY,
    DEFAULT_SPREADSHEET_ID,
    DEFAULT_SHEET_NAME,
    DEFAULT_START_ROW,
    DEFAULT_YEAR,
    DEFAULT_GOOGLE_CLIENT_ID,
    DEFAULT_SYNC_SLEEP_MS,
    SHEET_GRID_FAST_ROW_LIMIT,
    NAVER_SCHEDULE_FETCH_CONCURRENCY,
    ROOM_MAPPING_WARN_THRESHOLD,
    STATION_TOKEN_CACHE_TTL_MS,
    DATE_RANGE_CACHE_LIMIT,
    APPLY_JITTER_MS,
    APPLY_RETRY_LIMIT,
    EMBEDDED_AUTH_MODE,
    EMBEDDED_AUTH,
    TEXT,
    ROOM_PRESETS,
    ROOM_TYPE_LABELS,
    ROOM_TYPE_BY_ROOM_NO,
    CLOSED_TEXTS,
    V2_COLOR_STATUS_CHANNEL_MAP,
    RESERVATION_BLOCK_COLOR_HEX,
    INVENTORY_PROVIDER_ALIASES,
    DATE_LABEL_RE,
    ROOM_ROW_SKIP_TOKENS,
    DATE_HEADER_HINT,
    SHEET_HINTS_SCAN_RANGE,
    SHEET_HINTS_ROOM_MAP_RANGE,
    SHEET_HINT_CACHE_TTL_MS,
    SHEET_SNAPSHOT_CACHE_TTL_MS,
    SHEET_SNAPSHOT_CACHE_MAX,
    NAVER_BIZ_ITEMS_CACHE_TTL_MS,
    DEFAULT_SCAN_CONFIG,
  } = C;
  App.runtime = App.runtime || {};
  const dateRangeCache = App.runtime.dateRangeCache || (App.runtime.dateRangeCache = new Map());
  const valueCellIndexCache = App.runtime.valueCellIndexCache || (App.runtime.valueCellIndexCache = new WeakMap());
  let stationTokenCache = App.runtime.stationTokenCache || { token: null, expiresAt: 0 };
  const restoredAuthBundleCache = App.runtime.restoredAuthBundleCache || (App.runtime.restoredAuthBundleCache = new Map());
  const SPREADSHEET_ID_RE = /^(?=.{40,120}$)[A-Za-z0-9_-]+$/;
  const ZERO_WIDTH_RE = /[\u200B-\u200D\uFEFF]/g;
  const AUTH_BUNDLE_VERSION = 1;
  const SYNC_CFG_STORAGE_VERSION = 3;
  const SECURE_ENCRYPT_MESSAGE = "inventory.secure.encrypt";
  const SECURE_DECRYPT_MESSAGE = "inventory.secure.decrypt";
  function safeInt(value, fallback = 0) {
    const n = Number(value);
    if (Number.isNaN(n)) return fallback;
    return Math.max(0, Math.floor(n));
  }


  function isDate(value) {
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
  }


  function toDateKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }


  function fromDateKey(value) {
    const date = new Date(`${value}T00:00:00`);
    if (!isDate(value) || Number.isNaN(date.valueOf())) return null;
    return date;
  }


  function addDays(base, days) {
    const next = new Date(base.getTime());
    next.setDate(next.getDate() + days);
    return next;
  }


  function monthStart(base) {
    return new Date(base.getFullYear(), base.getMonth(), 1);
  }


  function monthLabel(date) {
    return `${date.getFullYear()}${TEXT.yearSuffix} ${date.getMonth() + 1}${TEXT.monthSuffix}`;
  }


  function buildDateRange(startDate, endDate) {
    const cacheKey = `${startDate}|${endDate}`;
    if (dateRangeCache.has(cacheKey)) return dateRangeCache.get(cacheKey);
    const dates = [];
    if (!isDate(startDate) || !isDate(endDate) || startDate > endDate) return dates;
    let cursor = fromDateKey(startDate);
    const end = fromDateKey(endDate);
    while (cursor && end && cursor <= end) {
      dates.push(toDateKey(cursor));
      cursor = addDays(cursor, 1);
    }
    if (dateRangeCache.size >= DATE_RANGE_CACHE_LIMIT) {
      const firstKey = dateRangeCache.keys().next().value;
      if (firstKey !== undefined) dateRangeCache.delete(firstKey);
    }
    dateRangeCache.set(cacheKey, dates);
    return dates;
  }


  function normalizeOpenStatus(raw) {
    if (typeof raw === "boolean") return raw ? "OPEN" : "CLOSED";
    if (typeof raw === "number") return raw > 0 ? "OPEN" : "CLOSED";
    const text = String(raw ?? "").trim().toLowerCase();
    if (["open", "opened", "true", "1", "y", "yes", "active"].includes(text)) return "OPEN";
    if (["closed", "close", "false", "0", "n", "no", "inactive", "soldout"].includes(text)) return "CLOSED";
    return "UNKNOWN";
  }


  function toPlainHeaders(input) {
    const headers = {};
    if (!input) return headers;
    if (Array.isArray(input)) {
      for (const item of input) {
        if (!Array.isArray(item) || item.length < 2) continue;
        headers[String(item[0])] = String(item[1]);
      }
      return headers;
    }
    if (typeof Headers !== "undefined" && input instanceof Headers) {
      for (const [key, value] of input.entries()) headers[key] = value;
      return headers;
    }
    if (typeof input === "object") {
      for (const [key, value] of Object.entries(input)) {
        if (value === undefined || value === null) continue;
        headers[key] = String(value);
      }
    }
    return headers;
  }


  function mergeHeaders(target, source) {
    const map = new Map(Object.keys(target).map((key) => [key.toLowerCase(), key]));
    for (const [key, value] of Object.entries(source || {})) {
      const lower = key.toLowerCase();
      const prev = map.get(lower);
      if (prev) target[prev] = value;
      else {
        target[key] = value;
        map.set(lower, key);
      }
    }
    return target;
  }


  function looksLikeJwt(value) {
    return typeof value === "string" && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value.trim());
  }


  function parseJsonMaybe(text) {
    if (typeof text !== "string") return null;
    const trimmed = text.trim();
    if (!trimmed || !["{", "[", "\""].includes(trimmed[0])) return null;
    try {
      return JSON.parse(trimmed);
    } catch (_) {
      return null;
    }
  }


  function parseJwtPayload(token) {
    if (!looksLikeJwt(token) || typeof atob !== "function") return null;
    const parts = token.split(".");
    const payloadPart = parts[1] || "";
    const padded = payloadPart.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payloadPart.length / 4) * 4, "=");
    try {
      return JSON.parse(atob(padded));
    } catch (_) {
      return null;
    }
  }


  function runtimeSendMessage(message) {
    return new Promise((resolve, reject) => {
      if (!chrome?.runtime?.sendMessage) {
        resolve(null);
        return;
      }
      chrome.runtime.sendMessage(message, (response) => {
        const err = chrome.runtime.lastError;
        if (err) {
          reject(new Error(err.message || "Runtime message failed."));
          return;
        }
        if (response?.ok === false) {
          reject(new Error(response.error || "Runtime message failed."));
          return;
        }
        resolve(response || null);
      });
    });
  }


  function normalizeBearerToken(value) {
    return normalizeText(value).replace(/^Bearer\s+/i, "").trim();
  }


  function normalizeCookieRecord(item) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const name = normalizeText(item.name || "");
    const domain = normalizeText(item.domain || "");
    if (!name || !domain) return null;
    const secure = item.secure === true;
    const path = normalizeText(item.path || "/") || "/";
    const rawUrl = normalizeText(item.url || `${secure ? "https" : "http"}://${domain.replace(/^\./, "")}${path}`);
    if (!/^https?:\/\//i.test(rawUrl)) return null;
    const out = {
      name,
      value: String(item.value ?? ""),
      domain,
      path,
      secure,
      httpOnly: item.httpOnly === true,
      sameSite: normalizeText(item.sameSite || "unspecified") || "unspecified",
      session: item.session === true,
      url: rawUrl
    };
    const storeId = normalizeText(item.storeId || "");
    if (storeId) out.storeId = storeId;
    if (item.partitionKey !== undefined && item.partitionKey !== null) out.partitionKey = item.partitionKey;
    if (Number.isFinite(Number(item.expirationDate)) && Number(item.expirationDate) > 0) {
      out.expirationDate = Number(item.expirationDate);
    }
    return out;
  }


  function dedupeCookieRecords(items) {
    const seen = new Set();
    const out = [];
    (Array.isArray(items) ? items : []).forEach((item) => {
      const cookie = normalizeCookieRecord(item);
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


  function buildCookieHeaderFromCookies(cookies) {
    return dedupeCookieRecords(cookies)
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join("; ");
  }


  function inferCsrfTokenFromCookies(cookies) {
    const preferred = ["x-csrf-token", "xsrf-token", "csrf-token", "csrf_token", "csrftoken", "xsrftoken"];
    const list = dedupeCookieRecords(cookies);
    for (const cookie of list) {
      const key = normalizeText(cookie?.name || "").toLowerCase();
      if (!key) continue;
      if (preferred.includes(key) || key.includes("csrf") || key.includes("xsrf")) {
        return normalizeText(cookie?.value || "");
      }
    }
    return "";
  }


  function resolveNaverRoleHint() {
    const storages = [window.localStorage, window.sessionStorage];
    for (const storage of storages) {
      if (!storage) continue;
      for (let i = 0; i < storage.length; i += 1) {
        let key = "";
        let raw = "";
        try {
          key = String(storage.key(i) || "");
          raw = String(storage.getItem(key) || "");
        } catch (_) {
          continue;
        }
        if (!/role/i.test(key)) continue;
        const match = raw.match(/\b(OWNER|MANAGER|STAFF|ADMIN)\b/i);
        if (match) return String(match[1]).toUpperCase();
      }
    }
    return "OWNER";
  }


  function resolveProviderAuthBundlePayload(raw, providerType) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const provider = normalizeText(raw.providerType || raw.provider || "").toLowerCase();
    if (provider === providerType) return raw;
    if (raw[providerType] && typeof raw[providerType] === "object" && !Array.isArray(raw[providerType])) {
      return raw[providerType];
    }

    const nestedCandidates = [raw.authBundles, raw.providerAuthBundles, raw.providers];
    for (const candidate of nestedCandidates) {
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
      if (candidate[providerType]) return candidate[providerType];
    }
    if (providerType === "naver-partner" && raw.naver && typeof raw.naver === "object") return raw.naver;
    if (providerType === "admin-station" && raw.station && typeof raw.station === "object") return raw.station;

    if (!provider && (raw.cookies || raw.cookieHeader || raw.authorization || raw.accessToken || raw.csrfToken || raw.role)) {
      return raw;
    }
    return null;
  }


  function sanitizeProviderAuthBundle(providerType, raw) {
    const source = resolveProviderAuthBundlePayload(raw, providerType);
    if (!source || typeof source !== "object" || Array.isArray(source)) return null;

    const capturedAt = normalizeText(source.capturedAt || source.updatedAt || source.createdAt || "");
    const sourceOrigin = normalizeText(source.sourceOrigin || source.origin || "");
    if (providerType === "admin-station") {
      const accessToken = normalizeBearerToken(
        source.accessToken || source.authorization || source.token || source.bearer || ""
      );
      if (!accessToken) return null;
      return {
        version: AUTH_BUNDLE_VERSION,
        providerType,
        capturedAt,
        sourceOrigin,
        accessToken,
        authorization: `Bearer ${accessToken}`
      };
    }

    const cookies = dedupeCookieRecords(source.cookies || source.cookieJar || []);
    const cookieHeader = normalizeText(source.cookieHeader || source.cookie || buildCookieHeaderFromCookies(cookies));
    const csrfToken = normalizeText(
      source.csrfToken || source["x-csrf-token"] || source.csrf || inferCsrfTokenFromCookies(cookies)
    );
    const role = normalizeText(source.role || source["x-booking-naver-role"] || source.naverRole || "OWNER") || "OWNER";
    if (!cookies.length && !cookieHeader) return null;
    return {
      version: AUTH_BUNDLE_VERSION,
      providerType,
      capturedAt,
      sourceOrigin,
      cookies,
      cookieHeader: cookieHeader || buildCookieHeaderFromCookies(cookies),
      csrfToken,
      role
    };
  }

  function sanitizeHeaderMap(raw) {
    const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    const out = {};
    Object.entries(source).forEach(([key, value]) => {
      const headerKey = normalizeText(key || "");
      const headerValue = normalizeText(value ?? "");
      if (!headerKey || !headerValue) return;
      out[headerKey] = headerValue;
    });
    return out;
  }

  function sanitizeGenericAuthBundle(raw) {
    const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : null;
    if (!source) return null;
    const cookies = dedupeCookieRecords(source.cookies || source.cookieJar || []);
    const cookieHeader = normalizeText(source.cookieHeader || source.cookie || buildCookieHeaderFromCookies(cookies));
    const accessToken = normalizeBearerToken(
      source.accessToken || source.authorization || source.token || source.bearer || ""
    );
    const authorization = normalizeText(source.authorization || (accessToken ? `Bearer ${accessToken}` : ""));
    const csrfToken = normalizeText(
      source.csrfToken || source["x-csrf-token"] || source.csrf || inferCsrfTokenFromCookies(cookies)
    );
    const role = normalizeText(source.role || source["x-booking-naver-role"] || source.naverRole || "");
    const headers = sanitizeHeaderMap(source.headers || source.headerMap || {});
    const capturedAt = normalizeText(source.capturedAt || source.updatedAt || source.createdAt || "");
    const sourceOrigin = normalizeText(source.sourceOrigin || source.origin || "");
    const method = normalizeText(source.method || source.httpMethod || "").toUpperCase();
    const contentType = normalizeText(source.contentType || source.bodyType || "").toLowerCase();
    const requestBody = typeof source.requestBody === "string"
      ? source.requestBody.trim()
      : normalizeText(source.requestBody || source.body || "");
    const hasRequestConfig = Boolean(method || contentType || requestBody);
    if (!cookieHeader && !authorization && !Object.keys(headers).length && !cookies.length && !hasRequestConfig) return null;
    const out = {
      capturedAt,
      sourceOrigin,
      headers
    };
    if (cookies.length) out.cookies = cookies;
    if (cookieHeader) out.cookieHeader = cookieHeader;
    if (accessToken) out.accessToken = accessToken;
    if (authorization) out.authorization = authorization;
    if (csrfToken) out.csrfToken = csrfToken;
    if (role) out.role = role;
    if (method) out.method = method;
    if (contentType) out.contentType = contentType;
    if (requestBody) out.requestBody = requestBody;
    return out;
  }

  function buildWingsPmsRangeBody({
    propertyNo,
    bsnsCode,
    pageId,
    pageSize,
    startDate,
    endDate,
    dateField = "ARRV_DATE",
    dateStartKey = "ARRV_DATE_F",
    dateEndKey = "ARRV_DATE_T"
  }) {
    const body = new URLSearchParams();
    body.set("take", String(pageSize));
    body.set("skip", "0");
    body.set("page", "1");
    body.set("pageSize", String(pageSize));
    body.set("filter[PAGE_ID]", pageId);
    body.set("filter[AUTH_PASS_YN]", "N");
    body.set("filter[filters][0][field]", "BSNS_CODE");
    body.set("filter[filters][0][value]", bsnsCode);
    body.set("filter[filters][1][field]", "PROPERTY_NO");
    body.set("filter[filters][1][value]", propertyNo);
    body.set("filter[filters][2][field]", dateField);
    body.set("filter[filters][2][operator]", "gte");
    body.set("filter[filters][2][value]", startDate);
    body.set("filter[filters][3][field]", dateField);
    body.set("filter[filters][3][operator]", "lte");
    body.set("filter[filters][3][value]", endDate);
    body.set(dateStartKey, startDate);
    body.set(dateEndKey, endDate);
    return body.toString();
  }

  const WINGS_PMS_PRESET_DEFS = {
    "wings-global-guest-list": {
      urlPath: "/pms/biz/ir04_0100X/searchListGlobalRsvn_v03.do",
      defaultPageId: "IR04_0100X_V03",
      defaultPageSize: 300,
      dateStartKey: "ARRV_DATE_F",
      dateEndKey: "ARRV_DATE_T",
      buildBody({ propertyNo, bsnsCode, pageId, pageSize, startDate, endDate }) {
        return buildWingsPmsRangeBody({
          propertyNo,
          bsnsCode,
          pageId,
          pageSize,
          startDate,
          endDate,
          dateField: "ARRV_DATE",
          dateStartKey: "ARRV_DATE_F",
          dateEndKey: "ARRV_DATE_T"
        });
      }
    },
    "wings-reservation-list": {
      urlPath: "/pms/biz/ir04_0100X/searchListRsvn.do",
      defaultPageId: "",
      defaultPageSize: 300,
      dateStartKey: "ARRV_DATE_F",
      dateEndKey: "ARRV_DATE_T",
      buildBody({ propertyNo, bsnsCode, pageId, pageSize, startDate, endDate }) {
        return buildWingsPmsRangeBody({
          propertyNo,
          bsnsCode,
          pageId,
          pageSize,
          startDate,
          endDate,
          dateField: "ARRV_DATE",
          dateStartKey: "ARRV_DATE_F",
          dateEndKey: "ARRV_DATE_T"
        });
      }
    }
  };

  const WINGS_PMS_HAR_PRESET_PATHS = Object.entries(WINGS_PMS_PRESET_DEFS).map(([presetKey, presetDef]) => ({
    presetKey,
    path: normalizeText(presetDef?.urlPath || "")
  }));
  const WINGS_PMS_HAR_READONLY_PATH_RE = /\/pms\/biz\/[^/]+\/(?:search|select|view)[^/]*\.do$/i;
  const WINGS_PMS_HAR_MUTATION_PATH_RE = /\/pms\/biz\/[^/]+\/(?:update|insert|delete|send)[^/]*\.do$/i;

  function sanitizeWingsPmsPreset(raw) {
    const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    const presetKey = normalizeText(source.presetKey || source.type || source.key || "");
    const propertyNo = normalizeText(source.propertyNo || source.PROPERTY_NO || source.property || "");
    const bsnsCode = normalizeText(source.bsnsCode || source.BSNS_CODE || source.businessCode || "");
    const presetDef = WINGS_PMS_PRESET_DEFS[presetKey] || null;
    const pageId = normalizeText(source.pageId || source.PAGE_ID || source.page || presetDef?.defaultPageId || "");
    const pageSizeRaw = Number(source.pageSize || source.take || source.size || presetDef?.defaultPageSize || 300);
    const pageSize = Math.max(1, Number.isFinite(pageSizeRaw) ? Math.trunc(pageSizeRaw) : 300);
    return { presetKey, propertyNo, bsnsCode, pageId, pageSize };
  }

  function buildWingsPmsPresetRequest(rawPreset, currentUrl = "") {
    const preset = sanitizeWingsPmsPreset(rawPreset);
    const presetDef = WINGS_PMS_PRESET_DEFS[preset.presetKey] || null;
    if (!presetDef) return null;
    const propertyNo = normalizeText(preset.propertyNo || "");
    const bsnsCode = normalizeText(preset.bsnsCode || propertyNo);
    const pageId = normalizeText(preset.pageId || presetDef.defaultPageId || "");
    if (!propertyNo || !bsnsCode || !pageId) return null;
    let origin = "https://pms.sanhait.com";
    try {
      if (currentUrl) origin = new URL(currentUrl).origin || origin;
    } catch (_) {
      // Keep default origin.
    }
    const url = new URL(presetDef.urlPath, origin);
    const requestBody = presetDef.buildBody({
      propertyNo,
      bsnsCode,
      pageId,
      pageSize: preset.pageSize || presetDef.defaultPageSize,
      startDate: "2026-02-28",
      endDate: "2026-03-07"
    });
    return {
      url: url.toString(),
      bundle: {
        method: "POST",
        contentType: "form",
        headers: {
          "X-Requested-With": "XMLHttpRequest"
        },
        requestBody
      }
    };
  }

  function getHarHeaderMap(rawHeaders) {
    const out = {};
    if (!Array.isArray(rawHeaders)) return out;
    rawHeaders.forEach((item) => {
      const key = normalizeText(item?.name || item?.key || "");
      const value = normalizeText(item?.value ?? "");
      if (!key || !value) return;
      mergeHeaders(out, { [key]: value });
    });
    return out;
  }

  function getHeaderValue(headerMap, headerName) {
    const wanted = normalizeText(headerName).toLowerCase();
    if (!wanted || !headerMap || typeof headerMap !== "object") return "";
    for (const [key, value] of Object.entries(headerMap)) {
      if (normalizeText(key).toLowerCase() === wanted) return normalizeText(value);
    }
    return "";
  }

  function buildHarPostDataText(postData) {
    if (typeof postData?.text === "string" && postData.text.trim()) return postData.text.trim();
    if (!Array.isArray(postData?.params)) return "";
    const body = new URLSearchParams();
    postData.params.forEach((item) => {
      const key = normalizeText(item?.name || "");
      if (!key) return;
      const value = item?.value === undefined || item?.value === null ? "" : String(item.value);
      body.append(key, value);
    });
    return body.toString();
  }

  function inferWingsPmsContentType(headerMap, postData, requestBody) {
    const contentType = normalizeText(postData?.mimeType || getHeaderValue(headerMap, "content-type") || "").toLowerCase();
    if (contentType.includes("json")) return "json";
    if (contentType.includes("x-www-form-urlencoded")) return "form";
    if (requestBody) return "form";
    return "";
  }

  function appendParamsToBag(bag, rawText) {
    const text = normalizeText(rawText);
    if (!text) return;
    try {
      const params = new URLSearchParams(text);
      params.forEach((value, key) => {
        bag.append(key, value);
      });
    } catch (_) {
      // Ignore malformed param strings.
    }
  }

  function getParamValueByKeys(params, keys) {
    const wanted = new Set((Array.isArray(keys) ? keys : [keys]).map((key) => normalizeText(key).toLowerCase()));
    for (const [key, value] of params.entries()) {
      if (wanted.has(normalizeText(key).toLowerCase())) return normalizeText(value);
    }
    return "";
  }

  function getFilterValueByField(params, fieldName) {
    const groups = new Map();
    for (const [key, value] of params.entries()) {
      const match = key.match(/^filter\[filters\]\[(\d+)\]\[(field|value)\]$/);
      if (!match) continue;
      const idx = match[1];
      const prop = match[2];
      const prev = groups.get(idx) || {};
      prev[prop] = value;
      groups.set(idx, prev);
    }
    for (const entry of groups.values()) {
      if (normalizeText(entry.field).toUpperCase() === fieldName) return normalizeText(entry.value);
    }
    return "";
  }

  function inferWingsPmsPresetKeyFromPath(pathname) {
    const normalizedPath = normalizeText(pathname);
    const matched = WINGS_PMS_HAR_PRESET_PATHS.find((item) => item.path && normalizedPath.endsWith(item.path));
    return matched?.presetKey || "";
  }

  function scoreWingsHarEntry(entry) {
    const request = entry?.request;
    const rawUrl = normalizeText(request?.url || "");
    if (!rawUrl) return -1;
    let url;
    try {
      url = new URL(rawUrl);
    } catch (_) {
      return -1;
    }
    const pathname = normalizeText(url.pathname || "");
    if (!pathname || WINGS_PMS_HAR_MUTATION_PATH_RE.test(pathname)) return -1;
    if (!WINGS_PMS_HAR_READONLY_PATH_RE.test(pathname)) return -1;
    const requestBody = buildHarPostDataText(request?.postData);
    const combined = `${pathname}\n${requestBody}`;
    const hasCoreFields = /PROPERTY_NO|BSNS_CODE|PAGE_ID/i.test(combined);
    const presetKey = inferWingsPmsPresetKeyFromPath(pathname);
    let score = 10;
    if (normalizeText(request?.method || "").toUpperCase() === "POST") score += 10;
    if (hasCoreFields) score += 25;
    if (presetKey) score += 50;
    return score;
  }

  function collectHarEntries(parsed) {
    if (!parsed || typeof parsed !== "object") return [];
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed.entries)) return parsed.entries;
    if (Array.isArray(parsed.log?.entries)) return parsed.log.entries;
    if (parsed.request) return [parsed];
    return [];
  }

  function pickBestHarEntry(entries) {
    let bestEntry = null;
    let bestScore = -1;
    (Array.isArray(entries) ? entries : []).forEach((entry) => {
      const score = scoreWingsHarEntry(entry);
      if (score > bestScore) {
        bestScore = score;
        bestEntry = entry;
      }
    });
    return bestScore < 0 ? null : bestEntry;
  }

  function buildHarParamBag(url, requestBody) {
    const params = new URLSearchParams();
    url.searchParams.forEach((value, key) => {
      params.append(key, value);
    });
    appendParamsToBag(params, requestBody);
    return params;
  }

  function extractWingsPresetFromHar(pathname, params, requestBody) {
    const presetKey = inferWingsPmsPresetKeyFromPath(pathname);
    const propertyNo = (
      getParamValueByKeys(params, ["PROPERTY_NO", "propertyNo"]) ||
      getFilterValueByField(params, "PROPERTY_NO")
    );
    const bsnsCode = (
      getParamValueByKeys(params, ["BSNS_CODE", "bsnsCode", "businessCode"]) ||
      getFilterValueByField(params, "BSNS_CODE") ||
      propertyNo
    );
    const pageId = getParamValueByKeys(params, ["PAGE_ID", "pageId", "filter[PAGE_ID]"]);
    const pageSizeRaw = Number(getParamValueByKeys(params, ["take", "pageSize", "size"]) || 300);
    const pageSize = Math.max(1, Number.isFinite(pageSizeRaw) ? Math.trunc(pageSizeRaw) : 300);
    if (!propertyNo && !bsnsCode && !pageId && !requestBody) return null;
    return sanitizeWingsPmsPreset({
      presetKey,
      propertyNo,
      bsnsCode,
      pageId,
      pageSize
    });
  }

  function buildWingsBundleFromHarEntry(entry, url, headerMap, requestBody, contentType) {
    const headers = {};
    if (getHeaderValue(headerMap, "x-requested-with")) {
      headers["X-Requested-With"] = getHeaderValue(headerMap, "x-requested-with");
    }
    return sanitizeGenericAuthBundle({
      capturedAt: normalizeText(entry?.startedDateTime || ""),
      sourceOrigin: url.origin,
      method: normalizeText(entry?.request?.method || "").toUpperCase() || "GET",
      contentType,
      requestBody,
      authorization: getHeaderValue(headerMap, "authorization"),
      cookieHeader: getHeaderValue(headerMap, "cookie"),
      csrfToken: getHeaderValue(headerMap, "x-csrf-token"),
      headers
    });
  }

  function convertHarToWingsPmsConfig(rawHar) {
    const parsed = typeof rawHar === "string" ? parseJsonMaybe(rawHar) : rawHar;
    const entries = collectHarEntries(parsed);
    if (!entries.length) return null;

    const bestEntry = pickBestHarEntry(entries);
    if (!bestEntry) return null;

    const request = bestEntry.request || {};
    const url = new URL(String(request.url));
    const pathname = normalizeText(url.pathname || "");
    const headerMap = getHarHeaderMap(request.headers);
    const requestBody = buildHarPostDataText(request.postData);
    const contentType = inferWingsPmsContentType(headerMap, request.postData, requestBody);
    const params = buildHarParamBag(url, requestBody);
    const preset = extractWingsPresetFromHar(pathname, params, requestBody);
    if (!preset) return null;
    const bundle = buildWingsBundleFromHarEntry(bestEntry, url, headerMap, requestBody, contentType);

    return {
      preset,
      url: url.toString(),
      bundle,
      matchedPath: pathname
    };
  }


  function sanitizeStoredAuthBundles(raw) {
    const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    const out = {};
    ["admin-station", "naver-partner"].forEach((providerType) => {
      const bundle = sanitizeProviderAuthBundle(providerType, source);
      if (bundle) out[providerType] = bundle;
    });
    return out;
  }


  function parseAuthBundleMaybe(value, providerType) {
    const text = String(value ?? "").trim();
    if (!text || !text.startsWith("{")) return null;
    try {
      const parsed = JSON.parse(text);
      if (providerType) return sanitizeProviderAuthBundle(providerType, parsed);
      return parsed;
    } catch (_) {
      return null;
    }
  }


  async function exportCookiesForUrls(urls) {
    const response = await runtimeSendMessage({ type: "inventory.auth.exportCookies", urls });
    return dedupeCookieRecords(response?.cookies || []);
  }


  async function importCookiesForBundle(cookies) {
    const list = dedupeCookieRecords(cookies);
    if (!list.length) return { appliedCount: 0, failedCount: 0, applied: [], failed: [] };
    const response = await runtimeSendMessage({ type: "inventory.auth.importCookies", cookies: list });
    return response || { appliedCount: 0, failedCount: 0, applied: [], failed: [] };
  }


  async function captureProviderAuthBundle(providerType) {
    if (providerType === "admin-station") {
      const accessToken = normalizeBearerToken(resolveStationAccessToken(true) || resolveStationAccessToken(false) || "");
      if (!accessToken) return null;
      return sanitizeProviderAuthBundle(providerType, {
        version: AUTH_BUNDLE_VERSION,
        providerType,
        capturedAt: new Date().toISOString(),
        sourceOrigin: location.origin,
        accessToken,
        authorization: `Bearer ${accessToken}`
      });
    }
    if (providerType === "naver-partner") {
      const cookies = await exportCookiesForUrls(NAVER_COOKIE_EXPORT_URLS);
      return sanitizeProviderAuthBundle(providerType, {
        version: AUTH_BUNDLE_VERSION,
        providerType,
        capturedAt: new Date().toISOString(),
        sourceOrigin: location.origin,
        cookies,
        cookieHeader: buildCookieHeaderFromCookies(cookies),
        csrfToken: inferCsrfTokenFromCookies(cookies),
        role: resolveNaverRoleHint()
      });
    }
    return null;
  }


  async function restoreProviderAuthBundle(providerType, bundle) {
    const normalized = sanitizeProviderAuthBundle(providerType, bundle);
    if (!normalized || providerType !== "naver-partner" || !normalized.cookies?.length) return false;
    const fingerprint = JSON.stringify({
      providerType,
      cookieHeader: normalized.cookieHeader,
      csrfToken: normalized.csrfToken,
      role: normalized.role
    });
    if (restoredAuthBundleCache.get(providerType) === fingerprint) return true;
    await importCookiesForBundle(normalized.cookies);
    restoredAuthBundleCache.set(providerType, fingerprint);
    return true;
  }


  async function loadStoredProviderAuthBundle(providerType) {
    const cached = App.runtime.syncConfigCache;
    if (cached?.authBundles?.[providerType]) return cached.authBundles[providerType];
    const raw = await storageGet(SYNC_CFG_KEY);
    const restored = await restoreSyncConfigFromStorage(raw);
    const normalized = sanitizeSyncConfig(applyEmbeddedSyncConfig(restored));
    App.runtime.syncConfigCache = normalized;
    return normalized.authBundles?.[providerType] || null;
  }


  function collectJwtCandidates(value, bucket, depth = 0) {
    if (depth > 5 || value === null || value === undefined) return;
    if (typeof value === "string") {
      const text = value.trim();
      if (!text) return;

      const bearer = text.match(/^Bearer\s+(.+)$/i);
      if (bearer && looksLikeJwt(bearer[1])) bucket.add(bearer[1].trim());
      if (looksLikeJwt(text)) bucket.add(text);

      const matches = text.match(/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g);
      if (matches) {
        for (const token of matches) {
          if (looksLikeJwt(token)) bucket.add(token.trim());
        }
      }

      const parsed = parseJsonMaybe(text);
      if (parsed !== null) collectJwtCandidates(parsed, bucket, depth + 1);
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) collectJwtCandidates(item, bucket, depth + 1);
      return;
    }

    if (typeof value === "object") {
      for (const [key, item] of Object.entries(value)) {
        if (item === null || item === undefined) continue;
        if (/token|auth|jwt|bearer|access|refresh/i.test(key)) collectJwtCandidates(item, bucket, depth + 1);
      }
      for (const item of Object.values(value)) collectJwtCandidates(item, bucket, depth + 1);
    }
  }


  function collectStorageTokenCandidates(storage, sourceName) {
    const candidates = [];
    if (!storage) return candidates;
    for (let i = 0; i < storage.length; i += 1) {
      let key = "";
      let raw = "";
      try {
        key = storage.key(i) || "";
        if (!key) continue;
        raw = storage.getItem(key) || "";
      } catch (_) {
        continue;
      }
      if (!raw) continue;
      const bucket = new Set();
      collectJwtCandidates(raw, bucket);
      for (const token of bucket) {
        candidates.push({ token, key, sourceName });
      }
    }
    return candidates;
  }


  function scoreTokenCandidate(candidate) {
    const hint = `${candidate.sourceName}:${candidate.key}`.toLowerCase();
    let score = 0;
    if (hint.includes("access")) score += 60;
    if (hint.includes("authorization")) score += 50;
    if (hint.includes("auth")) score += 30;
    if (hint.includes("token")) score += 20;
    if (hint.includes("refresh")) score -= 120;

    const payload = parseJwtPayload(candidate.token);
    const exp = Number(payload?.exp);
    if (Number.isFinite(exp)) {
      const nowSec = Math.floor(Date.now() / 1000);
      if (exp > nowSec) score += 120;
      else score -= 300;
    }
    const iat = Number(payload?.iat);
    if (Number.isFinite(iat) && Number.isFinite(exp) && exp > iat) {
      const ttl = exp - iat;
      if (ttl >= 60 * 60 * 24 * 25) score -= 40;
      if (ttl <= 60 * 60 * 24 * 21) score += 20;
    }
    return score;
  }


  function resolveStationAccessToken(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && stationTokenCache.expiresAt > now) return stationTokenCache.token;
    const candidates = [
      ...collectStorageTokenCandidates(window.localStorage, "localStorage"),
      ...collectStorageTokenCandidates(window.sessionStorage, "sessionStorage")
    ];
    if (!candidates.length) {
      stationTokenCache = { token: null, expiresAt: now + STATION_TOKEN_CACHE_TTL_MS };
      return null;
    }

    const bestByToken = new Map();
    for (const candidate of candidates) {
      const prev = bestByToken.get(candidate.token);
      if (!prev || scoreTokenCandidate(candidate) > scoreTokenCandidate(prev)) {
        bestByToken.set(candidate.token, candidate);
      }
    }
    const sorted = [...bestByToken.values()].sort((a, b) => scoreTokenCandidate(b) - scoreTokenCandidate(a));
    const token = sorted[0]?.token ?? null;
    stationTokenCache = { token, expiresAt: now + STATION_TOKEN_CACHE_TTL_MS };
    return token;
  }


  function createDefaultSessionRequestContext() {
    return {
      async build(requestUrl, init = {}) {
        const headers = {};
        mergeHeaders(headers, toPlainHeaders(init.headers));
        return { ...init, headers, credentials: init.credentials ?? "include" };
      },
      async buildVariants(requestUrl, init = {}) {
        return [await this.build(requestUrl, init)];
      }
    };
  }


  function createNaverSessionRequestContext() {
    return {
      async build(requestUrl, init = {}) {
        const headers = {};
        mergeHeaders(headers, toPlainHeaders(init.headers));
        const bundle = await loadStoredProviderAuthBundle("naver-partner");
        if (bundle) {
          try {
            await restoreProviderAuthBundle("naver-partner", bundle);
          } catch (error) {
            console.warn("[auth] failed to restore naver cookies", error);
          }
          if (bundle.csrfToken) mergeHeaders(headers, { "x-csrf-token": bundle.csrfToken });
          if (bundle.role) mergeHeaders(headers, { "x-booking-naver-role": bundle.role });
        }
        return { ...init, headers, credentials: init.credentials ?? "include" };
      },
      async buildVariants(requestUrl, init = {}) {
        return [await this.build(requestUrl, init)];
      }
    };
  }


  function createStationSessionRequestContext() {
    let cachedToken = null;

    async function getToken(forceRefresh = false) {
      if (!forceRefresh && cachedToken) return cachedToken;
      cachedToken = resolveStationAccessToken(forceRefresh);
      if (!cachedToken) {
        const bundle = await loadStoredProviderAuthBundle("admin-station");
        cachedToken = normalizeBearerToken(bundle?.authorization || bundle?.accessToken || "");
      }
      return cachedToken;
    }

    function buildWithHeaders(init, extraHeaders) {
      const headers = {};
      mergeHeaders(headers, toPlainHeaders(init.headers));
      mergeHeaders(headers, toPlainHeaders(extraHeaders));
      return { ...init, headers, credentials: init.credentials ?? "omit" };
    }

    return {
      async build(requestUrl, init = {}) {
        const token = await getToken(false);
        const authValue = token ? `Bearer ${token.replace(/^Bearer\s+/i, "").trim()}` : null;
        return buildWithHeaders(init, authValue ? { Authorization: authValue } : {});
      },
      async buildVariants(requestUrl, init = {}) {
        const variants = [];
        const seen = new Set();
        const push = (requestInit) => {
          const key = JSON.stringify(requestInit.headers || {});
          if (seen.has(key)) return;
          seen.add(key);
          variants.push(requestInit);
        };

        push(buildWithHeaders(init, {}));

        const token = (await getToken(true)) || (await getToken(false));
        if (!token) return variants;
        const rawToken = token.replace(/^Bearer\s+/i, "").trim();
        push(buildWithHeaders(init, { Authorization: `Bearer ${rawToken}` }));
        push(buildWithHeaders(init, { Authorization: rawToken }));
        return variants;
      }
    };
  }


  function createSessionRequestContext(providerType) {
    if (providerType === "admin-station") return createStationSessionRequestContext();
    if (providerType === "naver-partner") return createNaverSessionRequestContext();
    return createDefaultSessionRequestContext();
  }


  function storageGet(key) {
    return new Promise((resolve) => {
      if (!chrome?.storage?.local) return resolve(null);
      chrome.storage.local.get([key], (data) => resolve(data?.[key] ?? null));
    });
  }


  function storageSet(key, value) {
    return new Promise((resolve) => {
      if (!chrome?.storage?.local) return resolve();
      chrome.storage.local.set({ [key]: value }, () => resolve());
    });
  }

  function sanitizeProviderApplyConfig(raw) {
    const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    return {
      "admin-station": source["admin-station"] !== false,
      "naver-partner": source["naver-partner"] === true
    };
  }

  function splitSensitiveSyncConfig(config) {
    const safeConfig = config && typeof config === "object" ? { ...config } : {};
    const sensitive = {
      accessToken: normalizeText(safeConfig.accessToken || ""),
      refreshToken: normalizeText(safeConfig.refreshToken || ""),
      clientSecret: normalizeText(safeConfig.clientSecret || ""),
      authBundles: sanitizeStoredAuthBundles(safeConfig.authBundles || {}),
      pmsAuthBundle: sanitizeGenericAuthBundle(safeConfig.pmsAuthBundle || {})
    };
    delete safeConfig.accessToken;
    delete safeConfig.refreshToken;
    delete safeConfig.clientSecret;
    delete safeConfig.authBundles;
    delete safeConfig.pmsAuthBundle;
    return { safeConfig, sensitive };
  }

  function hasSensitiveSyncConfig(sensitive) {
    if (!sensitive || typeof sensitive !== "object") return false;
    return Boolean(
      normalizeText(sensitive.accessToken || "") ||
      normalizeText(sensitive.refreshToken || "") ||
      normalizeText(sensitive.clientSecret || "") ||
      Object.keys(sensitive.authBundles || {}).length > 0 ||
      sensitive.pmsAuthBundle
    );
  }

  async function encryptSensitiveSyncConfig(sensitive) {
    if (!hasSensitiveSyncConfig(sensitive)) return null;
    if (!chrome?.runtime?.sendMessage) return sensitive;
    const response = await runtimeSendMessage({
      type: SECURE_ENCRYPT_MESSAGE,
      value: sensitive
    });
    return response?.secure || null;
  }

  async function decryptSensitiveSyncConfig(securePayload) {
    if (!securePayload) return {};
    if (!chrome?.runtime?.sendMessage) return securePayload;
    const response = await runtimeSendMessage({
      type: SECURE_DECRYPT_MESSAGE,
      secure: securePayload
    });
    return response?.value && typeof response.value === "object" ? response.value : {};
  }

  async function prepareSyncConfigForStorage(config) {
    const normalized = sanitizeSyncConfig(applyEmbeddedSyncConfig(config));
    const { safeConfig, sensitive } = splitSensitiveSyncConfig(normalized);
    const encrypted = await encryptSensitiveSyncConfig(sensitive);
    if (!chrome?.runtime?.sendMessage) return normalized;
    return {
      version: SYNC_CFG_STORAGE_VERSION,
      config: safeConfig,
      secure: encrypted
    };
  }

  async function restoreSyncConfigFromStorage(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
    if (Number(raw.version) !== SYNC_CFG_STORAGE_VERSION || !raw.config || typeof raw.config !== "object") {
      return raw;
    }
    const safeConfig = raw.config && typeof raw.config === "object" ? raw.config : {};
    const sensitive = await decryptSensitiveSyncConfig(raw.secure || null);
    return {
      ...safeConfig,
      ...(sensitive && typeof sensitive === "object" ? sensitive : {})
    };
  }


  function normalizeText(value) {
    if (value === null || value === undefined) return "";
    return String(value).replace(/\s+/g, " ").trim();
  }


  function normalizeSpreadsheetInput(value) {
    return normalizeText(value).replace(ZERO_WIDTH_RE, "").trim();
  }


  function unquoteSpreadsheetInput(text) {
    const input = normalizeSpreadsheetInput(text);
    if (!input) return "";
    if ((input.startsWith("\"") && input.endsWith("\"")) || (input.startsWith("'") && input.endsWith("'"))) {
      return input.slice(1, -1).trim();
    }
    return input;
  }


  function isLikelySpreadsheetId(value) {
    const id = normalizeSpreadsheetInput(value);
    return SPREADSHEET_ID_RE.test(id) && /[A-Za-z]/.test(id);
  }


  function normalizeRoomNoKey(value) {
    return normalizeText(value).toUpperCase().replace(/\s+/g, "");
  }


  function sleep(ms) {
    const delay = Math.max(0, Number(ms) || 0);
    return new Promise((resolve) => setTimeout(resolve, delay));
  }


  async function mapWithConcurrencyLimit(items, limit, worker) {
    const list = Array.isArray(items) ? items : [];
    if (!list.length) return [];
    const maxWorkers = Math.max(1, Number(limit) || 1);
    const results = new Array(list.length);
    let cursor = 0;

    const workers = new Array(Math.min(maxWorkers, list.length)).fill(null).map(async () => {
      while (true) {
        const idx = cursor;
        cursor += 1;
        if (idx >= list.length) return;
        results[idx] = await worker(list[idx], idx);
      }
    });

    await Promise.all(workers);
    return results;
  }


  function extractSpreadsheetId(value) {
    const text = unquoteSpreadsheetInput(value);
    if (!text) return "";

    const candidates = new Set([text]);
    const decoded = (() => {
      try {
        return decodeURIComponent(text);
      } catch (_) {
        return text;
      }
    })();
    if (decoded) candidates.add(unquoteSpreadsheetInput(decoded));

    const maybeUrl = (() => {
      if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) return text;
      if (/^docs\.google\.com\//i.test(text)) return `https://${text}`;
      return "";
    })();
    if (maybeUrl) {
      try {
        const parsed = new URL(maybeUrl);
        const path = normalizeSpreadsheetInput(parsed.pathname || "");
        if (path) candidates.add(path);
        const idQuery = unquoteSpreadsheetInput(parsed.searchParams.get("id") || "");
        if (idQuery) candidates.add(idQuery);
      } catch (_) {
        // ignore URL parse failures and continue with raw candidates.
      }
    }

    const pathIdPattern = /\/spreadsheets(?:\/u\/\d+)?\/d\/([A-Za-z0-9_-]{40,120})/i;
    const genericPathIdPattern = /\/d\/([A-Za-z0-9_-]{40,120})/i;
    const queryIdPattern = /(?:[?&#]|^)id=([A-Za-z0-9_-]{40,120})/i;

    for (const candidateRaw of candidates) {
      const candidate = unquoteSpreadsheetInput(candidateRaw);
      if (!candidate) continue;

      const pathMatch = candidate.match(pathIdPattern) || candidate.match(genericPathIdPattern);
      if (pathMatch?.[1]) return pathMatch[1];

      const queryMatch = candidate.match(queryIdPattern);
      if (queryMatch?.[1]) return queryMatch[1];

      const leadingToken = candidate.split(/[/?#&=]/)[0];
      if (isLikelySpreadsheetId(leadingToken)) return leadingToken;
      if (isLikelySpreadsheetId(candidate)) return candidate;
    }

    return "";
  }


  function toIntOrNull(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    return Math.trunc(n);
  }


  function parseOptionalPositiveInt(value) {
    const text = normalizeText(value);
    if (!text) return null;
    const n = Number(text);
    if (!Number.isFinite(n)) return null;
    const i = Math.trunc(n);
    if (i <= 0) return null;
    return i;
  }


  function parseColumnRefToOneBased(value) {
    const text = normalizeText(value).toUpperCase();
    if (!text) return null;
    if (/^\d+$/.test(text)) return Math.max(1, Number(text));
    if (!/^[A-Z]+$/.test(text)) return null;
    let out = 0;
    for (const ch of text) {
      out = out * 26 + (ch.charCodeAt(0) - 64);
    }
    return out > 0 ? out : null;
  }


  function oneBasedToZeroBased(value) {
    return Number.isInteger(value) && value > 0 ? value - 1 : null;
  }

  function parseBooleanFlag(value, fallback = false) {
    if (typeof value === "boolean") return value;
    const text = normalizeText(value).toLowerCase();
    if (!text) return Boolean(fallback);
    if (["1", "true", "y", "yes", "on", "enable", "enabled"].includes(text)) return true;
    if (["0", "false", "n", "no", "off", "disable", "disabled"].includes(text)) return false;
    return Boolean(fallback);
  }


  function sanitizeScanConfig(raw) {
    const input = raw && typeof raw === "object" ? raw : {};
    const mode = normalizeText(input.mode || DEFAULT_SCAN_CONFIG.mode).toLowerCase() === "manual" ? "manual" : "auto";
    const allowPkgInventoryRows = parseBooleanFlag(
      input.allowPkgInventoryRows,
      DEFAULT_SCAN_CONFIG.allowPkgInventoryRows === true
    );
    const dateRow = parseOptionalPositiveInt(input.dateRow);
    const weekdayRow = parseOptionalPositiveInt(input.weekdayRow);
    const dateStartCol = parseColumnRefToOneBased(input.dateStartCol) || DEFAULT_SCAN_CONFIG.dateStartCol;
    const dateEndColRaw = parseColumnRefToOneBased(input.dateEndCol) || DEFAULT_SCAN_CONFIG.dateEndCol;
    const dateEndCol = Math.max(dateStartCol, dateEndColRaw);
    const normalizeRangePair = (startRaw, endRaw) => {
      const start = parseOptionalPositiveInt(startRaw);
      const end = parseOptionalPositiveInt(endRaw);
      if (start && end && end < start) return { start: end, end: start };
      return { start, end };
    };
    const urbanRange = normalizeRangePair(input.urbanStartRow, input.urbanEndRow);
    const doubleTwinRange = normalizeRangePair(input.doubleTwinStartRow, input.doubleTwinEndRow);
    const grandRange = normalizeRangePair(input.grandStartRow, input.grandEndRow);
    const stationUrbanRange = normalizeRangePair(input.stationUrbanStartRow, input.stationUrbanEndRow);
    const stationDoubleTwinRange = normalizeRangePair(input.stationDoubleTwinStartRow, input.stationDoubleTwinEndRow);
    const stationGrandRange = normalizeRangePair(input.stationGrandStartRow, input.stationGrandEndRow);
    const naverUrbanRange = normalizeRangePair(input.naverUrbanStartRow, input.naverUrbanEndRow);
    const naverDoubleTwinRange = normalizeRangePair(input.naverDoubleTwinStartRow, input.naverDoubleTwinEndRow);
    const naverGrandRange = normalizeRangePair(input.naverGrandStartRow, input.naverGrandEndRow);
    const roomSoldVacScanRange = normalizeRangePair(input.roomSoldVacScanStartRow, input.roomSoldVacScanEndRow);
    return {
      mode,
      allowPkgInventoryRows,
      dateRow,
      weekdayRow,
      dateStartCol,
      dateEndCol,
      roomStartRow: parseOptionalPositiveInt(input.roomStartRow),
      urbanStartRow: urbanRange.start,
      urbanEndRow: urbanRange.end,
      doubleTwinStartRow: doubleTwinRange.start,
      doubleTwinEndRow: doubleTwinRange.end,
      grandStartRow: grandRange.start,
      grandEndRow: grandRange.end,
      inventorySearchStartRow: parseOptionalPositiveInt(input.inventorySearchStartRow),
      stationInventoryRow: parseOptionalPositiveInt(input.stationInventoryRow),
      naverInventoryRow: parseOptionalPositiveInt(input.naverInventoryRow),
      stationUrbanStartRow: stationUrbanRange.start,
      stationUrbanEndRow: stationUrbanRange.end,
      stationDoubleTwinStartRow: stationDoubleTwinRange.start,
      stationDoubleTwinEndRow: stationDoubleTwinRange.end,
      stationGrandStartRow: stationGrandRange.start,
      stationGrandEndRow: stationGrandRange.end,
      naverUrbanStartRow: naverUrbanRange.start,
      naverUrbanEndRow: naverUrbanRange.end,
      naverDoubleTwinStartRow: naverDoubleTwinRange.start,
      naverDoubleTwinEndRow: naverDoubleTwinRange.end,
      naverGrandStartRow: naverGrandRange.start,
      naverGrandEndRow: naverGrandRange.end,
      roomSoldVacScanStartRow: roomSoldVacScanRange.start,
      roomSoldVacScanEndRow: roomSoldVacScanRange.end
    };
  }


  function colZeroToA1(colZeroBased) {
    let n = Number(colZeroBased);
    if (!Number.isInteger(n) || n < 0) return "A";
    n += 1;
    let out = "";
    while (n > 0) {
      const rem = (n - 1) % 26;
      out = String.fromCharCode(65 + rem) + out;
      n = Math.floor((n - 1) / 26);
    }
    return out || "A";
  }


  function gridRangeToA1(range, sheetTitle = "") {
    if (!range || typeof range !== "object") return "";
    const startRow = Number.isInteger(range.startRowIndex) ? range.startRowIndex + 1 : 1;
    const endRow = Number.isInteger(range.endRowIndex) ? range.endRowIndex : null;
    const startCol = Number.isInteger(range.startColumnIndex) ? range.startColumnIndex : 0;
    const endCol = Number.isInteger(range.endColumnIndex) ? Math.max(range.endColumnIndex - 1, startCol) : null;
    const left = `${colZeroToA1(startCol)}${startRow}`;
    const right = endCol === null ? "ZZ" : colZeroToA1(endCol);
    const rowTail = endRow === null ? "" : String(endRow);
    const rawTitle = String(sheetTitle || "");
    const escapedTitle = rawTitle.replace(/'/g, "''");
    const safeTitle = /[^A-Za-z0-9_]/.test(rawTitle) ? `'${escapedTitle}'` : rawTitle;
    const body = `${left}:${right}${rowTail}`;
    return safeTitle ? `${safeTitle}!${body}` : body;
  }


  function normalizeScanKey(value) {
    return normalizeText(value).toLowerCase().replace(/[^a-z0-9\uac00-\ud7a3]/g, "");
  }


  function parseScanConfigFromValuesGrid(values) {
    const out = {};
    const keyMap = {
      mode: "mode",
      scanmode: "mode",
      allow_pkg_inventory_rows: "allowPkgInventoryRows",
      allowpkginventoryrows: "allowPkgInventoryRows",
      scan_allow_pkg_inventory_rows: "allowPkgInventoryRows",
      scanallowpkginventoryrows: "allowPkgInventoryRows",
      date_row: "dateRow",
      daterow: "dateRow",
      weekday_row: "weekdayRow",
      weekdayrow: "weekdayRow",
      date_start_col: "dateStartCol",
      datestartcol: "dateStartCol",
      date_end_col: "dateEndCol",
      dateendcol: "dateEndCol",
      room_start_row: "roomStartRow",
      roomstartrow: "roomStartRow",
      urban_start_row: "urbanStartRow",
      urbanstartrow: "urbanStartRow",
      urban_end_row: "urbanEndRow",
      urbanendrow: "urbanEndRow",
      double_twin_start_row: "doubleTwinStartRow",
      doubletwinstartrow: "doubleTwinStartRow",
      double_twin_end_row: "doubleTwinEndRow",
      doubletwinendrow: "doubleTwinEndRow",
      grand_start_row: "grandStartRow",
      grandstartrow: "grandStartRow",
      grand_end_row: "grandEndRow",
      grandendrow: "grandEndRow",
      inventory_search_start_row: "inventorySearchStartRow",
      inventorysearchstartrow: "inventorySearchStartRow",
      station_inventory_row: "stationInventoryRow",
      stationinventoryrow: "stationInventoryRow",
      naver_inventory_row: "naverInventoryRow",
      naverinventoryrow: "naverInventoryRow",
      station_urban_start_row: "stationUrbanStartRow",
      station_urban_end_row: "stationUrbanEndRow",
      station_double_twin_start_row: "stationDoubleTwinStartRow",
      station_double_twin_end_row: "stationDoubleTwinEndRow",
      station_grand_start_row: "stationGrandStartRow",
      station_grand_end_row: "stationGrandEndRow",
      naver_urban_start_row: "naverUrbanStartRow",
      naver_urban_end_row: "naverUrbanEndRow",
      naver_double_twin_start_row: "naverDoubleTwinStartRow",
      naver_double_twin_end_row: "naverDoubleTwinEndRow",
      naver_grand_start_row: "naverGrandStartRow",
      naver_grand_end_row: "naverGrandEndRow",
      room_sold_vac_scan_start_row: "roomSoldVacScanStartRow",
      room_sold_vac_scan_end_row: "roomSoldVacScanEndRow",
      roomsoldvacscanstartrow: "roomSoldVacScanStartRow",
      roomsoldvacscanendrow: "roomSoldVacScanEndRow"
    };

    (values || []).forEach((row) => {
      if (!Array.isArray(row) || row.length <= 0) return;
      let keyRaw = normalizeText(row[0]);
      let valRaw = row.length > 1 ? row[1] : "";
      if (!valRaw && keyRaw.includes("=")) {
        const parts = keyRaw.split("=");
        keyRaw = normalizeText(parts[0]);
        valRaw = normalizeText(parts.slice(1).join("="));
      }
      const key = keyMap[normalizeScanKey(keyRaw)];
      if (!key) return;
      if (key === "mode") {
        out.mode = normalizeText(valRaw).toLowerCase() === "manual" ? "manual" : "auto";
      } else if (key === "allowPkgInventoryRows") {
        out.allowPkgInventoryRows = parseBooleanFlag(valRaw, DEFAULT_SCAN_CONFIG.allowPkgInventoryRows === true);
      } else if (key === "dateStartCol" || key === "dateEndCol") {
        out[key] = parseColumnRefToOneBased(valRaw);
      } else {
        out[key] = parseOptionalPositiveInt(valRaw);
      }
    });
    return sanitizeScanConfig(out);
  }

  function parseRoomTypeMapFromValuesGrid(values) {
    const result = {};
    const rows = Array.isArray(values) ? values : [];
    if (!rows.length) return result;

    const normalizeHeader = (v) => normalizeText(v).toLowerCase().replace(/[^a-z0-9_\uac00-\ud7a3]/g, "");
    let headerIdx = -1;
    let roomNoCol = 0;
    let roomTypeCol = 1;
    for (let i = 0; i < rows.length; i += 1) {
      const row = Array.isArray(rows[i]) ? rows[i] : [];
      if (!row.length) continue;
      const heads = row.map((v) => normalizeHeader(v));
      const rNo = heads.findIndex((h) => ["roomno", "room_no", "roomnumber", "\uac1d\uc2e4\ubc88\ud638", "\uac1d\uc2e4", "\ud638\uc2e4"].includes(h));
      const rType = heads.findIndex((h) => ["roomtype", "room_type", "type", "room", "\uac1d\uc2e4\ud0c0\uc785", "\ud0c0\uc785", "\uc720\ud615"].includes(h));
      if (rNo >= 0 && rType >= 0 && rNo !== rType) {
        headerIdx = i;
        roomNoCol = rNo;
        roomTypeCol = rType;
        break;
      }
    }

    const start = headerIdx >= 0 ? headerIdx + 1 : 0;
    let emptyStreak = 0;
    for (let i = start; i < rows.length; i += 1) {
      const row = Array.isArray(rows[i]) ? rows[i] : [];
      const roomNo = normalizeRoomNoKey(row[roomNoCol] ?? row[0] ?? "");
      const roomType = normalizeText(row[roomTypeCol] ?? row[1] ?? "");
      if (!roomNo && !roomType) {
        emptyStreak += 1;
        if (emptyStreak >= 6 && i > start + 3) break;
        continue;
      }
      emptyStreak = 0;
      if (!roomNo || !roomType) continue;
      if (!/[0-9]/.test(roomNo)) continue;
      result[roomNo] = roomType;
    }
    return result;
  }

  function mergeRoomTypeMap(baseMap, sheetMap) {
    const out = { ...(baseMap || {}) };
    Object.entries(sheetMap || {}).forEach(([roomNo, roomType]) => {
      const key = normalizeRoomNoKey(roomNo);
      const value = normalizeText(roomType);
      if (!key || !value) return;
      out[key] = value;
    });
    return out;
  }


  function resolveEffectiveScanConfig(userScan, sheetScan) {
    const user = sanitizeScanConfig(userScan || {});
    const hinted = sanitizeScanConfig(sheetScan || {});
    if (user.mode === "manual") return user;
    if (hinted.mode === "manual") return hinted;
    return user;
  }


  function parseTokenBundleMaybe(value) {
    const text = String(value ?? "").trim();
    if (!text || !text.startsWith("{")) return null;
    try {
      const obj = JSON.parse(text);
      if (!obj || typeof obj !== "object") return null;
      return {
        accessToken: normalizeText(obj.access_token || obj.accessToken || ""),
        refreshToken: normalizeText(obj.refresh_token || obj.refreshToken || ""),
        clientId: normalizeText(obj.client_id || obj.clientId || ""),
        clientSecret: normalizeText(obj.client_secret || obj.clientSecret || ""),
        expiresAt: Number(obj.expires_at || obj.expiresAt || 0) || 0
      };
    } catch (_) {
      return null;
    }
  }


  function applyEmbeddedSyncConfig(config) {
    const base = config && typeof config === "object" ? { ...config } : {};
    if (!EMBEDDED_AUTH_MODE) return base;
    return {
      ...base,
      spreadsheet: normalizeText(EMBEDDED_AUTH.spreadsheet || base.spreadsheet || ""),
      sheetName: normalizeText(EMBEDDED_AUTH.sheetName || base.sheetName || ""),
      startRow: Number(EMBEDDED_AUTH.startRow) || base.startRow,
      year: Number(EMBEDDED_AUTH.year) || base.year,
      stockMode: normalizeText(EMBEDDED_AUTH.stockMode || base.stockMode || "available"),
      clientId: normalizeText(EMBEDDED_AUTH.clientId || base.clientId || ""),
      clientSecret: normalizeText(EMBEDDED_AUTH.clientSecret || base.clientSecret || ""),
      refreshToken: normalizeText(EMBEDDED_AUTH.refreshToken || base.refreshToken || "")
    };
  }


  function getEmbeddedAuthMissingFields(syncConfig) {
    if (!EMBEDDED_AUTH_MODE) return [];
    const cfg = syncConfig || {};
    const invalid = (value) => {
      const text = normalizeText(value);
      if (!text) return true;
      if (/^PUT_/i.test(text)) return true;
      return false;
    };
    const missing = [];
    if (invalid(cfg.clientId)) missing.push("clientId");
    if (invalid(cfg.clientSecret)) missing.push("clientSecret");
    if (invalid(cfg.refreshToken)) missing.push("refreshToken");
    return missing;
  }

  function sanitizeNaverExecutionConfig(raw) {
    const cfg = raw && typeof raw === "object" ? raw : {};
    const modeRaw = normalizeText(cfg.mode || "").toLowerCase();
    const mode = (() => {
      if (modeRaw === "verify" || modeRaw === "plan" || modeRaw === "sync") return modeRaw;
      // Backward compatibility for previously stored modes.
      if (modeRaw === "monitor") return "verify";
      if (modeRaw === "assisted") return "plan";
      if (modeRaw === "auto") return "sync";
      return "plan";
    })();
    const batchWindowMs = Math.max(3000, Number(cfg.batchWindowMs) || 20000);
    const flushThreshold = Math.max(1, Number(cfg.flushThreshold) || 12);
    const maxBatchActions = Math.max(1, Number(cfg.maxBatchActions) || 80);
    const maxChangesPerRun = Math.max(1, Number(cfg.maxChangesPerRun) || 240);
    const retryLimit = Math.max(0, Number(cfg.retryLimit) || 2);
    const rateLimitMs = Math.max(0, Number(cfg.rateLimitMs) || DEFAULT_SYNC_SLEEP_MS);
    return {
      mode,
      batchWindowMs,
      flushThreshold,
      maxBatchActions,
      maxChangesPerRun,
      retryLimit,
      rateLimitMs
    };
  }


  function sanitizeSyncConfig(raw) {
    const config = applyEmbeddedSyncConfig(raw && typeof raw === "object" ? raw : {});
    const spreadsheetRaw = normalizeSpreadsheetInput(config.spreadsheet || DEFAULT_SPREADSHEET_ID);
    const spreadsheetId = extractSpreadsheetId(spreadsheetRaw);
    return {
      spreadsheet: spreadsheetId || spreadsheetRaw,
      sheetName: normalizeText(config.sheetName || DEFAULT_SHEET_NAME),
      startRow: Math.max(1, Number(config.startRow) || DEFAULT_START_ROW),
      year: Math.max(2000, Number(config.year) || DEFAULT_YEAR),
      stockMode: normalizeText(config.stockMode || "available") === "current" ? "current" : "available",
      accessToken: normalizeText(config.accessToken || ""),
      refreshToken: normalizeText(config.refreshToken || ""),
      clientId: normalizeText(config.clientId || DEFAULT_GOOGLE_CLIENT_ID),
      clientSecret: normalizeText(config.clientSecret || ""),
      accessTokenExpiresAt: Number(config.accessTokenExpiresAt || 0) || 0,
      sleepMs: Math.max(0, Number(config.sleepMs) || DEFAULT_SYNC_SLEEP_MS),
      opsUiCollapsed: config.opsUiCollapsed !== false,
      goldenExportRedaction: "default",
      reservationPolicyVersion: 1,
      scan: sanitizeScanConfig(config.scan || {}),
      naverExecution: sanitizeNaverExecutionConfig(config.naverExecution || {}),
      providerApply: sanitizeProviderApplyConfig(config.providerApply || config.applyProviders || {}),
      authBundles: sanitizeStoredAuthBundles(config.authBundles || config.providerAuthBundles || {}),
      pmsReservationUrl: normalizeText(config.pmsReservationUrl || config.pmsApiUrl || config.pmsReservationApiUrl || ""),
      pmsAuthBundle: sanitizeGenericAuthBundle(config.pmsAuthBundle || config.pmsReservationAuthBundle || config.pmsBundle || {}),
      pmsPreset: sanitizeWingsPmsPreset(
        config.pmsPreset || config.wingsPmsPreset || {
          presetKey: config.pmsPresetKey || "",
          propertyNo: config.pmsPropertyNo || config.PROPERTY_NO || "",
          bsnsCode: config.pmsBsnsCode || config.BSNS_CODE || "",
          pageId: config.pmsPageId || config.PAGE_ID || "",
          pageSize: config.pmsPageSize || config.take || ""
        }
      )
    };
  }


  async function loadSyncConfig() {
    const raw = await storageGet(SYNC_CFG_KEY);
    const restored = await restoreSyncConfigFromStorage(raw);
    const normalized = sanitizeSyncConfig(applyEmbeddedSyncConfig(restored));
    App.runtime.syncConfigCache = normalized;
    return normalized;
  }


  async function saveSyncConfig(config) {
    const normalized = sanitizeSyncConfig(applyEmbeddedSyncConfig(config));
    const stored = await prepareSyncConfigForStorage(normalized);
    await storageSet(SYNC_CFG_KEY, stored);
    App.runtime.syncConfigCache = normalized;
    return normalized;
  }


  async function refreshGoogleAccessToken(syncConfig) {
    if (!syncConfig.refreshToken || !syncConfig.clientId || !syncConfig.clientSecret) {
      throw new Error("Google token refresh requires refreshToken/clientId/clientSecret.");
    }
    const body = new URLSearchParams();
    body.set("client_id", syncConfig.clientId);
    body.set("client_secret", syncConfig.clientSecret);
    body.set("grant_type", "refresh_token");
    body.set("refresh_token", syncConfig.refreshToken);

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Google token refresh failed (${response.status}): ${text.slice(0, 300)}`);
    }
    const payload = await response.json();
    const nextToken = normalizeText(payload.access_token || "");
    if (!nextToken) throw new Error("Google token refresh response does not include access_token.");

    syncConfig.accessToken = nextToken;
    if (payload.refresh_token) syncConfig.refreshToken = normalizeText(payload.refresh_token);
    if (payload.expires_in) {
      const sec = Number(payload.expires_in) || 0;
      syncConfig.accessTokenExpiresAt = Math.floor(Date.now() / 1000) + sec;
    }
    await saveSyncConfig(syncConfig);
    return nextToken;
  }

  function hasGoogleRefreshCredentials(syncConfig) {
    return Boolean(
      normalizeText(syncConfig?.refreshToken || "") &&
        normalizeText(syncConfig?.clientId || "") &&
        normalizeText(syncConfig?.clientSecret || "")
    );
  }


  function isGoogleAccessTokenUsable(syncConfig, bufferSec = 60) {
    const token = normalizeText(syncConfig?.accessToken || "");
    if (!token) return false;
    const expiresAt = Number(syncConfig?.accessTokenExpiresAt || 0) || 0;
    if (!expiresAt) return true;
    const nowSec = Math.floor(Date.now() / 1000);
    return expiresAt - Math.max(0, Number(bufferSec) || 0) > nowSec;
  }


  async function ensureGoogleAccessToken(syncConfig, forceRefresh = false) {
    if (!forceRefresh && isGoogleAccessTokenUsable(syncConfig)) return syncConfig.accessToken;
    if (hasGoogleRefreshCredentials(syncConfig)) {
      return refreshGoogleAccessToken(syncConfig);
    }
    if (!forceRefresh && normalizeText(syncConfig?.accessToken || "")) return syncConfig.accessToken;
    throw new Error(TEXT.statusSyncNeedToken);
  }

  Object.assign(ns, {
    safeInt,
    isDate,
    toDateKey,
    fromDateKey,
    addDays,
    monthStart,
    monthLabel,
    buildDateRange,
    normalizeOpenStatus,
    toPlainHeaders,
    mergeHeaders,
    looksLikeJwt,
    parseJsonMaybe,
    parseJwtPayload,
    collectJwtCandidates,
    collectStorageTokenCandidates,
    scoreTokenCandidate,
    resolveStationAccessToken,
    createDefaultSessionRequestContext,
    createStationSessionRequestContext,
    createSessionRequestContext,
    storageGet,
    storageSet,
    normalizeText,
    normalizeRoomNoKey,
    sleep,
    mapWithConcurrencyLimit,
    extractSpreadsheetId,
    isLikelySpreadsheetId,
    toIntOrNull,
    parseOptionalPositiveInt,
    parseColumnRefToOneBased,
    oneBasedToZeroBased,
    sanitizeScanConfig,
    colZeroToA1,
    gridRangeToA1,
    normalizeScanKey,
    parseScanConfigFromValuesGrid,
    parseRoomTypeMapFromValuesGrid,
    mergeRoomTypeMap,
    resolveEffectiveScanConfig,
    parseTokenBundleMaybe,
    parseAuthBundleMaybe,
    applyEmbeddedSyncConfig,
    getEmbeddedAuthMissingFields,
    sanitizeNaverExecutionConfig,
    sanitizeSyncConfig,
    loadSyncConfig,
    saveSyncConfig,
    refreshGoogleAccessToken,
    hasGoogleRefreshCredentials,
    isGoogleAccessTokenUsable,
    ensureGoogleAccessToken,
    sanitizeProviderAuthBundle,
    sanitizeStoredAuthBundles,
    sanitizeWingsPmsPreset,
    buildWingsPmsPresetRequest,
    convertHarToWingsPmsConfig,
    captureProviderAuthBundle,
    restoreProviderAuthBundle,
    importCookiesForBundle,
    buildCookieHeaderFromCookies,
    inferCsrfTokenFromCookies,
  });
})();

