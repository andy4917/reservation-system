(() => {
  "use strict";

  const root = globalThis;
  const App = (root.App = root.App || {});
  App.io = App.io || {};
  const ns = (App.io.pmsFetch = App.io.pmsFetch || {});
  const C = App.constants || {};
  const {
    FIXED_NAVER_BUSINESS_ID,
    FIXED_STATION_BRANCH_ID,
    PMS_ORIGINS,
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
    buildStationCalendarUrl,
    buildNaverBizItemsUrl,
    buildNaverDailySchedulesUrl,
  } = C;
  const N = App.scan?.normalize || {};
  const K = App.engine?.noteKey || {};
  const R = App.engine?.rules || {};
  const P = App.domain?.reservationPolicy || {};
  const {
    safeInt,
    normalizeText,
    mapWithConcurrencyLimit,
    toIntOrNull,
    toDateKey,
    fromDateKey,
    addDays,
    normalizeOpenStatus,
    createSessionRequestContext,
    toPlainHeaders,
    mergeHeaders,
    buildCookieHeaderFromCookies,
    importCookiesForBundle,
    isDate,
    buildDateRange
  } = N;
  const { buildReservationIdentity } = K;
  const { roomNameKey } = R;
  const W = App.pms?.wingsAdapter || {};
  const normalizeReservationStatus =
    typeof P.normalizeReservationStatus === "function"
      ? P.normalizeReservationStatus
      : (value) => {
          const text = normalizeText(value || "").toUpperCase();
          if (!text) return "";
          const compact = text.replace(/[^A-Z0-9]+/g, "");
          if (!compact) return text;
          if (compact.includes("NOSHOW")) return "NOSHOW";
          if (["CANCEL", "CANCELED", "CANCELLED", "CNCL", "CNX", "CXL"].some((token) => compact.includes(token))) {
            return "CANCELED";
          }
          return compact;
        };
  const hasReservationAuditAnomaly =
    typeof P.hasReservationAuditAnomaly === "function"
      ? P.hasReservationAuditAnomaly
      : (status) => {
          const text = normalizeReservationStatus(status);
          return text === "NOSHOW" || /^NS$/.test(text);
        };
  const classifyReservationStatusBucket =
    typeof P.classifyReservationStatusBucket === "function"
      ? P.classifyReservationStatusBucket
      : (status) => {
          const text = normalizeReservationStatus(status);
          return text === "CANCELED" || /^CXL|^CNCL|^CANC|^CX$|^CN$/.test(text) ? "CANCELED" : "ACTIVE";
        };
  const normalizeReservationChannel =
    typeof P.normalizeReservationChannel === "function"
      ? P.normalizeReservationChannel
      : (value, sourceSystem = "", fallback = "") => {
          const low = normalizeText(value || fallback || "").toLowerCase();
          if (low.includes("station") || low.includes("uh suite")) return "STATION";
          if (low.includes("naver")) return "NAVER";
          if (low.includes("trip")) return "TRIP";
          if (low.includes("agoda")) return "AGODA";
          if (low.includes("booking")) return "BOOKING";
          if (low.includes("airbnb")) return "AIRBNB";
          if (low.includes("yanolja")) return "YANOLJA";
          if (low.includes("here")) return "HERE";
          if (low.includes("coupang")) return "COUPANG_TRAVEL";
          const src = normalizeText(sourceSystem || "").toUpperCase();
          if (src === "NAVER" || src === "STATION") return src;
          return normalizeText(value || fallback || "").toUpperCase() || "UNKNOWN";
        };
  let naverBizItemsCache = { ts: 0, items: [] };
  const pmsReservationCache = App.runtime.pmsReservationCache || (App.runtime.pmsReservationCache = new Map());
  const PMS_RESERVATION_CACHE_TTL_MS = 15000;
  const PMS_FETCH_TIMEOUT_MS = 15000;
  const PMS_FETCH_RETRY_LIMIT = 2;
  const PMS_READONLY_PATH_RE = /\/pms\/biz\/[^/]+\/(?:search|select|view)[^/]*\.do$/i;
  const PMS_MUTATION_PATH_RE = /\/pms\/biz\/[^/]+\/(?:update|insert|delete|send)[^/]*\.do$/i;
  const PMS_SENSITIVE_HEADER_NAMES = new Set([
    "authorization",
    "cookie",
    "x-csrf-token",
    "x-xsrf-token"
  ]);
  const RESERVATION_START_QUERY_KEYS = [
    "startDate",
    "start_date",
    "fromDate",
    "from_date",
    "from",
    "checkin",
    "checkIn",
    "arrivalDate",
    "arrvDate",
    "arrv_date",
    "arrv_date_f",
    "arrvDateF",
    "arrivalDateFrom",
    "arrival_date_from",
    "stay_date_f",
    "stayDateF",
    "dept_date_f",
    "deptDateF",
    "rsvn_date_f",
    "rsvnDateF"
  ];
  const RESERVATION_END_QUERY_KEYS = [
    "endDate",
    "end_date",
    "toDate",
    "to_date",
    "to",
    "checkout",
    "checkOut",
    "departureDate",
    "deptDate",
    "dept_date",
    "arrv_date_t",
    "arrvDateT",
    "arrivalDateTo",
    "arrival_date_to",
    "stay_date_t",
    "stayDateT",
    "dept_date_t",
    "deptDateT",
    "rsvn_date_t",
    "rsvnDateT"
  ];
  const NORMALIZED_RESERVATION_START_QUERY_KEYS = new Set(RESERVATION_START_QUERY_KEYS.map((key) => normalizeReservationParamKey(key)));
  const NORMALIZED_RESERVATION_END_QUERY_KEYS = new Set(RESERVATION_END_QUERY_KEYS.map((key) => normalizeReservationParamKey(key)));
  const RESERVATION_NO_FIELD_ALIASES = [
    "reservation_no",
    "reservationno",
    "booking_no",
    "bookingno",
    "confirm_no",
    "confirmation_no",
    "reservationnumber",
    "reservationnum",
    "orderno",
    "rsvn_no",
    "global_rsvn_no",
    "guest_rsvn_no",
    "rsvn_seq_no",
    "rsvn_folio_no",
    "reservationId",
    "bookingId",
    "bookingCode",
    "reservationCode",
    "confirmNo",
    "bookingNo",
    "reservationNo"
  ];
  const CHECKIN_FIELD_ALIASES = [
    "checkin",
    "check_in",
    "checkindate",
    "arrival_date",
    "arrivaldate",
    "arrv_date",
    "arrvdate",
    "start_date",
    "checkIn",
    "checkInDate",
    "arrivalDate"
  ];
  const CHECKOUT_FIELD_ALIASES = [
    "checkout",
    "check_out",
    "checkoutdate",
    "departure_date",
    "departuredate",
    "dept_date",
    "deptdate",
    "chck_out_date",
    "chckoutdate",
    "end_date",
    "checkOut",
    "checkOutDate",
    "departureDate"
  ];
  const CHANNEL_FIELD_ALIASES = [
    "channel",
    "ota",
    "platform",
    "site",
    "vendor",
    "source_code",
    "market_code",
    "ota_channel",
    "account",
    "channelName",
    "otaName",
    "bookingChannel"
  ];
  const NIGHTS_FIELD_ALIASES = ["nights", "night", "stay_nights", "stayNights"];
  const ROOM_FIELD_ALIASES = [
    "room_no",
    "roomno",
    "room_number",
    "roomNo",
    "roomNumber",
    "roomNos",
    "room_numbers"
  ];
  const PRICE_FIELD_ALIASES = ["price", "amount", "cost", "room_amt", "rate", "totalPrice", "paymentAmount"];
  const ACCOUNT_FIELD_ALIASES = ["account", "acct", "accountName", "sellerAccount"];
  const STATUS_FIELD_ALIASES = [
    "status",
    "reservation_status",
    "rsvn_status",
    "rsvn_status_code",
    "booking_status",
    "reservationStatus",
    "bookingStatus"
  ];
  const REMARK_FIELD_ALIASES = [
    "remark",
    "remarks",
    "memo",
    "note",
    "comment",
    "comments",
    "special_request",
    "specialRequest",
    "request",
    "requests",
    "rsvn_remark",
    "rsvn_memo",
    "guest_remark",
    "guestRemark",
    "memo_txt",
    "etc_remark"
  ];
  const GUEST_NAME_FIELD_ALIASES = [
    "guest_name",
    "guestName",
    "booker_name",
    "bookerName",
    "customer_name",
    "customerName",
    "rsvn_name",
    "guest_nm",
    "guestNm",
    "name"
  ];
  const PHONE_FIELD_ALIASES = [
    "phone",
    "phone_no",
    "phoneNo",
    "mobile",
    "mobile_no",
    "mobileNo",
    "hp_no",
    "tel_no",
    "telNo",
    "guest_phone",
    "guestPhone"
  ];
  const BRANCH_FIELD_ALIASES = [
    "branch",
    "branch_name",
    "property_no",
    "property_code",
    "bsns_code",
    "hotel",
    "hotel_name",
    "branchName",
    "propertyNo"
  ];
  const RESERVATION_RESOURCE_KEYWORDS = [
    "reservation",
    "reservations",
    "booking",
    "bookings",
    "rsvn",
    "stay"
  ];
  const RESERVATION_RESOURCE_EXCLUDES = [
    "daily-schedules",
    "stock-schedules",
    "sale-schedules",
    "/calendar",
    "price-set",
    "biz-items"
  ];

  function flattenAdminPayload(payload) {
    if (!payload) return [];
    if (Array.isArray(payload)) return payload;
    const rows = [];
    if (typeof payload === "object") {
      for (const [roomName, value] of Object.entries(payload)) {
        if (!Array.isArray(value)) continue;
        for (const row of value) rows.push({ ...row, roomName: row.roomName ?? roomName });
      }
    }
    return rows;
  }


  function parseNaverItems(payload) {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== "object") return [];
    return payload.items ?? payload.data ?? payload.content ?? payload.results ?? payload.bizItems ?? [];
  }

  function safeJsonParse(text) {
    const raw = text === null || text === undefined ? "" : String(text).trim();
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  function normalizeLookupKey(value) {
    return String(value || "").trim().toLowerCase().replace(/[^0-9a-zA-Z가-힣]/g, "");
  }

  function getFirstValueByAlias(row, aliases) {
    if (!row || typeof row !== "object") return undefined;
    const lookup = new Map();
    Object.keys(row).forEach((key) => {
      lookup.set(normalizeLookupKey(key), row[key]);
    });
    for (const alias of aliases || []) {
      const found = lookup.get(normalizeLookupKey(alias));
      if (found !== undefined && found !== null && String(found).trim() !== "") return found;
    }
    return undefined;
  }

  function coerceReservationNo(value) {
    const text = normalizeText(value || "");
    if (!text) return "";
    const match = text.match(/[0-9A-Za-z_-]{6,}/);
    return match ? match[0] : text;
  }

  function parseMoneyToInt(value) {
    const digits = String(value || "").replace(/[^\d-]/g, "");
    if (!digits) return null;
    const out = Number(digits);
    return Number.isFinite(out) ? Math.trunc(out) : null;
  }

  function parseAnyDate(value) {
    if (value instanceof Date && !Number.isNaN(value.valueOf())) return toDateKey(value);
    if (typeof value === "number" && Number.isFinite(value)) {
      const date = new Date(value);
      if (!Number.isNaN(date.valueOf())) return toDateKey(date);
    }
    const text = normalizeText(value || "");
    if (!text) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    const iso = text.match(/^(\d{4}-\d{2}-\d{2})[T\s]/);
    if (iso) return iso[1];
    const compact = text.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;
    const slash = text.match(/^(\d{4})[./](\d{1,2})[./](\d{1,2})$/);
    if (slash) return `${slash[1]}-${String(slash[2]).padStart(2, "0")}-${String(slash[3]).padStart(2, "0")}`;
    return "";
  }

  function deriveCheckout(checkin, checkout, nights) {
    const checkinKey = parseAnyDate(checkin);
    const checkoutKey = parseAnyDate(checkout);
    const nightsValue = Number.isInteger(nights) ? nights : safeInt(nights, 0);
    if (checkinKey && checkoutKey && checkoutKey > checkinKey) {
      return { checkin: checkinKey, checkout: checkoutKey, nights: buildDateRange(checkinKey, toDateKey(addDays(fromDateKey(checkoutKey), -1))).length };
    }
    if (checkinKey && nightsValue > 0) {
      const base = fromDateKey(checkinKey);
      const next = base ? addDays(base, nightsValue) : null;
      return {
        checkin: checkinKey,
        checkout: next ? toDateKey(next) : "",
        nights: nightsValue
      };
    }
    return { checkin: checkinKey, checkout: checkoutKey, nights: nightsValue };
  }

  function splitRoomTokens(value) {
    const text = normalizeText(value || "");
    if (!text) return [];
    const out = [];
    const seen = new Set();
    String(text)
      .split(/[,;/|]+/)
      .forEach((raw) => {
        let token = normalizeText(raw).toUpperCase().replace(/\s+/g, "").replace(/-/g, "");
        if (!token) return;
        if (/^\d+$/.test(token)) token = String(Number(token));
        if (seen.has(token)) return;
        seen.add(token);
        out.push(token);
      });
    return out;
  }

  function inferBranchFromReservationRow(row, channelRaw, account) {
    const branchRaw = normalizeText(getFirstValueByAlias(row, BRANCH_FIELD_ALIASES) || "");
    const candidates = [branchRaw, normalizeText(channelRaw || ""), normalizeText(account || "")].join(" ").toLowerCase();
    if (candidates.includes("coex") || candidates.includes("코엑스")) return "COEX";
    if (candidates.includes("gangnam") || candidates.includes("강남")) return "GANGNAM";
    if (/^\d+$/.test(branchRaw)) return `PROPERTY_${Number(branchRaw)}`;
    return "";
  }

  function reservationOverlapsQuery(record, query) {
    const checkin = parseAnyDate(record?.checkin);
    const checkout = parseAnyDate(record?.checkout);
    if (!checkin || !checkout || !query?.startDate || !query?.endDate) return false;
    return checkin <= query.endDate && checkout > query.startDate;
  }

  function looksLikeReservationObject(obj) {
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return false;
    return Boolean(
      getFirstValueByAlias(obj, RESERVATION_NO_FIELD_ALIASES) &&
        (getFirstValueByAlias(obj, CHECKIN_FIELD_ALIASES) || getFirstValueByAlias(obj, CHECKOUT_FIELD_ALIASES))
    );
  }

  function parseReservationRow(row, sourceSystem, defaultChannel = "") {
    if (!row || typeof row !== "object") return null;
    const reservationRef = coerceReservationNo(
      getFirstValueByAlias(row, ["global_rsvn_no", "guest_rsvn_no", "rsvn_seq_no", "reservationRef"])
    );
    const reservationNo =
      coerceReservationNo(getFirstValueByAlias(row, RESERVATION_NO_FIELD_ALIASES)) ||
      reservationRef ||
      "";
    if (!reservationNo) return null;

    const rawCheckin = getFirstValueByAlias(row, CHECKIN_FIELD_ALIASES);
    const rawCheckout = getFirstValueByAlias(row, CHECKOUT_FIELD_ALIASES);
    const rawNights = getFirstValueByAlias(row, NIGHTS_FIELD_ALIASES);
    const stay = deriveCheckout(rawCheckin, rawCheckout, safeInt(rawNights, 0));
    if (!stay.checkin || !stay.checkout || !(stay.checkout > stay.checkin)) return null;

    const channelRaw = normalizeText(getFirstValueByAlias(row, CHANNEL_FIELD_ALIASES) || "");
    const account = normalizeText(getFirstValueByAlias(row, ACCOUNT_FIELD_ALIASES) || "");
    const status = normalizeReservationStatus(getFirstValueByAlias(row, STATUS_FIELD_ALIASES) || "");
    const roomNos = splitRoomTokens(getFirstValueByAlias(row, ROOM_FIELD_ALIASES));
    const price = parseMoneyToInt(getFirstValueByAlias(row, PRICE_FIELD_ALIASES) || "");
    const branch = inferBranchFromReservationRow(row, channelRaw, account);
    const effectiveChannel = normalizeReservationChannel(channelRaw, sourceSystem, account || defaultChannel);
    const remarkText = normalizeText(getFirstValueByAlias(row, REMARK_FIELD_ALIASES) || "");
    const guestNameRaw = normalizeText(getFirstValueByAlias(row, GUEST_NAME_FIELD_ALIASES) || "");
    const phoneRaw = normalizeText(getFirstValueByAlias(row, PHONE_FIELD_ALIASES) || "");
    const identity =
      typeof buildReservationIdentity === "function"
        ? buildReservationIdentity(remarkText, {
            reservationNo,
            guestName: guestNameRaw,
            phone: phoneRaw,
            checkin: stay.checkin,
            checkout: stay.checkout,
            nights: stay.nights,
            channel: effectiveChannel
          })
        : {
            guestName: guestNameRaw,
            phoneTail: String(phoneRaw || "").replace(/\D+/g, "").slice(-4),
            rawTextHead: remarkText.slice(0, 120),
            softKey: "",
            tokenHashes: []
          };
    const statusBucket = classifyReservationStatusBucket(status);
    const auditAnomaly = hasReservationAuditAnomaly(status);

    return {
      sourceSystem: normalizeText(sourceSystem || "").toUpperCase() || "PMS",
      reservationNo,
      reservationRef,
      channel: effectiveChannel,
      checkin: stay.checkin,
      checkout: stay.checkout,
      nights: Math.max(1, Number(stay.nights || buildDateRange(stay.checkin, toDateKey(addDays(fromDateKey(stay.checkout), -1))).length)),
      roomNo: roomNos.join(","),
      roomNos,
      price,
      account,
      status,
      statusBucket,
      auditAnomaly,
      branch,
      guestName: normalizeText(identity?.guestName || guestNameRaw),
      phoneTail: normalizeText(identity?.phoneTail || ""),
      remarkHead: normalizeText(identity?.rawTextHead || ""),
      identitySoftKey: normalizeText(identity?.softKey || ""),
      identityTokenHashes: Array.isArray(identity?.tokenHashes) ? identity.tokenHashes.filter(Boolean) : []
    };
  }

  function collectReservationObjects(value, out = []) {
    if (Array.isArray(value)) {
      value.forEach((item) => collectReservationObjects(item, out));
      return out;
    }
    if (!value || typeof value !== "object") return out;
    if (looksLikeReservationObject(value)) out.push(value);
    Object.values(value).forEach((child) => collectReservationObjects(child, out));
    return out;
  }

  function dedupeReservationRecords(records) {
    const deduped = new Map();
    (records || []).forEach((record) => {
      const key = [
        record?.reservationNo || "",
        record?.checkin || "",
        record?.checkout || "",
        record?.roomNo || "",
        record?.channel || "",
        record?.statusBucket || ""
      ].join("::");
      if (!key.replace(/:/g, "")) return;
      deduped.set(key, record);
    });
    return [...deduped.values()];
  }

  function extractReservationRecordsFromPayload(payload, sourceSystem, query, defaultChannel = "") {
    const rows = collectReservationObjects(payload, []);
    const parsed = rows
      .map((row) => parseReservationRow(row, sourceSystem, defaultChannel))
      .filter(Boolean)
      .filter((row) => reservationOverlapsQuery(row, query));
    return dedupeReservationRecords(parsed);
  }

  function extractReservationRecordsFromDom(providerType, query) {
    const payloads = collectDomJsonPayloads();
    if (!payloads.length) return [];
    const sourceSystem = providerType === "admin-station" ? "STATION" : "NAVER";
    const defaultChannel = providerType === "admin-station" ? "STATION" : "NAVER";
    const out = [];
    payloads.forEach((payload) => {
      out.push(...extractReservationRecordsFromPayload(payload, sourceSystem, query, defaultChannel));
    });
    return dedupeReservationRecords(out);
  }

  function setReservationQueryRangeParams(url, query) {
    const next = new URL(url.toString());
    applyReservationQueryRangeToParams(next.searchParams, query);
    return next;
  }

  function normalizeReservationParamKey(value) {
    return normalizeText(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
  }

  function fingerprintText(value) {
    const text = String(value ?? "");
    if (!text) return "";
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return `fnv1a:${(hash >>> 0).toString(16)}`;
  }

  function sanitizeSensitiveHeaderPairs(headers) {
    const normalizedHeaders = toPlainHeaders(headers || {});
    return Object.keys(normalizedHeaders)
      .sort((a, b) => a.localeCompare(b))
      .map((key) => {
        const lower = normalizeText(key).toLowerCase();
        const value = normalizeText(normalizedHeaders[key] || "");
        if (!PMS_SENSITIVE_HEADER_NAMES.has(lower)) return [key, value];
        return [key, value ? `[secure:${fingerprintText(value)}]` : ""];
      });
  }

  function applyReservationQueryRangeToParams(params, query) {
    if (!params || typeof params.keys !== "function" || !query) return params;
    const existingKeys = [...params.keys()];
    existingKeys.forEach((key) => {
      const normalizedKey = normalizeReservationParamKey(key);
      if (NORMALIZED_RESERVATION_START_QUERY_KEYS.has(normalizedKey)) params.set(key, query.startDate);
      if (NORMALIZED_RESERVATION_END_QUERY_KEYS.has(normalizedKey)) params.set(key, query.endDate);
    });
    return params;
  }

  function buildReservationRequestOptions(urlRaw, bundle, query) {
    const method = normalizeText(bundle?.method || "").toUpperCase() || "GET";
    const contentType = normalizeText(bundle?.contentType || "").toLowerCase();
    const url = method === "GET" ? setReservationQueryRangeParams(new URL(urlRaw), query) : new URL(urlRaw);
    const options = { method, headers: {} };
    const requestBody = normalizeText(bundle?.requestBody || "");

    if (method !== "GET") {
      if (contentType === "json" && requestBody.startsWith("{")) {
        options.body = requestBody;
        mergeHeaders(options.headers, { "Content-Type": "application/json" });
      } else {
        const bodyParams = new URLSearchParams(requestBody);
        applyReservationQueryRangeToParams(bodyParams, query);
        options.body = bodyParams.toString();
        mergeHeaders(options.headers, { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" });
      }
      if (!options.headers["X-Requested-With"] && !options.headers["x-requested-with"]) {
        mergeHeaders(options.headers, { "X-Requested-With": "XMLHttpRequest" });
      }
    }

    return { url, options };
  }

  function assertReadonlyPmsRequest(url, options) {
    if (typeof W.assertReadonlyRequest === "function") {
      W.assertReadonlyRequest(url, options);
      return;
    }
    const method = normalizeText(options?.method || "GET").toUpperCase() || "GET";
    if (!["GET", "POST"].includes(method)) {
      throw new Error(`PMS 읽기 전용 요청만 허용됩니다. 현재 method=${method}`);
    }
    const pathname = normalizeText(url?.pathname || "");
    if (!pathname) {
      throw new Error("PMS 요청 URL 경로를 확인할 수 없습니다.");
    }
    if (PMS_MUTATION_PATH_RE.test(pathname) || !PMS_READONLY_PATH_RE.test(pathname)) {
      throw new Error(`PMS 읽기 전용 엔드포인트만 허용됩니다: ${pathname}`);
    }
  }

  function buildPmsReservationCacheKey(providerType, url, options, bundle, query) {
    return JSON.stringify({
      providerType: normalizeText(providerType),
      url: String(url || ""),
      method: normalizeText(options?.method || ""),
      body: normalizeText(options?.body || ""),
      queryStart: normalizeText(query?.startDate || ""),
      queryEnd: normalizeText(query?.endDate || ""),
      authorizationRef: fingerprintText(bundle?.authorization || ""),
      cookieHeaderRef: fingerprintText(bundle?.cookieHeader || ""),
      csrfTokenRef: fingerprintText(bundle?.csrfToken || ""),
      role: normalizeText(bundle?.role || ""),
      headers: sanitizeSensitiveHeaderPairs(bundle?.headers || {})
    });
  }

  function clonePmsReservationResult(result) {
    if (!result || typeof result !== "object") return result;
    return {
      ...result,
      records: Array.isArray(result.records) ? result.records.map((row) => ({ ...row })) : [],
      attempts: Array.isArray(result.attempts) ? result.attempts.map((row) => ({ ...row })) : [],
      statusCounts: result.statusCounts && typeof result.statusCounts === "object"
        ? { ...result.statusCounts }
        : { active: 0, canceled: 0 }
    };
  }

  function readCachedPmsReservation(key) {
    const cached = pmsReservationCache.get(key);
    if (!cached) return null;
    if (Date.now() - cached.ts > PMS_RESERVATION_CACHE_TTL_MS) {
      pmsReservationCache.delete(key);
      return null;
    }
    return clonePmsReservationResult(cached.value);
  }

  function writeCachedPmsReservation(key, value) {
    pmsReservationCache.set(key, {
      ts: Date.now(),
      value: clonePmsReservationResult(value)
    });
  }

  function buildPmsRequestHeaders(bundle, options) {
    const headers = {};
    if (bundle?.headers && typeof bundle.headers === "object" && !Array.isArray(bundle.headers)) {
      mergeHeaders(headers, toPlainHeaders(bundle.headers));
    }
    const authorization = normalizeText(bundle?.authorization || "");
    if (authorization) mergeHeaders(headers, { Authorization: authorization });
    const cookieHeader = normalizeText(bundle?.cookieHeader || buildCookieHeaderFromCookies(bundle?.cookies || []));
    if (cookieHeader) mergeHeaders(headers, { Cookie: cookieHeader });
    if (normalizeText(bundle?.csrfToken || "")) mergeHeaders(headers, { "x-csrf-token": normalizeText(bundle.csrfToken) });
    if (normalizeText(bundle?.role || "")) mergeHeaders(headers, { "x-booking-naver-role": normalizeText(bundle.role) });
    mergeHeaders(headers, options.headers || {});
    return { headers, cookieHeader };
  }

  async function ensurePmsBundleCookies(bundle) {
    if (!Array.isArray(bundle?.cookies) || bundle.cookies.length <= 0) return;
    try {
      await importCookiesForBundle(bundle.cookies);
    } catch (_) {
      // Cookie import is best-effort. Header/token auth may still succeed.
    }
  }

  async function fetchPmsReservationResponse(url, options, bundle) {
    await ensurePmsBundleCookies(bundle);
    const { headers, cookieHeader } = buildPmsRequestHeaders(bundle, options);
    const credentialsMode =
      cookieHeader || (Array.isArray(bundle?.cookies) && bundle.cookies.length > 0) ? "include" : "omit";
    let lastError = null;

    for (let attempt = 0; attempt <= PMS_FETCH_RETRY_LIMIT; attempt += 1) {
      const controller = typeof AbortController === "function" ? new AbortController() : null;
      const timeoutId = controller
        ? setTimeout(() => controller.abort(new Error("PMS reservation API timeout")), PMS_FETCH_TIMEOUT_MS)
        : null;
      try {
        const response = await fetch(url.toString(), {
          method: options.method || "GET",
          credentials: credentialsMode,
          headers,
          body: options.body,
          signal: controller?.signal
        });
        if (response.ok) {
          if (timeoutId) clearTimeout(timeoutId);
          return response;
        }
        const retryable = response.status === 429 || response.status >= 500;
        lastError = new Error(`PMS reservation API (${response.status})`);
        if (!retryable || attempt >= PMS_FETCH_RETRY_LIMIT) {
          if (timeoutId) clearTimeout(timeoutId);
          throw lastError;
        }
      } catch (error) {
        const message = normalizeText(error?.message || "");
        const aborted = message.toLowerCase().includes("timeout") || error?.name === "AbortError";
        const retryable = aborted || message.includes("Failed to fetch");
        lastError = error;
        if (!retryable || attempt >= PMS_FETCH_RETRY_LIMIT) {
          if (timeoutId) clearTimeout(timeoutId);
          throw error;
        }
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
      await delay(250 * (attempt + 1));
    }
    throw lastError || new Error("PMS reservation API failed");
  }

  async function parsePmsReservationResponse(response) {
    const text = await response.text();
    const payload = safeJsonParse(text);
    if (!payload || typeof payload !== "object") {
      throw new Error("PMS reservation API did not return JSON");
    }
    return payload;
  }

  function collectPerformanceReservationUrls(providerType, query) {
    if (typeof performance === "undefined" || typeof performance.getEntriesByType !== "function") return [];
    const apiOrigin = providerType === "admin-station" ? PMS_ORIGINS.STATION_API : PMS_ORIGINS.NAVER_API;
    const entries = performance.getEntriesByType("resource");
    const urls = [];
    const seen = new Set();
    entries.forEach((entry) => {
      const name = normalizeText(entry?.name || "");
      if (!name || !name.startsWith(apiOrigin)) return;
      const lower = name.toLowerCase();
      if (!RESERVATION_RESOURCE_KEYWORDS.some((token) => lower.includes(token))) return;
      if (RESERVATION_RESOURCE_EXCLUDES.some((token) => lower.includes(token))) return;
      try {
        const updated = setReservationQueryRangeParams(new URL(name), query).toString();
        if (seen.has(updated)) return;
        seen.add(updated);
        urls.push(updated);
      } catch (_) {
        // ignore malformed URL
      }
    });
    return urls;
  }

  async function fetchReservationPayloadFromUrl(providerType, url) {
    const session = createSessionRequestContext(providerType);
    const baseInit = { method: "GET", headers: { Accept: "application/json" } };
    let response = null;
    let lastFetchError = null;

    if (providerType === "admin-station") {
      const variants = await session.buildVariants(url, baseInit);
      for (const init of variants) {
        try {
          response = await fetch(url, init);
        } catch (error) {
          lastFetchError = error;
          continue;
        }
        if (response.ok) break;
        if (response.status !== 401 && response.status !== 403) break;
      }
    } else {
      try {
        const init = await session.build(url, baseInit);
        response = await fetch(url, init);
      } catch (error) {
        lastFetchError = error;
      }
    }

    if (!response?.ok) {
      if (response) throw new Error(`${providerType} reservation API (${response.status})`);
      throw new Error(lastFetchError?.message || "Failed to fetch reservation API");
    }

    const text = await response.text();
    const parsed = safeJsonParse(text);
    if (parsed && typeof parsed === "object") return parsed;
    throw new Error("Reservation API did not return JSON");
  }

  async function fetchProviderReservations(providerType, query, syncConfig = null) {
    const pmsUrlRaw = normalizeText(
      syncConfig?.pmsReservationUrl || syncConfig?.pmsApiUrl || syncConfig?.pmsReservationApiUrl || ""
    );
    if (!pmsUrlRaw) {
      return {
        records: [],
        source: "pms-unconfigured",
        url: "",
        candidateCount: 0,
        attempts: []
      };
    }

    const bundle = syncConfig?.pmsAuthBundle && typeof syncConfig.pmsAuthBundle === "object"
      ? syncConfig.pmsAuthBundle
      : null;
    const requestPlan =
      typeof W.buildRequest === "function"
        ? W.buildRequest({ urlRaw: pmsUrlRaw, bundle, query })
        : (() => {
            const fallbackRequest = buildReservationRequestOptions(pmsUrlRaw, bundle, query);
            assertReadonlyPmsRequest(fallbackRequest.url, fallbackRequest.options);
            return {
              ...fallbackRequest,
              endpointPath: normalizeText(fallbackRequest.url?.pathname || ""),
              requestSchemaIssues: []
            };
          })();
    const { url, options } = requestPlan;
    const cacheKey = buildPmsReservationCacheKey(providerType, url.toString(), options, bundle, query);
    const cached = readCachedPmsReservation(cacheKey);
    if (cached) {
      return cached;
    }
    const response = await fetchPmsReservationResponse(url, options, bundle);
    const payload = await parsePmsReservationResponse(response);
    const adapterParsed =
      typeof W.getReservations === "function"
        ? W.getReservations({
            payload,
            query,
            parser: extractReservationRecordsFromPayload
          })
        : null;
    const records = Array.isArray(adapterParsed?.records)
      ? adapterParsed.records
      : extractReservationRecordsFromPayload(payload, "PMS", query, "");
    const roomStateRows =
      typeof W.getRoomState === "function" ? W.getRoomState(records) : [];
    const inventoryRows =
      typeof W.getInventory === "function" ? W.getInventory(records) : [];
    const result = {
      records,
      source: records.length > 0 ? "pms-api" : "pms-empty",
      url: url.toString(),
      candidateCount: 1,
      attempts: [{ url: url.toString(), ok: true, recordCount: records.length }],
      adapter: {
        type: "wings",
        endpointPath: normalizeText(requestPlan?.endpointPath || url?.pathname || ""),
        knownEndpointCount:
          typeof W.getKnownEndpointCount === "function" ? W.getKnownEndpointCount() : 0,
        requestSchemaIssues: Array.isArray(requestPlan?.requestSchemaIssues)
          ? [...requestPlan.requestSchemaIssues]
          : [],
        responseValidation: adapterParsed?.validation && typeof adapterParsed.validation === "object"
          ? { ...adapterParsed.validation }
          : null,
        roomStateCount: Array.isArray(roomStateRows) ? roomStateRows.length : 0,
        inventoryCount: Array.isArray(inventoryRows) ? inventoryRows.length : 0
      },
      statusCounts: records.reduce(
        (acc, row) => {
          if (normalizeText(row?.statusBucket || "") === "CANCELED") acc.canceled += 1;
          else acc.active += 1;
          if (row?.auditAnomaly === true) acc.auditAnomaly += 1;
          return acc;
        },
        { active: 0, canceled: 0, auditAnomaly: 0 }
      )
    };
    writeCachedPmsReservation(cacheKey, result);
    return result;
  }

  function collectDomJsonPayloads() {
    if (typeof document === "undefined" || !document?.querySelectorAll) return [];
    const payloads = [];
    const pushPayload = (value) => {
      if (!value || typeof value !== "object") return;
      payloads.push(value);
    };

    const scriptNodes = Array.from(
      document.querySelectorAll("script#__NEXT_DATA__, script[type='application/json']")
    ).slice(0, 64);
    scriptNodes.forEach((node) => {
      const text = node?.textContent === null || node?.textContent === undefined
        ? ""
        : String(node.textContent).trim();
      if (!text || text.length > 2_000_000) return;
      const parsed = safeJsonParse(text);
      if (parsed && typeof parsed === "object") pushPayload(parsed);
    });

    [
      root.__NEXT_DATA__,
      root.__NUXT__,
      root.__APOLLO_STATE__,
      root.__INITIAL_STATE__,
      root.__PRELOADED_STATE__
    ].forEach((candidate) => pushPayload(candidate));

    return payloads;
  }

  function normalizeDomRowFromObject(obj) {
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
    const date =
      normalizeText(obj.date || obj.day || obj.targetDate || obj.saleDate || obj.businessDay || obj.calendarDate);
    if (!isDate(date)) return null;

    const roomId = normalizeText(obj.roomId ?? obj.bizItemId ?? obj.itemId ?? obj.resourceId);
    const roomName = normalizeText(obj.roomName ?? obj.bizItemName ?? obj.name ?? obj.title);
    if (!roomId && !roomName) return null;

    const settingStock = safeInt(obj.settingStock ?? obj.stockCount ?? obj.stock ?? obj.availableStock);
    const reservedStock = safeInt(
      obj.reservationCount ??
        obj.bookingCount ??
        obj.reservedStock ??
        obj.currentBookingCount ??
        obj.occupiedBookingCount
    );
    const totalStock = safeInt(
      obj.totalStock ??
        obj.maxStock ??
        obj.maximumStock ??
        obj.maxCount ??
        obj.stockCount ??
        obj.settingStock ??
        obj.stock ??
        obj.availableStock,
      settingStock
    );
    const normalizedOpen = normalizeOpenStatus(
      obj.openStatus ?? obj.saleStatus ?? obj.status ?? obj.isSaleDay ?? obj.saleDay
    );
    const openStatus =
      normalizedOpen !== "UNKNOWN"
        ? normalizedOpen
        : typeof obj.hasSaleEnded === "boolean"
          ? obj.hasSaleEnded
            ? "CLOSED"
            : "OPEN"
          : "UNKNOWN";

    const hasStockSignal =
      Number.isInteger(settingStock) ||
      Number.isInteger(reservedStock) ||
      Number.isInteger(totalStock) ||
      openStatus !== "UNKNOWN";
    if (!hasStockSignal) return null;

    return {
      date,
      roomId: roomId || roomName,
      roomName: roomName || roomId,
      priceSetId: toIntOrNull(obj.priceSetId),
      settingStock,
      openStatus,
      totalStock,
      reservedStock,
      availableStock: safeInt(obj.availableStock ?? obj.stock ?? obj.settingStock ?? settingStock),
      displayCurrent: safeInt(
        obj.displayCurrent ??
          obj.reservedStock ??
          obj.bookingCount ??
          obj.reservationCount ??
          obj.currentBookingCount ??
          obj.occupiedBookingCount
      ),
      displayMaximum: safeInt(
        obj.displayMaximum ??
          obj.totalStock ??
          obj.maxStock ??
          obj.maximumStock ??
          obj.maxCount ??
          obj.stock ??
          obj.stockCount ??
          obj.settingStock ??
          obj.availableStock,
        totalStock
      ),
      source: "dom_fallback"
    };
  }

  function extractProviderRowsFromDom(providerType, query) {
    const payloads = collectDomJsonPayloads();
    if (!payloads.length) return [];
    const rows = [];
    const seen = new Set();
    const preset = ROOM_PRESETS[providerType] || [];
    const expectedRoomIds = new Set(preset.map((room) => String(room.id)));
    const presetNameKeys = preset
      .map((room) => roomNameKey(room?.name || ""))
      .filter(Boolean);

    payloads.forEach((payload) => {
      const stack = [payload];
      const visitedObjects = new WeakSet();
      let visited = 0;
      const MAX_NODES = 80000;
      while (stack.length > 0 && visited < MAX_NODES) {
        const node = stack.pop();
        visited += 1;
        if (!node || typeof node !== "object") continue;
        if (visitedObjects.has(node)) continue;
        visitedObjects.add(node);
        if (Array.isArray(node)) {
          for (let i = 0; i < node.length; i += 1) {
            const item = node[i];
            if (item && typeof item === "object") stack.push(item);
          }
          continue;
        }

        const parsedRow = normalizeDomRowFromObject(node);
        if (parsedRow) {
          if (parsedRow.date < query.startDate || parsedRow.date > query.endDate) {
            // out of requested range
          } else {
            const roomId = String(parsedRow.roomId || "");
            const roomNameKeyText = roomNameKey(parsedRow.roomName || "");
            const roomLooksKnown =
              (roomId && expectedRoomIds.has(roomId)) ||
              (roomNameKeyText &&
                presetNameKeys.some(
                  (key) => roomNameKeyText.includes(key) || key.includes(roomNameKeyText)
                ));
            if (!roomLooksKnown) {
              continue;
            }
            const key = [
              parsedRow.date,
              roomId || normalizeText(parsedRow.roomName || ""),
              parsedRow.displayCurrent,
              parsedRow.displayMaximum,
              parsedRow.openStatus
            ].join("::");
            if (!seen.has(key)) {
              seen.add(key);
              rows.push(parsedRow);
            }
          }
        }

        Object.values(node).forEach((value) => {
          if (value && typeof value === "object") stack.push(value);
        });
      }
    });

    return rows;
  }


  async function fetchStationRows(query) {
    const branchId = FIXED_STATION_BRANCH_ID;
    const url = buildStationCalendarUrl(branchId);
    url.searchParams.set("startDate", query.startDate);
    url.searchParams.set("endDate", query.endDate);
    const session = createSessionRequestContext("admin-station");

    const baseInit = { method: "GET", headers: { Accept: "application/json" } };
    const variants = await session.buildVariants(url, baseInit);

    let response = null;
    let lastFetchError = null;
    for (const init of variants) {
      try {
        response = await fetch(url, init);
      } catch (error) {
        lastFetchError = error;
        continue;
      }
      if (response.ok) break;
      if (response.status !== 401 && response.status !== 403) break;
    }

    if (!response?.ok) {
      if (response) throw new Error(`${TEXT.station} API (${response.status})`);
      throw new Error(lastFetchError?.message || "Failed to fetch");
    }

    const json = await response.json();
    const payload = json?.data ?? json;
    return flattenAdminPayload(payload).map((item) => {
      const settingStock = safeInt(item.settingStock ?? item.stockCount ?? item.stock ?? item.availableStock);
      const reservedStock = safeInt(
        item.reservationCount ?? item.bookingCount ?? item.reservedStock ?? item.bookedCount ?? item.currentBookingCount
      );
      const totalStock = safeInt(
        item.totalStock ??
          item.maxStock ??
          item.maximumStock ??
          item.maxCount ??
          item.stockCount ??
          item.settingStock ??
          item.stock ??
          item.availableStock,
        settingStock
      );
      const normalizedOpen = normalizeOpenStatus(item.openStatus ?? item.saleStatus ?? item.status);
      const openStatus =
        normalizedOpen !== "UNKNOWN"
          ? normalizedOpen
          : typeof item.hasSaleEnded === "boolean"
            ? item.hasSaleEnded
              ? "CLOSED"
              : "OPEN"
            : "UNKNOWN";
      return {
        date: item.date,
        roomId: String(item.roomId ?? ""),
        roomName: String(item.roomName ?? item.name ?? ""),
        priceSetId: toIntOrNull(item.priceSetId),
        settingStock,
        openStatus,
        totalStock,
        reservedStock,
        availableStock: safeInt(item.availableStock ?? item.stock ?? item.stockCount ?? item.settingStock ?? settingStock),
        displayCurrent: reservedStock,
        displayMaximum: totalStock
      };
    });
  }


  async function fetchNaverRows(query) {
    const businessId = FIXED_NAVER_BUSINESS_ID;
    const session = createSessionRequestContext("naver-partner");
    let items = [];
    const now = Date.now();
    if (Array.isArray(naverBizItemsCache.items) && now - naverBizItemsCache.ts <= NAVER_BIZ_ITEMS_CACHE_TTL_MS) {
      items = naverBizItemsCache.items;
    } else {
      const itemUrl = buildNaverBizItemsUrl(businessId);
      itemUrl.searchParams.set(
        "projections",
        "resource,type-value,option-category,BIZ_ITEM_AMENITY,biz-item-detail,language-resource"
      );
      itemUrl.searchParams.set("size", "300");
      itemUrl.searchParams.set("lang", "ko");
      const itemInit = await session.build(itemUrl, { method: "GET", headers: { Accept: "application/json" } });
      const itemRes = await fetch(itemUrl, itemInit);
      if (!itemRes.ok) throw new Error(`${TEXT.naver} API (${itemRes.status})`);
      items = parseNaverItems(await itemRes.json());
      naverBizItemsCache = {
        ts: now,
        items: Array.isArray(items) ? items : []
      };
    }

    const preset = ROOM_PRESETS["naver-partner"] || [];
    const itemById = new Map();
    (Array.isArray(items) ? items : []).forEach((item) => {
      const id = String(item?.bizItemId ?? "");
      if (!id || itemById.has(id)) return;
      itemById.set(id, item);
    });
    const orderedIds = [];
    const seen = new Set();
    preset.forEach((row) => {
      const id = String(row?.id || "");
      if (!id || seen.has(id) || !itemById.has(id)) return;
      seen.add(id);
      orderedIds.push(id);
    });
    [...itemById.keys()]
      .sort((a, b) => a.localeCompare(b))
      .forEach((id) => {
        if (seen.has(id)) return;
        seen.add(id);
        orderedIds.push(id);
      });
    items = orderedIds.map((id) => itemById.get(id)).filter(Boolean);

    const roomRows = await mapWithConcurrencyLimit(
      items,
      NAVER_SCHEDULE_FETCH_CONCURRENCY,
      async (room) => {
        const rows = [];
        const roomName = String(room.bizItemName ?? room.name ?? room.title ?? "");
        const scheduleUrl = buildNaverDailySchedulesUrl(businessId, room.bizItemId);
        scheduleUrl.searchParams.set("startDateTime", `${query.startDate}T00:00:00`);
        scheduleUrl.searchParams.set("endDateTime", `${query.endDate}T00:00:00`);
        const scheduleInit = await session.build(scheduleUrl, { method: "GET", headers: { Accept: "application/json" } });
        const scheduleRes = await fetch(scheduleUrl, scheduleInit);
        if (!scheduleRes.ok) throw new Error(`${TEXT.naver} schedule API (${scheduleRes.status})`);
        const payload = await scheduleRes.json();
        for (const [dateKey, value] of Object.entries(payload || {})) {
          if (!value || typeof value !== "object") continue;
          const settingStock = safeInt(value.stock ?? value.settingStock ?? value.availableStock);
          const reservedStock = safeInt(
            value.bookingCount ??
              value.occupiedBookingCount ??
              value.reservedStock ??
              value.currentBookingCount ??
              value.reservationCount
          );
          const totalStock = safeInt(
            value.stock ?? value.totalStock ?? value.maxStock ?? value.maximumStock ?? value.settingStock ?? value.availableStock,
            settingStock
          );
          rows.push({
            date: typeof value.date === "string" && value.date ? value.date : dateKey,
            roomId: String(room.bizItemId),
            roomName,
            openStatus: normalizeOpenStatus(value.isSaleDay ?? value.saleDay ?? value.openStatus),
            totalStock,
            reservedStock,
            availableStock: settingStock,
            displayCurrent: reservedStock,
            displayMaximum: totalStock
          });
        }
        return rows;
      }
    );
    const rows = roomRows.flat();
    return rows;
  }


  async function fetchProviderRows(providerType, query) {
    const fetcher = providerType === "naver-partner" ? fetchNaverRows : fetchStationRows;
    let apiRows = [];
    let apiError = null;
    try {
      apiRows = await fetcher(query);
    } catch (error) {
      apiError = error;
    }

    if (apiError) {
      const domRows = extractProviderRowsFromDom(providerType, query);
      if (domRows.length > 0) {
        console.warn("[inventory] provider API failed; fallback to DOM snapshot rows", {
          providerType,
          rowCount: domRows.length,
          error: apiError?.message || String(apiError)
        });
        return domRows;
      }
      throw apiError;
    }

    const apiCoverage = assessProviderRowsCoverage(apiRows, query, providerType);
    if (apiCoverage.acceptable) return apiRows;
    const domRows = extractProviderRowsFromDom(providerType, query);
    if (!domRows.length) return apiRows;

    const merged = mergeProviderRowsPreferApi(apiRows, domRows);
    const mergedCoverage = assessProviderRowsCoverage(merged, query, providerType);
    if (mergedCoverage.acceptable || merged.length > apiRows.length) {
      console.warn("[inventory] provider API low coverage; merged API+DOM snapshot", {
        providerType,
        api: apiCoverage,
        merged: mergedCoverage
      });
      return merged;
    }
    return apiRows;
  }


  function buildProviderRowMergeKey(row) {
    const day = normalizeText(row?.date || "");
    const roomId = normalizeText(row?.roomId || "");
    const roomName = normalizeText(row?.roomName || "");
    if (!day) return "";
    if (roomId) return `${day}::id::${roomId}`;
    if (roomName) return `${day}::name::${roomName}`;
    return "";
  }


  function mergeProviderRowsPreferApi(apiRows, domRows) {
    const merged = new Map();
    (Array.isArray(domRows) ? domRows : []).forEach((row) => {
      const key = buildProviderRowMergeKey(row);
      if (!key) return;
      merged.set(key, row);
    });
    (Array.isArray(apiRows) ? apiRows : []).forEach((row) => {
      const key = buildProviderRowMergeKey(row);
      if (!key) return;
      merged.set(key, row);
    });
    return [...merged.values()];
  }


  function assessProviderRowsCoverage(rows, query, providerType) {
    const safeRows = Array.isArray(rows) ? rows : [];
    const validRows = safeRows.filter((row) => {
      const day = normalizeText(row?.date || "");
      return isDate(day) && day >= query.startDate && day <= query.endDate;
    });
    const dates = new Set(validRows.map((row) => String(row.date)));
    const expectedDays = buildDateRange(query.startDate, query.endDate).length;
    const expectedRooms = Math.max(1, (ROOM_PRESETS[providerType] || []).length || 1);
    const expectedCells = expectedDays * expectedRooms;
    const minimumRows = Math.max(expectedDays, Math.floor(expectedCells * 0.5));
    const dateCoverageOk = dates.size >= Math.max(1, Math.ceil(expectedDays * 0.7));
    const rowCoverageOk = validRows.length >= minimumRows;
    return {
      expectedDays,
      expectedRooms,
      expectedCells,
      minimumRows,
      rowCount: validRows.length,
      distinctDates: dates.size,
      acceptable: dateCoverageOk && rowCoverageOk
    };
  }


  function detectRoomTypeHint(rawValue) {
    const key = roomNameKey(rawValue);
    if (!key) return "";
    const urbanKey = roomNameKey(ROOM_TYPE_LABELS.urban);
    const doubleKey = roomNameKey(ROOM_TYPE_LABELS.doubleTwin);
    const grandKey = roomNameKey(ROOM_TYPE_LABELS.grand);
    if ((urbanKey && (key.includes(urbanKey) || urbanKey.includes(key))) || key.includes("urban")) return "urban";
    if (
      (doubleKey && (key.includes(doubleKey) || doubleKey.includes(key))) ||
      (key.includes("double") && key.includes("twin"))
    ) {
      return "doubleTwin";
    }
    if ((grandKey && (key.includes(grandKey) || grandKey.includes(key))) || key.includes("grand")) return "grand";
    return "";
  }


  function resolvePresetRoomId(rawId, rawName, preset, idMap) {
    const id = String(rawId ?? "");
    if (idMap.has(id)) {
      return {
        roomId: id,
        confidence: 1,
        method: "id_exact",
        matchedName: idMap.get(id) || ""
      };
    }
    const key = roomNameKey(rawName);
    if (!key) {
      return {
        roomId: id,
        confidence: 0,
        method: "unmatched",
        matchedName: ""
      };
    }

    const typeHint = detectRoomTypeHint(rawName);
    if (typeHint) {
      const typedMatch = (preset || []).find((room) => detectRoomTypeHint(room?.name || "") === typeHint);
      if (typedMatch) {
        return {
          roomId: String(typedMatch.id),
          confidence: 0.93,
          method: "name_type",
          matchedName: String(typedMatch.name || "")
        };
      }
    }

    let best = null;
    (preset || []).forEach((room) => {
      const presetKey = roomNameKey(room.name);
      if (!presetKey) return;

      let score = 0;
      let method = "";
      if (key === presetKey) {
        score = 0.95;
        method = "name_exact";
      } else if (key.includes(presetKey) || presetKey.includes(key)) {
        const similarity = Math.min(key.length, presetKey.length) / Math.max(key.length, presetKey.length);
        score = 0.7 + similarity * 0.2;
        method = "name_partial";
      }
      if (!method) return;

      if (!best || score > best.score) {
        best = {
          roomId: String(room.id),
          matchedName: String(room.name || ""),
          score,
          method
        };
      }
    });

    if (best && best.score >= 0.8) {
      return {
        roomId: best.roomId,
        confidence: Number(best.score.toFixed(2)),
        method: best.method,
        matchedName: best.matchedName
      };
    }

    return {
      roomId: id,
      confidence: 0,
      method: "unmatched",
      matchedName: ""
    };
  }


  function scoreNormalizedProviderRow(row) {
    let score = 0;
    const confidence = Number(row?.mappingConfidence ?? 0);
    if (Number.isFinite(confidence)) score += Math.round(confidence * 1000);
    const method = String(row?.mappingMethod || "");
    if (method === "id_exact") score += 220;
    else if (method === "name_exact") score += 150;
    else if (method === "name_type") score += 120;
    else if (method === "name_partial") score += 90;
    if (Number.isInteger(row?.displayCurrent)) score += 40;
    if (Number.isInteger(row?.displayMaximum)) score += 40;
    if (Number.isInteger(row?.reservedStock)) score += 20;
    if (Number.isInteger(row?.totalStock)) score += 20;
    if (Number.isInteger(row?.priceSetId)) score += 10;
    if (String(row?.openStatus || "") !== "UNKNOWN") score += 10;
    if (String(row?.source || "") === "dom_fallback") score -= 25;
    return score;
  }

  function normalizeRows(rows, query, providerType) {
    const preset = ROOM_PRESETS[providerType] || [];
    const idMap = new Map(preset.map((room) => [String(room.id), room.name]));
    const order = new Map(preset.map((room, index) => [String(room.id), index]));
    const normalized = (rows || [])
      .map((row) => {
        const settingStock = safeInt(row.settingStock ?? row.stockCount ?? row.stock ?? row.availableStock ?? 0);
        const reservedStock = safeInt(
          row.reservedStock ??
            row.bookingCount ??
            row.reservationCount ??
            row.currentBookingCount ??
            row.occupiedBookingCount
        );
        const totalStock = safeInt(
          row.displayMaximum ??
            row.totalStock ??
            row.maxStock ??
            row.maximumStock ??
            row.maxCount ??
            row.stock ??
            row.stockCount ??
            row.settingStock ??
            row.availableStock,
          settingStock
        );
        const displayCurrent = safeInt(
          row.displayCurrent ??
            row.reservedStock ??
            row.bookingCount ??
            row.reservationCount ??
            row.currentBookingCount ??
            row.occupiedBookingCount
        );
        const displayMaximum = safeInt(
          row.displayMaximum ??
            row.totalStock ??
            row.maxStock ??
            row.maximumStock ??
            row.maxCount ??
            row.stock ??
            row.stockCount ??
            row.settingStock ??
            row.availableStock,
          totalStock
        );
        const normalizedOpen = normalizeOpenStatus(row.openStatus);
        const openStatus =
          normalizedOpen !== "UNKNOWN"
            ? normalizedOpen
            : typeof row.hasSaleEnded === "boolean"
              ? row.hasSaleEnded
                ? "CLOSED"
                : "OPEN"
              : "UNKNOWN";
        const rawRoomId = String(row.roomId ?? "");
        const rawRoomName = String(row.roomName ?? row.name ?? "");
        const mappedRoom = resolvePresetRoomId(rawRoomId, rawRoomName, preset, idMap);
        const providerItemId = rawRoomId || String(mappedRoom.roomId || "");
        if (!providerItemId) return null;
        const mappedName = String(mappedRoom.matchedName || idMap.get(providerItemId) || "");
        const roomName = rawRoomName || mappedName || providerItemId;
        const mappingMethod = rawRoomId ? "id_exact" : String(mappedRoom.method || "unmatched");
        const mappingConfidence = rawRoomId ? 1 : Number(mappedRoom.confidence ?? 0);
        return {
          date: String(row.date ?? ""),
          roomId: providerItemId,
          providerItemId,
          roomName,
          rawRoomId,
          rawRoomName,
          mappingConfidence,
          mappingMethod,
          mappingMatchedName: mappedName,
          priceSetId: toIntOrNull(row.priceSetId),
          settingStock,
          openStatus,
          totalStock,
          reservedStock,
          availableStock: safeInt(row.availableStock ?? row.stock ?? row.settingStock ?? settingStock),
          displayCurrent,
          displayMaximum,
          source: normalizeText(row.source || "api")
        };
      })
      .filter(Boolean)
      .filter((row) => isDate(row.date) && normalizeText(row.roomId || ""))
      .filter((row) => row.date >= query.startDate && row.date <= query.endDate);
    const deduped = new Map();
    normalized.forEach((row) => {
      const key = `${row.date}::${row.roomId}`;
      const prev = deduped.get(key);
      if (!prev || scoreNormalizedProviderRow(row) > scoreNormalizedProviderRow(prev)) {
        deduped.set(key, row);
      }
    });
    return [...deduped.values()].sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      const ao = order.get(a.roomId);
      const bo = order.get(b.roomId);
      const hasOrderA = Number.isInteger(ao);
      const hasOrderB = Number.isInteger(bo);
      if (hasOrderA && hasOrderB && ao !== bo) return ao - bo;
      if (hasOrderA && !hasOrderB) return -1;
      if (!hasOrderA && hasOrderB) return 1;
      const byName = String(a.roomName || "").localeCompare(String(b.roomName || ""));
      if (byName !== 0) return byName;
      return String(a.roomId || "").localeCompare(String(b.roomId || ""));
    });
  }

  Object.assign(ns, {
    flattenAdminPayload,
    parseNaverItems,
    fetchStationRows,
    fetchNaverRows,
    fetchProviderRows,
    fetchProviderReservations,
    assertReadonlyPmsRequest,
    buildPmsReservationCacheKey,
    getKnownWingsEndpointCount:
      typeof W.getKnownEndpointCount === "function"
        ? () => W.getKnownEndpointCount()
        : () => 0,
    getKnownWingsEndpoints:
      typeof W.getEndpointCatalog === "function"
        ? () => W.getEndpointCatalog()
        : () => [],
    resolvePresetRoomId,
    normalizeRows,
  });
})();

