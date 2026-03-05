(() => {
  "use strict";

  const root = globalThis;
  const App = (root.App = root.App || {});
  App.pms = App.pms || {};
  const ns = (App.pms.wingsAdapter = App.pms.wingsAdapter || {});

  const N = App.scan?.normalize || {};
  const P = App.domain?.reservationPolicy || {};
  const {
    normalizeText,
    safeInt,
    toDateKey,
    addDays,
    fromDateKey
  } = N;

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

  const classifyReservationStatusBucket =
    typeof P.classifyReservationStatusBucket === "function"
      ? P.classifyReservationStatusBucket
      : (status) => {
          const text = normalizeReservationStatus(status);
          return text === "CANCELED" || /^CXL|^CNCL|^CANC|^CX$|^CN$/.test(text) ? "CANCELED" : "ACTIVE";
        };

  const WINGS_READONLY_PATH_RE = /\/pms\/biz\/[^/]+\/(?:search|select|view)[^/]*\.do$/i;
  const WINGS_MUTATION_PATH_RE = /\/pms\/biz\/[^/]+\/(?:update|insert|delete|send)[^/]*\.do$/i;
  const DATE_START_KEYS = [
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
  const DATE_END_KEYS = [
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

  // Current known read-only Wings endpoints used for reservation/ops extraction.
  const WINGS_ENDPOINT_CATALOG = [
    "/pms/biz/ir04_0100X/searchListGlobalRsvn_v03.do",
    "/pms/biz/ir04_0100X/searchListRsvn.do",
    "/pms/biz/ir04_0100X/searchFITReserv.do",
    "/pms/biz/ir04_0100X/searchListRoomAvaiable.do",
    "/pms/biz/ir04_0100X/searchListRoomBlockChart_V03.do",
    "/pms/biz/ir04_0100X/searchFITInHouse.do",
    "/pms/biz/ir04_0100X/searchListRateByWalkIn.do",
    "/pms/biz/ir04_0100X/searchListServiceByWalkIn.do",
    "/pms/biz/ir04_0100X/searchListInterMemo.do",
    "/pms/biz/ir04_0100X/searchListAssignedRoom.do",
    "/pms/biz/ir04_0100X/searchListAccountContract.do"
  ];

  function normalizeParamKey(value) {
    return normalizeText(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  const NORMALIZED_DATE_START_KEYS = new Set(DATE_START_KEYS.map((key) => normalizeParamKey(key)));
  const NORMALIZED_DATE_END_KEYS = new Set(DATE_END_KEYS.map((key) => normalizeParamKey(key)));

  function parseAnyDate(value) {
    const text = normalizeText(value || "");
    if (!text) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    const iso = text.match(/^(\d{4}-\d{2}-\d{2})[T\s]/);
    if (iso) return iso[1];
    const compact = text.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;
    return "";
  }

  function deriveCheckout(checkin, checkout, nights) {
    const checkinKey = parseAnyDate(checkin);
    const checkoutKey = parseAnyDate(checkout);
    const nightsValue = Number.isInteger(nights) ? nights : safeInt(nights, 0);
    if (checkinKey && checkoutKey && checkoutKey > checkinKey) {
      const checkinDate = fromDateKey(checkinKey);
      const checkoutDate = fromDateKey(checkoutKey);
      const nights =
        checkinDate && checkoutDate
          ? Math.max(0, Math.round((checkoutDate.valueOf() - checkinDate.valueOf()) / 86400000))
          : safeInt(nightsValue, 0);
      return {
        checkin: checkinKey,
        checkout: checkoutKey,
        nights
      };
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

  function applyQueryRange(params, query) {
    if (!params || typeof params.keys !== "function" || !query) return params;
    [...params.keys()].forEach((key) => {
      const normalized = normalizeParamKey(key);
      if (NORMALIZED_DATE_START_KEYS.has(normalized)) params.set(key, query.startDate);
      if (NORMALIZED_DATE_END_KEYS.has(normalized)) params.set(key, query.endDate);
    });
    return params;
  }

  function validateRequestSchema({ urlRaw, bundle, query }) {
    const issues = [];
    const urlText = normalizeText(urlRaw || "");
    if (!urlText) issues.push("WINGS PMS URL is required.");
    if (!query?.startDate || !query?.endDate) issues.push("WINGS query range(startDate/endDate) is required.");
    if (query?.startDate && query?.endDate && query.startDate > query.endDate) {
      issues.push("WINGS query range is invalid (startDate > endDate).");
    }
    const method = normalizeText(bundle?.method || "GET").toUpperCase() || "GET";
    if (!["GET", "POST"].includes(method)) {
      issues.push(`WINGS readonly request supports GET/POST only. method=${method}`);
    }
    return issues;
  }

  function assertReadonlyRequest(url, options) {
    const method = normalizeText(options?.method || "GET").toUpperCase() || "GET";
    if (!["GET", "POST"].includes(method)) {
      throw new Error(`PMS 읽기 전용 요청만 허용됩니다. 현재 method=${method}`);
    }
    const pathname = normalizeText(url?.pathname || "");
    if (!pathname) {
      throw new Error("PMS 요청 URL 경로를 확인할 수 없습니다.");
    }
    if (WINGS_MUTATION_PATH_RE.test(pathname) || !WINGS_READONLY_PATH_RE.test(pathname)) {
      throw new Error(`PMS 읽기 전용 엔드포인트만 허용됩니다: ${pathname}`);
    }
  }

  function buildRequest({ urlRaw, bundle, query }) {
    const issues = validateRequestSchema({ urlRaw, bundle, query });
    if (issues.length > 0) {
      throw new Error(issues.join(" "));
    }
    const method = normalizeText(bundle?.method || "").toUpperCase() || "GET";
    const contentType = normalizeText(bundle?.contentType || "").toLowerCase();
    const url = new URL(String(urlRaw));
    const options = { method, headers: {} };
    const requestBody = normalizeText(bundle?.requestBody || "");

    if (method === "GET") {
      applyQueryRange(url.searchParams, query);
    } else {
      if (contentType === "json" && requestBody.startsWith("{")) {
        options.body = requestBody;
        options.headers["Content-Type"] = "application/json";
      } else {
        const bodyParams = new URLSearchParams(requestBody);
        applyQueryRange(bodyParams, query);
        options.body = bodyParams.toString();
        options.headers["Content-Type"] = "application/x-www-form-urlencoded; charset=UTF-8";
      }
      if (!options.headers["X-Requested-With"] && !options.headers["x-requested-with"]) {
        options.headers["X-Requested-With"] = "XMLHttpRequest";
      }
    }

    assertReadonlyRequest(url, options);
    return {
      url,
      options,
      endpointPath: normalizeText(url.pathname || ""),
      requestSchemaIssues: []
    };
  }

  function validateResponsePayload(payload) {
    const issues = [];
    if (!payload || typeof payload !== "object") {
      issues.push("PMS payload is not a JSON object.");
      return { ok: false, issues };
    }
    const candidates = [
      payload.rows,
      payload.items,
      payload.data?.rows,
      payload.data?.items,
      payload.data,
      payload.results
    ].filter((item) => Array.isArray(item));
    if (candidates.length === 0) {
      issues.push("PMS payload does not include array candidates(rows/items/data/results).");
    }
    return { ok: issues.length === 0, issues };
  }

  function getReservations({ payload, query, parser }) {
    const validation = validateResponsePayload(payload);
    const parseFn = typeof parser === "function" ? parser : null;
    if (!parseFn) {
      throw new Error("WINGS Adapter parser callback is required.");
    }
    const records = parseFn(payload, "PMS", query, "");
    return {
      records: Array.isArray(records) ? records : [],
      validation
    };
  }

  function getReservationChanges(records, sinceDateKey) {
    const since = parseAnyDate(sinceDateKey);
    if (!since) return [];
    return (Array.isArray(records) ? records : []).filter((row) => {
      const checkin = parseAnyDate(row?.checkin || "");
      return checkin && checkin >= since;
    });
  }

  function getRoomState(records) {
    const rows = [];
    (Array.isArray(records) ? records : []).forEach((record) => {
      const checkin = parseAnyDate(record?.checkin || "");
      const checkout = parseAnyDate(record?.checkout || "");
      const roomId = normalizeText(record?.roomId || record?.roomNo || "");
      const reservationId = normalizeText(record?.reservationNo || record?.reservationRef || "");
      const statusBucket = normalizeText(record?.statusBucket || "");
      const stay = deriveCheckout(checkin, checkout, safeInt(record?.nights, 0));
      if (!stay.checkin || !stay.checkout || !roomId || !reservationId) return;
      let day = stay.checkin;
      while (day && day < stay.checkout) {
        rows.push({
          room_id: roomId,
          date: day,
          status: statusBucket || classifyReservationStatusBucket(record?.status || ""),
          reservation_id: reservationId
        });
        const base = fromDateKey(day);
        day = base ? toDateKey(addDays(base, 1)) : "";
      }
    });
    return rows;
  }

  function getInventory(records) {
    const roomState = getRoomState(records);
    const byKey = new Map();
    roomState.forEach((row) => {
      const key = `${row.room_id}::${row.date}`;
      byKey.set(key, (byKey.get(key) || 0) + 1);
    });
    return [...byKey.entries()].map(([key, stock]) => {
      const [provider_item_id, day] = key.split("::");
      return {
        provider_item_id,
        date: day,
        stock: Math.max(0, Number(stock) || 0)
      };
    });
  }

  function getEndpointCatalog() {
    return [...WINGS_ENDPOINT_CATALOG];
  }

  function getKnownEndpointCount() {
    return WINGS_ENDPOINT_CATALOG.length;
  }

  ns.WINGS_ENDPOINT_CATALOG = WINGS_ENDPOINT_CATALOG;
  ns.WINGS_READONLY_PATH_RE = WINGS_READONLY_PATH_RE;
  ns.WINGS_MUTATION_PATH_RE = WINGS_MUTATION_PATH_RE;
  ns.validateRequestSchema = validateRequestSchema;
  ns.buildRequest = buildRequest;
  ns.assertReadonlyRequest = assertReadonlyRequest;
  ns.validateResponsePayload = validateResponsePayload;
  ns.getReservations = getReservations;
  ns.getReservationChanges = getReservationChanges;
  ns.getRoomState = getRoomState;
  ns.getInventory = getInventory;
  ns.getEndpointCatalog = getEndpointCatalog;
  ns.getKnownEndpointCount = getKnownEndpointCount;
})();
