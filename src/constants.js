(() => {
  "use strict";

  const root = globalThis;
  const App = (root.App = root.App || {});
  if (App.constants && App.constants.__ready) return;
  const syncPolicy = root.InventorySyncPolicy || {};
  const sheetDefaults = syncPolicy.sheetDefaults || {};
  const roomPresetsPolicy = syncPolicy.roomPresets || {};
  const roomTypeMapPolicy = syncPolicy.roomTypeByRoomNo || {};

  const POLICY_NAVER_BUSINESS_ID = String(syncPolicy.defaultNaverBusinessId || "");
  const POLICY_STATION_BRANCH_ID = String(syncPolicy.defaultStationBranchId || "");
  const PMS_ORIGINS = {
    NAVER_PARTNER: "https://partner.booking.naver.com",
    NAVER_API: String(syncPolicy.defaultNaverApiBase || "https://api-partner.booking.naver.com"),
    STATION_ADMIN: "https://admin.admin-stationbyuhc.com",
    STATION_API: String(syncPolicy.defaultStationApiBase || "https://api.admin-stationbyuhc.com")
  };
  const NAVER_COOKIE_EXPORT_URLS = [
    `${PMS_ORIGINS.NAVER_PARTNER}/`,
    `${PMS_ORIGINS.NAVER_API}/`
  ];
  const PREF_KEY = "inventory_date_range_pref_v4";
  const SYNC_CFG_KEY = "inventory_sheet_sync_cfg_v1";
  const SYNC_APPLY_KEY = "inventory_sheet_apply_enabled_v1";
  const SYNC_FEATURE_KEY_COMPAT = "inventory_sheet_sync_enabled_v1";
  const POLICY_SPREADSHEET_ID = String(sheetDefaults.spreadsheetId || "");
  const POLICY_SHEET_NAME = String(sheetDefaults.sheetName || "2026");
  const POLICY_START_ROW = Number(sheetDefaults.startRow || 61);
  const POLICY_SHEET_YEAR = Number(sheetDefaults.year || 2026);
  const POLICY_GOOGLE_CLIENT_ID =
    String(sheetDefaults.googleClientId || "");
  const DEFAULT_SYNC_SLEEP_MS = 900;
  const SHEET_GRID_FAST_ROW_LIMIT = 260;
  const NAVER_SCHEDULE_FETCH_CONCURRENCY = 3;
  const ROOM_MAPPING_WARN_THRESHOLD = 0.9;
  const STATION_TOKEN_CACHE_TTL_MS = 15000;
  const DATE_RANGE_CACHE_LIMIT = 48;
  const TABLE_RENDER_CHUNK_ROWS = 30;
  const APPLY_JITTER_MS = 280;
  const APPLY_RETRY_LIMIT = 2;
  const APPLY_BLOCKING_SCAN_WARN_CODES = new Set([
    "ROOM_TYPE_COUNT_MISMATCH",
    "ROOM_ROWS_INSUFFICIENT",
    "FORMULA_SOLD_VAC_RANGE_MISMATCH",
    "PROVIDER_VALUE_ROW_MISMATCH",
    "PROVIDER_VALUE_SOURCE_LOW_COVERAGE"
  ]);
  const APPLY_BLOCKING_PREVIEW_WARN_CODES = new Set(
    Array.isArray(syncPolicy.applyBlockingValidationWarnCodes)
      ? syncPolicy.applyBlockingValidationWarnCodes
      : ["CURRENT_EXCEEDS_MAXIMUM", "MAX_DIFFERS_FROM_BASELINE", "TARGET_EXCEEDS_PROVIDER_MAX"]
  );
  const APPLY_BLOCKING_PLANNER_WARNING_CODES = new Set(
    Array.isArray(syncPolicy.applyBlockingStationWarningCodes)
      ? syncPolicy.applyBlockingStationWarningCodes
      : ["STATION_NO_CALENDAR_ROWS", "STATION_NO_PRICE_SET_ID"]
  );
  const READ_ONLY_TOOL_MODE = true;
  const EMBEDDED_AUTH_MODE = false;
  const EMBEDDED_AUTH = {
    spreadsheet: POLICY_SPREADSHEET_ID,
    sheetName: POLICY_SHEET_NAME,
    startRow: POLICY_START_ROW,
    year: POLICY_SHEET_YEAR,
    stockMode: "available",
    clientId: POLICY_GOOGLE_CLIENT_ID,
    clientSecret: "",
    refreshToken: ""
  };

  const TEXT = {
    toggle: "재고 관리",
    titleNaver: "네이버 재고 관리",
    titleStation: "스테이션 재고 관리",
    close: "닫기",
    sitePrefix: "현재 사이트:",
    selectHint: "캘린더에서 시작일/종료일을 선택하세요.",
    statusIdle: "대기 중",
    statusLoadingSite: "사이트 재고 조회 중...",
    statusLoadingSheet: "시트 재고 조회 중...",
    statusLoadingAll: "사이트/시트 재고 조회 중...",
    statusLoadedSite: "사이트 재고 조회 완료",
    statusLoadedSheet: "시트 재고 조회 완료",
    statusLoadedAll: "사이트/시트 재고 조회 완료",
    statusCopiedSite: "사이트 재고 복사 완료",
    statusCopiedSheet: "시트 재고 복사 완료",
    statusSelectRange: "시작일과 종료일을 순서대로 선택하세요.",
    statusNoCopy: "복사할 값이 없습니다.",
    statusNeedSiteLoad: "사이트 재고를 먼저 불러오세요.",
    statusNeedSheetLoad: "시트 재고를 먼저 불러오세요.",
    statusDateReset: "날짜 선택이 초기화되었습니다.",
    selectedNone: "선택한 날짜: 없음",
    selectedPendingEnd: "선택한 날짜: {start} ~ (종료일 선택)",
    selectedRange: "선택한 날짜: {start} ~ {end}",
    quickRange2d: "오늘+1일",
    quickRange7d: "7일",
    quickRangeMonth: "이번달",
    resetDate: "날짜 초기화",
    loadSite: "사이트 재고 불러오기",
    loadSheet: "시트 재고 불러오기",
    loadAll: "사이트+시트 조회",
    copySite: "사이트 복사",
    copySheet: "시트 복사",
    siteInventory: "사이트 재고",
    sheetInventory: "시트 재고",
    mismatchTitle: "불일치",
    mismatchCount: "불일치 건수",
    mismatchNone: "불일치 없음",
    reviewTitle: "불일치 내역 리뷰",
    reviewEmpty: "기간을 선택하고 사이트/시트를 조회하면 불일치 내역을 확인할 수 있습니다.",
    reviewTruncated: "일치 항목이 많아 일부만 표시합니다.",
    reviewMatch: "일치함",
    reviewMismatch: "불일치",
    reviewSuggestion: "보정 제안",
    reviewSuggestionPrimary: "보정 제안 (권장: 사이트 -> 시트)",
    reviewSuggestionSecondary: "역방향 참고 (시트 -> 사이트)",
    reviewDirectionGuide: "기본 보정 방향은 사이트 값을 시트 목표값에 맞추는 것입니다. 필요 시 역방향 값도 함께 확인하세요.",
    reviewSiteValue: "사이트 재고",
    reviewSheetValue: "구글 시트",
    reviewCollapsed: "축소",
    severityToken: "TOKEN",
    severityApi: "API",
    verifyDone: "재고 값 검증 완료",
    tableHintSelectRange: "기간을 선택한 뒤 재고를 불러오세요.",
    tableHintNoData: "조회된 재고 데이터가 없습니다.",
    sumRows: "조회 행",
    sumOpen: "오픈",
    sumClosed: "마감",
    sumPeriod: "선택 기간",
    userSyncState: "검토 상태",
    userMismatchSummary: "검토 건수",
    userPmsSummary: "PMS 예약",
    userLoadSummary: "조회 상태",
    userHintIdle: "Task에는 조작과 상태만 표시합니다. 상세 사유와 근거는 Evidence / Utility에서 확인하세요.",
    noPeriod: "-",
    roomLabel: "객실",
    flowTitle: "작업 단계",
    flowStepPeriod: "기간 선택",
    flowStepLoad: "재고 조회",
    flowStepReview: "검토",
    flowStepApply: "리포트",
    settingsOpen: "설정",
    settingsClose: "설정 닫기",
    opsSectionTitle: "운영 전용",
    opsSectionShow: "운영 정보 보기",
    opsSectionHide: "운영 정보 닫기",
    opsPolicyDefault: "정책 요약\n- 예약 상태는 ACTIVE / CANCELED만 사용합니다.\n- NOSHOW는 별도 상태로 쓰지 않고 ACTIVE + anomaly로만 집계합니다.\n- 수기 OTA(STATION/NAVER)는 PMS 누락 오류로 간주하지 않습니다.",
    opsRetentionDefault: "보존 데이터\n- 예약번호, OTA, 날짜, 박수, 객실, 전화 끝자리, 이름 정규화, 토큰 해시만 런타임에서 유지합니다.\n- 원문 note/remark/payload는 저장하지 않습니다.",
    opsEvidenceDefault: "판정 근거\n- exact ID > 날짜/OTA/객실 blocking > 이름/전화/remark-note token soft-match 순서로 비교합니다.\n- 차단 상세는 Evidence > Blocking, 검증 근거는 Evidence > Validation Basis, trace는 Evidence > Trace / Log에서 확인할 수 있습니다.",
    scanSettings: "스캔 좌표 설정",
    scanOpen: "좌표 설정",
    scanClose: "좌표 설정 닫기",
    scanMode: "좌표 모드",
    scanModeAuto: "자동 탐색",
    scanModeManual: "수동 좌표 우선",
    scanAllowPkgRows: "PKG 재고행 포함",
    scanDateRow: "날짜 행",
    scanWeekdayRow: "요일 행",
    scanDateStartCol: "날짜 시작 열",
    scanDateEndCol: "날짜 끝 열",
    scanRoomStartRow: "객실 시작 행",
    scanUrbanStartRow: "Urban 시작 행",
    scanUrbanEndRow: "Urban 끝 행",
    scanDoubleTwinStartRow: "Double Twin 시작 행",
    scanDoubleTwinEndRow: "Double Twin 끝 행",
    scanGrandStartRow: "Grand 시작 행",
    scanGrandEndRow: "Grand 끝 행",
    scanInventoryStartRow: "재고 탐색 시작 행",
    scanStationRow: "스테이션 재고 행",
    scanNaverRow: "네이버 재고 행",
    scanSave: "좌표 저장",
    scanCopyConfigTemplate: "SCAN_CONFIG 복사",
    scanCopyRoomMapTemplate: "ROOM_MAP 복사",
    syncSettings: "시트 연동 설정",
    syncSheet: "스프레드시트 URL 또는 ID",
    syncSheetName: "시트명",
    syncStartRow: "시작 행",
    syncYear: "연도",
    syncStockMode: "재고 기준",
    syncModeAvailable: "가용(최대-현재)",
    syncModeCurrent: "현재값",
    syncAccessToken: "Google Access Token (토큰 JSON 가능)",
    syncRefreshToken: "Google Refresh Token",
    syncAuthBundle: "현재 사이트 인증 번들(JSON)",
    syncPmsPreset: "Wings PMS 조회 프리셋",
    syncPmsPresetCustom: "직접 입력",
    syncPmsPresetGlobalGuestList: "Global Guest List",
    syncPmsPresetReservationList: "Reservation List",
    syncPmsPropertyNo: "PROPERTY_NO",
    syncPmsBsnsCode: "BSNS_CODE",
    syncPmsPageId: "PAGE_ID",
    syncPmsPageSize: "페이지 크기",
    syncPmsPresetApply: "Wings 조회 템플릿 채우기",
    syncPmsReservationUrl: "WINGS/PMS 예약목록 API URL",
    syncPmsAuthBundle: "WINGS/PMS 인증 번들(JSON)",
    syncPmsHarInput: "WINGS HAR(JSON)",
    syncPmsHarConvert: "HAR에서 Wings 요청 추출",
    syncAuthBundleCapture: "현재 세션 캡처",
    syncAuthBundleCopy: "번들 복사",
    syncClientId: "Google Client ID",
    syncClientSecret: "Google Client Secret",
    syncProviderApply: "현재 OTA 쓰기 허용",
    syncProviderApplyHintStation: "읽기 전용 모드: 스테이션 쓰기 비활성",
    syncProviderApplyHintNaver: "읽기 전용 모드: 네이버 쓰기 비활성",
    syncSaveCfg: "설정 저장",
    syncFeatureOn: "읽기 전용 고정",
    syncFeatureOff: "읽기 전용 고정",
    syncRun: "검토 결과 갱신",
    syncRunProcessing: "처리 중...",
    syncRunNeedApprove: "검토 결과 갱신",
    syncRunProviderBlocked: "검토 결과 갱신",
    syncApproveTitle: "검토 범위",
    syncApproveMismatch: "불일치",
    syncApproveClosed: "닫음 예상",
    syncApprovePeriod: "적용 기간",
    syncApproveConfirmLabel: "영향 범위를 확인했고 검토 결과를 갱신합니다.",
    syncResult: "검토 요약",
    syncBlockedTitle: "검토 차단 사유",
    resultTotal: "변환 총 건",
    resultSuccess: "성공 건",
    resultFail: "실패 건",
    resultClosed: "닫음 처리건",
    errorToggle: "오류건 보기",
    errorHide: "오류건 닫기",
    debugToggle: "디버그/로그 보기",
    debugHide: "디버그/로그 닫기",
    debugTitle: "디버그/로그",
    debugScan: "스캔 디버그",
    debugLog: "상태 로그",
    traceExportJson: "Trace JSON 저장",
    traceExportCsv: "Trace CSV 저장",
    goldenSetExport: "골든셋 JSON+CSV 저장",
    clearRuntime: "캐시/로그 초기화",
    statusRuntimeCleared: "캐시/로그를 초기화했습니다.",
    errorDate: "일자",
    errorType: "유형",
    errorDetail: "내용",
    statusSyncing: "불일치 검토 계산 중...",
    statusSyncSaved: "설정이 저장되었습니다.",
    statusSyncDone: "검토 갱신 완료",
    statusSyncNoDiff: "불일치 항목이 없습니다.",
    statusSyncNeedLoadBeforeRun: "검토 계산 전 '사이트+시트 조회'를 먼저 실행하세요.",
    statusSyncVerifyByManualLoad: "검토 후 확인은 자동 재조회 없이 조회 버튼으로 진행합니다.",
    statusSyncSavedNeedReload: "설정 저장 완료. 반영은 다음 조회 시 적용됩니다.",
    statusSyncFeatureEnabled: "읽기 전용 모드가 적용되어 쓰기 작업은 실행되지 않습니다.",
    statusSyncFeatureDisabled: "읽기 전용 모드가 적용되어 쓰기 작업은 실행되지 않습니다.",
    statusAuthBundleCaptured: "현재 사이트 인증 번들을 채웠습니다. 저장 후 재실행하면 세션을 다시 주입합니다.",
    statusAuthBundleCopied: "현재 사이트 인증 번들을 복사했습니다.",
    statusSyncApplySkipped: "읽기 전용 모드입니다. 미리보기만 갱신했습니다.",
    statusNeedSyncApproval: "읽기 전용 모드에서는 승인 체크가 필요하지 않습니다.",
    statusSyncNeedToken: "Google 접근 토큰이 필요합니다. (또는 refresh 설정)",
    statusSyncNeedSheet: "스프레드시트 ID가 필요합니다.",
    statusScanSaved: "스캔 좌표 설정이 저장되었습니다.",
    secretMaskOn: "민감정보 숨김 ON",
    secretMaskOff: "민감정보 보기",
    statusScanConfigTemplateCopied: "SCAN_CONFIG 템플릿을 복사했습니다. 시트에 붙여 넣으세요.",
    statusRoomMapTemplateCopied: "ROOM_MAP 템플릿을 복사했습니다. 시트에 붙여 넣으세요.",
    closed: "닫음",
    daySun: "일",
    dayMon: "월",
    dayTue: "화",
    dayWed: "수",
    dayThu: "목",
    dayFri: "금",
    daySat: "토",
    naver: "네이버",
    station: "스테이션",
    monthSuffix: "월",
    yearSuffix: "년"
  };

  const ROOM_PRESETS = Object.fromEntries(
    Object.entries(roomPresetsPolicy).map(([provider, rows]) => [
      String(provider),
      Array.isArray(rows)
        ? rows.map((row) => ({
            id: String(row?.id || ""),
            name: String(row?.name || "")
          }))
        : []
    ])
  );
  if (!ROOM_PRESETS["naver-partner"]) {
    ROOM_PRESETS["naver-partner"] = [
      { id: "6556948", name: "Urban Spa Suite 6인" },
      { id: "6556938", name: "Double Twin Spa Room 4인" },
      { id: "7043386", name: "Grand Spa Suite 8인" }
    ];
  }
  if (!ROOM_PRESETS["admin-station"]) {
    ROOM_PRESETS["admin-station"] = [
      { id: "62", name: "Urban Spa Suite 6인" },
      { id: "59", name: "Double Twin Spa Room 4인" },
      { id: "258", name: "Grand Spa Suite 8인" }
    ];
  }
  const ROOM_TYPE_LABELS = {
    urban: "Urban Spa Suite 6인",
    doubleTwin: "Double Twin Spa Room 4인",
    grand: "Grand Spa Suite 8인"
  };
  const ROOM_TYPE_BY_ROOM_NO = Object.keys(roomTypeMapPolicy || {}).length > 0
    ? Object.fromEntries(Object.entries(roomTypeMapPolicy).map(([roomNo, roomType]) => [String(roomNo), String(roomType)]))
    : {
        "201": "Urban Spa Suite 6인",
        "301": "Urban Spa Suite 6인",
        "401": "Urban Spa Suite 6인",
        "501": "Urban Spa Suite 6인",
        "601": "Urban Spa Suite 6인",
        "701": "Urban Spa Suite 6인",
        "801": "Urban Spa Suite 6인",
        "901": "Urban Spa Suite 6인",
        "1001": "Urban Spa Suite 6인",
        "1101": "Urban Spa Suite 6인",
        "1201": "Urban Spa Suite 6인",
        "A301": "Urban Spa Suite 6인",
        "A401": "Urban Spa Suite 6인",
        "A501": "Urban Spa Suite 6인",
        "A601": "Urban Spa Suite 6인",
        "A701": "Urban Spa Suite 6인",
        "A801": "Urban Spa Suite 6인",
        "A901": "Urban Spa Suite 6인",
        "A1001": "Urban Spa Suite 6인",
        "A1101": "Urban Spa Suite 6인",
        "202": "Double Twin Spa Room 4인",
        "302": "Double Twin Spa Room 4인",
        "402": "Double Twin Spa Room 4인",
        "502": "Double Twin Spa Room 4인",
        "602": "Double Twin Spa Room 4인",
        "702": "Double Twin Spa Room 4인",
        "802": "Double Twin Spa Room 4인",
        "902": "Double Twin Spa Room 4인",
        "1002": "Double Twin Spa Room 4인",
        "1102": "Double Twin Spa Room 4인",
        "1202": "Double Twin Spa Room 4인",
        "A302": "Double Twin Spa Room 4인",
        "A402": "Double Twin Spa Room 4인",
        "A502": "Double Twin Spa Room 4인",
        "A602": "Double Twin Spa Room 4인",
        "A702": "Double Twin Spa Room 4인",
        "A802": "Double Twin Spa Room 4인",
        "A902": "Double Twin Spa Room 4인",
        "A1002": "Double Twin Spa Room 4인",
        "A1102": "Double Twin Spa Room 4인",
        "A1201": "Grand Spa Suite 8인"
      };
  const CLOSED_TEXTS = new Set(["closed", "close", "soldout", "off", "x", "닫음", "마감"]);
  const V2_COLOR_STATUS_CHANNEL_MAP = {
    "#EA9999": { status: "OCCUPIED", channel: "AGODA" },
    "#6D9EEB": { status: "OCCUPIED", channel: "BOOKING" },
    "#45818E": { status: "OCCUPIED", channel: "TRIP" },
    "#B6D7A8": { status: "OCCUPIED", channel: "AIRBNB" },
    "#C9DAF8": { status: "OCCUPIED", channel: "TRAVELOKA" },
    "#6AA84F": { status: "OCCUPIED", channel: "NAVER" },
    "#34A853": { status: "OCCUPIED", channel: "NAVER" },
    "#FFFF00": { status: "OCCUPIED", channel: "YANOLJA" },
    "#EAD1DC": { status: "OCCUPIED", channel: "HERE" },
    "#980000": { status: "OCCUPIED", channel: "COUPANG_TRAVEL" },
    "#00FFFF": { status: "OCCUPIED", channel: "STATION" },
    "#8E7CC3": { status: "OCCUPIED", channel: "DIDA_TRAVEL" },
    "#999999": { status: "OCCUPIED", channel: "ETC" },
    "#F6B26B": { status: "OCCUPIED", channel: "UNKNOWN" },
    "#00FF00": { status: "BLOCKED", channel: "VIP" },
    "#073763": { status: "BLOCKED", channel: "MARKETING" },
    "#000000": { status: "BLOCKED", channel: "OOO" },
    "#FFFFFF": { status: "VACANT", channel: "VAC" }
  };
  const RESERVATION_BLOCK_COLOR_HEX = new Set([
    "#EA9999", "#6D9EEB", "#45818E", "#B6D7A8", "#C9DAF8",
    "#6AA84F", "#34A853", "#FFFF00", "#EAD1DC", "#980000", "#00FFFF", "#8E7CC3", "#999999", "#F6B26B"
  ]);
  const IGNORED_COLOR_HEX = new Set(["#3D85C6", "#F3F3F3"]);
  const INVENTORY_PROVIDER_ALIASES = {
    STATION: ["station", "스테이션", "uh suite"],
    NAVER: ["naver", "네이버"]
  };
  const DATE_LABEL_RE = /^\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일\s*$/;
  const ROOM_ROW_SKIP_TOKENS = ["합계", "total", "room sold", "sold", "naver", "station", "네이버", "스테이션"];
  const DATE_HEADER_HINT = {
    dateRow: 64, // 1-based 65행
    weekdayRow: 65, // 1-based 66행
    dateProbeCol: 52 // BA열
  };
  const SHEET_HINTS_SCAN_RANGE = "A1:H120";
  const SHEET_HINTS_ROOM_MAP_RANGE = "A1:H320";
  const SHEET_HINT_CACHE_TTL_MS = 5 * 60 * 1000;
  const SHEET_SNAPSHOT_CACHE_TTL_MS = 45 * 1000;
  const SHEET_SNAPSHOT_CACHE_MAX = 96;
  const NAVER_BIZ_ITEMS_CACHE_TTL_MS = 5 * 60 * 1000;
  const DEFAULT_SCAN_CONFIG = {
    mode: "auto",
    allowPkgInventoryRows: false,
    dateRow: null,
    weekdayRow: null,
    dateStartCol: 3,
    dateEndCol: 702,
    roomStartRow: null,
    urbanStartRow: null,
    urbanEndRow: null,
    doubleTwinStartRow: null,
    doubleTwinEndRow: null,
    grandStartRow: null,
    grandEndRow: null,
    inventorySearchStartRow: null,
    stationInventoryRow: null,
    naverInventoryRow: null,
    stationUrbanStartRow: null,
    stationUrbanEndRow: null,
    stationDoubleTwinStartRow: null,
    stationDoubleTwinEndRow: null,
    stationGrandStartRow: null,
    stationGrandEndRow: null,
    naverUrbanStartRow: null,
    naverUrbanEndRow: null,
    naverDoubleTwinStartRow: null,
    naverDoubleTwinEndRow: null,
    naverGrandStartRow: null,
    naverGrandEndRow: null,
    roomSoldVacScanStartRow: null,
    roomSoldVacScanEndRow: null
  };
  const dateRangeCache = new Map();
  const valueCellIndexCache = new WeakMap();
  const tableRenderTokenMap = new WeakMap();
  const sheetReadHintsCache = new Map();
  const sheetSnapshotCache = new Map();
  let stationTokenCache = { token: null, expiresAt: 0 };
  let naverBizItemsCache = { ts: 0, items: [] };

  function buildStationCalendarUrl(branchId = POLICY_STATION_BRANCH_ID) {
    return new URL(`/admin/branch/${branchId}/calendar`, PMS_ORIGINS.STATION_API);
  }

  function buildStationApplyUrl(branchId = POLICY_STATION_BRANCH_ID) {
    return new URL(`/admin/branch/${branchId}/apply/price-set`, PMS_ORIGINS.STATION_API);
  }

  function buildNaverBizItemsUrl(businessId = POLICY_NAVER_BUSINESS_ID) {
    return new URL(`/v3.1/businesses/${businessId}/biz-items`, PMS_ORIGINS.NAVER_API);
  }

  function buildNaverDailySchedulesUrl(businessId = POLICY_NAVER_BUSINESS_ID, bizItemId = "") {
    return new URL(`/v3.0/businesses/${businessId}/biz-items/${bizItemId}/daily-schedules`, PMS_ORIGINS.NAVER_API);
  }

  function buildNaverStockSchedulesUrl(businessId = POLICY_NAVER_BUSINESS_ID, bizItemId = "") {
    return new URL(`/v3.0/businesses/${businessId}/biz-items/${bizItemId}/stock-schedules`, PMS_ORIGINS.NAVER_API);
  }

  function buildNaverSaleSchedulesUrl(businessId = POLICY_NAVER_BUSINESS_ID, bizItemId = "") {
    return new URL(`/v3.1/businesses/${businessId}/biz-items/${bizItemId}/sale-schedules`, PMS_ORIGINS.NAVER_API);
  }

  App.constants = {
    __ready: true,
    POLICY_NAVER_BUSINESS_ID,
    POLICY_STATION_BRANCH_ID,
    PMS_ORIGINS,
    NAVER_COOKIE_EXPORT_URLS,
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
    TABLE_RENDER_CHUNK_ROWS,
    APPLY_JITTER_MS,
    APPLY_RETRY_LIMIT,
    APPLY_BLOCKING_SCAN_WARN_CODES,
    APPLY_BLOCKING_PREVIEW_WARN_CODES,
    APPLY_BLOCKING_PLANNER_WARNING_CODES,
    READ_ONLY_TOOL_MODE,
    EMBEDDED_AUTH_MODE,
    EMBEDDED_AUTH,
    TEXT,
    ROOM_PRESETS,
    ROOM_TYPE_LABELS,
    ROOM_TYPE_BY_ROOM_NO,
    CLOSED_TEXTS,
    V2_COLOR_STATUS_CHANNEL_MAP,
    RESERVATION_BLOCK_COLOR_HEX,
    IGNORED_COLOR_HEX,
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
    buildStationApplyUrl,
    buildNaverBizItemsUrl,
    buildNaverDailySchedulesUrl,
    buildNaverStockSchedulesUrl,
    buildNaverSaleSchedulesUrl,
  };

  App.runtime = App.runtime || {};
  App.runtime.dateRangeCache = dateRangeCache;
  App.runtime.valueCellIndexCache = valueCellIndexCache;
  App.runtime.tableRenderTokenMap = tableRenderTokenMap;
  App.runtime.sheetReadHintsCache = sheetReadHintsCache;
  App.runtime.sheetSnapshotCache = sheetSnapshotCache;
  App.runtime.stationTokenCache = stationTokenCache;
  App.runtime.naverBizItemsCache = naverBizItemsCache;
})();
