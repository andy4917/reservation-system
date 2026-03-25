(() => {
  "use strict";

  const root = globalThis;
  const App = (root.App = root.App || {});
  App.io = App.io || {};
  App.runtime = App.runtime || {};
  const ns = (App.io.pmsFetch = App.io.pmsFetch || {});
  const C = App.constants || {};
  const {
    POLICY_NAVER_BUSINESS_ID,
    POLICY_STATION_BRANCH_ID,
    PMS_ORIGINS,
    PREF_KEY,
    SYNC_CFG_KEY,
    SYNC_APPLY_KEY,
    SYNC_FEATURE_KEY_COMPAT,
    POLICY_SPREADSHEET_ID,
    POLICY_SHEET_NAME,
    POLICY_START_ROW,
    POLICY_SHEET_YEAR,
    POLICY_GOOGLE_CLIENT_ID,
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
    buildDateRange,
    normalizeBranchLabel,
    normalizeReadonlyDateRange,
    buildWingsPmsPresetRequest
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
  const pmsReservationInflightCache =
    App.runtime.pmsReservationInflightCache || (App.runtime.pmsReservationInflightCache = new Map());
  const pmsCapabilityCache = App.runtime.pmsCapabilityCache || (App.runtime.pmsCapabilityCache = new Map());
  const pmsCapabilityInflightCache =
    App.runtime.pmsCapabilityInflightCache || (App.runtime.pmsCapabilityInflightCache = new Map());
  const providerFetchInstrumentation =
    App.runtime.providerFetchInstrumentation ||
    (App.runtime.providerFetchInstrumentation = { byProvider: {} });
  const PMS_RESERVATION_CACHE_TTL_MS = 15000;
  const PMS_FETCH_TIMEOUT_MS = 15000;
  const PMS_FETCH_RETRY_LIMIT = 2;
  const PMS_FETCH_MAX_QUERY_DAYS = 31;
  const PMS_CAPABILITY_CACHE_TTL_MS = 15000;
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
  const NATIONALITY_FIELD_ALIASES = [
    "nationality",
    "guest_nationality",
    "guestNation",
    "guest_country",
    "nat_code",
    "natCode",
    "countryCode",
    "nationality_nights"
  ];
  const LANGUAGE_CODE_FIELD_ALIASES = [
    "lang_code",
    "langCode",
    "language_code",
    "languageCode",
    "guest_lang_code"
  ];
  const LANGUAGE_NAME_FIELD_ALIASES = [
    "lang_name",
    "langName",
    "language",
    "language_name",
    "languageName",
    "preferred_language"
  ];
  const SOURCE_CODE_FIELD_ALIASES = ["source_code", "sourceCode", "raw_channel", "rawChannel"];
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
  const WINGS_LIVE_CONTRACT_DEFS = Object.freeze({
    reservation_summary: Object.freeze({
      path: "/pms/biz/ir04_0100X/searchListGlobalRsvn_v03_SUM.do",
      buildBody(request, context, profile) {
        return buildMergedCapabilityRequestBody(
          profile,
          buildReadonlyRangeOverrideMap(request, context)
        );
      }
    }),
    reservation_detail: Object.freeze({
      path: "/pms/biz/ir01_0102/searchFITReserv.do",
      defaultPageId: "IR01_0310_V03",
      buildBody(request, context, profile) {
        const reservationNo = coerceReservationNo(
          request?.reservationNo || request?.rsvnNo || request?.reservation_id || request?.reservationId || ""
        );
        const reservationSeqNo = normalizeText(request?.reservationSeqNo || request?.rsvnSeqNo || "1") || "1";
        if (!reservationNo) throw new Error("reservation_detail requires reservationNo.");
        return buildMergedCapabilityRequestBody(profile, {
          PROPERTY_NO: normalizeText(request?.propertyNo || context?.propertyNo || ""),
          BSNS_CODE: normalizeText(request?.bsnsCode || context?.bsnsCode || ""),
          RSVN_NO: reservationNo,
          RSVN_SEQ_NO: reservationSeqNo,
          PAGE_ID: normalizeText(request?.pageId || "IR01_0310_V03") || "IR01_0310_V03",
          AUTH_PASS_YN: normalizeText(request?.authPassYn || "N") || "N"
        });
      }
    }),
    linked_reservation_lookup: Object.freeze({
      path: "/pms/biz/fd01_0101/searchListLinkedReservation.do",
      buildBody(request, context, profile) {
        const reservationNo = coerceReservationNo(
          request?.reservationNo || request?.rsvnNo || request?.reservation_id || request?.reservationId || ""
        );
        const reservationRef = coerceReservationNo(
          request?.reservationRef || request?.globalReservationNo || request?.globalRsvnNo || ""
        );
        if (!reservationNo && !reservationRef) {
          throw new Error("linked_reservation_lookup requires reservationNo or reservationRef.");
        }
        return buildMergedCapabilityRequestBody(profile, {
          PROPERTY_NO: normalizeText(request?.propertyNo || context?.propertyNo || ""),
          BSNS_CODE: normalizeText(request?.bsnsCode || context?.bsnsCode || ""),
          RSVN_NO: reservationNo,
          GLOBAL_RSVN_NO: reservationRef
        });
      }
    }),
    room_block_chart: Object.freeze({
      path: "/pms/biz/ir01_0300/searchListRoomBlockChart_V03.do",
      buildBody(request, context, profile) {
        const { startDate, endDate } = normalizePmsReadonlyQuery(request || {});
        return buildMergedCapabilityRequestBody(
          profile,
          buildReadonlyRangeOverrideMap({ startDate, endDate }, context)
        );
      }
    }),
    room_availability_chart: Object.freeze({
      path: "/pms/biz/ir01_0300/searchListRoomAvaiable.do",
      buildBody(request, context, profile) {
        const { startDate, endDate } = normalizePmsReadonlyQuery(request || {});
        return buildMergedCapabilityRequestBody(
          profile,
          buildReadonlyRangeOverrideMap({ startDate, endDate }, context)
        );
      }
    }),
    room_availability_summary: Object.freeze({
      path: "/pms/biz/ir02_0100/searchListRoomAvailable.do",
      buildBody(request, context, profile) {
        const { startDate, endDate } = normalizePmsReadonlyQuery(request || {});
        return buildMergedCapabilityRequestBody(
          profile,
          buildReadonlyRangeOverrideMap({ startDate, endDate }, context)
        );
      }
    }),
    source_catalog: Object.freeze({
      path: "/pms/biz/ir04/searchListSource.do",
      buildBody(request, context, profile) {
        const propertyNo = normalizeText(request?.propertyNo || context?.propertyNo || "");
        if (!propertyNo) throw new Error("source_catalog requires propertyNo.");
        return buildMergedCapabilityRequestBody(profile, {
          PROPERTY_NO: propertyNo
        });
      }
    }),
    room_type_catalog: Object.freeze({
      path: "/pms/biz/ir04/searchListRoomType.do",
      buildBody(request, context, profile) {
        const propertyNo = normalizeText(request?.propertyNo || context?.propertyNo || "");
        if (!propertyNo) throw new Error("room_type_catalog requires propertyNo.");
        return buildMergedCapabilityRequestBody(profile, {
          PROPERTY_NO: propertyNo
        });
      }
    }),
    market_catalog: Object.freeze({
      path: "/pms/biz/ir04/searchListMarket.do",
      buildBody(request, context, profile) {
        const propertyNo = normalizeText(request?.propertyNo || context?.propertyNo || "");
        if (!propertyNo) throw new Error("market_catalog requires propertyNo.");
        return buildMergedCapabilityRequestBody(profile, {
          PROPERTY_NO: propertyNo
        });
      }
    }),
    rate_catalog: Object.freeze({
      path: "/pms/biz/ir04/selectListRate.do",
      buildBody(request, context, profile) {
        const propertyNo = normalizeText(request?.propertyNo || context?.propertyNo || "");
        if (!propertyNo) throw new Error("rate_catalog requires propertyNo.");
        return buildMergedCapabilityRequestBody(profile, {
          PROPERTY_NO: propertyNo
        });
      }
    }),
    sale_person_catalog: Object.freeze({
      path: "/pms/biz/ir04/selectListSalePerson.do",
      buildBody(request, context, profile) {
        const propertyNo = normalizeText(request?.propertyNo || context?.propertyNo || "");
        if (!propertyNo) throw new Error("sale_person_catalog requires propertyNo.");
        return buildMergedCapabilityRequestBody(profile, {
          PROPERTY_NO: propertyNo
        });
      }
    }),
    nationality_language_lookup: Object.freeze({
      path: "/pms/biz/comn/searchLangByNatCode.do",
      buildBody(request, context, profile) {
        const propertyNo = normalizeText(request?.propertyNo || context?.propertyNo || "");
        const natCode = normalizeText(request?.natCode || request?.nationalityCode || request?.countryCode || "");
        if (!propertyNo) throw new Error("nationality_language_lookup requires propertyNo.");
        if (!natCode) throw new Error("nationality_language_lookup requires natCode.");
        return buildMergedCapabilityRequestBody(profile, {
          PROPERTY_NO: propertyNo,
          NAT_CODE: natCode
        });
      }
    }),
    account_contract_lookup: Object.freeze({
      path: "/pms/biz/comn02_0301/searchListAccountContract.do",
      buildBody(request, context, profile) {
        const propertyNo = normalizeText(request?.propertyNo || context?.propertyNo || "");
        if (!propertyNo) throw new Error("account_contract_lookup requires propertyNo.");
        return buildMergedCapabilityRequestBody(profile, {
          PROPERTY_NO: propertyNo
        });
      }
    }),
    special_service_lookup: Object.freeze({
      path: "/pms/biz/ir01_0102/searchListSpecialService.do",
      buildBody(request, context, profile) {
        const reservationNo = coerceReservationNo(request?.reservationNo || request?.rsvnNo || "");
        if (!reservationNo) throw new Error("special_service_lookup requires reservationNo.");
        return buildMergedCapabilityRequestBody(profile, {
          PROPERTY_NO: normalizeText(request?.propertyNo || context?.propertyNo || ""),
          BSNS_CODE: normalizeText(request?.bsnsCode || context?.bsnsCode || ""),
          RSVN_NO: reservationNo,
          RSVN_SEQ_NO: normalizeText(request?.reservationSeqNo || request?.rsvnSeqNo || "1") || "1"
        });
      }
    }),
    reservation_rate_lookup: Object.freeze({
      path: "/pms/biz/ir01_0111/searchRoomRateOnRsvn.do",
      buildBody(request, context, profile) {
        const reservationNo = coerceReservationNo(request?.reservationNo || request?.rsvnNo || "");
        if (!reservationNo) throw new Error("reservation_rate_lookup requires reservationNo.");
        return buildMergedCapabilityRequestBody(profile, {
          PROPERTY_NO: normalizeText(request?.propertyNo || context?.propertyNo || ""),
          BSNS_CODE: normalizeText(request?.bsnsCode || context?.bsnsCode || ""),
          RSVN_NO: reservationNo,
          RSVN_SEQ_NO: normalizeText(request?.reservationSeqNo || request?.rsvnSeqNo || "1") || "1"
        });
      }
    }),
    assigned_room_guest_info: Object.freeze({
      path: "/pms/biz/ir01_0124/searchGuestInfo.do",
      buildBody(request, context, profile) {
        const reservationNo = coerceReservationNo(request?.reservationNo || request?.rsvnNo || "");
        if (!reservationNo) throw new Error("assigned_room_guest_info requires reservationNo.");
        return buildMergedCapabilityRequestBody(profile, {
          PROPERTY_NO: normalizeText(request?.propertyNo || context?.propertyNo || ""),
          BSNS_CODE: normalizeText(request?.bsnsCode || context?.bsnsCode || ""),
          RSVN_NO: reservationNo,
          RSVN_SEQ_NO: normalizeText(request?.reservationSeqNo || request?.rsvnSeqNo || "1") || "1"
        });
      }
    }),
    assigned_room_lookup: Object.freeze({
      path: "/pms/biz/ir01_0124/searchListAssignedRoom.do",
      buildBody(request, context, profile) {
        const propertyNo = normalizeText(request?.propertyNo || context?.propertyNo || "");
        const bsnsCode = normalizeText(request?.bsnsCode || context?.bsnsCode || propertyNo);
        const reservationNo = coerceReservationNo(request?.reservationNo || request?.rsvnNo || "");
        const reservationSeqNo = normalizeText(request?.reservationSeqNo || request?.rsvnSeqNo || "1") || "1";
        const roomTypeCode = normalizeText(request?.roomTypeCode || request?.room_type_code || "");
        const arrvDate = parseAnyDate(request?.arrvDate || request?.arrivalDate || request?.checkin || "");
        const deptDate = parseAnyDate(request?.deptDate || request?.departureDate || request?.checkout || "");
        const rsvnStatusCode = normalizeText(request?.rsvnStatusCode || request?.reservationStatusCode || "RR") || "RR";
        const indGroupCode = normalizeText(request?.indGroupCode || "F") || "F";
        if (!propertyNo || !bsnsCode) throw new Error("assigned_room_lookup requires propertyNo and bsnsCode.");
        if (!reservationNo) throw new Error("assigned_room_lookup requires reservationNo.");
        if (!roomTypeCode) throw new Error("assigned_room_lookup requires roomTypeCode.");
        if (!arrvDate || !deptDate) throw new Error("assigned_room_lookup requires arrvDate and deptDate.");
        const compactArrv = arrvDate.replace(/-/g, "");
        const compactDept = deptDate.replace(/-/g, "");
        return buildMergedCapabilityRequestBody(
          profile,
          {
            FLOOR_CODE: normalizeText(request?.floorCode || ""),
            ROOM_TYPE_CODE: roomTypeCode,
            ROOM_NO_F: normalizeText(request?.roomNoFrom || ""),
            ROOM_NO_T: normalizeText(request?.roomNoTo || ""),
            VIEW_CODE: normalizeText(request?.viewCode || ""),
            ROOM_STATUS_CODE: normalizeText(request?.roomStatusCode || "VAC") || "VAC",
            ROOM_CLEAN_STATUS_CODE: normalizeText(request?.roomCleanStatusCode || ""),
            SMOKE_YN: normalizeText(request?.smokeYn || ""),
            FORCE_BY_USER_YN: normalizeText(request?.forceByUserYn || ""),
            VALUE_OF_CURSOR: normalizeText(request?.valueOfCursor || ""),
            BSNS_CODE: bsnsCode,
            PROPERTY_NO: propertyNo,
            IND_GROUP_CODE: indGroupCode,
            RSVN_NO: reservationNo,
            RSVN_SEQ_NO: reservationSeqNo,
            ARRV_DATE: compactArrv,
            DEPT_DATE: compactDept,
            ROOM_TYPE_NAME: normalizeText(request?.roomTypeName || ""),
            RSVN_NAME_RES: normalizeText(request?.reservationName || request?.guestName || ""),
            RSVN_STATUS_CODE: rsvnStatusCode,
            RSVN_ROOM_CNT: normalizeText(request?.reservationRoomCount || "1") || "1"
          },
          [
            ["ROOM_TYPE_CODE_ARRAY[]", roomTypeCode],
            ["ROOM_STATUS_CODE_ARRAY[]", normalizeText(request?.roomStatusCode || "VAC") || "VAC"]
          ]
        );
      }
    }),
    assignable_room_lookup: Object.freeze({
      path: "/pms/biz/ir01_0124/searchListRoom.do",
      buildBody(request, context, profile) {
        const propertyNo = normalizeText(request?.propertyNo || context?.propertyNo || "");
        const bsnsCode = normalizeText(request?.bsnsCode || context?.bsnsCode || propertyNo);
        const roomTypeCode = normalizeText(request?.roomTypeCode || request?.room_type_code || "");
        const arrvDate = parseAnyDate(request?.arrvDate || request?.arrivalDate || request?.checkin || "");
        const deptDate = parseAnyDate(request?.deptDate || request?.departureDate || request?.checkout || "");
        if (!propertyNo || !bsnsCode) throw new Error("assignable_room_lookup requires propertyNo and bsnsCode.");
        if (!roomTypeCode) throw new Error("assignable_room_lookup requires roomTypeCode.");
        if (!arrvDate || !deptDate) throw new Error("assignable_room_lookup requires arrvDate and deptDate.");
        return buildMergedCapabilityRequestBody(profile, {
          PROPERTY_NO: propertyNo,
          BSNS_CODE: bsnsCode,
          ROOM_TYPE_CODE: roomTypeCode,
          ARRV_DATE: arrvDate.replace(/-/g, ""),
          DEPT_DATE: deptDate.replace(/-/g, ""),
          ROOM_STATUS_CODE: normalizeText(request?.roomStatusCode || "VAC") || "VAC"
        });
      }
    }),
    assignable_room_type_lookup: Object.freeze({
      path: "/pms/biz/ir01_0124/searchListRoomTypeByParam.do",
      buildBody(request, context, profile) {
        const propertyNo = normalizeText(request?.propertyNo || context?.propertyNo || "");
        const bsnsCode = normalizeText(request?.bsnsCode || context?.bsnsCode || propertyNo);
        if (!propertyNo || !bsnsCode) throw new Error("assignable_room_type_lookup requires propertyNo and bsnsCode.");
        return buildMergedCapabilityRequestBody(profile, {
          PROPERTY_NO: propertyNo,
          BSNS_CODE: bsnsCode,
          ARRV_DATE: parseAnyDate(request?.arrvDate || request?.arrivalDate || request?.checkin || "").replace(/-/g, ""),
          DEPT_DATE: parseAnyDate(request?.deptDate || request?.departureDate || request?.checkout || "").replace(/-/g, "")
        });
      }
    })
  });

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

  function createTaggedError(code, message, detail = "") {
    const error = new Error(message);
    error.code = code;
    error.detail = detail;
    return error;
  }

  function formatTaggedError(error) {
    const message = String(error?.message || error || "").trim();
    const detail = String(error?.detail || "").trim();
    return detail ? `${message} :: ${detail}` : message;
  }

  function decodeHtmlEntities(value) {
    return String(value || "")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/&#x2f;/gi, "/")
      .replace(/&#(\d+);/g, (_, code) => {
        const parsed = Number(code);
        return Number.isFinite(parsed) ? String.fromCharCode(parsed) : _;
      });
  }

  function parseHtmlFormInputs(text) {
    const inputs = [];
    const inputRe = /<input\b[^>]*>/gi;
    let match;
    while ((match = inputRe.exec(String(text || "")))) {
      const tag = match[0] || "";
      const name = decodeHtmlEntities(tag.match(/\bname\s*=\s*['"]([^'"]*)['"]/i)?.[1] || "");
      if (!name) continue;
      const value = decodeHtmlEntities(tag.match(/\bvalue\s*=\s*['"]([^'"]*)['"]/i)?.[1] || "");
      inputs.push([name, value]);
    }
    return inputs;
  }

  function parseHtmlRelayForm(text, baseUrl) {
    const raw = String(text || "");
    if (!/<form\b/i.test(raw)) return null;
    const formMatch = raw.match(/<form\b([^>]*)>/i);
    if (!formMatch?.[1]) return null;
    const attrs = formMatch[1];
    const method = normalizeText(attrs.match(/\bmethod\s*=\s*['"]([^'"]*)['"]/i)?.[1] || "POST").toUpperCase() || "POST";
    const actionRaw = decodeHtmlEntities(attrs.match(/\baction\s*=\s*['"]([^'"]*)['"]/i)?.[1] || "");
    if (!actionRaw) return null;
    let actionUrl = actionRaw;
    try {
      actionUrl = new URL(actionRaw, baseUrl || PMS_ORIGINS.WINGS_WEB).toString();
    } catch (_) {
      return null;
    }
    return {
      method: method === "GET" ? "GET" : "POST",
      actionUrl,
      body: new URLSearchParams(parseHtmlFormInputs(raw)).toString()
    };
  }

  async function submitHtmlRelayForm(relay, bundle, referer = "") {
    if (!relay?.actionUrl) {
      throw createTaggedError("HTML_RELAY_MISSING_ACTION", "PMS relay form is missing an action URL.");
    }
    await ensurePmsBundleCookies(bundle);
    const { headers, cookieHeader } = buildPmsRequestHeaders(bundle, { headers: {} });
    const relayHeaders = {};
    mergeHeaders(relayHeaders, headers);
    mergeHeaders(relayHeaders, {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    });
    if (referer) {
      mergeHeaders(relayHeaders, { Referer: referer });
    }
    if (relay.method !== "GET") {
      mergeHeaders(relayHeaders, { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" });
    }
    const response = await fetch(relay.actionUrl, {
      method: relay.method,
      credentials: cookieHeader || (Array.isArray(bundle?.cookies) && bundle.cookies.length > 0) ? "include" : "omit",
      headers: relayHeaders,
      body: relay.method === "GET" ? undefined : relay.body
    });
    if (!response?.ok) {
      throw createTaggedError("HTML_RELAY_FAILED", `PMS relay form failed (${response?.status || "unknown"})`);
    }
    return response;
  }

  function summarizeProviderRowSources(rows) {
    return (Array.isArray(rows) ? rows : []).reduce(
      (acc, row) => {
        const key = normalizeText(row?.source || "api").toLowerCase();
        if (key === "dom_fallback") acc.dom += 1;
        else if (!key || key === "api") acc.api += 1;
        else acc.other += 1;
        acc.total += 1;
        return acc;
      },
      { api: 0, dom: 0, other: 0, total: 0 }
    );
  }

  function cloneCoverageSummary(coverage) {
    if (!coverage || typeof coverage !== "object") return null;
    return {
      expectedDays: Number(coverage.expectedDays || 0),
      expectedRooms: Number(coverage.expectedRooms || 0),
      expectedCells: Number(coverage.expectedCells || 0),
      minimumRows: Number(coverage.minimumRows || 0),
      rowCount: Number(coverage.rowCount || 0),
      distinctDates: Number(coverage.distinctDates || 0),
      acceptable: Boolean(coverage.acceptable)
    };
  }

  function ensureProviderFetchStats(providerType) {
    const key = normalizeText(providerType || "");
    if (!key) return null;
    if (!providerFetchInstrumentation.byProvider || typeof providerFetchInstrumentation.byProvider !== "object") {
      providerFetchInstrumentation.byProvider = {};
    }
    if (!providerFetchInstrumentation.byProvider[key]) {
      providerFetchInstrumentation.byProvider[key] = {
        providerType: key,
        totalFetches: 0,
        apiOnlyAccept: 0,
        apiDomMerge: 0,
        domOnlyFallback: 0,
        apiOnlyInsufficient: 0,
        apiErrorNoDom: 0,
        lastEvent: null,
        updatedAt: ""
      };
    }
    return providerFetchInstrumentation.byProvider[key];
  }

  function cloneProviderFetchStats(stats) {
    if (!stats || typeof stats !== "object") return null;
    return {
      providerType: normalizeText(stats.providerType || ""),
      totalFetches: Number(stats.totalFetches || 0),
      apiOnlyAccept: Number(stats.apiOnlyAccept || 0),
      apiDomMerge: Number(stats.apiDomMerge || 0),
      domOnlyFallback: Number(stats.domOnlyFallback || 0),
      apiOnlyInsufficient: Number(stats.apiOnlyInsufficient || 0),
      apiErrorNoDom: Number(stats.apiErrorNoDom || 0),
      updatedAt: normalizeText(stats.updatedAt || ""),
      lastEvent: stats.lastEvent && typeof stats.lastEvent === "object" ? { ...stats.lastEvent } : null
    };
  }

  function buildProviderFetchMeta({
    providerType,
    route,
    query,
    rows,
    apiRows = [],
    domRows = [],
    apiCoverage = null,
    finalCoverage = null,
    mergedCoverage = null,
    apiError = null
  }) {
    return {
      providerType: normalizeText(providerType || ""),
      route: normalizeText(route || ""),
      query: query && typeof query === "object"
        ? {
            startDate: normalizeText(query.startDate || ""),
            endDate: normalizeText(query.endDate || "")
          }
        : { startDate: "", endDate: "" },
      returnedRowCount: Array.isArray(rows) ? rows.length : 0,
      apiRowCount: Array.isArray(apiRows) ? apiRows.length : 0,
      domRowCount: Array.isArray(domRows) ? domRows.length : 0,
      sourceCount: summarizeProviderRowSources(rows),
      apiCoverage: cloneCoverageSummary(apiCoverage),
      finalCoverage: cloneCoverageSummary(finalCoverage),
      mergedCoverage: cloneCoverageSummary(mergedCoverage),
      apiError: apiError ? String(apiError?.message || apiError) : "",
      recordedAt: new Date().toISOString()
    };
  }

  function recordProviderFetchMeta(meta) {
    const providerType = normalizeText(meta?.providerType || "");
    if (!providerType) return null;
    const stats = ensureProviderFetchStats(providerType);
    if (!stats) return null;
    stats.totalFetches += 1;
    if (meta?.route === "api_only_accept") stats.apiOnlyAccept += 1;
    else if (meta?.route === "api_dom_merge") stats.apiDomMerge += 1;
    else if (meta?.route === "dom_only_fallback") stats.domOnlyFallback += 1;
    else if (meta?.route === "api_error_no_dom") stats.apiErrorNoDom += 1;
    else stats.apiOnlyInsufficient += 1;
    stats.updatedAt = new Date().toISOString();
    const sessionCounts = {
      apiOnlyAccept: stats.apiOnlyAccept,
      apiDomMerge: stats.apiDomMerge,
      domOnlyFallback: stats.domOnlyFallback,
      apiOnlyInsufficient: stats.apiOnlyInsufficient,
      apiErrorNoDom: stats.apiErrorNoDom,
      totalFetches: stats.totalFetches
    };
    stats.lastEvent = {
      ...meta,
      sessionCounts
    };
    return cloneProviderFetchStats(stats)?.lastEvent || null;
  }

  function getLastProviderFetchMeta(providerType = "") {
    const stats = ensureProviderFetchStats(providerType);
    const cloned = cloneProviderFetchStats(stats);
    return cloned?.lastEvent || null;
  }

  function getProviderFetchInstrumentation(providerType = "") {
    const key = normalizeText(providerType || "");
    if (key) return cloneProviderFetchStats(ensureProviderFetchStats(key));
    const byProvider = {};
    Object.entries(providerFetchInstrumentation.byProvider || {}).forEach(([name, stats]) => {
      byProvider[name] = cloneProviderFetchStats(stats);
    });
    return { byProvider };
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

  function normalizePmsReadonlyQuery(query) {
    if (typeof normalizeReadonlyDateRange === "function") {
      return normalizeReadonlyDateRange(query || {}, 7, PMS_FETCH_MAX_QUERY_DAYS);
    }
    const startDate = parseAnyDate(query?.startDate || "");
    const endDate = parseAnyDate(query?.endDate || "");
    if (!startDate || !endDate) {
      throw new Error("PMS read-only query requires startDate/endDate.");
    }
    const start = fromDateKey(startDate);
    const end = fromDateKey(endDate);
    const rawDayCount =
      start && end ? Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1) : 1;
    const limitedEndDate =
      start && rawDayCount > PMS_FETCH_MAX_QUERY_DAYS
        ? toDateKey(addDays(start, PMS_FETCH_MAX_QUERY_DAYS - 1))
        : endDate;
    return {
      startDate,
      endDate: limitedEndDate,
      requestedStartDate: startDate,
      requestedEndDate: endDate,
      dayCount: Math.min(rawDayCount, PMS_FETCH_MAX_QUERY_DAYS),
      requestedDayCount: rawDayCount,
      limited: rawDayCount > PMS_FETCH_MAX_QUERY_DAYS
    };
  }

  function normalizeRecordBranch(value) {
    if (typeof normalizeBranchLabel === "function") return normalizeBranchLabel(value);
    const text = normalizeText(value || "").toUpperCase();
    return text.replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  }

  function isGenericPropertyBranch(branch) {
    return /^PROPERTY_\d+$/.test(normalizeText(branch || "").toUpperCase());
  }

  function inferBranchFromReservationRow(row, channelRaw, account) {
    const branchRaw = normalizeText(getFirstValueByAlias(row, BRANCH_FIELD_ALIASES) || "");
    const candidates = [branchRaw, normalizeText(channelRaw || ""), normalizeText(account || "")].join(" ").toLowerCase();
    if (candidates.includes("coex") || candidates.includes("코엑스")) return "COEX";
    if (candidates.includes("gangnam") || candidates.includes("강남")) return "GANGNAM";
    if (/^\d+$/.test(branchRaw)) return `PROPERTY_${Number(branchRaw)}`;
    return "";
  }

  function applyBranchToReservationRecords(records, branch) {
    const normalizedBranch = normalizeRecordBranch(branch);
    if (!normalizedBranch) return Array.isArray(records) ? records : [];
    return (Array.isArray(records) ? records : []).map((record) => {
      const currentBranch = normalizeRecordBranch(record?.branch || "");
      if (currentBranch && !isGenericPropertyBranch(currentBranch)) {
        return { ...record, branch: currentBranch };
      }
      return { ...record, branch: normalizedBranch };
    });
  }

  function resolvePmsFetchProfiles(syncConfig = null) {
    const directUrl = normalizeText(
      syncConfig?.pmsReservationUrl || syncConfig?.pmsApiUrl || syncConfig?.pmsReservationApiUrl || ""
    );
    const directBundle =
      syncConfig?.pmsAuthBundle && typeof syncConfig.pmsAuthBundle === "object" ? syncConfig.pmsAuthBundle : null;
    const directPreset = syncConfig?.pmsPreset && typeof syncConfig.pmsPreset === "object" ? syncConfig.pmsPreset : null;
    const rawProfiles = Array.isArray(syncConfig?.pmsBranchProfiles) ? syncConfig.pmsBranchProfiles : [];
    const profiles = rawProfiles
      .map((profile, index) => {
        const branch = normalizeRecordBranch(profile?.branch || profile?.branchKey || `PROFILE_${index + 1}`);
        const pmsReservationUrl = normalizeText(
          profile?.pmsReservationUrl || profile?.pmsApiUrl || profile?.pmsReservationApiUrl || profile?.url || ""
        );
        const pmsAuthBundle =
          profile?.pmsAuthBundle && typeof profile.pmsAuthBundle === "object"
            ? profile.pmsAuthBundle
            : profile?.bundle && typeof profile.bundle === "object"
              ? profile.bundle
              : null;
        const pmsPreset = profile?.pmsPreset && typeof profile.pmsPreset === "object" ? profile.pmsPreset : null;
        if (!pmsReservationUrl && !normalizeText(pmsPreset?.presetKey || "")) return null;
        return {
          branch,
          pmsReservationUrl,
          pmsAuthBundle,
          pmsPreset
        };
      })
      .filter(Boolean);
    if (profiles.length > 0) return profiles;
    if (!directUrl && !normalizeText(directPreset?.presetKey || "")) return [];
    return [{
      branch: "",
      pmsReservationUrl: directUrl,
      pmsAuthBundle: directBundle,
      pmsPreset: directPreset
    }];
  }

  function parseBundleRequestBodyParams(bundle) {
    const params = new URLSearchParams();
    const requestBody = normalizeText(bundle?.requestBody || "");
    if (!requestBody) return params;
    try {
      const parsed = new URLSearchParams(requestBody);
      parsed.forEach((value, key) => params.append(key, value));
    } catch (_) {
      // Keep empty params on malformed body.
    }
    return params;
  }

  function getParamValueIgnoreCase(params, wantedKeys) {
    const normalizedWanted = new Set((Array.isArray(wantedKeys) ? wantedKeys : [wantedKeys]).map((key) => normalizeReservationParamKey(key)));
    for (const [key, value] of params.entries()) {
      if (normalizedWanted.has(normalizeReservationParamKey(key))) return normalizeText(value);
    }
    return "";
  }

  function extractProfilePmsContext(profile) {
    const preset = profile?.pmsPreset && typeof profile.pmsPreset === "object" ? profile.pmsPreset : {};
    const bundle = profile?.pmsAuthBundle && typeof profile.pmsAuthBundle === "object" ? profile.pmsAuthBundle : {};
    const params = parseBundleRequestBodyParams(bundle);
    const propertyNo = normalizeText(
      preset.propertyNo || getParamValueIgnoreCase(params, ["PROPERTY_NO", "propertyNo", "property_no"]) || ""
    );
    const bsnsCode = normalizeText(
      preset.bsnsCode || getParamValueIgnoreCase(params, ["BSNS_CODE", "bsnsCode", "bsns_code"]) || propertyNo
    );
    const pageId = normalizeText(
      preset.pageId || getParamValueIgnoreCase(params, ["PAGE_ID", "pageId", "page_id", "filter[PAGE_ID]"]) || ""
    );
    const urlText = normalizeText(profile?.pmsReservationUrl || "");
    let origin = "https://pms.sanhait.com";
    try {
      if (urlText) origin = new URL(urlText).origin || origin;
    } catch (_) {
      // Keep default origin.
    }
    return {
      propertyNo,
      bsnsCode,
      pageId,
      origin,
      branch: normalizeRecordBranch(profile?.branch || ""),
      params
    };
  }

  function normalizeCapabilityName(value) {
    return normalizeText(value || "").toLowerCase();
  }

  function normalizeWingsCapabilityRequest(raw) {
    const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    const capability = normalizeCapabilityName(source.capability || source.name || source.type || "");
    return {
      ...source,
      capability,
      branch: normalizeRecordBranch(source.branch || source.branchName || ""),
      reservationNo: coerceReservationNo(source.reservationNo || source.rsvnNo || source.reservation_id || source.reservationId || ""),
      reservationSeqNo: normalizeText(source.reservationSeqNo || source.rsvnSeqNo || "1") || "1",
      propertyNo: normalizeText(source.propertyNo || source.PROPERTY_NO || ""),
      bsnsCode: normalizeText(source.bsnsCode || source.BSNS_CODE || ""),
      pageId: normalizeText(source.pageId || source.PAGE_ID || ""),
      natCode: normalizeText(source.natCode || source.nationalityCode || source.NAT_CODE || ""),
      startDate: parseAnyDate(source.startDate || source.fromDate || source.arrivalDateFrom || ""),
      endDate: parseAnyDate(source.endDate || source.toDate || source.arrivalDateTo || ""),
      arrvDate: parseAnyDate(source.arrvDate || source.arrivalDate || source.checkin || ""),
      deptDate: parseAnyDate(source.deptDate || source.departureDate || source.checkout || ""),
      roomTypeCode: normalizeText(source.roomTypeCode || source.ROOM_TYPE_CODE || ""),
      roomTypeName: normalizeText(source.roomTypeName || source.ROOM_TYPE_NAME || ""),
      rsvnStatusCode: normalizeText(source.rsvnStatusCode || source.RSVN_STATUS_CODE || ""),
      indGroupCode: normalizeText(source.indGroupCode || source.IND_GROUP_CODE || ""),
      requestBody: normalizeText(source.requestBody || "")
    };
  }

  function resolveCapabilityProfiles(syncConfig, request) {
    const branchFilter = normalizeRecordBranch(request?.branch || "");
    return resolvePmsFetchProfiles(syncConfig).filter((profile) => {
      const profileBranch = normalizeRecordBranch(profile?.branch || "");
      if (branchFilter && profileBranch && profileBranch !== branchFilter) return false;
      return true;
    });
  }

  function capabilitySupportsProfile(capabilityDef, profile) {
    const endpointMeta =
      typeof W.lookupEndpointMeta === "function" ? W.lookupEndpointMeta(capabilityDef?.path || "") : null;
    const branches = Array.isArray(endpointMeta?.branches) ? endpointMeta.branches : [];
    const profileBranch = normalizeRecordBranch(profile?.branch || "");
    if (!profileBranch || branches.length <= 0) return true;
    return branches.includes(profileBranch);
  }

  function buildCapabilityRequestPlanForProfile(profile, rawRequest) {
    const request = normalizeWingsCapabilityRequest(rawRequest);
    const capability = normalizeCapabilityName(request.capability);
    const contract = WINGS_LIVE_CONTRACT_DEFS[capability] || null;
    if (!contract) return null;
    if (!capabilitySupportsProfile(contract, profile)) return null;
    const context = extractProfilePmsContext(profile);
    const url = new URL(contract.path, context.origin);
    const bodyText =
      request.requestBody ||
      (typeof contract.buildBody === "function" ? contract.buildBody(request, context, profile) : "");
    const bundle = {
      ...(profile?.pmsAuthBundle && typeof profile.pmsAuthBundle === "object" ? profile.pmsAuthBundle : {}),
      method: "POST",
      contentType: "form",
      requestBody: bodyText,
      headers: {
        ...toPlainHeaders((profile?.pmsAuthBundle && profile.pmsAuthBundle.headers) || {}),
        "X-Requested-With": "XMLHttpRequest"
      }
    };
    const options = {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest"
      },
      body: bodyText
    };
    assertReadonlyPmsRequest(url, options);
    const requestPlan = {
      url,
      options,
      endpointPath: normalizeText(url.pathname || ""),
      requestSchemaIssues: []
    };
    return {
      capability,
      branch: context.branch,
      bundle,
      requestPlan,
      profileContext: context
    };
  }

  function buildPmsRequestPlanForProfile(profile, query) {
    const profileUrl = normalizeText(profile?.pmsReservationUrl || "");
    const profileBundle =
      profile?.pmsAuthBundle && typeof profile.pmsAuthBundle === "object" ? profile.pmsAuthBundle : null;
    let urlRaw = profileUrl;
    let bundle = profileBundle;
    if (!urlRaw && normalizeText(profile?.pmsPreset?.presetKey || "")) {
      const generated =
        typeof buildWingsPmsPresetRequest === "function"
          ? buildWingsPmsPresetRequest({
              ...(profile.pmsPreset || {}),
              startDate: query.startDate,
              endDate: query.endDate
            })
          : null;
      if (generated?.url) {
        urlRaw = normalizeText(generated.url || "");
        bundle = {
          ...(generated.bundle && typeof generated.bundle === "object" ? generated.bundle : {}),
          ...(profileBundle && typeof profileBundle === "object" ? profileBundle : {})
        };
      }
    }
    if (!urlRaw) return null;
    const requestPlan =
      typeof W.buildRequest === "function"
        ? W.buildRequest({ urlRaw, bundle, query })
        : (() => {
            const fallbackRequest = buildReservationRequestOptions(urlRaw, bundle, query);
            assertReadonlyPmsRequest(fallbackRequest.url, fallbackRequest.options);
            return {
              ...fallbackRequest,
              endpointPath: normalizeText(fallbackRequest.url?.pathname || ""),
              requestSchemaIssues: []
            };
          })();
    return {
      branch: normalizeRecordBranch(profile?.branch || ""),
      bundle,
      requestPlan
    };
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
    const nationalityCode = normalizeText(getFirstValueByAlias(row, NATIONALITY_FIELD_ALIASES) || "");
    const languageCode = normalizeText(getFirstValueByAlias(row, LANGUAGE_CODE_FIELD_ALIASES) || "");
    const languageName = normalizeText(getFirstValueByAlias(row, LANGUAGE_NAME_FIELD_ALIASES) || "");
    const sourceCode = normalizeText(getFirstValueByAlias(row, SOURCE_CODE_FIELD_ALIASES) || "");
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
      sourceCode,
      status,
      statusBucket,
      auditAnomaly,
      branch,
      nationalityCode,
      languageCode,
      languageName,
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
        record?.statusBucket || "",
        record?.branch || ""
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

  function extractCapabilityPayloadRows(payload) {
    if (!payload || typeof payload !== "object") return [];
    if (Array.isArray(payload.rows)) return payload.rows.filter((row) => row && typeof row === "object");
    if (payload.rows && typeof payload.rows === "object") return [payload.rows];
    if (Array.isArray(payload.valueList)) return payload.valueList.filter((row) => row && typeof row === "object");
    if (Array.isArray(payload.items)) return payload.items.filter((row) => row && typeof row === "object");
    if (Array.isArray(payload.data?.rows)) return payload.data.rows.filter((row) => row && typeof row === "object");
    if (Array.isArray(payload.data)) return payload.data.filter((row) => row && typeof row === "object");
    if (payload.data && typeof payload.data === "object") return [payload.data];
    return [];
  }

  function parseFormBodyEntries(value) {
    const body = normalizeText(value || "");
    if (!body) return [];
    return [...new URLSearchParams(body).entries()];
  }

  function buildMergedCapabilityRequestBody(profile, overrides = {}, appendPairs = []) {
    const params = new URLSearchParams();
    parseFormBodyEntries(profile?.pmsAuthBundle?.requestBody).forEach(([key, value]) => {
      if (!normalizeText(key)) return;
      params.append(key, value);
    });
    Object.entries(overrides || {}).forEach(([key, value]) => {
      if (!normalizeText(key)) return;
      const text = normalizeText(value || "");
      if (!text && params.has(key)) {
        params.set(key, "");
        return;
      }
      params.set(key, text);
    });
    (Array.isArray(appendPairs) ? appendPairs : []).forEach((entry) => {
      if (!Array.isArray(entry) || entry.length < 2) return;
      const key = normalizeText(entry[0] || "");
      const value = normalizeText(entry[1] || "");
      if (!key || !value) return;
      params.append(key, value);
    });
    return params.toString();
  }

  function buildReadonlyRangeOverrideMap(query, context) {
    const normalized = normalizePmsReadonlyQuery(query || {});
    const propertyNo = normalizeText(query?.propertyNo || context?.propertyNo || "");
    const bsnsCode = normalizeText(query?.bsnsCode || context?.bsnsCode || propertyNo);
    const pageId = normalizeText(query?.pageId || context?.pageId || "");
    const compactStart = normalized.startDate.replace(/-/g, "");
    const compactEnd = normalized.endDate.replace(/-/g, "");
    return {
      PROPERTY_NO: propertyNo,
      BSNS_CODE: bsnsCode,
      PAGE_ID: pageId,
      START_DATE: normalized.startDate,
      END_DATE: normalized.endDate,
      FROM_DATE: normalized.startDate,
      TO_DATE: normalized.endDate,
      ARRV_DATE_F: compactStart,
      ARRV_DATE_T: compactEnd,
      STAY_DATE_F: compactStart,
      STAY_DATE_T: compactEnd,
      DEPT_DATE_F: compactStart,
      DEPT_DATE_T: compactEnd,
      RSVN_DATE_F: compactStart,
      RSVN_DATE_T: compactEnd
    };
  }

  function sanitizeSourceCatalogRow(row, branch) {
    if (!row || typeof row !== "object") return null;
    const sourceCode = normalizeText(row.SOURCE_CODE || row.source_code || row.sourceCode || "");
    if (!sourceCode) return null;
    return {
      sourceCode,
      sourceName: normalizeText(row.SOURCE_CODE_NAME || row.source_name || row.sourceName || ""),
      categoryCode: normalizeText(row.CATEGORY_CODE || row.category_code || row.categoryCode || ""),
      categoryName: normalizeText(row.CATEGORY_NAME || row.category_name || row.categoryName || ""),
      useYn: normalizeText(row.USE_YN || row.use_yn || row.useYn || ""),
      activeYn: normalizeText(row.ACTIVE_YN || row.active_yn || row.activeYn || ""),
      branch: normalizeRecordBranch(branch || "")
    };
  }

  function sanitizeNationalityLanguageRow(row, branch) {
    if (!row || typeof row !== "object") return null;
    const natCode = normalizeText(row.NAT_CODE || row.nat_code || row.natCode || "");
    if (!natCode) return null;
    return {
      natCode,
      langCode: normalizeText(row.LANG_CODE || row.lang_code || row.langCode || ""),
      langName: normalizeText(row.LANG_NAME || row.lang_name || row.langName || row.language || ""),
      branch: normalizeRecordBranch(branch || "")
    };
  }

  function sanitizeReservationDetailRow(row, request, branch) {
    if (!row || typeof row !== "object") return null;
    const merged = {
      ...row,
      RSVN_NO: row.RSVN_NO ?? request?.reservationNo ?? "",
      RSVN_SEQ_NO: row.RSVN_SEQ_NO ?? request?.reservationSeqNo ?? "1"
    };
    const base = parseReservationRow(merged, "PMS", "");
    const reservationNo = base?.reservationNo || coerceReservationNo(request?.reservationNo || "");
    if (!reservationNo) return null;
    return {
      reservationNo,
      reservationSeqNo: normalizeText(merged.RSVN_SEQ_NO || request?.reservationSeqNo || "1") || "1",
      reservationRef: normalizeText(base?.reservationRef || ""),
      branch: normalizeRecordBranch(branch || base?.branch || ""),
      checkin: normalizeText(base?.checkin || parseAnyDate(merged.ARRV_DATE || "")),
      checkout: normalizeText(base?.checkout || parseAnyDate(merged.DEPT_DATE || "")),
      nights: Number(base?.nights || safeInt(merged.NIGHTS, 0) || 0),
      status: normalizeText(base?.status || merged.RSVN_STATUS_CODE || ""),
      statusBucket: normalizeText(base?.statusBucket || ""),
      account: normalizeText(base?.account || merged.ACCOUNT || merged.CUSTM_NAME || ""),
      sourceCode: normalizeText(base?.sourceCode || merged.SOURCE_CODE || ""),
      guestName: normalizeText(base?.guestName || merged.GUEST_NAME || merged.INHS_GEST_NAME || ""),
      phoneTail: normalizeText(base?.phoneTail || ""),
      remarkHead: normalizeText(base?.remarkHead || normalizeText(merged.COMT || "").slice(0, 120)),
      nationalityCode: normalizeText(base?.nationalityCode || merged.NAT_CODE || ""),
      languageCode: normalizeText(base?.languageCode || merged.LANG_CODE || ""),
      languageName: normalizeText(base?.languageName || merged.LANG_NAME || ""),
      roomTypeCode: normalizeText(merged.ROOM_TYPE_CODE || ""),
      roomTypeName: normalizeText(merged.ROOM_TYPE_NAME || ""),
      roomNo: normalizeText(base?.roomNo || merged.ROOM_NO || ""),
      roomNos: Array.isArray(base?.roomNos) ? [...base.roomNos] : splitRoomTokens(merged.ROOM_NO || ""),
      rateName: normalizeText(merged.RATE_NAME || ""),
      assignedRoomCount: normalizeText(merged.ASSIGNED_ROOM_CNT || ""),
      auditAnomaly: base?.auditAnomaly === true
    };
  }

  function sanitizeAssignedRoomRow(row, branch) {
    if (!row || typeof row !== "object") return null;
    const reservationNo = coerceReservationNo(row.RSVN_NO || row.rsvn_no || "");
    if (!reservationNo) return null;
    return {
      reservationNo,
      reservationSeqNo: normalizeText(row.RSVN_SEQ_NO || row.rsvn_seq_no || "1") || "1",
      arrvDate: parseAnyDate(row.ARRV_DATE || row.arrv_date || ""),
      deptDate: parseAnyDate(row.DEPT_DATE || row.dept_date || ""),
      roomNo: normalizeText(row.ROOM_NO || row.room_no || ""),
      roomTypeCode: normalizeText(row.ROOM_TYPE_CODE || row.room_type_code || ""),
      roomStatusCode: normalizeText(row.ROOM_STATUS_CODE || row.room_status_code || ""),
      roomCleanStatusCode: normalizeText(row.ROOM_CLEAN_STATUS_CODE || row.room_clean_status_code || ""),
      guestName: normalizeText(row.INHS_GEST_NAME || row.inhs_gest_name || ""),
      propertyNo: normalizeText(row.PROPERTY_NO || row.property_no || ""),
      bsnsCode: normalizeText(row.BSNS_CODE || row.bsns_code || ""),
      branch: normalizeRecordBranch(branch || "")
    };
  }

  function sanitizeLinkedReservationRow(row, branch) {
    if (!row || typeof row !== "object") return null;
    return {
      reservationNo: coerceReservationNo(row.RSVN_NO || row.rsvn_no || ""),
      reservationRef: coerceReservationNo(row.GLOBAL_RSVN_NO || row.global_rsvn_no || ""),
      linkedReservationNo: coerceReservationNo(row.LINK_RSVN_NO || row.link_rsvn_no || row.RELATED_RSVN_NO || ""),
      linkedReservationRef: coerceReservationNo(row.LINK_GLOBAL_RSVN_NO || row.link_global_rsvn_no || ""),
      branch: normalizeRecordBranch(branch || ""),
      relationshipType: normalizeText(row.LINK_TYPE || row.link_type || row.REL_TYPE || "")
    };
  }

  function sanitizeRoomAvailabilityRow(row, branch) {
    if (!row || typeof row !== "object") return null;
    const roomTypeCode = normalizeText(row.ROOM_TYPE_CODE || row.room_type_code || "");
    const businessDate = parseAnyDate(row.BSNS_DATE || row.bsns_date || row.STAY_DATE || row.stay_date || row.ARRV_DATE || row.arrv_date || "");
    if (!roomTypeCode && !businessDate) return clonePmsCapabilityItem(row);
    return {
      branch: normalizeRecordBranch(branch || ""),
      roomTypeCode,
      roomTypeName: normalizeText(row.ROOM_TYPE_NAME || row.room_type_name || ""),
      businessDate,
      availableRooms: safeInt(row.AVAILABLE_ROOM_CNT || row.available_room_cnt || row.AVAILABLE_CNT || "", 0),
      totalRooms: safeInt(row.TOTAL_ROOM_CNT || row.total_room_cnt || row.ROOM_CNT || "", 0),
      occupiedRooms: safeInt(row.OCCUPIED_ROOM_CNT || row.occupied_room_cnt || "", 0),
      outOfOrderRooms: safeInt(row.OOO_ROOM_CNT || row.ooo_room_cnt || "", 0),
      rawStatus: normalizeText(row.ROOM_STATUS_CODE || row.room_status_code || "")
    };
  }

  function sanitizeAssignedRoomGuestInfoRow(row, branch) {
    if (!row || typeof row !== "object") return null;
    const reservationNo = coerceReservationNo(row.RSVN_NO || row.rsvn_no || "");
    if (!reservationNo) return null;
    return {
      reservationNo,
      reservationSeqNo: normalizeText(row.RSVN_SEQ_NO || row.rsvn_seq_no || "1") || "1",
      guestName: normalizeText(row.INHS_GEST_NAME || row.GUEST_NAME || row.guest_name || ""),
      roomNo: normalizeText(row.ROOM_NO || row.room_no || ""),
      roomTypeCode: normalizeText(row.ROOM_TYPE_CODE || row.room_type_code || ""),
      arrvDate: parseAnyDate(row.ARRV_DATE || row.arrv_date || ""),
      deptDate: parseAnyDate(row.DEPT_DATE || row.dept_date || ""),
      nationalityCode: normalizeText(row.NAT_CODE || row.nat_code || ""),
      languageCode: normalizeText(row.LANG_CODE || row.lang_code || ""),
      languageName: normalizeText(row.LANG_NAME || row.lang_name || ""),
      branch: normalizeRecordBranch(branch || "")
    };
  }

  function sanitizeGenericCapabilityRow(row, branch) {
    const cloned = clonePmsCapabilityItem(row);
    if (!cloned || typeof cloned !== "object") return null;
    return {
      ...cloned,
      branch: normalizeRecordBranch(cloned.branch || branch || "")
    };
  }

  function parseWingsCapabilityItems(capability, payload, request, branch) {
    const rows = extractCapabilityPayloadRows(payload);
    if (capability === "source_catalog") {
      return rows.map((row) => sanitizeSourceCatalogRow(row, branch)).filter(Boolean);
    }
    if (capability === "nationality_language_lookup") {
      return rows.map((row) => sanitizeNationalityLanguageRow(row, branch)).filter(Boolean);
    }
    if (capability === "reservation_detail") {
      return rows.map((row) => sanitizeReservationDetailRow(row, request, branch)).filter(Boolean);
    }
    if (capability === "assigned_room_lookup") {
      return rows.map((row) => sanitizeAssignedRoomRow(row, branch)).filter(Boolean);
    }
    if (capability === "linked_reservation_lookup") {
      return rows.map((row) => sanitizeLinkedReservationRow(row, branch)).filter(Boolean);
    }
    if (
      capability === "room_block_chart" ||
      capability === "room_availability_chart" ||
      capability === "room_availability_summary"
    ) {
      return rows.map((row) => sanitizeRoomAvailabilityRow(row, branch)).filter(Boolean);
    }
    if (capability === "assigned_room_guest_info") {
      return rows.map((row) => sanitizeAssignedRoomGuestInfoRow(row, branch)).filter(Boolean);
    }
    return rows.map((row) => sanitizeGenericCapabilityRow(row, branch)).filter(Boolean);
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

  function buildPmsCapabilityCacheKey(providerType, capability, url, options, bundle, request, branch) {
    return JSON.stringify({
      providerType: normalizeText(providerType),
      capability: normalizeText(capability),
      branch: normalizeText(branch || ""),
      url: String(url || ""),
      method: normalizeText(options?.method || ""),
      body: normalizeText(options?.body || ""),
      request: request && typeof request === "object" ? { ...request } : {},
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
      profilesFetched: Array.isArray(result.profilesFetched)
        ? result.profilesFetched.map((row) => ({ ...row }))
        : [],
      query: result.query && typeof result.query === "object" ? { ...result.query } : null,
      statusCounts: result.statusCounts && typeof result.statusCounts === "object"
        ? { ...result.statusCounts }
        : { active: 0, canceled: 0 }
    };
  }

  function clonePmsCapabilityItem(value) {
    if (Array.isArray(value)) return value.map((item) => clonePmsCapabilityItem(item));
    if (!value || typeof value !== "object") return value;
    const out = {};
    Object.entries(value).forEach(([key, item]) => {
      out[key] = clonePmsCapabilityItem(item);
    });
    return out;
  }

  function clonePmsCapabilityResult(result) {
    if (!result || typeof result !== "object") return result;
    return {
      ...result,
      items: Array.isArray(result.items) ? result.items.map((row) => clonePmsCapabilityItem(row)) : [],
      records: Array.isArray(result.records) ? result.records.map((row) => clonePmsCapabilityItem(row)) : [],
      attempts: Array.isArray(result.attempts) ? result.attempts.map((row) => ({ ...row })) : [],
      profilesFetched: Array.isArray(result.profilesFetched)
        ? result.profilesFetched.map((row) => ({ ...row }))
        : [],
      request: result.request && typeof result.request === "object" ? { ...result.request } : null,
      adapter: result.adapter && typeof result.adapter === "object" ? clonePmsCapabilityItem(result.adapter) : null
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

  function readCachedPmsCapability(key) {
    const cached = pmsCapabilityCache.get(key);
    if (!cached) return null;
    if (Date.now() - cached.ts > PMS_CAPABILITY_CACHE_TTL_MS) {
      pmsCapabilityCache.delete(key);
      return null;
    }
    return clonePmsCapabilityResult(cached.value);
  }

  function writeCachedPmsCapability(key, value) {
    pmsCapabilityCache.set(key, {
      ts: Date.now(),
      value: clonePmsCapabilityResult(value)
    });
  }

  async function readOrRunInflightPmsReservation(key, factory) {
    const active = pmsReservationInflightCache.get(key);
    if (active) {
      return clonePmsReservationResult(await active);
    }
    const nextPromise = (async () => clonePmsReservationResult(await factory()))();
    pmsReservationInflightCache.set(key, nextPromise);
    try {
      return clonePmsReservationResult(await nextPromise);
    } finally {
      pmsReservationInflightCache.delete(key);
    }
  }

  async function readOrRunInflightPmsCapability(key, factory) {
    const active = pmsCapabilityInflightCache.get(key);
    if (active) {
      return clonePmsCapabilityResult(await active);
    }
    const nextPromise = (async () => clonePmsCapabilityResult(await factory()))();
    pmsCapabilityInflightCache.set(key, nextPromise);
    try {
      return clonePmsCapabilityResult(await nextPromise);
    } finally {
      pmsCapabilityInflightCache.delete(key);
    }
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

  async function parsePmsReservationResponse(response, requestContext = null) {
    const text = await response.text();
    const payload = safeJsonParse(text);
    if (!payload || typeof payload !== "object") {
      const contentType = normalizeText(response?.headers?.get?.("content-type") || "").toLowerCase();
      const snippet = String(text || "").slice(0, 240);
      const relay = parseHtmlRelayForm(text, response?.url || requestContext?.url?.toString?.() || "");
      const relayDepth = Number(requestContext?.relayDepth || 0);
      if (relay && requestContext?.url && requestContext?.options && requestContext?.bundle && relayDepth < 2) {
        await submitHtmlRelayForm(relay, requestContext.bundle, response?.url || "");
        const retriedResponse = await fetchPmsReservationResponse(requestContext.url, requestContext.options, requestContext.bundle);
        return parsePmsReservationResponse(retriedResponse, {
          ...requestContext,
          relayDepth: relayDepth + 1
        });
      }
      if (
        contentType.includes("text/html") &&
        /identity\/samlsso|you are now redirected back to/i.test(snippet)
      ) {
        throw createTaggedError("AUTH_EXPIRED_SSO_REDIRECT", "PMS session was redirected to SSO login.", snippet);
      }
      throw createTaggedError("NON_JSON_UPSTREAM_RESPONSE", "PMS reservation API did not return JSON", snippet);
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

  async function fetchSinglePmsProfileReservations(providerType, query, profile) {
    const plan = buildPmsRequestPlanForProfile(profile, query);
    if (!plan) {
      return {
        records: [],
        source: "pms-unconfigured",
        url: "",
        candidateCount: 0,
        attempts: [],
        profilesFetched: [],
        query: { ...query }
      };
    }
    const { requestPlan, branch, bundle } = plan;
    const { url, options } = requestPlan;
    const endpointMeta =
      typeof W.lookupEndpointMeta === "function" ? W.lookupEndpointMeta(normalizeText(url?.pathname || "")) : null;
    const cacheKey = buildPmsReservationCacheKey(providerType, url.toString(), options, bundle, query);
    const cached = readCachedPmsReservation(cacheKey);
    if (cached) return cached;

    return readOrRunInflightPmsReservation(cacheKey, async () => {
      const response = await fetchPmsReservationResponse(url, options, bundle);
      const payload = await parsePmsReservationResponse(response, {
        url,
        options,
        bundle,
        relayDepth: 0
      });
      const adapterParsed =
        typeof W.getReservations === "function"
          ? W.getReservations({
              payload,
              query,
              parser: extractReservationRecordsFromPayload
            })
          : null;
      const parsedRecords = Array.isArray(adapterParsed?.records)
        ? adapterParsed.records
        : extractReservationRecordsFromPayload(payload, "PMS", query, "");
      const records = applyBranchToReservationRecords(parsedRecords, branch);
      const roomStateRows =
        typeof W.getRoomState === "function" ? W.getRoomState(records) : [];
      const inventoryRows =
        typeof W.getInventory === "function" ? W.getInventory(records) : [];
      const result = {
        records,
        source: records.length > 0 ? "pms-api" : "pms-empty",
        url: url.toString(),
        endpointPath: normalizeText(url.pathname || ""),
        endpointCapability: normalizeText(endpointMeta?.capability || ""),
        candidateCount: 1,
        attempts: [{
          url: url.toString(),
          branch,
          endpointCapability: normalizeText(endpointMeta?.capability || ""),
          ok: true,
          recordCount: records.length
        }],
        profilesFetched: [{
          branch,
          url: url.toString(),
          endpointCapability: normalizeText(endpointMeta?.capability || ""),
          recordCount: records.length
        }],
        query: { ...query },
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
    });
  }

  async function fetchProviderReservations(providerType, query, syncConfig = null) {
    const normalizedQuery = normalizePmsReadonlyQuery(query || {});
    const profiles = resolvePmsFetchProfiles(syncConfig);
    if (profiles.length <= 0) {
      return {
        records: [],
        source: "pms-unconfigured",
        url: "",
        candidateCount: 0,
        attempts: [],
        profilesFetched: [],
        query: { ...normalizedQuery }
      };
    }

    const results = [];
    for (const profile of profiles) {
      try {
        results.push(await fetchSinglePmsProfileReservations(providerType, normalizedQuery, profile));
      } catch (error) {
        if (profiles.length === 1) throw error;
        results.push({
          records: [],
          source: "pms-error",
          url: normalizeText(profile?.pmsReservationUrl || ""),
          candidateCount: 1,
          attempts: [{
            url: normalizeText(profile?.pmsReservationUrl || ""),
            branch: normalizeRecordBranch(profile?.branch || ""),
            ok: false,
            error: formatTaggedError(error)
          }],
          profilesFetched: [{
            branch: normalizeRecordBranch(profile?.branch || ""),
            url: normalizeText(profile?.pmsReservationUrl || ""),
            recordCount: 0,
            error: formatTaggedError(error)
          }],
          query: { ...normalizedQuery },
          error: formatTaggedError(error)
        });
      }
    }

    const records = dedupeReservationRecords(results.flatMap((item) => item?.records || []));
    const attempts = results.flatMap((item) => item?.attempts || []);
    const profilesFetched = results.flatMap((item) => item?.profilesFetched || []);
    const successful = results.filter((item) => normalizeText(item?.source || "") === "pms-api");
    const primary = successful[0] || results[0] || null;
    const errors = results
      .map((item) => normalizeText(item?.error || ""))
      .filter(Boolean);
    return {
      records,
      source: records.length > 0 ? "pms-api" : errors.length > 0 ? "unavailable" : "pms-empty",
      url: primary?.url || "",
      endpointPath: normalizeText(primary?.endpointPath || ""),
      endpointCapability: normalizeText(primary?.endpointCapability || ""),
      candidateCount: profiles.length,
      attempts,
      profilesFetched,
      query: { ...normalizedQuery },
      adapter: primary?.adapter ? { ...primary.adapter } : null,
      error: errors.length > 0 ? errors.join(" | ") : "",
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
  }

  function buildWingsCapabilityResultBase(capability, request) {
    return {
      capability,
      items: [],
      records: [],
      source: "pms-unconfigured",
      url: "",
      endpointPath: "",
      endpointCapability: capability,
      candidateCount: 0,
      attempts: [],
      profilesFetched: [],
      request: request && typeof request === "object" ? { ...request } : {},
      adapter: {
        type: "wings",
        capability
      }
    };
  }

  function getSupportedWingsLiveContracts() {
    return [
      "assigned_room_lookup",
      "assigned_room_guest_info",
      "assignable_room_lookup",
      "assignable_room_type_lookup",
      "account_contract_lookup",
      "linked_reservation_lookup",
      "market_catalog",
      "nationality_language_lookup",
      "rate_catalog",
      "reservation_rate_lookup",
      "reservation_detail",
      "reservation_lookup",
      "reservation_lookup_local",
      "reservation_summary",
      "room_availability_chart",
      "room_availability_summary",
      "room_block_chart",
      "room_type_catalog",
      "sale_person_catalog",
      "source_catalog",
      "special_service_lookup"
    ];
  }

  async function fetchSingleWingsCapabilityProfile(providerType, request, profile) {
    const plan = buildCapabilityRequestPlanForProfile(profile, request);
    if (!plan) {
      return {
        ...buildWingsCapabilityResultBase(normalizeCapabilityName(request?.capability || ""), request),
        source: "pms-unconfigured"
      };
    }
    const { capability, requestPlan, branch, bundle } = plan;
    const { url, options } = requestPlan;
    const endpointMeta =
      typeof W.lookupEndpointMeta === "function" ? W.lookupEndpointMeta(normalizeText(url?.pathname || "")) : null;
    const cacheKey = buildPmsCapabilityCacheKey(providerType, capability, url.toString(), options, bundle, request, branch);
    const cached = readCachedPmsCapability(cacheKey);
    if (cached) return cached;

    return readOrRunInflightPmsCapability(cacheKey, async () => {
      const response = await fetchPmsReservationResponse(url, options, bundle);
      const payload = await parsePmsReservationResponse(response);
      const items = parseWingsCapabilityItems(capability, payload, request, branch);
      const records = capability.startsWith("reservation_") ? items.map((row) => ({ ...row })) : [];
      const result = {
        capability,
        items,
        records,
        source: items.length > 0 ? "pms-api" : "pms-empty",
        url: url.toString(),
        endpointPath: normalizeText(url.pathname || ""),
        endpointCapability: normalizeText(endpointMeta?.capability || capability),
        candidateCount: 1,
        attempts: [{
          url: url.toString(),
          branch,
          endpointCapability: normalizeText(endpointMeta?.capability || capability),
          ok: true,
          itemCount: items.length
        }],
        profilesFetched: [{
          branch,
          url: url.toString(),
          endpointCapability: normalizeText(endpointMeta?.capability || capability),
          itemCount: items.length
        }],
        request: request && typeof request === "object" ? { ...request } : {},
        adapter: {
          type: "wings",
          capability,
          endpointPath: normalizeText(requestPlan?.endpointPath || url?.pathname || ""),
          knownEndpointCount:
            typeof W.getKnownEndpointCount === "function" ? W.getKnownEndpointCount() : 0,
          requestSchemaIssues: Array.isArray(requestPlan?.requestSchemaIssues)
            ? [...requestPlan.requestSchemaIssues]
            : [],
        }
      };
      writeCachedPmsCapability(cacheKey, result);
      return result;
    });
  }

  async function fetchWingsLiveContract(providerType, rawRequest, syncConfig = null) {
    const request = normalizeWingsCapabilityRequest(rawRequest);
    const capability = normalizeCapabilityName(request.capability);
    if (!capability) throw new Error("Wings live contract requires capability.");
    if (capability === "reservation_lookup" || capability === "reservation_lookup_local") {
      const reservationQuery = normalizePmsReadonlyQuery(rawRequest || {});
      const base = await fetchProviderReservations(providerType, reservationQuery, syncConfig);
      const filteredProfiles = (base.profilesFetched || []).filter((row) => normalizeText(row?.endpointCapability || "") === capability);
      const filteredAttempts = (base.attempts || []).filter((row) => normalizeText(row?.endpointCapability || "") === capability);
      const filteredBranches = new Set(filteredProfiles.map((row) => normalizeRecordBranch(row?.branch || "")));
      const filteredRecords = (base.records || []).filter((row) => {
        if (request.branch && normalizeRecordBranch(row?.branch || "") !== request.branch) return false;
        if (filteredBranches.size <= 0) return normalizeText(base.endpointCapability || "") === capability;
        return filteredBranches.has(normalizeRecordBranch(row?.branch || ""));
      });
      return {
        capability,
        items: filteredRecords.map((row) => ({ ...row })),
        records: filteredRecords.map((row) => ({ ...row })),
        source: filteredRecords.length > 0 ? "pms-api" : filteredProfiles.length > 0 ? "pms-empty" : "pms-unconfigured",
        url: filteredProfiles[0]?.url || "",
        endpointPath: normalizeText(filteredProfiles[0]?.url ? new URL(filteredProfiles[0].url).pathname : ""),
        endpointCapability: capability,
        candidateCount: filteredProfiles.length,
        attempts: filteredAttempts,
        profilesFetched: filteredProfiles,
        request: { ...request, ...reservationQuery },
        adapter: base.adapter ? { ...base.adapter, capability } : { type: "wings", capability },
        error: normalizeText(base?.error || "")
      };
    }
    if (!WINGS_LIVE_CONTRACT_DEFS[capability]) {
      throw new Error(`Unsupported Wings live contract capability: ${capability}`);
    }
    const profiles = resolveCapabilityProfiles(syncConfig, request);
    if (profiles.length <= 0) {
      return buildWingsCapabilityResultBase(capability, request);
    }
    const results = [];
    for (const profile of profiles) {
      try {
        const result = await fetchSingleWingsCapabilityProfile(providerType, request, profile);
        if (result.candidateCount > 0) results.push(result);
      } catch (error) {
        if (profiles.length === 1) throw error;
        const failedPlan = buildCapabilityRequestPlanForProfile(profile, request);
        const failedUrl = normalizeText(failedPlan?.requestPlan?.url?.toString() || profile?.pmsReservationUrl || "");
        results.push({
          ...buildWingsCapabilityResultBase(capability, request),
          source: "pms-error",
          url: failedUrl,
          candidateCount: 1,
          attempts: [{
            url: failedUrl,
            branch: normalizeRecordBranch(profile?.branch || ""),
            ok: false,
            error: formatTaggedError(error)
          }],
          profilesFetched: [{
            branch: normalizeRecordBranch(profile?.branch || ""),
            url: failedUrl,
            itemCount: 0,
            error: formatTaggedError(error)
          }],
          error: formatTaggedError(error)
        });
      }
    }
    const items = [];
    const seen = new Set();
    results.forEach((result) => {
      (result.items || []).forEach((item) => {
        const key = JSON.stringify(item);
        if (seen.has(key)) return;
        seen.add(key);
        items.push(item);
      });
    });
    const successful = results.filter((item) => normalizeText(item?.source || "") === "pms-api");
    const primary = successful[0] || results[0] || null;
    const errors = results.map((item) => normalizeText(item?.error || "")).filter(Boolean);
    return {
      capability,
      items,
      records: capability.startsWith("reservation_") ? items.map((row) => ({ ...row })) : [],
      source: items.length > 0 ? "pms-api" : errors.length > 0 ? "unavailable" : "pms-empty",
      url: primary?.url || "",
      endpointPath: normalizeText(primary?.endpointPath || ""),
      endpointCapability: normalizeText(primary?.endpointCapability || capability),
      candidateCount: results.length,
      attempts: results.flatMap((row) => row?.attempts || []),
      profilesFetched: results.flatMap((row) => row?.profilesFetched || []),
      request: { ...request },
      adapter: primary?.adapter ? { ...primary.adapter } : { type: "wings", capability },
      error: errors.length > 0 ? errors.join(" | ") : ""
    };
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

  function pickFirstPositiveNumericId(candidates, fallback) {
    for (const value of Array.isArray(candidates) ? candidates : []) {
      const text = normalizeText(value);
      if (!/^\d+$/.test(text)) continue;
      if (Number(text) <= 0) continue;
      return text;
    }
    return fallback;
  }

  function toPositiveNumericId(value) {
    const text = normalizeText(value);
    if (!/^\d+$/.test(text)) return "";
    if (Number(text) <= 0) return "";
    return text;
  }

  function resolveStationBranchId(fallback = "") {
    const path = normalizeText(location.pathname || "");
    const href = normalizeText(location.href || "");
    const hash = normalizeText(location.hash || "");
    const matches = [
      path.match(/\/branch\/(\d+)/i)?.[1],
      href.match(/[?&](?:branchId|branch_id|branchNo|branch_no)=(\d+)/i)?.[1],
      hash.match(/(?:branchId|branch_id|branchNo|branch_no)=(\d+)/i)?.[1],
      hash.match(/\/branch\/(\d+)/i)?.[1]
    ];
    const syncFallback = toPositiveNumericId(App.runtime?.syncConfigCache?.stationBranchId || "");
    const explicitFallback = toPositiveNumericId(fallback || "");
    const defaultFallback = toPositiveNumericId(POLICY_STATION_BRANCH_ID);
    return pickFirstPositiveNumericId(matches, explicitFallback || syncFallback || defaultFallback);
  }

  function resolveNaverBusinessId(fallback = "") {
    const path = normalizeText(location.pathname || "");
    const href = normalizeText(location.href || "");
    const hash = normalizeText(location.hash || "");
    const matches = [
      path.match(/\/businesses\/(\d+)/i)?.[1],
      href.match(/[?&](?:businessId|business_id|bizId|biz_id)=(\d+)/i)?.[1],
      hash.match(/(?:businessId|business_id|bizId|biz_id)=(\d+)/i)?.[1],
      hash.match(/\/businesses\/(\d+)/i)?.[1]
    ];
    const syncFallback = toPositiveNumericId(App.runtime?.syncConfigCache?.naverBusinessId || "");
    const explicitFallback = toPositiveNumericId(fallback || "");
    const defaultFallback = toPositiveNumericId(POLICY_NAVER_BUSINESS_ID);
    return pickFirstPositiveNumericId(matches, explicitFallback || syncFallback || defaultFallback);
  }


  async function fetchStationRows(query) {
    const branchId = resolveStationBranchId();
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
    const businessId = resolveNaverBusinessId();
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
        const finalCoverage = assessProviderRowsCoverage(domRows, query, providerType);
        recordProviderFetchMeta(
          buildProviderFetchMeta({
            providerType,
            route: "dom_only_fallback",
            query,
            rows: domRows,
            apiRows,
            domRows,
            finalCoverage,
            apiError
          })
        );
        console.warn("[inventory] provider API failed; fallback to DOM snapshot rows", {
          providerType,
          rowCount: domRows.length,
          error: apiError?.message || String(apiError)
        });
        return domRows;
      }
      recordProviderFetchMeta(
        buildProviderFetchMeta({
          providerType,
          route: "api_error_no_dom",
          query,
          rows: apiRows,
          apiRows,
          domRows: [],
          finalCoverage: assessProviderRowsCoverage(apiRows, query, providerType),
          apiError
        })
      );
      throw apiError;
    }

    const apiCoverage = assessProviderRowsCoverage(apiRows, query, providerType);
    if (apiCoverage.acceptable) {
      recordProviderFetchMeta(
        buildProviderFetchMeta({
          providerType,
          route: "api_only_accept",
          query,
          rows: apiRows,
          apiRows,
          apiCoverage,
          finalCoverage: apiCoverage
        })
      );
      return apiRows;
    }
    const domRows = extractProviderRowsFromDom(providerType, query);
    if (!domRows.length) {
      recordProviderFetchMeta(
        buildProviderFetchMeta({
          providerType,
          route: "api_only_insufficient",
          query,
          rows: apiRows,
          apiRows,
          apiCoverage,
          finalCoverage: apiCoverage
        })
      );
      return apiRows;
    }

    const merged = mergeProviderRowsPreferApi(apiRows, domRows);
    const mergedCoverage = assessProviderRowsCoverage(merged, query, providerType);
    if (mergedCoverage.acceptable || merged.length > apiRows.length) {
      recordProviderFetchMeta(
        buildProviderFetchMeta({
          providerType,
          route: "api_dom_merge",
          query,
          rows: merged,
          apiRows,
          domRows,
          apiCoverage,
          finalCoverage: mergedCoverage,
          mergedCoverage
        })
      );
      console.warn("[inventory] provider API low coverage; merged API+DOM snapshot", {
        providerType,
        api: apiCoverage,
        merged: mergedCoverage
      });
      return merged;
    }
    recordProviderFetchMeta(
      buildProviderFetchMeta({
        providerType,
        route: "api_only_insufficient",
        query,
        rows: apiRows,
        apiRows,
        domRows,
        apiCoverage,
        finalCoverage: apiCoverage,
        mergedCoverage
      })
    );
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

    const typeHint = detectRoomTypeHint(rawName);
    if (typeHint) {
      const typedMatch = (preset || []).find((room) => detectRoomTypeHint(room?.name || "") === typeHint);
      if (typedMatch) {
        return {
          roomId: String(typedMatch.id),
          confidence: 0.74,
          method: "name_type",
          matchedName: String(typedMatch.name || "")
        };
      }
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
    assessProviderRowsCoverage,
    summarizeProviderRowSources,
    fetchProviderReservations,
    fetchWingsLiveContract,
    getSupportedWingsLiveContracts,
    assertReadonlyPmsRequest,
    buildPmsReservationCacheKey,
    buildPmsCapabilityCacheKey,
    getKnownWingsEndpointCount:
      typeof W.getKnownEndpointCount === "function"
        ? () => W.getKnownEndpointCount()
        : () => 0,
    getKnownWingsEndpoints:
      typeof W.getEndpointCatalog === "function"
        ? () => W.getEndpointCatalog()
        : () => [],
    getKnownWingsEndpointDetails:
      typeof W.getEndpointDetails === "function"
        ? () => W.getEndpointDetails()
        : () => [],
    resolveStationBranchId,
    resolveNaverBusinessId,
    resolvePresetRoomId,
    normalizeRows,
    getLastProviderFetchMeta,
    getProviderFetchInstrumentation,
  });
})();

