(() => {
  "use strict";

  if (window.__siteInventoryBoardMounted) return;
  window.__siteInventoryBoardMounted = true;

  const App = (globalThis.App = globalThis.App || {});
  const C = App.constants || {};
  const runtime = App.runtime || (App.runtime = {});
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
    buildStationApplyUrl,
    buildNaverStockSchedulesUrl,
    buildNaverSaleSchedulesUrl,
  } = C;
  const dateRangeCache = runtime.dateRangeCache || (runtime.dateRangeCache = new Map());
  let valueCellIndexCache = runtime.valueCellIndexCache || (runtime.valueCellIndexCache = new WeakMap());
  const tableRenderTokenMap = runtime.tableRenderTokenMap || (runtime.tableRenderTokenMap = new WeakMap());
  const tableCellFlashCache = runtime.tableCellFlashCache || (runtime.tableCellFlashCache = new WeakMap());
  const sheetReadHintsCache = runtime.sheetReadHintsCache || (runtime.sheetReadHintsCache = new Map());
  const sheetSnapshotCache = runtime.sheetSnapshotCache || (runtime.sheetSnapshotCache = new Map());
  let stationTokenCache = runtime.stationTokenCache || (runtime.stationTokenCache = { token: null, expiresAt: 0 });
  let naverBizItemsCache = runtime.naverBizItemsCache || (runtime.naverBizItemsCache = { ts: 0, items: [] });
  const productFlow = App.ui?.productFlow || {};
  const {
    detectProviderTypeFromHost,
    evaluateProductFlow
  } = productFlow;

  function detectContext() {
    const providerType =
      typeof detectProviderTypeFromHost === "function"
        ? detectProviderTypeFromHost(location.host)
        : location.host.toLowerCase().includes("partner.booking.naver.com")
          ? "naver-partner"
          : location.host.toLowerCase().includes("admin.admin-stationbyuhc.com")
            ? "admin-station"
            : "";
    if (!providerType) return null;
    const siteName =
      providerType === "admin-station"
        ? TEXT.station
        : providerType === "wings-pms"
          ? "WINGS"
          : TEXT.naver;
    return { providerType, siteName };
  }

  const context = detectContext();

  const scanEngine = (globalThis.App && globalThis.App.engine && globalThis.App.engine.scanEngine) || {};
  const {
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
    quickTextHash,
    extractReservationNoFromText,
    buildReservationIdentity,
    calculateTokenOverlapRatio,
    calculateNameSimilarity,
    hasStrongGuestNameMatch,
    digestValueRanges,
    assertReadonlySheetsRequest,
    fetchSheetMetadataAnchors,
    fetchSheetValuesBatch,
    scanConfigFromMetadata,
    loadSheetReadHints,
    buildSnapshotCacheKey,
    buildSnapshotQuickCacheKey,
    parseTokenBundleMaybe,
    parseAuthBundleMaybe,
    sanitizeWingsPmsPreset,
    buildWingsPmsPresetRequest,
    convertHarToWingsPmsConfig,
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
    captureProviderAuthBundle,
    sanitizeProviderAuthBundle,
    colorObjToHex,
    isLikelyReservationColor,
    classifySheetCellColorStatus,
    classifySheetCellStatus,
    createCellStatusResolver,
    isLikelyRoomNo,
    buildManualRoomTypeRanges,
    resolveManualRoomTypeByRow,
    hasCompleteManualRoomTypeRanges,
    buildRoomPartitions,
    mapSheetRoomRowsByPartitions,
    mapSheetRoomRows,
    summarizeRoomTypeStatsByDate,
    summarizeRoomCellStatuses,
    countExpectedRoomTypesFromMap,
    buildExpectedRoomTypeTotalsByKey,
    summarizeDetectedRoomTypeCounts,
    countExpectedPartitionRooms,
    summarizeDetectedPartitionCounts,
    scoreRoomTypeMatch,
    mapPresetRoomTypeKeys,
    resolveExpectedCountsFromStat,
    inferRoomValueFormat,
    formatExpectedInventoryRaw,
    canonicalizeInventoryRaw,
    areInventoryRawsEquivalent,
    parseStockValue,
    weekdayFromDateKey,
    resolveProviderFixedMaximum,
    applyProviderMaximumRule,
    extractInventoryValuesByDate,
    resolveInventoryMaximum,
    inventoryValueToTargetUnits,
    buildTargetMap,
    analyzeTargetMap,
    allocateRoomUnits,
    allocateRoomUnitsFlexible,
    planStationActions,
    planNaverActions,
    fetchSheetSnapshot,
    flattenAdminPayload,
    parseNaverItems,
    fetchStationRows,
    fetchNaverRows,
    fetchProviderRows,
    fetchProviderReservations,
    resolveStationBranchId,
    roomNameKey,
    resolvePresetRoomId,
    normalizeRows,
    normalizeDisplayInventoryValue,
    parseStockFraction,
    isClosedByFractionRule,
    autoCorrectInventoryDisplayValue,
    rowToValue,
    tableCellDisplayText,
    tableCellIsCorrected,
    tableCellTooltip,
    escapeHtml,
    normalizeCopyTemplateRows,
    tableCellCopyText,
    expandCopyRowsByTemplate,
    valueRowsToTsv,
    rowsToTsv,
    oneBasedColToA1,
    createVerificationReport,
    addVerificationPass,
    addVerificationWarn,
    addVerificationFail,
    makeVerificationIssue,
    validateInventoryDisplayCell,
    toMappingMethodLabel,
  } = scanEngine;
  const reservationPolicy = App.domain?.reservationPolicy || {};
  const reservationVerification = App.report?.reservationVerification || {};
  const { normalizeReservationNoFromText: normalizeReservationNoFromTextCore } = reservationPolicy;
  const {
    toNormalizedSet: toNormalizedSetCore,
    normalizedIntersectionCount: normalizedIntersectionCountCore,
    reservationSummaryStatusBucket: reservationSummaryStatusBucketCore,
    createReservationSummary: createReservationSummaryCore,
    mergeReservationIdentity: mergeReservationIdentityCore,
    summarizeReservationChannelList: summarizeReservationChannelListCore,
    buildReservationSummaryHandle: buildReservationSummaryHandleCore,
    buildReservationSummaryDetail: buildReservationSummaryDetailCore,
    buildReservationMatchReasonText: buildReservationMatchReasonTextCore,
    hasReservationDateOverlap: hasReservationDateOverlapCore,
    hasReservationRoomOverlap: hasReservationRoomOverlapCore,
    hasReservationChannelOverlap: hasReservationChannelOverlapCore,
    summaryHasAuditAnomaly: summaryHasAuditAnomalyCore,
    isManualOtaSummary: isManualOtaSummaryCore,
    firstKnownValue: firstKnownValueCore,
    dateKeyDistance: dateKeyDistanceCore,
    splitReservationRoomTokens: splitReservationRoomTokensCore,
    reservationRoomAliasKeys: reservationRoomAliasKeysCore,
    reservationRoomSetsConflict: reservationRoomSetsConflictCore,
    buildExclusiveStayDateKeys: buildExclusiveStayDateKeysCore,
    summarizeReservationDateDiff: summarizeReservationDateDiffCore,
    collectReservationPrice: collectReservationPriceCore,
    reservationPriceSetsConflict: reservationPriceSetsConflictCore,
    formatReservationPriceSet: formatReservationPriceSetCore,
    buildSheetReservationVerificationSource: buildSheetReservationVerificationSourceCore,
    buildPmsReservationVerificationSource: buildPmsReservationVerificationSourceCore,
    hasStrongGuestNameOverlap: hasStrongGuestNameOverlapCore,
    evaluateReservationSoftMatch: evaluateReservationSoftMatchCore,
    passesReservationBlocking: passesReservationBlockingCore,
    selectBestExactCandidate: selectBestExactCandidateCore,
    pairReservationSummaries: pairReservationSummariesCore,
    verifyProviderReservationsAgainstSheet: verifyProviderReservationsAgainstSheetCore,
    normalizeReservationStatusBucket: normalizeReservationStatusBucketCore,
  } = reservationVerification;
  const normalizeReservationNoFromText =
    normalizeReservationNoFromTextCore ||
    ((value) => normalizeText(value || ""));
  const toNormalizedSet = toNormalizedSetCore || ((values, mapper = (value) => normalizeText(value)) => {
    const out = new Set();
    const items = values instanceof Set ? [...values] : Array.isArray(values) ? values : [];
    items.forEach((value) => {
      const mapped = mapper(value);
      if (mapped) out.add(mapped);
    });
    return out;
  });
  const normalizedIntersectionCount =
    normalizedIntersectionCountCore ||
    ((leftValues, rightValues, mapper = (value) => normalizeText(value)) => {
      const left = toNormalizedSet(leftValues, mapper);
      const right = toNormalizedSet(rightValues, mapper);
      if (left.size <= 0 || right.size <= 0) return 0;
      let count = 0;
      left.forEach((value) => {
        if (right.has(value)) count += 1;
      });
      return count;
    });
  const reservationSummaryStatusBucket = reservationSummaryStatusBucketCore || (() => "ACTIVE");
  const createReservationSummary = createReservationSummaryCore;
  const mergeReservationIdentity = mergeReservationIdentityCore;
  const summarizeReservationChannelList = summarizeReservationChannelListCore || (() => []);
  const buildReservationSummaryHandle = buildReservationSummaryHandleCore || (() => "-");
  const buildReservationSummaryDetail = buildReservationSummaryDetailCore || (() => "-");
  const buildReservationMatchReasonText = buildReservationMatchReasonTextCore || (() => "보조식별");
  const hasReservationDateOverlap = hasReservationDateOverlapCore || (() => false);
  const hasReservationRoomOverlap = hasReservationRoomOverlapCore || (() => false);
  const hasReservationChannelOverlap = hasReservationChannelOverlapCore || (() => false);
  const summaryHasAuditAnomaly = summaryHasAuditAnomalyCore || (() => false);
  const isManualOtaSummary = isManualOtaSummaryCore || (() => false);
  const firstKnownValue = firstKnownValueCore || (() => "");
  const dateKeyDistance = dateKeyDistanceCore || (() => Number.POSITIVE_INFINITY);
  const splitReservationRoomTokens = splitReservationRoomTokensCore || (() => []);
  const reservationRoomAliasKeys = reservationRoomAliasKeysCore || (() => new Set());
  const reservationRoomSetsConflict = reservationRoomSetsConflictCore || (() => false);
  const buildExclusiveStayDateKeys = buildExclusiveStayDateKeysCore || (() => []);
  const summarizeReservationDateDiff =
    summarizeReservationDateDiffCore ||
    ((leftDates, rightDates) => ({ leftOnly: [...(leftDates || [])], rightOnly: [...(rightDates || [])] }));
  const collectReservationPrice = collectReservationPriceCore || (() => {});
  const reservationPriceSetsConflict = reservationPriceSetsConflictCore || (() => false);
  const formatReservationPriceSet = formatReservationPriceSetCore || (() => "-");
  const buildSheetReservationVerificationSource = buildSheetReservationVerificationSourceCore || (() => ({ summaries: [], missingIdIssues: [] }));
  const buildPmsReservationVerificationSource = buildPmsReservationVerificationSourceCore || (() => ({ summaries: [] }));
  const hasStrongGuestNameOverlap = hasStrongGuestNameOverlapCore || (() => false);
  const evaluateReservationSoftMatch =
    evaluateReservationSoftMatchCore ||
    (() => ({ matched: false, reasons: [], tokenOverlap: 0, conditionCount: 0, hasDateEvidence: false, hasOtaOrRoomEvidence: false, score: 0 }));
  const passesReservationBlocking = passesReservationBlockingCore || (() => false);
  const selectBestExactCandidate = selectBestExactCandidateCore || (() => null);
  const pairReservationSummaries = pairReservationSummariesCore || (() => ({ pairs: [], usedSheetKeys: new Set(), usedPmsKeys: new Set() }));
  const normalizeReservationStatusBucket = normalizeReservationStatusBucketCore || (() => "ACTIVE");
  const panelDom = App.ui?.panelDom || {};
  const panelEvents = App.ui?.panelEvents || {};
  const panelTemplate = App.ui?.panelTemplate || {};
  const { createPanelDom, collectPanelUi } = panelDom;
  const { bindPanelEvents } = panelEvents;
  const { STYLE, HTML } = panelTemplate;

  if (
    typeof createPanelDom !== "function" ||
    typeof collectPanelUi !== "function" ||
    typeof bindPanelEvents !== "function" ||
    typeof evaluateProductFlow !== "function" ||
    typeof STYLE !== "string" ||
    typeof HTML !== "string"
  ) {
    throw new Error("InventoryBoard UI modules failed to load.");
  }

  if (!context) return;

  const { shadow } = createPanelDom({ style: STYLE, html: HTML, documentRef: document });
  const ui = collectPanelUi(shadow);

  const state = {
    bootstrapped: false,
    loading: false,
    syncRunning: false,
    loadingAction: "",
    activeTask: "NAVER_STATION_SYNC",
    fitMode: "auto",
    densityMode: "standard",
    panelWidthMode: "standard",
    secondarySurfaceKind: "evidence",
    activeEvidenceTab: "result",
    activeUtilityTab: "scope",
    lastUtilityTab: "scope",
    lastEvidenceTab: "result",
    scopeDrawerOpen: false,
    utilityMode: "none",
    rangeSource: "shell",
    rangeSourceDetail: "manual",
    syncErrorCellKeys: new Set(),
    syncErrorCellDetailByKey: new Map(),
    monthCursor: monthStart(new Date()),
    selectedStart: null,
    selectedEnd: null,
    query: null,
    rows: [],
    providerReservations: [],
    providerReservationMeta: null,
    dates: [],
    valueRows: [],
    sheetQuery: null,
    sheetSnapshot: null,
    sheetDates: [],
    sheetValueRows: [],
    verificationReport: null,
    correctionsApplied: false,
    correctionAppliedAt: "",
    correctionAppliedCount: 0,
    correctionDiffCsv: "",
    correctionDiffCount: 0,
    syncConfig: sanitizeSyncConfig({}),
    syncPreview: null,
    syncApplyEnabled: READ_ONLY_TOOL_MODE === true ? false : true,
    syncResultVisible: false,
    settingsOpen: false,
    errorExpanded: false,
    debugExpanded: false,
    debugDetails: "-",
    statusLogs: [],
    syncApprovalChecked: false,
    syncApprovalFingerprint: "",
    secretsMasked: true,
    opsSectionExpanded: false,
    lastStatusTone: "info",
    productFlow: evaluateProductFlow({ providerType: context.providerType }),
    lastActionTimes: {
      query: "-",
      comparison: "-",
      application: READ_ONLY_TOOL_MODE === true ? "읽기 전용" : "-"
    },
    naverQueue: runtime.naverQueue || (runtime.naverQueue = new Map()),
    naverQueueMeta: runtime.naverQueueMeta || (runtime.naverQueueMeta = { lastFlushedAt: 0 })
  };
  const PANEL_ANIM_MS = 220;
  let panelAnimTimer = 0;
  let hostOverflowRestore = null;
  let hostViewportShiftRestore = null;
  let hostViewportShiftTimer = 0;

  function taskLabelById(taskId) {
    const task = normalizeText(taskId || "").toUpperCase();
    if (task === "PMS_RESERVATION_VALIDATION") return "예약 읽기 / 검증";
    if (task === "SHEET_MAPPING_REVIEW") return "시트 매핑 / 검토";
    if (task === "OTA_PMS_COMPARISON") return "OTA / PMS 대조";
    return "재고 조회 / 비교";
  }

  function taskClassById(taskId) {
    const task = normalizeText(taskId || "").toUpperCase();
    if (task === "PMS_RESERVATION_VALIDATION") return "task-reservation";
    if (task === "SHEET_MAPPING_REVIEW") return "task-sheet";
    if (task === "OTA_PMS_COMPARISON") return "task-audit";
    return "task-inventory";
  }

  function normalizeDensityMode(mode) {
    const text = normalizeText(mode || "").toLowerCase();
    if (text === "focus") return "focus";
    if (text === "compact") return "compact";
    return "standard";
  }

  function normalizeEvidenceTab(tab) {
    const text = normalizeText(tab || "").toLowerCase();
    if (text === "blocking") return "blocking";
    if (text === "validation") return "validation";
    if (text === "trace") return "trace";
    if (text === "export") return "export";
    return "result";
  }

  function normalizeUtilityTab(tab) {
    const text = normalizeText(tab || "").toLowerCase();
    if (text === "settings") return "settings";
    if (text === "ops") return "ops";
    if (text === "debug") return "debug";
    return "scope";
  }

  function normalizePanelWidthMode(mode) {
    const text = normalizeText(mode || "").toLowerCase();
    if (text === "collapsed") return "collapsed";
    if (text === "expanded") return "expanded";
    return "standard";
  }

  function syncDerivedSurfaceState() {
    state.scopeDrawerOpen = state.secondarySurfaceKind === "utility" && state.activeUtilityTab === "scope";
    state.settingsOpen = state.secondarySurfaceKind === "utility" && state.activeUtilityTab === "settings";
    state.opsSectionExpanded = state.secondarySurfaceKind === "utility" && state.activeUtilityTab === "ops";
    state.debugExpanded = state.secondarySurfaceKind === "evidence" && state.activeEvidenceTab === "trace";
    state.utilityMode = state.secondarySurfaceKind === "utility" ? state.activeUtilityTab : "none";
    if (state.densityMode !== "focus" && state.panelWidthMode === "expanded") {
      state.panelWidthMode = "standard";
    }
  }

  function hasSheetConfigReady(config = state.syncConfig) {
    return Boolean(
      normalizeText(config?.spreadsheet || "") &&
      normalizeText(config?.sheetName || "") &&
      Number(config?.startRow || 0) > 0 &&
      Number(config?.year || 0) > 0
    );
  }

  function hasSheetAuthReady(config = state.syncConfig) {
    if (normalizeText(config?.accessToken || "")) return true;
    if (hasGoogleRefreshCredentials(config)) return true;
    return getEmbeddedAuthMissingFields(config).length <= 0;
  }

  function hasPmsConfigReady(config = state.syncConfig) {
    return Boolean(
      normalizeText(config?.pmsReservationUrl || config?.pmsApiUrl || config?.pmsReservationApiUrl || "")
    );
  }

  function hasPmsAuthReady(config = state.syncConfig) {
    const bundle = config?.pmsAuthBundle;
    if (!bundle || typeof bundle !== "object") return false;
    const headers = bundle.headers && typeof bundle.headers === "object" ? Object.keys(bundle.headers) : [];
    return Boolean(
      normalizeText(bundle.authorization || "") ||
      normalizeText(bundle.cookieHeader || "") ||
      normalizeText(bundle.csrfToken || "") ||
      normalizeText(bundle.requestBody || "") ||
      headers.length > 0 ||
      (Array.isArray(bundle.cookies) && bundle.cookies.length > 0)
    );
  }

  async function probeProviderSessionReady() {
    try {
      const bundle = await captureProviderAuthBundle(context.providerType);
      return Boolean(bundle);
    } catch (_error) {
      return false;
    }
  }

  function currentTaskFlowAccess(taskId = state.activeTask) {
    const key = normalizeText(taskId || "").toUpperCase();
    return state.productFlow?.tasks?.[key] || {
      blocked: false,
      reason: "",
      utilityTab: "scope"
    };
  }

  function directEntryHostLabelsText() {
    const labels = (state.productFlow?.directEntryHosts || [])
      .map((host) => normalizeText(host?.directEntryLabel))
      .filter(Boolean);
    return labels.length ? labels.join(" / ") : "지원 시작 호스트";
  }

  function inventoryProviderKeyFor(providerType = context.providerType) {
    if (providerType === "admin-station") return "STATION";
    if (providerType === "naver-partner") return "NAVER";
    return "";
  }

  function requireInventoryProviderKey(providerType = context.providerType) {
    const providerKey = inventoryProviderKeyFor(providerType);
    if (providerKey) return providerKey;
    throw new Error("WINGS 시작 호스트에서는 재고 Task를 직접 실행할 수 없습니다. Naver 또는 Station 관리자 페이지에서 다시 시작하세요.");
  }

  function capabilityUiStatus(capabilityKey) {
    const capability = state.productFlow?.capabilities?.[capabilityKey];
    if (!capability) {
      return {
        label: "GUARD",
        className: "guard",
        summary: "지원 정책을 다시 확인하세요."
      };
    }
    if (capability.ready === true) {
      return {
        label: "READY",
        className: "ready",
        summary:
          capabilityKey === "provider-session"
            ? "현재 호스트 세션이 확인되어 작업면에 진입할 수 있습니다."
            : "현재 워크플로에서 바로 사용할 수 있습니다."
      };
    }
    if (capabilityKey === "provider-session") {
      return {
        label: "BLOCKED",
        className: "blocked",
        summary: `${context.siteName} 관리자 페이지 로그인 상태를 먼저 확인하세요.`
      };
    }
    if (capability.configured !== true) {
      return {
        label: "GUARD",
        className: "guard",
        summary: "직접 시작 호스트가 아니며 Utility > Settings에서 설정이 필요합니다."
      };
    }
    return {
      label: "GUARD",
      className: "guard",
      summary: "설정은 있으나 인증 정보가 준비되지 않았습니다."
    };
  }

  function buildPolicyItemHtml(label, status, body) {
    return (
      `<div class="policy-item">` +
      `<div class="policy-item-head">` +
      `<span>${escapeHtml(label)}</span>` +
      `<span class="policy-item-status ${escapeHtml(status.className)}">${escapeHtml(status.label)}</span>` +
      `</div>` +
      `<div class="policy-item-body">${escapeHtml(body)}</div>` +
      `</div>`
    );
  }

  function renderSupportPolicySurface() {
    const directHosts = directEntryHostLabelsText();
    const providerStatus = capabilityUiStatus("provider-session");
    const sheetsStatus = capabilityUiStatus("sheets");
    const wingsStatus = capabilityUiStatus("wings");
    const items = [
      buildPolicyItemHtml(
        "Direct Entry Hosts",
        { label: "READY", className: "ready" },
        `${directHosts}에서만 직접 시작할 수 있습니다. Google Sheets는 보조 연동 서비스입니다.`
      ),
      buildPolicyItemHtml("Provider Session", providerStatus, providerStatus.summary),
      buildPolicyItemHtml("Google Sheets", sheetsStatus, sheetsStatus.summary),
      buildPolicyItemHtml("WINGS/PMS", wingsStatus, wingsStatus.summary)
    ].join("");

    if (ui.supportPolicyList) ui.supportPolicyList.innerHTML = items;
    if (ui.flowGateSupportList) ui.flowGateSupportList.innerHTML = items;
    if (ui.supportPolicySummary) {
      ui.supportPolicySummary.textContent =
        state.productFlow?.workspaceAccess === true
          ? `직접 시작은 ${directHosts}에서 허용됩니다. Google Sheets는 Utility 설정을 거쳐 보조 연동으로 사용합니다.`
          : `${context.siteName} 세션을 확인한 뒤 작업면에 진입합니다.`;
    }
  }

  function activeFlowGate() {
    if (state.productFlow?.workspaceAccess !== true) {
      return {
        kicker: "Start Gate",
        title: `${context.siteName} 세션 확인 필요`,
        summary: `확장 아이콘으로만 시작할 수 있습니다. ${context.siteName} 관리자 페이지 로그인 상태를 확인한 뒤 상태를 다시 확인하세요.`,
        utilityLabel: "지원 정책 보기",
        utilityTab: "scope"
      };
    }
    const taskAccess = currentTaskFlowAccess();
    if (!taskAccess.blocked) return null;
    if (taskAccess.reason === "sheets") {
      return {
        kicker: "Task Guard",
        title: "Google Sheets 설정 필요",
        summary: "Sheet Mapping과 시트 비교 플로우는 Google Sheets 설정과 인증이 준비된 뒤에만 열립니다.",
        utilityLabel: "Utility > Settings",
        utilityTab: "settings"
      };
    }
    if (taskAccess.reason === "wings") {
      return {
        kicker: "Task Guard",
        title: "WINGS/PMS 설정 필요",
        summary: "Reservation Validation과 OTA/PMS Audit는 WINGS/PMS 조회 URL과 인증 번들이 준비된 뒤에만 진입할 수 있습니다.",
        utilityLabel: "Utility > Settings",
        utilityTab: "settings"
      };
    }
    if (taskAccess.reason === "host-scope") {
      const entryHostLabel = normalizeText(state.productFlow?.entryHost?.directEntryLabel || context.siteName);
      return {
        kicker: "Task Guard",
        title: "현재 시작 호스트에서는 이 Task를 열 수 없음",
        summary: `${entryHostLabel} 시작 호스트에서는 현재 세션 캡처와 설정 정리까지만 직접 지원합니다. 실행이 필요한 Task는 Naver 또는 Station 관리자 페이지에서 이어서 여세요.`,
        utilityLabel: "Utility > Settings",
        utilityTab: "settings"
      };
    }
    return null;
  }

  function syncFlowSurfaceState() {
    if (state.productFlow?.workspaceAccess !== true) {
      state.secondarySurfaceKind = "utility";
      state.activeUtilityTab = "scope";
      state.lastUtilityTab = "scope";
      syncDerivedSurfaceState();
      return;
    }
    const taskAccess = currentTaskFlowAccess();
    if (!taskAccess.blocked) return;
    state.secondarySurfaceKind = "utility";
    state.activeUtilityTab = normalizeUtilityTab(taskAccess.utilityTab || "settings");
    state.lastUtilityTab = state.activeUtilityTab;
    syncDerivedSurfaceState();
  }

  async function refreshProductFlowState(options = {}) {
    const providerSessionReady = await probeProviderSessionReady();
    state.productFlow = evaluateProductFlow({
      providerType: context.providerType,
      providerSessionReady,
      sheetConfigured: hasSheetConfigReady(state.syncConfig),
      sheetAuthReady: hasSheetAuthReady(state.syncConfig),
      pmsConfigured: hasPmsConfigReady(state.syncConfig),
      pmsAuthReady: hasPmsAuthReady(state.syncConfig)
    });
    syncFlowSurfaceState();
    renderSupportPolicySurface();
    if (options.render !== false) renderWorkspaceShellState();
    return state.productFlow;
  }

  function openEvidenceTab(tab = "result") {
    state.secondarySurfaceKind = "evidence";
    state.activeEvidenceTab = normalizeEvidenceTab(tab);
    state.lastEvidenceTab = state.activeEvidenceTab;
    syncDerivedSurfaceState();
    renderWorkspaceShellState();
  }

  function openUtilityTab(tab = "scope") {
    state.secondarySurfaceKind = "utility";
    state.activeUtilityTab = normalizeUtilityTab(tab);
    state.lastUtilityTab = state.activeUtilityTab;
    syncDerivedSurfaceState();
    renderWorkspaceShellState();
  }

  function setPanelWidthMode(mode) {
    const nextMode = normalizePanelWidthMode(mode);
    if (nextMode === "expanded" && normalizeDensityMode(state.densityMode) !== "focus") {
      state.panelWidthMode = "standard";
    } else {
      state.panelWidthMode = nextMode;
    }
    renderWorkspaceShellState();
  }

  function preferredEvidenceTabForTask(taskId = state.activeTask) {
    const task = normalizeText(taskId || "").toUpperCase();
    if (task === "PMS_RESERVATION_VALIDATION") return "validation";
    if (task === "OTA_PMS_COMPARISON") return "validation";
    if (task === "SHEET_MAPPING_REVIEW") return "trace";
    if (Number(state.syncPreview?.errorCount || 0) > 0) return "blocking";
    return "result";
  }

  function preferredUtilityTabForTask(taskId = state.activeTask) {
    const task = normalizeText(taskId || "").toUpperCase();
    const taskAccess = currentTaskFlowAccess(task);
    if (taskAccess.blocked) return normalizeUtilityTab(taskAccess.utilityTab || "settings");
    if (task === "SHEET_MAPPING_REVIEW") return "settings";
    if (task === "PMS_RESERVATION_VALIDATION" || task === "OTA_PMS_COMPARISON") return "ops";
    return "scope";
  }

  function openTaskEvidenceSurface(taskId = state.activeTask) {
    openEvidenceTab(preferredEvidenceTabForTask(taskId));
  }

  function openTaskUtilitySurface(taskId = state.activeTask) {
    openUtilityTab(preferredUtilityTabForTask(taskId));
  }

  function resolveTaskGuideModel(taskId = state.activeTask) {
    const task = normalizeText(taskId || "").toUpperCase();
    const mismatchCount = isSyncPreviewForActiveQuery() ? Number(state.syncPreview?.mismatchCount || 0) : 0;
    const errorCount = Number(state.syncPreview?.errorCount || 0);
    const warnCount = Number(state.verificationReport?.warnCount || 0);
    const failCount = Number(state.verificationReport?.failCount || 0);
    const reservationCount = Array.isArray(state.providerReservations) ? state.providerReservations.length : 0;
    const anomalyCount = countReservationAuditAnomalies();
    const sheetRows = Array.isArray(state.sheetValueRows) ? state.sheetValueRows.length : 0;
    const scanMode = normalizeText(state.syncConfig?.scan?.mode || "auto") || "auto";

    if (task === "PMS_RESERVATION_VALIDATION") {
      return {
        title: "Reservation Validation",
        summary: `PMS 예약과 읽은 예약을 검증하고 anomaly, 누락, 분류 오류를 먼저 확인합니다. 예약 ${reservationCount}건 / 경고 ${warnCount}건 / 실패 ${failCount}건 / anomaly ${anomalyCount}건`,
        action: reservationCount > 0 ? "누락/분류 오류와 anomaly를 검토하세요." : "먼저 예약을 읽어 검증 기준을 만드세요.",
        primaryView: "검증 상태 / anomaly 요약",
        evidence: "Validation Basis",
        utility: "Ops",
        evidenceButton: "Evidence > Validation Basis",
        utilityButton: "Utility > Ops"
      };
    }
    if (task === "SHEET_MAPPING_REVIEW") {
      return {
        title: "Sheet Mapping",
        summary: `시트 구조, 좌표, 맵핑 규칙을 검토해 엔진 정합성을 유지합니다. 스캔 모드 ${scanMode} / 시트 행 ${sheetRows}건`,
        action: state.secondarySurfaceKind === "utility" && state.activeUtilityTab === "settings"
          ? "좌표와 맵핑 규칙을 검토하고 저장하세요."
          : "시트 구조와 맵핑 규칙의 정합성을 확인하세요.",
        primaryView: "시트 구조 / 맵핑 상태",
        evidence: "Trace / Log",
        utility: "Settings",
        evidenceButton: "Evidence > Trace / Log",
        utilityButton: "Utility > Settings"
      };
    }
    if (task === "OTA_PMS_COMPARISON") {
      return {
        title: "OTA/PMS Audit",
        summary: `OTA / PMS / Sheet를 교차 대조해 운영 리스크를 조기에 발견합니다. 예약 ${reservationCount}건 / 경고 ${warnCount}건 / 실패 ${failCount}건 / anomaly ${anomalyCount}건`,
        action: reservationCount > 0 ? "교차 대조 결과와 운영 리스크를 검토하세요." : "먼저 예약과 조회 데이터를 읽어 대조 근거를 확보하세요.",
        primaryView: "감사 요약 / 교차 검증 상태",
        evidence: "Validation Basis",
        utility: "Ops",
        evidenceButton: "Evidence > Validation Basis",
        utilityButton: "Utility > Ops"
      };
    }
    return {
      title: "Inventory",
      summary: `사이트와 시트 재고를 비교하고 불일치와 보정 미리보기를 검토합니다. 불일치 ${mismatchCount}건 / 차단 ${errorCount}건`,
      action: !state.selectedStart || !state.selectedEnd
        ? "먼저 범위를 선택하세요."
        : !hasLoadedBothInventoryForQuery(resolveActiveQuery())
          ? "사이트와 시트를 함께 조회해 비교 기준을 만드세요."
          : mismatchCount > 0
            ? "불일치와 보정 미리보기를 검토하세요."
            : "비교 결과를 확인하고 필요 시 보정 미리보기를 실행하세요.",
      primaryView: "사이트 vs 시트 비교 / 불일치 리뷰",
      evidence: errorCount > 0 ? "Blocking" : "Result",
      utility: "Scope",
      evidenceButton: errorCount > 0 ? "Evidence > Blocking" : "Evidence > Result",
      utilityButton: "Utility > Scope"
    };
  }

  function renderTaskGuideCard() {
    if (!ui.taskGuideTitle || !ui.taskGuideSummary || !ui.taskGuideAction || !ui.taskGuidePrimaryView || !ui.taskGuideEvidence || !ui.taskGuideUtility) return;
    const model = resolveTaskGuideModel(state.activeTask);
    ui.taskGuideTitle.textContent = model.title;
    ui.taskGuideSummary.textContent = model.summary;
    ui.taskGuideAction.textContent = model.action;
    ui.taskGuidePrimaryView.textContent = model.primaryView;
    ui.taskGuideEvidence.textContent = model.evidence;
    ui.taskGuideUtility.textContent = model.utility;
    if (ui.taskGuideEvidenceBtn) ui.taskGuideEvidenceBtn.textContent = model.evidenceButton;
    if (ui.taskGuideUtilityBtn) ui.taskGuideUtilityBtn.textContent = model.utilityButton;
  }

  function stepLabelText() {
    const step = resolveWorkflowStep();
    if (step === "period") return TEXT.flowStepPeriod;
    if (step === "load") return TEXT.flowStepLoad;
    if (step === "apply") return "결과 확인";
    return TEXT.flowStepReview;
  }

  function formatActionStamp(date = new Date()) {
    const hh = String(date.getHours()).padStart(2, "0");
    const mm = String(date.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  }

  function markActionTime(key) {
    const target = normalizeText(key || "");
    if (!target || !state.lastActionTimes || !(target in state.lastActionTimes)) return;
    state.lastActionTimes[target] = formatActionStamp(new Date());
    renderHostContextBar();
  }

  function lockHostScroll(flag) {
    const shouldLock = Boolean(flag);
    const root = document.documentElement;
    if (!root) return;
    if (shouldLock) {
      if (!hostOverflowRestore) {
        hostOverflowRestore = {
          html: root.style.overflow || "",
          body: document.body?.style?.overflow || ""
        };
      }
      root.style.overflow = "hidden";
      if (document.body) document.body.style.overflow = "hidden";
      return;
    }
    if (!hostOverflowRestore) return;
    root.style.overflow = hostOverflowRestore.html;
    if (document.body) document.body.style.overflow = hostOverflowRestore.body;
    hostOverflowRestore = null;
  }

  function releaseHostViewportShift(restoreTransition = true) {
    const body = document.body;
    if (!body || !hostViewportShiftRestore) return;
    if (hostViewportShiftTimer) {
      window.clearTimeout(hostViewportShiftTimer);
      hostViewportShiftTimer = 0;
    }
    body.style.transform = hostViewportShiftRestore.transform;
    body.style.transformOrigin = hostViewportShiftRestore.transformOrigin;
    body.style.willChange = hostViewportShiftRestore.willChange;
    if (restoreTransition) body.style.transition = hostViewportShiftRestore.transition;
    hostViewportShiftRestore = null;
  }

  function syncHostViewportShift(flag) {
    const body = document.body;
    if (!body) return;
    const shouldShift = Boolean(flag) && Number(window.innerWidth || 0) >= 1280;
    if (!shouldShift) {
      if (!hostViewportShiftRestore) return;
      if (hostViewportShiftTimer) {
        window.clearTimeout(hostViewportShiftTimer);
        hostViewportShiftTimer = 0;
      }
      body.style.transition = `transform ${PANEL_ANIM_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`;
      body.style.transform = hostViewportShiftRestore.transform;
      body.style.transformOrigin = hostViewportShiftRestore.transformOrigin || "top center";
      body.style.willChange = "transform";
      hostViewportShiftTimer = window.setTimeout(() => {
        releaseHostViewportShift(true);
      }, PANEL_ANIM_MS + 40);
      return;
    }
    if (hostViewportShiftTimer) {
      window.clearTimeout(hostViewportShiftTimer);
      hostViewportShiftTimer = 0;
    }
    if (!hostViewportShiftRestore) {
      hostViewportShiftRestore = {
        transform: body.style.transform || "",
        transition: body.style.transition || "",
        transformOrigin: body.style.transformOrigin || "",
        willChange: body.style.willChange || ""
      };
    }
    const panelWidth = Math.max(360, Math.round(ui.panel?.getBoundingClientRect?.().width || ui.panel?.offsetWidth || 420));
    const baseTransform =
      hostViewportShiftRestore.transform && hostViewportShiftRestore.transform !== "none"
        ? hostViewportShiftRestore.transform
        : "";
    const maxShift = Math.max(0, Math.floor((Number(window.innerWidth || 0) - 960) / 2));
    const shift = Math.max(0, Math.min(panelWidth + 20, maxShift));
    body.style.transition = `transform ${PANEL_ANIM_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`;
    body.style.transformOrigin = "top center";
    body.style.willChange = "transform";
    body.style.transform = `${baseTransform}${baseTransform ? " " : ""}translate3d(-${shift}px, 0, 0)`;
  }

  function resolveContextEntityText() {
    if (context.providerType === "admin-station") {
      return `지점 ${resolveActiveStationBranchId(state.syncConfig)} / PMS ${normalizeText(state.syncConfig?.pmsPropertyNo || "") || "-"}`;
    }
    if (context.providerType === "wings-pms") {
      return `WINGS ${location.host} / PMS ${normalizeText(state.syncConfig?.pmsPropertyNo || "") || "-"}`;
    }
    return `비즈니스 ${FIXED_NAVER_BUSINESS_ID} / PMS ${normalizeText(state.syncConfig?.pmsPropertyNo || "") || "-"}`;
  }

  function currentCapabilityLabel() {
    if (state.productFlow?.workspaceAccess !== true) return "세션 확인 필요";
    const taskAccess = currentTaskFlowAccess();
    if (taskAccess.blocked && taskAccess.reason === "host-scope") return "호스트 가드";
    if (taskAccess.blocked && taskAccess.reason === "sheets") return "시트 가드";
    if (taskAccess.blocked && taskAccess.reason === "wings") return "PMS 가드";
    if (READ_ONLY_TOOL_MODE === true) return "읽기 전용 / 비교 가능";
    if (!isCurrentProviderApplyAllowed()) return "비교 가능 / 반영 차단";
    if (Boolean(state.syncPreview?.policy?.blocked)) return "비교 가능 / 검토 차단";
    return "반영 가능";
  }

  function nextActionLabel() {
    const query = resolveActiveQuery();
    const task = normalizeText(state.activeTask || "").toUpperCase();
    const taskAccess = currentTaskFlowAccess(task);
    if (state.loading) return "처리 중";
    if (state.productFlow?.workspaceAccess !== true) return "로그인 확인";
    if (taskAccess.blocked && taskAccess.reason === "host-scope") return "호스트 전환";
    if (taskAccess.blocked && taskAccess.reason === "sheets") return "시트 설정";
    if (taskAccess.blocked && taskAccess.reason === "wings") return "PMS 설정";
    if (!state.selectedStart || !state.selectedEnd) return "범위 선택";
    if (task === "SHEET_MAPPING_REVIEW") {
      return state.secondarySurfaceKind === "utility" && state.activeUtilityTab === "settings" ? "설정 저장" : "시트 검토";
    }
    if (task === "PMS_RESERVATION_VALIDATION" || task === "OTA_PMS_COMPARISON") {
      return state.providerReservations.length > 0 ? "차이 검토" : "예약 읽기";
    }
    if (!hasLoadedBothInventoryForQuery(query)) return TEXT.loadAll;
    return normalizeText(ui.syncBtnLabel?.textContent || "") || TEXT.syncRun;
  }

  function currentRangeSourceLabel() {
    if (state.rangeSource === "host") {
      if (state.rangeSourceDetail === "url") return "호스트(URL)";
      if (state.rangeSourceDetail === "dom") return "호스트(DOM)";
      return "호스트";
    }
    return "셸";
  }

  function syncViewportFitMode() {
    if (!ui.wrap || !ui.panel) return;
    const densityMode = normalizeDensityMode(state.densityMode || state.fitMode);
    const widthMode = normalizePanelWidthMode(state.panelWidthMode);
    ui.wrap.classList.toggle("fit-auto", densityMode === "standard");
    ui.wrap.classList.toggle("fit-standard", densityMode === "standard");
    ui.wrap.classList.toggle("fit-focus", densityMode === "focus");
    ui.wrap.classList.toggle("fit-compact", densityMode === "compact");
    ui.wrap.classList.toggle("width-collapsed", widthMode === "collapsed");
    ui.wrap.classList.toggle("width-standard", widthMode === "standard");
    ui.wrap.classList.toggle("width-expanded", widthMode === "expanded");
    [ui.fitAutoBtn, ui.fitFocusBtn, ui.fitCompactBtn].forEach((btn) => btn?.classList.remove("is-active"));
    if (densityMode === "focus") ui.fitFocusBtn?.classList.add("is-active");
    else if (densityMode === "compact") ui.fitCompactBtn?.classList.add("is-active");
    else ui.fitAutoBtn?.classList.add("is-active");
    [ui.widthCollapsedBtn, ui.widthStandardBtn, ui.widthExpandedBtn].forEach((btn) => btn?.classList.remove("is-active", "is-disabled"));
    if (widthMode === "collapsed") ui.widthCollapsedBtn?.classList.add("is-active");
    else if (widthMode === "expanded") ui.widthExpandedBtn?.classList.add("is-active");
    else ui.widthStandardBtn?.classList.add("is-active");
    if (densityMode !== "focus") ui.widthExpandedBtn?.classList.add("is-disabled");

    const vw = Math.max(360, Number(window.innerWidth || 0));
    const vh = Math.max(520, Number(window.innerHeight || 0));
    const mobile = vw <= 820;
    const rightSafe = mobile ? 8 : 14;
    const topSafe = mobile ? 68 : 72;
    const bottomSafe = mobile ? 8 : 14;
    const widthRatio =
      widthMode === "expanded" ? 0.41 :
      widthMode === "collapsed" ? 0.31 :
      0.35;
    const hardMax = Math.floor(vw * 0.44);
    const targetWidth = Math.min(hardMax, Math.round(vw * widthRatio));
    const maxWidth = Math.max(320, vw - (mobile ? 16 : 28));
    const width = Math.min(maxWidth, targetWidth);
    ui.panel.style.left = "auto";
    ui.panel.style.top = `${Math.round(topSafe)}px`;
    ui.panel.style.right = `${Math.round(rightSafe)}px`;
    ui.panel.style.bottom = `${Math.round(bottomSafe)}px`;
    ui.panel.style.width = `${width}px`;
    ui.panel.style.height = "auto";
    syncHostViewportShift(isPanelVisible());
  }

  function renderHostContextBar() {
    if (!ui.contextHostBadge || !ui.contextEntityName || !ui.contextConnectionStatus || !ui.contextPermissionState || !ui.contextLastRun) return;
    ui.contextHostBadge.textContent =
      context.providerType === "admin-station"
        ? "STATION"
        : context.providerType === "wings-pms"
          ? "WINGS"
          : "NAVER";
    ui.contextEntityName.textContent = resolveContextEntityText();
    ui.contextPermissionState.textContent = currentCapabilityLabel();
    ui.contextConnectionStatus.textContent =
      state.loading ? "조회 중" :
      state.lastStatusTone === "error" ? "연결 주의" :
      state.lastStatusTone === "warn" ? "검토 주의" :
      "연결됨";
    ui.contextLastRun.textContent =
      `Last Query ${state.lastActionTimes.query} / Compare ${state.lastActionTimes.comparison} / Apply ${state.lastActionTimes.application}`;
  }

  function renderFlowGateCard() {
    const gate = activeFlowGate();
    if (ui.flowGateCard) ui.flowGateCard.classList.toggle("hidden", !gate);
    if (!gate) return;
    if (ui.flowGateKicker) ui.flowGateKicker.textContent = gate.kicker;
    if (ui.flowGateTitle) ui.flowGateTitle.textContent = gate.title;
    if (ui.flowGateSummary) ui.flowGateSummary.textContent = gate.summary;
    if (ui.flowGateUtilityBtn) ui.flowGateUtilityBtn.textContent = gate.utilityLabel;
  }

  function renderWorkspaceShellState() {
    if (!ui.wrap) return;
    syncDerivedSurfaceState();
    const workspaceBlocked = state.productFlow?.workspaceAccess !== true;
    const taskFlowAccess = currentTaskFlowAccess();
    const taskGuarded = !workspaceBlocked && taskFlowAccess.blocked === true;
    const showMainWorkspace = !workspaceBlocked && !taskGuarded;
    const showVerification = ["PMS_RESERVATION_VALIDATION", "OTA_PMS_COMPARISON"].includes(normalizeText(state.activeTask || "").toUpperCase());
    if (!showVerification && state.secondarySurfaceKind === "evidence" && state.activeEvidenceTab === "validation") {
      state.activeEvidenceTab = "result";
      state.lastEvidenceTab = "result";
      syncDerivedSurfaceState();
    }
    ui.wrap.classList.remove("task-inventory", "task-reservation", "task-sheet", "task-audit", "scope-open", "utility-open", "secondary-evidence", "secondary-utility");
    ui.wrap.classList.add(taskClassById(state.activeTask));
    ui.wrap.classList.add("sidebar-docked");
    ui.wrap.classList.toggle("workspace-blocked", workspaceBlocked || taskGuarded);
    ui.wrap.classList.toggle("scope-open", state.scopeDrawerOpen);
    ui.wrap.classList.toggle("utility-open", state.secondarySurfaceKind === "utility");
    ui.wrap.classList.toggle("secondary-evidence", state.secondarySurfaceKind === "evidence");
    ui.wrap.classList.toggle("secondary-utility", state.secondarySurfaceKind === "utility");
    ui.wrap.classList.toggle("panel-open", isPanelVisible());

    if (ui.evidenceSurface) ui.evidenceSurface.classList.toggle("is-active", state.secondarySurfaceKind === "evidence");
    if (ui.utilitySurface) ui.utilitySurface.classList.toggle("is-active", state.secondarySurfaceKind === "utility");
    if (ui.scopeToggleBtn) ui.scopeToggleBtn.textContent = state.secondarySurfaceKind === "utility" && state.activeUtilityTab === "scope" ? "범위 닫기" : "범위";
    if (ui.toggleConfig) ui.toggleConfig.textContent = state.secondarySurfaceKind === "utility" ? "Utility 닫기" : "Utility";
    if (ui.workspaceTaskPill) ui.workspaceTaskPill.textContent = taskLabelById(state.activeTask);
    if (ui.workspaceContextSummary) {
      ui.workspaceContextSummary.textContent = `현재 단계: ${stepLabelText()} / 기간 기준: ${currentRangeSourceLabel()} / 다음 행동: ${nextActionLabel()} / Density ${state.densityMode} / Width ${state.panelWidthMode}`;
    }
    renderTaskGuideCard();
    renderFlowGateCard();
    [
      [ui.taskNavInventoryBtn, "NAVER_STATION_SYNC"],
      [ui.taskNavReservationBtn, "PMS_RESERVATION_VALIDATION"],
      [ui.taskNavSheetBtn, "SHEET_MAPPING_REVIEW"],
      [ui.taskNavAuditBtn, "OTA_PMS_COMPARISON"]
    ].forEach(([btn, taskId]) => {
      const taskAccess = state.productFlow?.tasks?.[taskId] || { blocked: false };
      btn?.classList.toggle("is-active", normalizeText(state.activeTask || "").toUpperCase() === taskId);
      if (btn) btn.disabled = workspaceBlocked ? false : taskAccess.blocked === true;
    });

    [
      [ui.workspaceFlow, showMainWorkspace],
      [ui.status, showMainWorkspace],
      [ui.readOnlyNotice, showMainWorkspace],
      [ui.primarySummary, showMainWorkspace],
      [ui.userOpsSummary, showMainWorkspace],
      [ui.userOpsHint, showMainWorkspace],
      [ui.taskGuideCard, showMainWorkspace],
      [ui.severityBanner, showMainWorkspace && !ui.severityBanner?.classList.contains("hidden")],
      [ui.workspaceActionPrimary, showMainWorkspace],
      [ui.workspaceActionSecondary, showMainWorkspace],
      [ui.reviewSection, showMainWorkspace],
      [ui.comparisonSection, showMainWorkspace]
    ].forEach(([el, visible]) => {
      if (!el) return;
      if (el === ui.severityBanner) {
        el.classList.toggle("hidden", !visible);
        return;
      }
      el.classList.toggle("hidden", !visible);
    });

    [
      [ui.evidenceResultTabBtn, "result", state.activeEvidenceTab, state.secondarySurfaceKind],
      [ui.evidenceBlockingTabBtn, "blocking", state.activeEvidenceTab, state.secondarySurfaceKind],
      [ui.evidenceValidationTabBtn, "validation", state.activeEvidenceTab, state.secondarySurfaceKind],
      [ui.evidenceTraceTabBtn, "trace", state.activeEvidenceTab, state.secondarySurfaceKind],
      [ui.evidenceExportTabBtn, "export", state.activeEvidenceTab, state.secondarySurfaceKind]
    ].forEach(([btn, tabId, activeTab, kind]) => btn?.classList.toggle("is-active", kind === "evidence" && activeTab === tabId));
    [
      [ui.utilityScopeTabBtn, "scope", state.activeUtilityTab, state.secondarySurfaceKind],
      [ui.utilitySettingsTabBtn, "settings", state.activeUtilityTab, state.secondarySurfaceKind],
      [ui.utilityOpsTabBtn, "ops", state.activeUtilityTab, state.secondarySurfaceKind],
      [ui.utilityDebugTabBtn, "debug", state.activeUtilityTab, state.secondarySurfaceKind]
    ].forEach(([btn, tabId, activeTab, kind]) => btn?.classList.toggle("is-active", kind === "utility" && activeTab === tabId));

    [
      [ui.evidenceResultPanel, state.secondarySurfaceKind === "evidence" && state.activeEvidenceTab === "result"],
      [ui.evidenceBlockingPanel, state.secondarySurfaceKind === "evidence" && state.activeEvidenceTab === "blocking"],
      [ui.evidenceValidationPanel, state.secondarySurfaceKind === "evidence" && state.activeEvidenceTab === "validation"],
      [ui.evidenceTracePanel, state.secondarySurfaceKind === "evidence" && state.activeEvidenceTab === "trace"],
      [ui.evidenceExportPanel, state.secondarySurfaceKind === "evidence" && state.activeEvidenceTab === "export"],
      [ui.utilityScopePanel, state.secondarySurfaceKind === "utility" && state.activeUtilityTab === "scope"],
      [ui.utilitySettingsPanel, state.secondarySurfaceKind === "utility" && state.activeUtilityTab === "settings"],
      [ui.utilityOpsPanel, state.secondarySurfaceKind === "utility" && state.activeUtilityTab === "ops"],
      [ui.utilityDebugPanel, state.secondarySurfaceKind === "utility" && state.activeUtilityTab === "debug"]
    ].forEach(([el, visible]) => el?.classList.toggle("hidden", !visible));

    if (ui.evidenceValidationTabBtn) ui.evidenceValidationTabBtn.classList.toggle("hidden", !showVerification);
    const showResults = state.syncResultVisible === true || Number(state.syncPreview?.errorCount || 0) > 0 || state.activeEvidenceTab === "result";
    if (ui.syncResultWrap) ui.syncResultWrap.classList.toggle("hidden", !showResults);
    if (ui.flowGateCard) ui.flowGateCard.classList.toggle("hidden", !(workspaceBlocked || taskGuarded));
    syncViewportFitMode();
    renderHostContextBar();
  }

  function setFitMode(mode) {
    const normalized = normalizeText(mode || "").toLowerCase();
    const nextMode = normalized === "focus" || normalized === "compact" ? normalized : "standard";
    state.densityMode = nextMode;
    state.fitMode = nextMode === "standard" ? "auto" : nextMode;
    if (nextMode !== "focus" && state.panelWidthMode === "expanded") {
      state.panelWidthMode = "standard";
    }
    syncDerivedSurfaceState();
    lockHostScroll(false);
    renderWorkspaceShellState();
  }

  function setScopeDrawerOpen(flag) {
    if (flag) {
      openUtilityTab("scope");
      return;
    }
    if (state.secondarySurfaceKind === "utility" && state.activeUtilityTab === "scope") {
      state.secondarySurfaceKind = "evidence";
      syncDerivedSurfaceState();
    }
    renderWorkspaceShellState();
  }

  function setActiveTask(taskId, options = {}) {
    state.activeTask = normalizeText(taskId || "").toUpperCase() || "NAVER_STATION_SYNC";
    const preferredEvidenceTab = preferredEvidenceTabForTask(state.activeTask);
    const preferredUtilityTab = preferredUtilityTabForTask(state.activeTask);
    state.lastEvidenceTab = preferredEvidenceTab;
    state.lastUtilityTab = preferredUtilityTab;
    if (options.openSettings === true) openUtilityTab("settings");
    else if (options.openScope === true) openUtilityTab("scope");
    else if (!state.selectedStart || !state.selectedEnd) openUtilityTab("scope");
    else openEvidenceTab(preferredEvidenceTab);
    syncFlowSurfaceState();
    renderWorkspaceShellState();
  }

  function releasePanelSessionMemory() {
    state.bootstrapped = false;
    state.loading = false;
    state.loadingAction = "";
    state.densityMode = "standard";
    state.panelWidthMode = "standard";
    state.secondarySurfaceKind = "evidence";
    state.activeEvidenceTab = "result";
    state.activeUtilityTab = "scope";
    state.lastUtilityTab = "scope";
    state.lastEvidenceTab = "result";
    state.scopeDrawerOpen = false;
    state.settingsOpen = false;
    state.utilityMode = "none";
    state.rangeSource = "shell";
    state.rangeSourceDetail = "manual";
    state.fitMode = "auto";
    state.densityMode = "standard";
    state.panelWidthMode = "standard";
    state.rows = [];
    state.dates = [];
    state.valueRows = [];
    state.providerReservations = [];
    state.providerReservationMeta = null;
    state.sheetSnapshot = null;
    state.sheetDates = [];
    state.sheetValueRows = [];
    state.syncPreview = { mismatchCount: 0 };
    state.syncApprovalChecked = false;
    state.syncApprovalFingerprint = "";
    state.verificationReport = null;
    state.statusLogs = [];
    state.productFlow = evaluateProductFlow({ providerType: context.providerType });
    clearSyncErrorCellMarkers();
    if (ui.siteBody) tableCellFlashCache.set(ui.siteBody, new Map());
    if (ui.sheetBody) tableCellFlashCache.set(ui.sheetBody, new Map());
    if (ui.insightBody) tableCellFlashCache.set(ui.insightBody, new Map());
    lockHostScroll(false);
    syncHostViewportShift(false);
  }

  function isPanelVisible() {
    return Boolean(ui.panel) && !ui.panel.classList.contains("hidden") && !ui.panel.classList.contains("is-closing");
  }

  function setPanelOpen(flag) {
    const shouldOpen = Boolean(flag);
    if (!ui.panel || !ui.backdrop || !ui.wrap) return;
    if (panelAnimTimer) {
      window.clearTimeout(panelAnimTimer);
      panelAnimTimer = 0;
    }
    if (shouldOpen) {
      ui.wrap.classList.add("panel-open");
      ui.panel.classList.remove("hidden", "is-closing");
      ui.backdrop.classList.remove("hidden", "is-closing");
      requestAnimationFrame(() => {
        ui.panel.classList.add("is-open");
        ui.backdrop.classList.add("is-open");
        lockHostScroll(false);
        renderWorkspaceShellState();
        syncHostViewportShift(true);
      });
      emitUiEvent("main_panel_open", { provider: context.providerType || "" });
      return;
    }
    if (ui.panel.classList.contains("hidden")) return;
    ui.panel.classList.remove("is-open");
    ui.backdrop.classList.remove("is-open");
    ui.wrap.classList.remove("panel-open");
    ui.panel.classList.add("is-closing");
    ui.backdrop.classList.add("is-closing");
    syncHostViewportShift(false);
    panelAnimTimer = window.setTimeout(() => {
      ui.panel.classList.remove("is-closing");
      ui.backdrop.classList.remove("is-closing");
      ui.panel.classList.add("hidden");
      ui.backdrop.classList.add("hidden");
      lockHostScroll(false);
      renderWorkspaceShellState();
      panelAnimTimer = 0;
    }, PANEL_ANIM_MS);
  }

  function isSectionVisible(el) {
    return Boolean(el) && !el.classList.contains("hidden");
  }

  function setSectionVisible(el, flag) {
    if (!el) return;
    el.classList.toggle("hidden", !Boolean(flag));
  }

  function syncSectionVisible(el, flag) {
    if (!el) return;
    if (isSectionVisible(el) === Boolean(flag)) return;
    setSectionVisible(el, flag);
  }

  function emitUiEvent(name, payload = {}) {
    const eventName = normalizeText(name || "");
    if (!eventName) return;
    try {
      window.dispatchEvent(
        new CustomEvent("inventory-ui-event", {
          detail: {
            name: eventName,
            timestamp: Date.now(),
            ...payload
          }
        })
      );
    } catch (_err) {
      // ignore telemetry failures
    }
  }

  function redactSensitiveText(input) {
    let text = String(input ?? "");
    if (!text) return "";
    const keyedPatterns = [
      /((?:["']?(?:client[_-\s]?secret|clientSecret)["']?\s*[:=]\s*["']?))([^"'\\s,;]+)(["']?)/gi,
      /((?:["']?(?:refresh[_-\s]?token|refreshToken)["']?\s*[:=]\s*["']?))([^"'\\s,;]+)(["']?)/gi,
      /((?:["']?(?:access[_-\s]?token|accessToken)["']?\s*[:=]\s*["']?))([^"'\\s,;]+)(["']?)/gi,
      /((?:["']?(?:csrfToken|x-csrf-token|x-xsrf-token)["']?\s*[:=]\s*["']?))([^"'\\s,;]+)(["']?)/gi,
      /((?:["']?(?:cookieHeader|cookie)["']?\s*[:=]\s*["']?))([^"'\n]+)(["']?)/gi,
      /(authorization\s*:\s*bearer\s+)([^\s,;"]+)/gi,
      /(cookie\s*:\s*)([^\n]+)/gi
    ];
    keyedPatterns.forEach((pattern) => {
      text = text.replace(pattern, (_, prefix, _value, suffix = "") => `${prefix}[REDACTED]${suffix}`);
    });
    text = text.replace(/\bya29\.[A-Za-z0-9._-]+\b/g, "ya29.[REDACTED]");
    text = text.replace(/\b1\/\/[A-Za-z0-9._-]+\b/g, "1//[REDACTED]");
    text = text.replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, "[JWT_REDACTED]");
    text = text.replace(/\bGOCSPX-[A-Za-z0-9_-]+\b/g, "GOCSPX-[REDACTED]");
    return text;
  }

  function resolveActiveQuery() {
    if (state.selectedStart && state.selectedEnd) {
      return { startDate: state.selectedStart, endDate: state.selectedEnd };
    }
    if (state.query) return state.query;
    if (state.sheetQuery) return state.sheetQuery;
    return null;
  }

  function isSyncPreviewForActiveQuery() {
    const selected = resolveActiveQuery();
    const previewQuery = state.syncPreview?.query || state.query || state.sheetQuery || null;
    if (!selected || !previewQuery) return false;
    return (
      String(previewQuery.startDate || "") === String(selected.startDate || "") &&
      String(previewQuery.endDate || "") === String(selected.endDate || "")
    );
  }

  function isSyncApprovalRequired() {
    if (READ_ONLY_TOOL_MODE === true) return false;
    if (!isSyncApplyEnabled()) return false;
    if (Number(state.syncPreview?.mismatchCount || 0) <= 0) return false;
    return isSyncPreviewForActiveQuery();
  }

  function isSyncApprovalReady() {
    return !isSyncApprovalRequired() || state.syncApprovalChecked === true;
  }

  function buildSyncApprovalFingerprint() {
    const query = resolveActiveQuery();
    const isCurrentPreview = isSyncPreviewForActiveQuery();
    const mismatchCount = isCurrentPreview ? Number(state.syncPreview?.mismatchCount || 0) : 0;
    const closedCount = isCurrentPreview ? countClosedItems(state.syncPreview?.providerKey, state.syncPreview?.actions || []) : 0;
    const validationErrorCount = Number(state.syncPreview?.validation?.errorCount || 0);
    return [
      query?.startDate || "-",
      query?.endDate || "-",
      normalizeText(isCurrentPreview ? state.syncPreview?.providerKey : "-"),
      mismatchCount,
      closedCount,
      validationErrorCount
    ].join("::");
  }

  function updateSyncApprovalUi(options = {}) {
    if (!ui.syncApprovalWrap || !ui.syncApprovalCheck) return;
    const isCurrentPreview = isSyncPreviewForActiveQuery();
    const mismatchCount = isCurrentPreview ? Number(state.syncPreview?.mismatchCount || 0) : 0;
    const closedCount = isCurrentPreview ? countClosedItems(state.syncPreview?.providerKey, state.syncPreview?.actions || []) : 0;
    const query = resolveActiveQuery();
    const fingerprint = buildSyncApprovalFingerprint();
    if (options.reset === true || state.syncApprovalFingerprint !== fingerprint) {
      state.syncApprovalChecked = false;
      state.syncApprovalFingerprint = fingerprint;
    }
    const required = isSyncApprovalRequired();
    ui.syncApprovalWrap.classList.toggle("hidden", !required);
    if (ui.syncApprovalMismatch) ui.syncApprovalMismatch.textContent = String(mismatchCount);
    if (ui.syncApprovalClosed) ui.syncApprovalClosed.textContent = String(closedCount);
    if (ui.syncApprovalPeriod) {
      ui.syncApprovalPeriod.textContent = query ? `${query.startDate} ~ ${query.endDate}` : TEXT.noPeriod;
    }
    ui.syncApprovalCheck.checked = state.syncApprovalChecked === true;
    ui.syncApprovalCheck.disabled = Boolean(state.loading) || !required;
    renderWorkflowProgress();
    renderSupportPolicySurface();
  }

  function resolveWorkflowStep() {
    const hasRange = Boolean(state.selectedStart && state.selectedEnd);
    const siteLoadedForSelectedRange = Boolean(
      state.selectedStart &&
      state.selectedEnd &&
      state.query &&
      state.query.startDate === state.selectedStart &&
      state.query.endDate === state.selectedEnd &&
      Array.isArray(state.rows) &&
      state.rows.length > 0
    );
    const sheetLoadedForSelectedRange = Boolean(
      state.selectedStart &&
      state.selectedEnd &&
      state.sheetQuery &&
      state.sheetQuery.startDate === state.selectedStart &&
      state.sheetQuery.endDate === state.selectedEnd &&
      state.sheetSnapshot
    );
    const hasLoadedData = siteLoadedForSelectedRange || sheetLoadedForSelectedRange;
    if (!hasRange) return "period";
    if (!hasLoadedData) return "load";
    if (READ_ONLY_TOOL_MODE === true) return "review";
    if (!isSyncApplyEnabled()) return "review";
    if (!isSyncApprovalReady()) return "review";
    return "apply";
  }

  function renderWorkflowProgress() {
    const steps = [
      ["period", ui.flowStepPeriod],
      ["load", ui.flowStepLoad],
      ["review", ui.flowStepReview],
      ["apply", ui.flowStepApply]
    ];
    if (steps.some(([, el]) => !el)) return;
    const activeStep = resolveWorkflowStep();
    const activeIndex = steps.findIndex(([key]) => key === activeStep);
    steps.forEach(([, el], idx) => {
      el.classList.toggle("is-active", idx === activeIndex);
      el.classList.toggle("is-done", idx < activeIndex);
    });
  }

  function countReservationAuditAnomalies() {
    const counts = state.providerReservationMeta?.statusCounts;
    if (counts && Number.isFinite(Number(counts.auditAnomaly))) {
      return Number(counts.auditAnomaly);
    }
    return (Array.isArray(state.providerReservations) ? state.providerReservations : []).filter((row) => row?.auditAnomaly === true).length;
  }

  function renderUserOpsSummary() {
    if (!ui.userSyncState || !ui.userMismatchCount || !ui.userPmsStatus || !ui.userLoadState || !ui.userOpsHint) return;
    const mismatchCount = isSyncPreviewForActiveQuery() ? Number(state.syncPreview?.mismatchCount || 0) : 0;
    const mismatchCard = ui.userMismatchCount?.closest?.(".card");
    const readonlyMode = READ_ONLY_TOOL_MODE === true;
    const blocked = readonlyMode ? false : (Boolean(state.syncPreview?.policy?.blocked) || !isCurrentProviderApplyAllowed());
    const hasSite = Boolean(state.query && Array.isArray(state.rows) && state.rows.length > 0);
    const hasSheet = Boolean(state.sheetQuery && state.sheetSnapshot);
    const reservationCounts = state.providerReservationMeta?.statusCounts && typeof state.providerReservationMeta.statusCounts === "object"
      ? state.providerReservationMeta.statusCounts
      : {};
    const activeCount = Number.isFinite(Number(reservationCounts.active))
      ? Number(reservationCounts.active)
      : (state.providerReservations || []).filter((row) => normalizeReservationStatusBucket(row?.statusBucket || row?.status || "") === "ACTIVE").length;
    const canceledCount = Number.isFinite(Number(reservationCounts.canceled))
      ? Number(reservationCounts.canceled)
      : (state.providerReservations || []).filter((row) => normalizeReservationStatusBucket(row?.statusBucket || row?.status || "") === "CANCELED").length;
    const anomalyCount = countReservationAuditAnomalies();

    let syncState = "대기";
    let hint = TEXT.userHintIdle;
    if (state.loading) {
      syncState = "처리 중";
      hint = readonlyMode ? "조회 또는 검토 계산이 진행 중입니다." : "조회 또는 적용이 진행 중입니다.";
    } else if (readonlyMode) {
      syncState = mismatchCount > 0 ? "검토 필요" : hasSite && hasSheet ? "검토 가능" : "대기";
      hint = "읽기 전용 모드입니다. 시트/OTA 쓰기 없이 조회와 비교 결과만 제공합니다.";
    } else if (blocked) {
      syncState = "차단됨";
      hint = "적용은 차단 상태입니다. 차단 사유는 Evidence > Blocking에서, 정책 근거는 Utility > Ops에서 확인하세요.";
    } else if (mismatchCount > 0) {
      syncState = "검토 필요";
      hint = "불일치가 있어 검토가 필요합니다. 상세 불일치는 Evidence에서, 정책과 soft-match 근거는 Utility > Ops에서 확인하세요.";
    } else if (hasSite && hasSheet) {
      syncState = "적용 가능";
      hint = "사이트/시트 조회가 완료되었습니다. Task에는 상태만 표시되고 상세 근거는 Evidence / Utility로 분리됩니다.";
    }

    ui.userSyncState.textContent = syncState;
    ui.userMismatchCount.textContent = String(mismatchCount);
    if (mismatchCard) mismatchCard.classList.toggle("is-critical", mismatchCount > 0);
    ui.userPmsStatus.textContent =
      state.providerReservationMeta?.source === "pms-unconfigured"
        ? "설정 필요"
        : state.providerReservations.length > 0 || activeCount > 0 || canceledCount > 0
          ? `활성 ${activeCount} / 취소 ${canceledCount}`
          : "미조회";
    ui.userLoadState.textContent = hasSite && hasSheet ? "사이트+시트" : hasSite ? "사이트" : hasSheet ? "시트" : "대기";
    if (anomalyCount > 0 && !state.loading) {
      hint = `${hint}\n- night audit anomaly 후보 ${anomalyCount}건은 Utility > Ops에서 확인하세요.`;
    }
    ui.userOpsHint.textContent = hint;
    renderHostContextBar();
  }

  function renderOpsMetaSummary() {
    if (ui.opsPolicySummary) {
      const mismatchCount = isSyncPreviewForActiveQuery() ? Number(state.syncPreview?.mismatchCount || 0) : 0;
      const blocked = READ_ONLY_TOOL_MODE === true ? false : (Boolean(state.syncPreview?.policy?.blocked) || !isCurrentProviderApplyAllowed());
      const statusLine = READ_ONLY_TOOL_MODE === true
        ? (mismatchCount > 0 ? "검토 필요" : "대기/검토 가능")
        : (blocked ? "차단" : mismatchCount > 0 ? "검토 필요" : "대기/적용 가능");
      ui.opsPolicySummary.textContent =
        `정책 요약\n- 상태모델: ACTIVE / CANCELED (NOSHOW는 ACTIVE + anomaly)\n- 현재 판정: ${statusLine}\n- 현재 불일치: ${mismatchCount}건\n- 수기 OTA(STATION/NAVER)는 PMS 누락 오류에서 제외`;
    }
    if (ui.opsRetentionSummary) {
      const reservationCount = Array.isArray(state.providerReservations) ? state.providerReservations.length : 0;
      ui.opsRetentionSummary.textContent =
        `보존 데이터\n- 런타임 예약요약: ${reservationCount}건\n- 유지: 예약번호, OTA, 날짜, 박수, 객실, 이름 정규화, 전화 끝자리, 토큰 해시\n- 폐기: full note/remark, PMS raw payload, HAR raw payload, plain token/cookie`;
    }
    if (ui.opsEvidenceSummary) {
      const anomalyCount = countReservationAuditAnomalies();
      ui.opsEvidenceSummary.textContent =
        `판정 근거\n- exact ID > blocking(날짜/OTA/객실) > soft-match(이름/전화/remark-note token)\n- soft-match 임계값: 7조건 중 3개 이상 + 날짜근거 1개 + OTA/객실 1개\n- audit anomaly: ${anomalyCount}건`;
    }
  }

  function setSecretsMasked(flag) {
    state.secretsMasked = Boolean(flag);
    [ui.cfgAccessToken, ui.cfgRefreshToken, ui.cfgPmsAuthBundle, ui.cfgAuthBundle].forEach((el) => {
      if (!el) return;
      el.classList.toggle("secret-masked", state.secretsMasked);
    });
    if (ui.toggleSecretsBtn) {
      ui.toggleSecretsBtn.textContent = state.secretsMasked ? TEXT.secretMaskOn : TEXT.secretMaskOff;
      ui.toggleSecretsBtn.className = `btn ${state.secretsMasked ? "gray" : "secondary"}`;
    }
  }

  function buildDateKeyFromParts(yearRaw, monthRaw, dayRaw) {
    const year = Number(yearRaw);
    const month = Number(monthRaw);
    const day = Number(dayRaw);
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return "";
    if (month < 1 || month > 12 || day < 1 || day > 31) return "";
    const candidate = new Date(year, month - 1, day);
    if (
      candidate.getFullYear() !== year ||
      candidate.getMonth() !== month - 1 ||
      candidate.getDate() !== day
    ) {
      return "";
    }
    candidate.setHours(0, 0, 0, 0);
    return toDateKey(candidate);
  }

  function parseLooseDateKey(rawValue) {
    const text = normalizeText(rawValue || "");
    if (!text) return "";
    const directMatches = [
      text.match(/(?:^|[^0-9])((?:19|20)\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})(?:\s*일)?(?=$|[^0-9])/),
      text.match(/(?:^|[^0-9])((?:19|20)\d{2})(\d{2})(\d{2})(?=$|[^0-9])/)
    ];
    for (const match of directMatches) {
      if (!match) continue;
      const key = buildDateKeyFromParts(match[1], match[2], match[3]);
      if (key) return key;
    }
    return "";
  }

  function extractLooseDateKeys(rawValue, limit = 2) {
    const text = normalizeText(rawValue || "");
    if (!text) return [];
    const out = [];
    const pushKey = (key) => {
      if (!key || out.includes(key)) return;
      out.push(key);
    };
    const pattern = /((?:19|20)\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})(?:\s*일)?/g;
    let match = null;
    while ((match = pattern.exec(text)) !== null) {
      pushKey(buildDateKeyFromParts(match[1], match[2], match[3]));
      if (out.length >= limit) return out;
    }
    const compactPattern = /((?:19|20)\d{2})(\d{2})(\d{2})/g;
    while ((match = compactPattern.exec(text)) !== null) {
      pushKey(buildDateKeyFromParts(match[1], match[2], match[3]));
      if (out.length >= limit) return out;
    }
    return out;
  }

  function readElementDateHints(el) {
    if (!el) return [];
    const values = [];
    const pushValue = (value) => {
      const text = normalizeText(value || "");
      if (!text) return;
      if (text.length > 120) return;
      if (!values.includes(text)) values.push(text);
    };
    pushValue(el.value);
    pushValue(el.textContent);
    pushValue(el.getAttribute?.("aria-label"));
    pushValue(el.getAttribute?.("title"));
    pushValue(el.getAttribute?.("placeholder"));
    if (el.dataset && typeof el.dataset === "object") {
      Object.values(el.dataset).forEach((value) => pushValue(value));
    }
    return values;
  }

  function normalizeRangeParamKey(keyRaw) {
    return normalizeText(keyRaw || "").replace(/[_\-\s]/g, "").toLowerCase();
  }

  function tryReadHostRangeFromLocation() {
    let url = null;
    try {
      url = new URL(location.href);
    } catch (_err) {
      return null;
    }
    const startKeys = new Set(["startdate", "fromdate", "checkin", "begindate", "datefrom", "searchstartdate", "sdate"]);
    const endKeys = new Set(["enddate", "todate", "checkout", "finishdate", "dateto", "searchenddate", "edate"]);
    const findFromParams = (params, targetKeys) => {
      for (const [key, value] of params.entries()) {
        if (!targetKeys.has(normalizeRangeParamKey(key))) continue;
        const parsed = parseLooseDateKey(value);
        if (parsed) return parsed;
      }
      return "";
    };
    const startDate = findFromParams(url.searchParams, startKeys);
    const endDate = findFromParams(url.searchParams, endKeys);
    if (startDate && endDate) {
      return { startDate, endDate, source: "url" };
    }
    const hashQueryIndex = String(url.hash || "").indexOf("?");
    if (hashQueryIndex >= 0) {
      const hashParams = new URLSearchParams(String(url.hash || "").slice(hashQueryIndex + 1));
      const hashStart = findFromParams(hashParams, startKeys);
      const hashEnd = findFromParams(hashParams, endKeys);
      if (hashStart && hashEnd) {
        return { startDate: hashStart, endDate: hashEnd, source: "url" };
      }
    }
    const joinedParamValues = [];
    url.searchParams.forEach((value) => joinedParamValues.push(value));
    if (hashQueryIndex >= 0) {
      const hashParams = new URLSearchParams(String(url.hash || "").slice(hashQueryIndex + 1));
      hashParams.forEach((value) => joinedParamValues.push(value));
    }
    for (const value of joinedParamValues) {
      const keys = extractLooseDateKeys(value, 2);
      if (keys.length >= 2) {
        return { startDate: keys[0], endDate: keys[1], source: "url" };
      }
    }
    return null;
  }

  function collectDateKeysFromSelectors(selectors, limit = 6) {
    const out = [];
    selectors.forEach((selector) => {
      const nodes = document.querySelectorAll(selector);
      nodes.forEach((el) => {
        readElementDateHints(el).forEach((value) => {
          const key = parseLooseDateKey(value);
          if (!key || out.includes(key)) return;
          out.push(key);
        });
      });
    });
    return out.slice(0, limit);
  }

  function tryReadHostRangeFromDom() {
    const datasetRangeEl = document.querySelector("[data-start-date][data-end-date]");
    if (datasetRangeEl) {
      const startDate = parseLooseDateKey(datasetRangeEl.getAttribute("data-start-date"));
      const endDate = parseLooseDateKey(datasetRangeEl.getAttribute("data-end-date"));
      if (startDate && endDate) {
        return { startDate, endDate, source: "dom" };
      }
    }

    const startCandidates = collectDateKeysFromSelectors([
      'input[name*="start" i]',
      'input[id*="start" i]',
      'input[name*="from" i]',
      'input[id*="from" i]',
      'input[name*="checkin" i]',
      'input[id*="checkin" i]',
      'input[name*="date" i][name*="start" i]',
      'input[id*="date" i][id*="start" i]'
    ]);
    const endCandidates = collectDateKeysFromSelectors([
      'input[name*="end" i]',
      'input[id*="end" i]',
      'input[name*="to" i]',
      'input[id*="to" i]',
      'input[name*="checkout" i]',
      'input[id*="checkout" i]',
      'input[name*="date" i][name*="end" i]',
      'input[id*="date" i][id*="end" i]'
    ]);
    if (startCandidates.length > 0 && endCandidates.length > 0) {
      return { startDate: startCandidates[0], endDate: endCandidates[0], source: "dom" };
    }

    const combinedSelectors = [
      '[class*="range" i]',
      '[id*="range" i]',
      '[class*="period" i]',
      '[id*="period" i]',
      '[class*="date" i]',
      '[id*="date" i]',
      '[aria-label*="기간"]',
      '[aria-label*="날짜"]',
      '[title*="기간"]',
      '[title*="날짜"]'
    ];
    for (const selector of combinedSelectors) {
      const nodes = document.querySelectorAll(selector);
      for (const el of nodes) {
        for (const value of readElementDateHints(el)) {
          const keys = extractLooseDateKeys(value, 2);
          if (keys.length >= 2) {
            return { startDate: keys[0], endDate: keys[1], source: "dom" };
          }
        }
      }
    }
    return null;
  }

  function readDateRangeFromHost() {
    return tryReadHostRangeFromLocation() || tryReadHostRangeFromDom() || null;
  }

  function syncSelectedRangeFromHost(options = {}) {
    const hostRange = readDateRangeFromHost();
    if (!hostRange?.startDate || !hostRange?.endDate) return false;
    setSelectedRangeFromDates(hostRange.startDate, hostRange.endDate, {
      source: "host",
      sourceDetail: hostRange.source || "dom",
      emit: options.emit === true,
      silent: options.silent !== false
    });
    return true;
  }

  function setSelectedRangeFromDates(startDate, endDate, options = {}) {
    const start = startDate instanceof Date ? startDate : new Date(startDate);
    const end = endDate instanceof Date ? endDate : new Date(endDate);
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    let startKey = toDateKey(start);
    let endKey = toDateKey(end);
    if (endKey < startKey) {
      const tmp = startKey;
      startKey = endKey;
      endKey = tmp;
    }
    state.selectedStart = startKey;
    state.selectedEnd = endKey;
    state.rangeSource = options.source === "host" ? "host" : "shell";
    state.rangeSourceDetail = normalizeText(options.sourceDetail || (state.rangeSource === "host" ? "dom" : "manual")) || (state.rangeSource === "host" ? "dom" : "manual");
    const firstDay = fromDateKey(startKey);
    if (firstDay) state.monthCursor = monthStart(firstDay);
    renderCalendar();
    renderWorkspaceShellState();
    if (options.silent !== true || options.emit === true) {
      emitUiEvent("date_range_change", {
        startDate: state.selectedStart || "",
        endDate: state.selectedEnd || ""
      });
    }
  }

  function applyQuickRange(type) {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    if (type === "2d") {
      setSelectedRangeFromDates(now, addDays(now, 1));
      return;
    }
    if (type === "7d") {
      setSelectedRangeFromDates(now, addDays(now, 6));
      return;
    }
    const monthFirst = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthLast = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    setSelectedRangeFromDates(monthFirst, monthLast);
  }

  function formatStatusLogTime(date = new Date()) {
    const hh = String(date.getHours()).padStart(2, "0");
    const mm = String(date.getMinutes()).padStart(2, "0");
    const ss = String(date.getSeconds()).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  }

  function appendStatusLog(message, kind = "info") {
    const msg = String(message ?? "");
    if (!msg) return;
    const levelRaw = normalizeText(kind || "info").toLowerCase();
    const level = levelRaw === "warn" || levelRaw === "error" ? levelRaw : "info";
    state.statusLogs.push({
      time: formatStatusLogTime(),
      level,
      label: level.toUpperCase(),
      message: msg
    });
    const overflow = state.statusLogs.length - 200;
    if (overflow > 0) state.statusLogs.splice(0, overflow);
  }

  function renderDebugPanel() {
    if (!ui.debugWrap || !ui.debugDiag || !ui.debugLog) return;
    const logCount = Number(state.statusLogs?.length || 0);
    if (ui.toggleDebugBtn) {
      ui.toggleDebugBtn.textContent = `${TEXT.debugToggle} (${logCount})`;
    }
    ui.debugDiag.textContent = String(state.debugDetails || "-");
    const logs = Array.isArray(state.statusLogs) ? state.statusLogs : [];
    if (!logs.length) {
      ui.debugLog.innerHTML = `<div class="debug-log-empty">-</div>`;
      return;
    }
    ui.debugLog.innerHTML = logs
      .slice()
      .reverse()
      .map(
        (row) =>
          `<div class="debug-log-row">` +
          `<span>${escapeHtml(row.time)}</span>` +
          `<span class="k ${escapeHtml(row.level)}">${escapeHtml(row.label)}</span>` +
          `<span>${escapeHtml(row.message)}</span>` +
          `</div>`
      )
      .join("");
  }

  function setDebugExpanded(flag, options = {}) {
    if (flag) openEvidenceTab("trace");
    else if (state.secondarySurfaceKind === "evidence" && state.activeEvidenceTab === "trace") openEvidenceTab("result");
    state.debugExpanded = Boolean(flag);
    renderDebugPanel();
    renderWorkspaceShellState();
  }

  function setDebugDetails(text) {
    const msg = redactSensitiveText(text).trim();
    state.debugDetails = msg || "-";
    renderDebugPanel();
  }

  function clearSeverityBanner() {
    if (!ui.severityBanner || !ui.severityPill || !ui.severityText) return;
    ui.severityBanner.classList.add("hidden");
    ui.severityBanner.classList.remove("warn");
    ui.severityPill.textContent = TEXT.severityApi;
    ui.severityText.textContent = "-";
  }

  function setSeverityBanner(levelRaw, pillText, message) {
    if (!ui.severityBanner || !ui.severityPill || !ui.severityText) return;
    const level = levelRaw === "warn" ? "warn" : "error";
    const text = redactSensitiveText(message).trim() || "-";
    ui.severityBanner.classList.remove("hidden");
    ui.severityBanner.classList.toggle("warn", level === "warn");
    ui.severityPill.textContent = normalizeText(pillText || "") || (level === "warn" ? TEXT.severityApi : TEXT.severityToken);
    ui.severityText.textContent = text;
  }

  function classifySeverityBannerStatus(message, tone) {
    const text = normalizeText(message || "").toLowerCase();
    if (!text || tone === "info") return null;
    const tokenRe = /(token|토큰|만료|expired|refresh|access|401|403|unauthoriz|forbidden|인증)/;
    if (tokenRe.test(text)) {
      return { level: "error", pill: TEXT.severityToken };
    }
    const apiRe = /(api|호출 실패|요청 실패|request failed|network|timeout|\(\d{3}\))/;
    if (apiRe.test(text)) {
      return { level: tone === "warn" ? "warn" : "error", pill: TEXT.severityApi };
    }
    return null;
  }

  function classifyUiSurfaceStatus(tone, textRaw) {
    const text = normalizeText(textRaw || "").toLowerCase();
    if (tone === "error") return { label: "오류", className: "error" };
    if (tone === "warn") return { label: "주의", className: "warn" };
    if (/(조회 중|처리 중|loading|syncing|실행 중|적용 중)/.test(text)) {
      return { label: "조회 중", className: "loading" };
    }
    return { label: "정상", className: "" };
  }

  function updateSurfaceStatusIndicators(tone, text) {
    const statusUi = classifyUiSurfaceStatus(tone, text);
    if (ui.headerStatusPill) {
      ui.headerStatusPill.textContent = statusUi.label;
      ui.headerStatusPill.classList.remove("warn", "error", "loading");
      if (statusUi.className) ui.headerStatusPill.classList.add(statusUi.className);
    }
  }

  function setStatus(message, kind = "info") {
    const tone = kind === "warn" || kind === "error" ? kind : "info";
    const text = redactSensitiveText(message).trim() || "-";
    const toneLabel = tone === "error" ? "ERROR" : tone === "warn" ? "WARN" : "INFO";
    state.lastStatusTone = tone;
    ui.status.className = `status ${tone === "info" ? "" : tone}`.trim();
    ui.status.setAttribute("aria-live", tone === "error" ? "assertive" : "polite");
    ui.status.innerHTML = `<span class="status-k">${toneLabel}</span><span class="status-msg">${escapeHtml(text).replace(/\n/g, "<br>")}</span>`;
    updateSurfaceStatusIndicators(tone, text);
    const banner = classifySeverityBannerStatus(text, tone);
    if (banner) setSeverityBanner(banner.level, banner.pill, text);
    else clearSeverityBanner();
    appendStatusLog(text, tone);
    renderDebugPanel();
    renderWorkflowProgress();
    renderUserOpsSummary();
    renderOpsMetaSummary();
    renderWorkspaceShellState();
  }

  async function loadSyncApplyEnabled() {
    if (READ_ONLY_TOOL_MODE === true) return false;
    const next = await storageGet(SYNC_APPLY_KEY);
    if (typeof next === "boolean") return next;
    const legacy = await storageGet(SYNC_FEATURE_KEY_LEGACY);
    return legacy !== false;
  }

  function isSyncApplyEnabled() {
    if (READ_ONLY_TOOL_MODE === true) return false;
    return state.syncApplyEnabled !== false;
  }

  function updateSyncFeatureButtonText() {
    if (!ui.syncFeatureToggle) return;
    if (READ_ONLY_TOOL_MODE === true) {
      ui.syncFeatureToggle.textContent = TEXT.syncFeatureOff;
      ui.syncFeatureToggle.className = "btn gray hidden";
      return;
    }
    ui.syncFeatureToggle.textContent = isSyncApplyEnabled() ? TEXT.syncFeatureOn : TEXT.syncFeatureOff;
    ui.syncFeatureToggle.className = isSyncApplyEnabled() ? "btn" : "btn gray";
  }

  function applySyncFeatureUiState() {
    const busy = Boolean(state.loading);
    const enabled = isSyncApplyEnabled();
    const readonlyMode = READ_ONLY_TOOL_MODE === true;
    const providerApplyAllowed = readonlyMode ? false : isCurrentProviderApplyAllowed();
    const activeQuery = resolveActiveQuery();
    const hasLoadedPair = hasLoadedBothInventoryForQuery(activeQuery);
    if (!enabled) state.syncApprovalChecked = false;
    updateSyncApprovalUi();
    const approvalReady = readonlyMode ? true : isSyncApprovalReady();
    ui.syncFeatureSection.classList.toggle("hidden", !enabled && !readonlyMode);
    if (ui.syncFeatureToggle) {
      ui.syncFeatureToggle.disabled = readonlyMode ? true : busy;
      ui.syncFeatureToggle.classList.toggle("hidden", readonlyMode);
    }
    ui.syncBtn.disabled = busy || !hasLoadedPair || (!readonlyMode && (!enabled || !approvalReady || !providerApplyAllowed));
    ui.toggleConfig.disabled = busy;
    ui.saveSyncCfg.disabled = busy;
    if (ui.toggleOpsSectionBtn) ui.toggleOpsSectionBtn.disabled = busy;
    if (ui.cfgProviderApply) {
      ui.cfgProviderApply.disabled = true;
      const applyField = ui.cfgProviderApply.closest(".field");
      if (applyField) applyField.classList.toggle("hidden", readonlyMode);
    }
    if (ui.toggleSecretsBtn) ui.toggleSecretsBtn.disabled = busy;
    const errorCount = Number(state.syncPreview?.errorCount || 0);
    ui.toggleErrorBtn.disabled = busy || errorCount <= 0;
    ui.toggleDebugBtn.disabled = busy;
    if (ui.clearRuntimeBtn) ui.clearRuntimeBtn.disabled = busy;
    ui.exportTraceJson.disabled = busy;
    ui.exportTraceCsv.disabled = busy;
    if (ui.exportGoldenSetBtn) ui.exportGoldenSetBtn.disabled = busy;
    if (!enabled && !readonlyMode && state.settingsOpen) setSettingsOpen(false);
    if (!enabled && !readonlyMode && state.debugExpanded) setDebugExpanded(false);
    if (!enabled && !readonlyMode && state.syncResultVisible) setSyncResultVisible(false);
    updateSyncFeatureButtonText();
    renderWorkflowProgress();
    renderUserOpsSummary();
    renderOpsMetaSummary();
    renderWorkspaceShellState();
  }

  function hasLoadedInventoryForCorrection() {
    const hasSiteRows = Boolean(state.query && Array.isArray(state.rows) && state.rows.length > 0);
    const hasSheetRows = Boolean(state.sheetSnapshot && state.sheetQuery);
    return hasSiteRows || hasSheetRows;
  }

  function hasLoadedSiteInventoryForQuery(query) {
    return Boolean(
      query &&
      state.query &&
      isSameQuery(query, state.query) &&
      Array.isArray(state.rows) &&
      state.rows.length > 0
    );
  }

  function hasLoadedSheetInventoryForQuery(query) {
    return Boolean(
      query &&
      state.sheetQuery &&
      isSameQuery(query, state.sheetQuery) &&
      state.sheetSnapshot
    );
  }

  function hasLoadedBothInventoryForQuery(query) {
    return hasLoadedSiteInventoryForQuery(query) && hasLoadedSheetInventoryForQuery(query);
  }

  function activeProviderKey() {
    return inventoryProviderKeyFor(context.providerType);
  }

  function clearCorrectionArtifacts() {
    state.correctionAppliedAt = "";
    state.correctionAppliedCount = 0;
    state.correctionDiffCsv = "";
    state.correctionDiffCount = 0;
  }

  function updateCorrectionBadge() {
    if (!ui.correctionBadge) return;
    const applied = state.correctionsApplied === true;
    if (!applied || !state.correctionAppliedAt) {
      ui.correctionBadge.classList.add("hidden");
      ui.correctionBadge.textContent = "보정 이력\n- 적용 이력 없음";
      return;
    }
    const appliedAtText = normalizeText(state.correctionAppliedAt || "");
    const correctedCount = Number(state.correctionAppliedCount || 0);
    const diffCount = Number(state.correctionDiffCount || 0);
    ui.correctionBadge.textContent =
      `보정 이력\n- 적용 시각: ${appliedAtText}\n- 수정 셀: ${correctedCount}건\n- diff: ${diffCount}건`;
    ui.correctionBadge.classList.remove("hidden");
  }

  function collectUnknownColorRowsFromSnapshot(snapshot, providerKey) {
    const rows = [];
    const seen = new Set();
    const diagnostics = snapshot?.derivedCorrections?.[providerKey]?.diagnostics || {};
    const unknownCells = Array.isArray(diagnostics?.unknownColorCells) ? diagnostics.unknownColorCells : [];

    const pushRow = (row) => {
      const date = normalizeText(row?.date || "");
      const rowNo = Number(row?.row || 0);
      const colNo = Number(row?.col || 0);
      const colA1 = normalizeText(row?.colA1 || "");
      const roomNo = normalizeText(row?.roomNo || "");
      const roomType = normalizeText(row?.roomType || "");
      const colorHex = normalizeText(row?.colorHex || "");
      const errorCode = normalizeText(row?.errorCode || "");
      const key = `${date}::${rowNo}::${colNo}::${roomNo}::${colorHex}::${errorCode}`;
      if (seen.has(key)) return;
      seen.add(key);
      rows.push({
        provider: providerKey,
        date,
        row: rowNo > 0 ? rowNo : "",
        col: colNo > 0 ? colNo : "",
        colA1,
        roomNo,
        roomType,
        colorHex,
        errorCode
      });
    };

    unknownCells.forEach(pushRow);

    if (!rows.length) {
      const fallbackBlocks = Array.isArray(snapshot?.reservationBlocks) ? snapshot.reservationBlocks : [];
      fallbackBlocks.forEach((block) => {
        if (normalizeText(block?.channel || "").toUpperCase() !== "UNKNOWN") return;
        const day = normalizeText(block?.startDate || "");
        const rowNo = Number(block?.row || 0);
        const colNo = Number(block?.startCol || 0);
        pushRow({
          date: day,
          row: rowNo,
          col: colNo,
          colA1: normalizeText(block?.startColA1 || ""),
          roomNo: normalizeText(block?.roomNo || ""),
          roomType: normalizeText(block?.roomType || ""),
          colorHex: "",
          errorCode: "UNKNOWN_COLOR(FALLBACK)"
        });
      });
    }

    return rows.sort((a, b) => {
      const d = String(a.date).localeCompare(String(b.date));
      if (d !== 0) return d;
      const r = Number(a.row || 0) - Number(b.row || 0);
      if (r !== 0) return r;
      return Number(a.col || 0) - Number(b.col || 0);
    });
  }

  function updateCorrectionButtonState() {
    const applyButtons = [ui.applyCorrectionBtn, ui.applyCorrectionSiteBtn].filter(Boolean);
    const applied = state.correctionsApplied === true;
    const canApply = hasLoadedInventoryForCorrection();
    const hasSheet = Boolean(state.sheetSnapshot && state.sheetQuery);
    const providerKey = activeProviderKey();
    const unknownColorRows = hasSheet ? collectUnknownColorRowsFromSnapshot(state.sheetSnapshot, providerKey) : [];

    applyButtons.forEach((button) => {
      button.textContent = applied ? "보정 미리보기 적용됨" : "보정 미리보기";
      button.disabled = Boolean(state.loading) || !canApply || applied;
      button.className = `btn ${applied ? "gray" : "secondary"}`;
    });

    if (ui.downloadCorrectionDiffBtn) {
      const hasDiff = normalizeText(state.correctionDiffCsv || "").length > 0 && Number(state.correctionDiffCount || 0) > 0;
      ui.downloadCorrectionDiffBtn.disabled = Boolean(state.loading) || !hasDiff;
      ui.downloadCorrectionDiffBtn.className = `btn ${hasDiff ? "secondary" : "gray"}`;
      ui.downloadCorrectionDiffBtn.textContent = hasDiff
        ? `보정 diff CSV (${Number(state.correctionDiffCount || 0)})`
        : "보정 diff CSV";
    }

    if (ui.exportUnknownColorBtn) {
      const hasUnknownColor = Array.isArray(unknownColorRows) && unknownColorRows.length > 0;
      ui.exportUnknownColorBtn.disabled = Boolean(state.loading) || !hasUnknownColor;
      ui.exportUnknownColorBtn.className = `btn ${hasUnknownColor ? "secondary" : "gray"}`;
      ui.exportUnknownColorBtn.textContent = hasUnknownColor
        ? `미인식 색상 CSV (${unknownColorRows.length})`
        : "미인식 색상 CSV";
    }
    updateCorrectionBadge();
    renderUserOpsSummary();
    renderOpsMetaSummary();
  }

  function setCorrectionsApplied(flag) {
    state.correctionsApplied = Boolean(flag);
    if (!state.correctionsApplied) clearCorrectionArtifacts();
    updateCorrectionButtonState();
  }

  async function setSyncFeatureEnabled(flag, showMessage = true) {
    if (READ_ONLY_TOOL_MODE === true) {
      state.syncApplyEnabled = false;
      await storageSet(SYNC_APPLY_KEY, false);
      applySyncFeatureUiState();
      updateSyncApprovalUi({ reset: true });
      updateSyncButtonText();
      if (showMessage) {
        setStatus(TEXT.statusSyncFeatureDisabled);
        ui.status.classList.add("ok");
      }
      return;
    }
    const enabled = Boolean(flag);
    state.syncApplyEnabled = enabled;
    await storageSet(SYNC_APPLY_KEY, enabled);

    applySyncFeatureUiState();
    updateSyncApprovalUi({ reset: true });
    updateSyncButtonText();

    if (showMessage) {
      setStatus(enabled ? TEXT.statusSyncFeatureEnabled : TEXT.statusSyncFeatureDisabled);
      ui.status.classList.add("ok");
    }
  }

  function setElementDisabled(el, flag) {
    if (el) el.disabled = flag;
  }

  function setActionLoadingState(button, flag) {
    if (!button) return;
    const busy = Boolean(flag);
    button.classList.toggle("is-loading", busy);
    button.setAttribute("aria-busy", busy ? "true" : "false");
  }

  function updateLoadActionButtons() {
    const action = normalizeText(state.loadingAction || "").toLowerCase();
    const loading = Boolean(state.loading);
    setActionLoadingState(ui.load, loading && action === "site");
    setActionLoadingState(ui.loadSheet, loading && action === "sheet");
    setActionLoadingState(ui.loadAll, loading && action === "all");
  }

  function setLoadingAction(action) {
    state.loadingAction = normalizeText(action || "");
    updateLoadActionButtons();
  }

  function getEmbeddedLockedControls() {
    return [ui.cfgClientId, ui.cfgClientSecret, ui.cfgAccessToken, ui.cfgRefreshToken];
  }

  function getLoadingPrimaryControls() {
    return [
      ui.load,
      ui.loadAll,
      ui.loadSheet,
      ui.applyCorrectionSiteBtn,
      ui.applyCorrectionBtn,
      ui.copySite,
      ui.copySheet,
      ui.prevMonth,
      ui.nextMonth,
      ui.presetRange2d,
      ui.presetRange7d,
      ui.presetRangeMonth,
      ui.saveSyncCfg,
      ui.cfgManualRangeSampleBtn,
      ui.toggleConfig,
      ui.syncBtn
    ];
  }

  function getLoadingConfigControls() {
    return [
      ui.cfgSpreadsheet,
      ui.cfgSheetName,
      ui.cfgStartRow,
      ui.cfgYear,
      ui.cfgStockMode,
      ui.cfgAllowPkgInventoryRows,
      ui.cfgScanMode,
      ui.cfgDateAnchorRow,
      ui.cfgManualRanges,
      ui.cfgClientId,
      ui.cfgClientSecret,
      ui.cfgAccessToken,
      ui.cfgRefreshToken,
      ui.cfgAuthBundle
    ];
  }

  function getLoadingAuxControls() {
    return [
      ui.exportTraceJson,
      ui.exportTraceCsv,
      ui.exportGoldenSetBtn,
      ui.captureAuthBundleBtn,
      ui.copyAuthBundleBtn,
      ui.cfgPmsHarConvertBtn,
      ui.clearRuntimeBtn
    ];
  }

  function setLoading(flag) {
    state.loading = flag;
    if (!flag) state.loadingAction = "";
    updateLoadActionButtons();
    getLoadingPrimaryControls().forEach((el) => {
      setElementDisabled(el, flag);
    });
    const embeddedLocked = new Set(getEmbeddedLockedControls());
    getLoadingConfigControls().forEach((el) => {
      if (!el) return;
      if (!flag && EMBEDDED_AUTH_MODE && embeddedLocked.has(el)) {
        el.disabled = true;
      } else {
        el.disabled = flag;
      }
    });
    getLoadingAuxControls().forEach((el) => {
      setElementDisabled(el, flag);
    });
    if (!flag) updateScanModeUiState();
    applySyncFeatureUiState();
    updateSyncButtonText();
    updateCorrectionButtonState();
    renderSupportPolicySurface();
    renderUserOpsSummary();
    renderOpsMetaSummary();
    renderWorkspaceShellState();
  }

  function formatPickedText() {
    if (!state.selectedStart && !state.selectedEnd) return TEXT.selectedNone;
    if (state.selectedStart && !state.selectedEnd) {
      return TEXT.selectedPendingEnd.replace("{start}", state.selectedStart);
    }
    return TEXT.selectedRange.replace("{start}", state.selectedStart).replace("{end}", state.selectedEnd);
  }

  function isWithin(dateKey, start, end) {
    if (!start || !end) return false;
    return dateKey >= start && dateKey <= end;
  }

  function isSameQuery(a, b) {
    return (
      a &&
      b &&
      String(a.startDate || "") === String(b.startDate || "") &&
      String(a.endDate || "") === String(b.endDate || "")
    );
  }

  function resolveCopyTemplateRows(query, providerType) {
    const providerKey = inventoryProviderKeyFor(providerType);
    if (!providerKey) return [];
    if (!query || !state.sheetSnapshot || !state.sheetQuery || !isSameQuery(query, state.sheetQuery)) return [];
    const rows = state.sheetSnapshot?.inventoryDataRows?.[providerKey];
    return Array.isArray(rows) ? rows : [];
  }

  function renderCalendar() {
    ui.monthLabel.textContent = monthLabel(state.monthCursor);
    ui.pickedText.textContent = formatPickedText();
    ui.dateGrid.textContent = "";
    ui.dateGrid.classList.toggle("range-complete", Boolean(state.selectedStart && state.selectedEnd));

    const first = monthStart(state.monthCursor);
    const offset = first.getDay();
    const gridStart = addDays(first, -offset);
    for (let i = 0; i < 42; i += 1) {
      const date = addDays(gridStart, i);
      const key = toDateKey(date);
      const btn = document.createElement("button");
      btn.className = "day";
      btn.textContent = String(date.getDate());
      if (date.getMonth() !== state.monthCursor.getMonth()) btn.classList.add("other");
      if (date.getDay() === 0) btn.classList.add("sun");
      if (date.getDay() === 6) btn.classList.add("sat");
      if (isWithin(key, state.selectedStart, state.selectedEnd)) btn.classList.add("range");
      if (state.selectedStart === key) btn.classList.add("start");
      if (state.selectedEnd === key) btn.classList.add("end");
      btn.addEventListener("click", () => onDateClick(key));
      btn.addEventListener("dblclick", (event) => {
        event.preventDefault();
        onDateDoubleClick(key);
      });
      ui.dateGrid.appendChild(btn);
    }
    updateSyncApprovalUi();
  }

  function onDateClick(dateKey) {
    state.rangeSource = "shell";
    state.rangeSourceDetail = "manual";
    if (!state.selectedStart || (state.selectedStart && state.selectedEnd)) {
      state.selectedStart = dateKey;
      state.selectedEnd = null;
    } else if (dateKey < state.selectedStart) {
      state.selectedEnd = state.selectedStart;
      state.selectedStart = dateKey;
    } else {
      state.selectedEnd = dateKey;
    }
    renderCalendar();
    renderWorkspaceShellState();
    if (state.selectedStart && state.selectedEnd) {
      emitUiEvent("date_range_change", {
        startDate: state.selectedStart,
        endDate: state.selectedEnd
      });
    }
  }

  function onDateDoubleClick(dateKey) {
    state.rangeSource = "shell";
    state.rangeSourceDetail = "manual";
    state.selectedStart = dateKey;
    state.selectedEnd = dateKey;
    renderCalendar();
    renderWorkspaceShellState();
    emitUiEvent("date_range_change", {
      startDate: state.selectedStart,
      endDate: state.selectedEnd
    });
  }

  function resetDateRange() {
    state.selectedStart = null;
    state.selectedEnd = null;
    state.rangeSource = "shell";
    state.rangeSourceDetail = "cleared";
    state.query = null;
    state.rows = [];
    state.providerReservations = [];
    state.providerReservationMeta = null;
    state.dates = [];
    state.valueRows = [];
    state.sheetQuery = null;
    state.sheetSnapshot = null;
    state.sheetDates = [];
    state.sheetValueRows = [];
    state.verificationReport = null;
    setCorrectionsApplied(false);
    state.syncPreview = { mismatchCount: 0 };
    state.syncApprovalChecked = false;
    state.syncApprovalFingerprint = "";
    renderCalendar();
    renderSummary([]);
    renderSiteValueTable([], []);
    renderSheetValueTable([], []);
    clearSheetInsightPanel();
    renderMismatchRows([], null);
    state.verificationReport = createVerificationReport();
    renderInventoryVerification(state.verificationReport);
    renderSyncResult({ totalCount: 0, successCount: 0, failCount: 0, closedCount: 0, errors: [] });
    setSyncResultVisible(false);
    setErrorExpanded(false);
    updateSyncApprovalUi({ reset: true });
    updateSyncButtonText();
    setStatus(TEXT.statusDateReset);
  }

  function getSelectedQuery() {
    syncSelectedRangeFromHost({ emit: false, silent: true });
    if (!state.selectedStart || !state.selectedEnd) {
      throw new Error(TEXT.statusSelectRange);
    }
    return { startDate: state.selectedStart, endDate: state.selectedEnd };
  }

  function renderSummary(rows) {
    const open = rows.filter((row) => row.openStatus === "OPEN").length;
    const closed = rows.filter((row) => row.openStatus === "CLOSED").length;
    ui.sumRows.textContent = String(rows.length);
    ui.sumOpen.textContent = String(open);
    ui.sumClosed.textContent = String(closed);
    ui.sumPeriod.textContent = state.query ? `${state.query.startDate} ~ ${state.query.endDate}` : TEXT.noPeriod;
    renderUserOpsSummary();
    renderOpsMetaSummary();
    renderWorkspaceShellState();
  }

  function renderSheetSummary(query, snapshot) {
    const providerKey = inventoryProviderKeyFor();
    const diagnostics = snapshot?.derivedCorrections?.[providerKey]?.diagnostics || {};
    const roomRows = Number(diagnostics?.roomRows || 0);
    ui.sumRows.textContent = String(roomRows > 0 ? roomRows : (state.sheetValueRows || []).length || 0);
    ui.sumOpen.textContent = "-";
    ui.sumClosed.textContent = "-";
    ui.sumPeriod.textContent = query ? `${query.startDate} ~ ${query.endDate}` : TEXT.noPeriod;
    renderUserOpsSummary();
    renderOpsMetaSummary();
    renderWorkspaceShellState();
  }

  function clearSheetInsightPanel(noteText = "자동보정 이슈 요약\n- 상태: 대기") {
    if (ui.sheetInsightWrap) ui.sheetInsightWrap.classList.add("hidden");
    if (ui.insightTitle) ui.insightTitle.textContent = "시트 객실별 예약 카운트";
    if (ui.insightHead) {
      ui.insightHead.innerHTML = `<tr><th class="room-col">${TEXT.roomLabel}</th></tr>`;
    }
    if (ui.insightBody) {
      ui.insightBody.innerHTML = `<tr class="table-empty"><td colspan="1">${TEXT.tableHintNoData}</td></tr>`;
    }
    if (ui.correctionIssueHint) {
      ui.correctionIssueHint.classList.remove("warn");
      ui.correctionIssueHint.textContent = noteText;
    }
  }

  function classifyTypeKeyForRoom(roomName, roomTypeMap, roomId) {
    const mapped = normalizeText(roomTypeMap?.[roomId] || "");
    if (mapped) return normalizeRoomTypeKeyForSummary(mapped);
    return normalizeRoomTypeKeyForSummary(roomName);
  }

  function buildReservationCountIndex(snapshot, dateSet = null) {
    const out = {};
    const blocks = Array.isArray(snapshot?.reservationBlocks) ? snapshot.reservationBlocks : [];
    blocks.forEach((block) => {
      if (normalizeText(block?.kind || "").toUpperCase() !== "RESERVATION") return;
      const channel = normalizeText(block?.channel || "").toUpperCase();
      if (channel !== "NAVER" && channel !== "STATION") return;
      const typeKey = normalizeRoomTypeKeyForSummary(block?.roomTypeKey || block?.roomType || "");
      const dateKeys = Array.isArray(block?.dateKeys) ? block.dateKeys : [];
      dateKeys.forEach((dayRaw) => {
        const day = normalizeText(dayRaw || "");
        if (!day) return;
        if (dateSet && !dateSet.has(day)) return;
        const key = `${typeKey}::${day}`;
        if (!out[key]) out[key] = { NAVER: 0, STATION: 0 };
        out[key][channel] += 1;
      });
    });
    return out;
  }

  function buildSheetReservationInsightRows(snapshot, dates, roomPreset, providerKey) {
    const roomTypeMap = snapshot?.derivedCorrections?.[providerKey]?.roomTypeMap || {};
    const safeDates = Array.isArray(dates) ? dates.filter(Boolean) : [];
    const dateSet = safeDates.length > 0 ? new Set(safeDates) : null;
    const reservationCountIndex = buildReservationCountIndex(snapshot, dateSet);
    const activeChannel = providerKey === "STATION" ? "STATION" : "NAVER";
    const rows = (Array.isArray(roomPreset) ? roomPreset : []).map((room) => {
      const roomId = String(room?.id || "");
      const roomName = String(room?.name || roomId || "");
      const roomTypeKey = classifyTypeKeyForRoom(roomName, roomTypeMap, roomId);
      return {
        roomId,
        roomName,
        cells: safeDates.map((day) => {
          const stat = reservationCountIndex[`${roomTypeKey}::${day}`] || { NAVER: 0, STATION: 0 };
          const activeCount = Number(stat?.[activeChannel] || 0);
          const hasAny = activeCount > 0;
          return {
            text: String(activeCount),
            className: hasAny ? "warn-cell" : "",
            tooltip: `${activeChannel} ${activeCount}`
          };
        })
      };
    });
    return rows;
  }

  function summarizeCorrectionReasons(valueRows, dates, scopeLabel = "SHEET") {
    const safeRows = Array.isArray(valueRows) ? valueRows : [];
    const safeDates = Array.isArray(dates) ? dates : [];
    const reasonMap = new Map();
    const samples = [];
    safeRows.forEach((row) => {
      const roomName = normalizeText(row?.roomName || row?.roomId || "-") || "-";
      const cells = Array.isArray(row?.cells) ? row.cells : [];
      cells.forEach((cell, idx) => {
        if (!tableCellIsCorrected(cell)) return;
        const reason = normalizeText(cell?.reason || "AUTO_CORRECTED") || "AUTO_CORRECTED";
        reasonMap.set(reason, Number(reasonMap.get(reason) || 0) + 1);
        if (samples.length < 6) {
          const day = normalizeText(safeDates[idx] || "-") || "-";
          const before = normalizeDisplayInventoryValue(cell?.originalRaw || "");
          const after = normalizeDisplayInventoryValue(tableCellDisplayText(cell));
          samples.push(`${scopeLabel} ${day} ${roomName}: ${before || "-"} -> ${after || "-"} (${reason})`);
        }
      });
    });
    return {
      counts: Object.fromEntries(reasonMap.entries()),
      samples
    };
  }

  function renderSheetInsightPanel(snapshot, dates, valueRows, providerKey) {
    if (!snapshot || !Array.isArray(dates) || dates.length <= 0) {
      clearSheetInsightPanel();
      return;
    }
    const providerType = providerKey === "STATION" ? "admin-station" : "naver-partner";
    const providerLabel = providerKey === "STATION" ? "STATION" : "NAVER";
    const roomPreset = ROOM_PRESETS[providerType] || ROOM_PRESETS[context.providerType] || [];
    const insightRows = buildSheetReservationInsightRows(snapshot, dates, roomPreset, providerKey);
    if (ui.insightTitle) ui.insightTitle.textContent = `시트 객실별 예약 카운트 (${providerLabel})`;
    renderTable(ui.insightHead, ui.insightBody, dates, insightRows);
    if (ui.sheetInsightWrap) ui.sheetInsightWrap.classList.remove("hidden");

    const correctionSummary = summarizeCorrectionReasons(valueRows, dates, "SHEET");
    const reasonEntries = Object.entries(correctionSummary.counts || {});
    if (!ui.correctionIssueHint) return;
    if (state.correctionsApplied !== true) {
      ui.correctionIssueHint.classList.remove("warn");
      ui.correctionIssueHint.textContent = "자동보정 이슈 요약\n- 상태: 보정 전(원본 표시)\n- 안내: '보정 적용' 후 이슈 통계를 확인할 수 있습니다.";
      return;
    }
    if (reasonEntries.length <= 0) {
      ui.correctionIssueHint.classList.remove("warn");
      ui.correctionIssueHint.textContent = "자동보정 이슈 요약\n- 상태: 없음";
      return;
    }
    const totalCount = reasonEntries.reduce((sum, [, count]) => sum + Number(count || 0), 0);
    const reasonLines = reasonEntries
      .map(([reason, count]) => `  · ${reason}: ${count}건`)
      .join("\n");
    const sampleLines = (Array.isArray(correctionSummary.samples) ? correctionSummary.samples : [])
      .slice(0, 3)
      .map((line, idx) => `  ${idx + 1}. ${line}`)
      .join("\n");
    ui.correctionIssueHint.classList.add("warn");
    ui.correctionIssueHint.textContent =
      `자동보정 이슈 요약\n- 상태: ${totalCount}건 감지\n- 사유:\n${reasonLines}${sampleLines ? `\n- 예시:\n${sampleLines}` : ""}`;
  }

  function renderTable(headEl, bodyEl, dates, valueRows) {
    if (!headEl || !bodyEl) return;
    const safeDates = Array.isArray(dates) ? dates : [];
    const safeRows = Array.isArray(valueRows) ? valueRows : [];
    const colCount = Math.max(1, safeDates.length + 1);
    const renderToken = Number(tableRenderTokenMap.get(bodyEl) || 0) + 1;
    tableRenderTokenMap.set(bodyEl, renderToken);
    const prevCellValueMap = tableCellFlashCache.get(bodyEl) || new Map();
    const nextCellValueMap = new Map();
    const tableWrap = bodyEl.closest?.(".copy-wrap");
    if (tableWrap) tableWrap.classList.remove("is-loading");

    headEl.innerHTML = `<tr>${[`<th class="room-col">${TEXT.roomLabel}</th>`]
      .concat(safeDates.map((d) => `<th>${d.slice(5)}</th>`))
      .join("")}</tr>`;

    if (!safeDates.length) {
      bodyEl.innerHTML = `<tr class="table-empty"><td colspan="${colCount}">${TEXT.tableHintSelectRange}</td></tr>`;
      tableCellFlashCache.set(bodyEl, new Map());
      return;
    }

    if (!safeRows.length) {
      bodyEl.innerHTML = `<tr class="table-empty"><td colspan="${colCount}">${TEXT.tableHintNoData}</td></tr>`;
      tableCellFlashCache.set(bodyEl, new Map());
      return;
    }

    const isStale = () => tableRenderTokenMap.get(bodyEl) !== renderToken;
    const buildRowHtml = (row) => {
      const cells = Array.isArray(row?.cells) ? row.cells : [];
      const roomName = String(row?.roomName ?? "");
      const roomKey = String(row?.roomId || "");
      const rowCells = [`<td class="room-col">${escapeHtml(roomName)}</td>`].concat(
        safeDates.map((_, idx) => {
          const cell = cells[idx];
          const dayKey = String(safeDates[idx] || "");
          const tableKey = `${dayKey}::${roomKey}`;
          const text = normalizeDisplayInventoryValue(tableCellDisplayText(cell));
          nextCellValueMap.set(tableKey, text);
          const shouldFlash = prevCellValueMap.has(tableKey) && prevCellValueMap.get(tableKey) !== text;
          const corrected = tableCellIsCorrected(cell);
          const before = corrected ? normalizeDisplayInventoryValue(cell?.originalRaw || "") : "";
          const inlineDiff = corrected && before && before !== text ? `${before}→${text}` : "";
          const errorKey = tableKey;
          const hasError = state.syncErrorCellKeys instanceof Set && state.syncErrorCellKeys.has(errorKey);
          const errorDetail = hasError && state.syncErrorCellDetailByKey instanceof Map
            ? normalizeText(state.syncErrorCellDetailByKey.get(errorKey) || "")
            : "";
          const tooltip = [
            tableCellTooltip(cell) || normalizeText(cell?.tooltip || ""),
            inlineDiff ? `변경: ${inlineDiff}` : "",
            errorDetail ? `오류: ${errorDetail}` : ""
          ].filter(Boolean).join(" | ");
          const className = [
            corrected ? "corrected-cell" : "",
            inlineDiff ? "has-inline-diff" : "",
            hasError ? "error-cell" : "",
            shouldFlash ? "flash-cell" : "",
            normalizeText(cell?.className || "")
          ]
            .filter(Boolean)
            .join(" ");
          const titleAttr = tooltip ? ` title="${escapeHtml(tooltip)}"` : "";
          const html = inlineDiff
            ? `<span class="cell-main">${escapeHtml(text)}</span><span class="cell-inline-diff">${escapeHtml(inlineDiff)}</span>`
            : escapeHtml(text);
          return `<td class="${className}"${titleAttr}>${html}</td>`;
        })
      );
      return `<tr>${rowCells.join("")}</tr>`;
    };
    const renderRange = (start, end) => safeRows.slice(start, end).map(buildRowHtml).join("");
    if (safeRows.length <= TABLE_RENDER_CHUNK_ROWS) {
      if (isStale()) return;
      bodyEl.innerHTML = renderRange(0, safeRows.length);
      tableCellFlashCache.set(bodyEl, nextCellValueMap);
      return;
    }
    bodyEl.innerHTML = `<tr class="table-empty"><td colspan="${colCount}">테이블 렌더링 중...</td></tr>`;
    if (tableWrap) tableWrap.classList.add("is-loading");
    if (isStale()) {
      if (tableWrap) tableWrap.classList.remove("is-loading");
      return;
    }
    const firstEnd = Math.min(TABLE_RENDER_CHUNK_ROWS, safeRows.length);
    bodyEl.innerHTML = renderRange(0, firstEnd);
    tableCellFlashCache.set(bodyEl, nextCellValueMap);
    if (tableWrap) tableWrap.classList.remove("is-loading");
    let cursor = firstEnd;
    const schedule = typeof window.requestAnimationFrame === "function"
      ? window.requestAnimationFrame.bind(window)
      : (cb) => window.setTimeout(cb, 0);
    const pump = () => {
      if (isStale()) {
        if (tableWrap) tableWrap.classList.remove("is-loading");
        return;
      }
      if (cursor >= safeRows.length) {
        if (tableWrap) tableWrap.classList.remove("is-loading");
        return;
      }
      const next = Math.min(cursor + TABLE_RENDER_CHUNK_ROWS, safeRows.length);
      bodyEl.insertAdjacentHTML("beforeend", renderRange(cursor, next));
      cursor = next;
      if (cursor < safeRows.length) schedule(pump);
      else if (tableWrap) tableWrap.classList.remove("is-loading");
    };
    schedule(pump);
  }

  function renderSiteValueTable(dates, valueRows) {
    renderTable(ui.siteHead, ui.siteBody, dates, buildRoomTypeAggregatedRowsForView(dates, valueRows, activeProviderKey()));
  }

  function renderSheetValueTable(dates, valueRows) {
    renderTable(ui.sheetHead, ui.sheetBody, dates, buildRoomTypeAggregatedRowsForView(dates, valueRows, activeProviderKey()));
  }

  function normalizeReviewCellValue(cell) {
    return normalizeDisplayInventoryValue(tableCellDisplayText(cell));
  }

  function isReviewValueMismatch(leftRaw, rightRaw) {
    const left = normalizeDisplayInventoryValue(leftRaw || "");
    const right = normalizeDisplayInventoryValue(rightRaw || "");
    if (!left && !right) return false;
    return !areInventoryRawsEquivalent(left, right);
  }

  function buildReviewRowsFromLoadedTables(query) {
    if (!query || !hasLoadedBothInventoryForQuery(query)) return [];
    const siteDates = Array.isArray(state.dates) ? state.dates : [];
    const sheetDates = Array.isArray(state.sheetDates) ? state.sheetDates : [];
    if (!siteDates.length || !sheetDates.length) return [];

    const sheetDateSet = new Set(sheetDates.map((day) => String(day || "")));
    const sharedDates = siteDates.filter((day) => sheetDateSet.has(String(day || "")));
    if (!sharedDates.length) return [];

    const siteDateIndex = new Map(siteDates.map((day, idx) => [String(day || ""), idx]));
    const sheetDateIndex = new Map(sheetDates.map((day, idx) => [String(day || ""), idx]));
    const siteRows = Array.isArray(state.valueRows) ? state.valueRows : [];
    const sheetRows = Array.isArray(state.sheetValueRows) ? state.sheetValueRows : [];
    const siteByRoom = new Map();
    const sheetByRoom = new Map();
    const roomOrder = [];
    const seenRooms = new Set();

    const rememberRoom = (row, targetMap) => {
      const roomKey = normalizeText(row?.roomId || row?.roomName || "");
      if (!roomKey) return;
      targetMap.set(roomKey, row);
      if (seenRooms.has(roomKey)) return;
      seenRooms.add(roomKey);
      roomOrder.push(roomKey);
    };

    siteRows.forEach((row) => rememberRoom(row, siteByRoom));
    sheetRows.forEach((row) => rememberRoom(row, sheetByRoom));

    const reviewRows = [];
    roomOrder.forEach((roomKey) => {
      const siteRow = siteByRoom.get(roomKey);
      const sheetRow = sheetByRoom.get(roomKey);
      const roomName = normalizeText(siteRow?.roomName || sheetRow?.roomName || roomKey) || roomKey || "-";
      const siteCells = Array.isArray(siteRow?.cells) ? siteRow.cells : [];
      const sheetCells = Array.isArray(sheetRow?.cells) ? sheetRow.cells : [];
      sharedDates.forEach((day) => {
        const dateKey = String(day || "");
        const siteCell = siteCells[Number(siteDateIndex.get(dateKey))];
        const sheetCell = sheetCells[Number(sheetDateIndex.get(dateKey))];
        const siteValueRaw = normalizeReviewCellValue(siteCell);
        const sheetValueRaw = normalizeReviewCellValue(sheetCell);
        const mismatch = isReviewValueMismatch(siteValueRaw, sheetValueRaw);
        const siteValue = siteValueRaw || "-";
        const sheetValue = sheetValueRaw || "-";
        reviewRows.push({
          date: dateKey || "-",
          roomId: roomKey,
          roomName,
          siteValue,
          sheetValue,
          suggestionToSheet: mismatch ? `${siteValue} → ${sheetValue}` : "",
          suggestionToSite: mismatch ? `${sheetValue} → ${siteValue}` : "",
          mismatch
        });
      });
    });

    return reviewRows;
  }

  function resolvePreviewRoomName(preview, roomIdRaw) {
    const roomId = normalizeText(roomIdRaw || "");
    if (!roomId) return "객실";
    const mappedName = normalizeText(
      preview?.providerItemMap?.[roomId]?.roomName ||
      preview?.providerItemMap?.[roomId]?.name ||
      ""
    );
    if (mappedName) return mappedName;
    const preset = ROOM_PRESETS[context.providerType] || [];
    const presetRoom = preset.find((row) => normalizeText(row?.id || "") === roomId);
    if (presetRoom?.name) return normalizeText(presetRoom.name) || roomId;
    return roomId;
  }

  function formatPreviewBooleanStock(value) {
    if (value === true) return "판매";
    if (value === false) return "미판매";
    const text = normalizeDisplayInventoryValue(String(value ?? ""));
    return text || "-";
  }

  function buildReviewRowsFromSyncPreview(query) {
    if (!query || !isSyncPreviewForActiveQuery()) return [];
    const preview = state.syncPreview;
    if (!preview || !Array.isArray(preview.actions)) return [];
    const rows = [];

    if (preview.providerKey === "STATION") {
      preview.actions.forEach((action) => {
        const date = normalizeText(action?.date || "") || "-";
        const changes = Array.isArray(action?.roomChanges) ? action.roomChanges : [];
        changes.forEach((change) => {
          const siteValue = normalizeDisplayInventoryValue(String(change?.from ?? "")) || "-";
          const sheetValue = normalizeDisplayInventoryValue(String(change?.to ?? "")) || "-";
          const mismatch = isReviewValueMismatch(siteValue, sheetValue);
          if (!mismatch) return;
          rows.push({
            date,
            roomId: normalizeText(change?.roomId || ""),
            roomName: resolvePreviewRoomName(preview, change?.roomId || ""),
            siteValue,
            sheetValue,
            suggestionToSheet: `${siteValue} → ${sheetValue}`,
            suggestionToSite: `${sheetValue} → ${siteValue}`,
            mismatch: true
          });
        });
      });
      return rows;
    }

    preview.actions.forEach((action) => {
      const type = normalizeText(action?.type || "");
      if (type !== "stock" && type !== "sale-day") return;
      const siteValue = type === "stock"
        ? normalizeDisplayInventoryValue(String(action?.currentStock ?? "")) || "-"
        : formatPreviewBooleanStock(action?.currentSaleDay);
      const sheetValue = type === "stock"
        ? normalizeDisplayInventoryValue(String(action?.targetStock ?? "")) || "-"
        : formatPreviewBooleanStock(action?.targetSaleDay);
      const mismatch = isReviewValueMismatch(siteValue, sheetValue);
      if (!mismatch) return;
      rows.push({
        date: normalizeText(action?.date || "") || "-",
        roomId: normalizeText(action?.bizItemId || ""),
        roomName: resolvePreviewRoomName(preview, action?.bizItemId || ""),
        siteValue,
        sheetValue,
        suggestionToSheet: `${siteValue} → ${sheetValue}`,
        suggestionToSite: `${sheetValue} → ${siteValue}`,
        mismatch: true
      });
    });

    return rows;
  }

  function renderMismatchRows(rows, query = null) {
    if (!ui.mismatchReviewList || !ui.reviewMismatchCount) return;
    const targetQuery = query || resolveActiveQuery();
    const hasExplicitRows = Array.isArray(rows);
    const incomingRows = hasExplicitRows ? rows : [];
    const normalizedRows = hasExplicitRows
      ? incomingRows
      : (() => {
          const loadedRows = buildReviewRowsFromLoadedTables(targetQuery);
          if (loadedRows.length > 0) return loadedRows;
          return buildReviewRowsFromSyncPreview(targetQuery);
        })();

    const safeRows = normalizedRows
      .map((row) => ({
        date: normalizeText(row?.date || "") || "-",
        roomName: normalizeText(row?.roomName || row?.roomId || "") || "-",
        siteValue: normalizeDisplayInventoryValue(String(row?.siteValue ?? "")) || "-",
        sheetValue: normalizeDisplayInventoryValue(String(row?.sheetValue ?? "")) || "-",
        suggestionToSheet: normalizeText(row?.suggestionToSheet || ""),
        suggestionToSite: normalizeText(row?.suggestionToSite || row?.suggestion || ""),
        mismatch: row?.mismatch === true
      }))
      .sort((left, right) => {
        const dateDiff = String(left.date).localeCompare(String(right.date));
        if (dateDiff !== 0) return dateDiff;
        return String(left.roomName).localeCompare(String(right.roomName));
      });

    const mismatchRows = safeRows.filter((row) => row.mismatch === true);
    const matchRows = safeRows.filter((row) => row.mismatch !== true);
    ui.reviewMismatchCount.textContent = `${mismatchRows.length}건`;
    emitUiEvent("diff_check", {
      mismatchCount: mismatchRows.length,
      rowCount: safeRows.length,
      startDate: targetQuery?.startDate || state.selectedStart || "",
      endDate: targetQuery?.endDate || state.selectedEnd || ""
    });

    if (!safeRows.length) {
      ui.mismatchReviewList.innerHTML = `<div class="review-empty">${escapeHtml(TEXT.reviewEmpty)}</div>`;
      return;
    }

    const maxMatchedRows = 80;
    const visibleMatchRows = matchRows.slice(0, maxMatchedRows);
    const hiddenMatchCount = Math.max(0, matchRows.length - visibleMatchRows.length);
    const orderedRows = mismatchRows.concat(visibleMatchRows);

    const cardsHtml = orderedRows.map((row) => {
      if (row.mismatch === true) {
        const suggestionToSheet = row.suggestionToSheet || `${row.siteValue} → ${row.sheetValue}`;
        const suggestionToSite = row.suggestionToSite || `${row.sheetValue} → ${row.siteValue}`;
        return (
          `<article class="review-card is-mismatch">` +
            `<div class="review-card-top">` +
              `<div>` +
                `<span class="review-date">${escapeHtml(row.date)}</span>` +
                `<div class="review-room">${escapeHtml(row.roomName)}</div>` +
              `</div>` +
              `<div>` +
                `<div class="review-state">${escapeHtml(TEXT.reviewMismatch)}</div>` +
                `<div class="review-suggest">${escapeHtml(TEXT.reviewSuggestionPrimary || TEXT.reviewSuggestion)}<b>${escapeHtml(suggestionToSheet)}</b></div>` +
                `<div class="review-suggest alt">${escapeHtml(TEXT.reviewSuggestionSecondary || TEXT.reviewSuggestion)}<b>${escapeHtml(suggestionToSite)}</b></div>` +
              `</div>` +
            `</div>` +
            `<div class="review-grid">` +
              `<div><div class="review-k">${escapeHtml(TEXT.reviewSiteValue)}</div><div class="review-v">${escapeHtml(row.siteValue)}</div></div>` +
              `<div><div class="review-k">${escapeHtml(TEXT.reviewSheetValue)}</div><div class="review-v diff">${escapeHtml(row.sheetValue)}</div></div>` +
            `</div>` +
          `</article>`
        );
      }
      return (
        `<article class="review-card is-match">` +
          `<div class="review-card-top">` +
            `<div>` +
              `<span class="review-date">${escapeHtml(row.date)}</span>` +
              `<div class="review-room">${escapeHtml(row.roomName)}</div>` +
            `</div>` +
            `<div class="review-state">${escapeHtml(TEXT.reviewMatch)}<span class="review-collapsed">${escapeHtml(TEXT.reviewCollapsed)}</span></div>` +
          `</div>` +
        `</article>`
      );
    }).join("");

    const tailHtml = hiddenMatchCount > 0
      ? `<div class="review-empty">${escapeHtml(TEXT.reviewTruncated)} (+${hiddenMatchCount})</div>`
      : "";
    ui.mismatchReviewList.innerHTML = cardsHtml + tailHtml;
  }

  function roomTypeLabelFromSummaryKey(typeKey) {
    if (typeKey === "urban") return ROOM_TYPE_LABELS.urban;
    if (typeKey === "doubleTwin") return ROOM_TYPE_LABELS.doubleTwin;
    if (typeKey === "grand") return ROOM_TYPE_LABELS.grand;
    return "UNKNOWN";
  }

  const ROOM_TYPE_AGGREGATION_POLICY_DEFAULT = {
    urban: "sum",
    doubleTwin: "sum",
    grand: "sum",
    unknown: "sum"
  };

  function normalizeRoomTypeAggregationMode(modeRaw) {
    const mode = normalizeText(modeRaw || "").toLowerCase();
    if (mode === "min" || mode === "max") return mode;
    return "sum";
  }

  function resolveRoomTypeAggregationMode(typeKeyRaw) {
    const typeKey = String(typeKeyRaw || "");
    const policy = state.syncConfig?.roomTypeAggregationPolicy;
    const configured = policy && typeof policy === "object" ? policy[typeKey] : "";
    const fallback = ROOM_TYPE_AGGREGATION_POLICY_DEFAULT[typeKey] || "sum";
    return normalizeRoomTypeAggregationMode(configured || fallback);
  }

  function resolveRoomTypeKeyForItem(providerKey, roomIdRaw, roomNameRaw) {
    const roomId = String(roomIdRaw || "");
    const roomName = String(roomNameRaw || "");
    const previewMapped = state.syncPreview?.providerItemMap?.[roomId]?.roomType;
    if (normalizeText(previewMapped || "")) {
      return normalizeRoomTypeKeyForSummary(previewMapped);
    }
    const derivedMapped = state.sheetSnapshot?.derivedCorrections?.[providerKey]?.roomTypeMap?.[roomId];
    if (normalizeText(derivedMapped || "")) {
      return normalizeRoomTypeKeyForSummary(derivedMapped);
    }
    return normalizeRoomTypeKeyForSummary(roomName);
  }

  function buildRoomTypeAggregatedRowsForView(dates, valueRows, providerKey) {
    const safeDates = Array.isArray(dates) ? dates : [];
    const safeRows = Array.isArray(valueRows) ? valueRows : [];
    if (!safeDates.length || !safeRows.length) return [];

    const bucketByType = new Map();
    const orderedTypeKeys = ["urban", "doubleTwin", "grand", "unknown"];

    const ensureBucket = (typeKey) => {
      const normalizedTypeKey = orderedTypeKeys.includes(typeKey) ? typeKey : "unknown";
      if (bucketByType.has(normalizedTypeKey)) return bucketByType.get(normalizedTypeKey);
      const bucket = {
        typeKey: normalizedTypeKey,
        roomIds: [],
        rows: []
      };
      bucketByType.set(normalizedTypeKey, bucket);
      return bucket;
    };

    safeRows.forEach((row) => {
      const roomId = String(row?.roomId || "");
      const roomName = String(row?.roomName || roomId || "");
      const typeKey = resolveRoomTypeKeyForItem(providerKey, roomId, roomName);
      const bucket = ensureBucket(typeKey);
      if (roomId) bucket.roomIds.push(roomId);
      bucket.rows.push(row);
    });

    return orderedTypeKeys
      .filter((typeKey) => bucketByType.has(typeKey))
      .map((typeKey) => {
        const bucket = bucketByType.get(typeKey);
        const roomCount = new Set(bucket.roomIds.filter(Boolean)).size;
        const label = roomTypeLabelFromSummaryKey(typeKey);
        const aggregationMode = resolveRoomTypeAggregationMode(typeKey);
        return {
          roomId: `type:${typeKey}`,
          roomName: roomCount > 0 ? `${label} (${roomCount})` : label,
          cells: safeDates.map((_, idx) => {
            let sumCurrent = 0;
            let sumMaximum = 0;
            let hasFraction = false;
            let hasClosed = false;
            let fallbackCell = null;
            const candidates = [];
            const toInlineDiffCell = (candidate) => {
              if (!candidate || !candidate.text) return "";
              if (candidate.corrected !== true) return candidate.text;
              const before = normalizeDisplayInventoryValue(candidate.originalRaw || "");
              if (!before || before === candidate.text) return candidate.text;
              return {
                text: candidate.text,
                corrected: true,
                originalRaw: before
              };
            };
            bucket.rows.forEach((row) => {
              const cell = Array.isArray(row?.cells) ? row.cells[idx] : "";
              const text = normalizeDisplayInventoryValue(tableCellDisplayText(cell));
              const corrected = tableCellIsCorrected(cell);
              const originalRaw = corrected ? normalizeDisplayInventoryValue(cell?.originalRaw || "") : "";
              const fraction = parseStockFraction(text);
              if (fraction) {
                hasFraction = true;
                sumCurrent += Number(fraction.current || 0);
                sumMaximum += Number(fraction.maximum || 0);
                candidates.push({
                  text,
                  available: Math.max(0, Number(fraction.maximum || 0) - Number(fraction.current || 0)),
                  corrected,
                  originalRaw
                });
                return;
              }
              if (text === TEXT.closed) {
                hasClosed = true;
                candidates.push({
                  text: TEXT.closed,
                  available: 0,
                  corrected,
                  originalRaw
                });
                return;
              }
              if (!fallbackCell && text) {
                fallbackCell = { text, corrected, originalRaw };
              }
            });
            if (aggregationMode === "min" || aggregationMode === "max") {
              if (candidates.length > 0) {
                const ordered = [...candidates].sort((a, b) => a.available - b.available);
                return toInlineDiffCell(aggregationMode === "min" ? ordered[0] : ordered[ordered.length - 1]);
              }
              if (hasClosed) return TEXT.closed;
              return toInlineDiffCell(fallbackCell);
            }
            if (hasFraction) {
              const mergedText = normalizeDisplayInventoryValue(`${Math.max(0, sumCurrent)}/${Math.max(0, sumMaximum)}`);
              const correctedMerged = autoCorrectInventoryDisplayValue(mergedText);
              if (correctedMerged.corrected === true) {
                return {
                  text: correctedMerged.text,
                  corrected: true,
                  originalRaw: normalizeDisplayInventoryValue(correctedMerged.originalRaw || mergedText)
                };
              }
              return correctedMerged.text;
            }
            if (hasClosed) return TEXT.closed;
            return toInlineDiffCell(fallbackCell);
          })
        };
      });
  }

  function verifySiteInventoryAccuracy(report, query) {
    if (!query || !Array.isArray(state.rows) || state.rows.length <= 0) return;
    const scope = TEXT.siteInventory;
    const dates = buildDateRange(query.startDate, query.endDate);
    const preset = ROOM_PRESETS[context.providerType] || [];
    if (!dates.length || !preset.length) return;
    const roomNameById = new Map(preset.map((room) => [room.id, room.name]));

    const rawByKey = new Map();
    (state.rows || []).forEach((row) => {
      const key = `${row.date}::${row.roomId}`;
      if (!rawByKey.has(key)) rawByKey.set(key, []);
      rawByKey.get(key).push(row);
    });
    const renderedIndex = buildValueCellIndex(state.dates, state.valueRows);

    if ((state.valueRows || []).length < preset.length) {
      addVerificationWarn(
        report,
        makeVerificationIssue(
          scope,
          query.startDate,
          "-",
          "ROW_COUNT_MISMATCH",
          `렌더 행 수(${(state.valueRows || []).length})가 기준 객실 수(${preset.length})보다 적습니다.`
        )
      );
    } else {
      addVerificationPass(report);
    }

    const lowConfidenceSeen = new Set();
    (state.rows || []).forEach((row) => {
      const confidence = Number(row?.mappingConfidence ?? 1);
      const method = String(row?.mappingMethod || "id_exact");
      if (!Number.isFinite(confidence) || confidence >= ROOM_MAPPING_WARN_THRESHOLD) return;
      if (method === "id_exact") return;
      const warnKey = `${row?.date || ""}::${row?.roomId || ""}`;
      if (lowConfidenceSeen.has(warnKey)) return;
      lowConfidenceSeen.add(warnKey);

      const roomId = String(row?.roomId || "");
      const roomName = roomNameById.get(roomId) || roomId || "-";
      const sourceName = normalizeText(row?.rawRoomName || row?.rawRoomId || "") || "-";
      const score = `${Math.round(Math.max(0, Math.min(confidence, 1)) * 100)}%`;
      addVerificationWarn(
        report,
        makeVerificationIssue(
          scope,
          row?.date || "-",
          roomName,
          "LOW_CONFIDENCE_MAPPING",
          `객실 매핑 신뢰도 ${score} (${toMappingMethodLabel(method)}): 원본 '${sourceName}'`
        )
      );
    });
    if (lowConfidenceSeen.size <= 0) {
      addVerificationPass(report);
    }

    preset.forEach((room) => {
      dates.forEach((day) => {
        const key = `${day}::${room.id}`;
        const rowName = room.name;
        const rawRows = rawByKey.get(key) || [];
        if (!rawRows.length) {
          addVerificationFail(
            report,
            makeVerificationIssue(scope, day, rowName, "MISSING_SITE_ROW", "사이트 원본 데이터가 없습니다.")
          );
          return;
        }
        if (rawRows.length > 1) {
          addVerificationWarn(
            report,
            makeVerificationIssue(
              scope,
              day,
              rowName,
              "DUPLICATE_SITE_ROW",
              `같은 날짜/객실 원본 행이 ${rawRows.length}개입니다.`
            )
          );
        } else {
          addVerificationPass(report);
        }

        const rawRow = rawRows[0];
        const rawDisplay = normalizeDisplayInventoryValue(rowToValue(rawRow));
        const expected = state.correctionsApplied === true
          ? autoCorrectInventoryDisplayValue(rawDisplay).text
          : rawDisplay;
        const actual = normalizeDisplayInventoryValue(renderedIndex.get(key) ?? "");
        if (actual !== expected) {
          addVerificationFail(
            report,
            makeVerificationIssue(
              scope,
              day,
              rowName,
              "RENDER_MISMATCH",
              `표시값(${actual || "-"})이 원본 계산값(${expected || "-"})과 다릅니다.`
            )
          );
        } else {
          addVerificationPass(report);
        }

        const valueIssue = validateInventoryDisplayCell(actual);
        if (valueIssue) {
          addVerificationFail(report, makeVerificationIssue(scope, day, rowName, valueIssue.type, valueIssue.detail));
        } else {
          addVerificationPass(report);
        }

        const reserved = safeInt(rawRow.displayCurrent ?? rawRow.reservedStock);
        const total = safeInt(rawRow.displayMaximum ?? rawRow.totalStock, reserved);
        if (total > 0 && reserved >= total) {
          addVerificationWarn(
            report,
            makeVerificationIssue(
              scope,
              day,
              rowName,
              "N_GE_M_AUTO_CORRECTED",
              `현재값/최대값 ${reserved}/${total}이므로 표시값을 닫음으로 자동 보정했습니다.`
            )
          );
        } else {
          addVerificationPass(report);
        }

        const openStatus = normalizeOpenStatus(rawRow.openStatus);
        if (openStatus === "UNKNOWN") {
          addVerificationWarn(
            report,
            makeVerificationIssue(scope, day, rowName, "UNKNOWN_OPEN_STATUS", "오픈 상태를 확정할 수 없습니다.")
          );
        } else {
          addVerificationPass(report);
        }
      });
    });
  }

  function verifySheetInventoryAccuracy(report, query) {
    if (!query || !Array.isArray(state.sheetValueRows) || state.sheetValueRows.length <= 0) return;
    const scope = TEXT.sheetInventory;
    const dates = Array.isArray(state.sheetDates) ? state.sheetDates : [];
    const preset = ROOM_PRESETS[context.providerType] || [];
    if (!dates.length || !preset.length) return;
    const index = buildValueCellIndex(state.sheetDates, state.sheetValueRows);
    const expectedDates = buildDateRange(query.startDate, query.endDate);

    if (
      expectedDates.length !== dates.length ||
      expectedDates.some((day, idx) => day !== dates[idx])
    ) {
      addVerificationWarn(
        report,
        makeVerificationIssue(
          scope,
          query.startDate,
          "-",
          "DATE_RANGE_MISMATCH",
          `선택 기간(${expectedDates.length}일)과 시트 날짜열(${dates.length}일)이 다릅니다.`
        )
      );
    } else {
      addVerificationPass(report);
    }

    if ((state.sheetValueRows || []).length < preset.length) {
      addVerificationWarn(
        report,
        makeVerificationIssue(
          scope,
          query.startDate,
          "-",
          "ROW_COUNT_MISMATCH",
          `시트 행 수(${(state.sheetValueRows || []).length})가 기준 객실 수(${preset.length})보다 적습니다.`
        )
      );
    } else {
      addVerificationPass(report);
    }

    const providerKey = inventoryProviderKeyFor();
    if (!providerKey) return;
    const roomValueMaps = resolveProviderRoomValueMaps(state.sheetSnapshot, providerKey);
    const allowProviderFallback = shouldAllowProviderFallback(
      state.sheetSnapshot,
      providerKey,
      Array.isArray(state.sheetValueRows) ? state.sheetValueRows.length : preset.length
    );
    const sourceUsage = {
      room_raw: 0,
      room_derived: 0,
      provider_raw: 0,
      none: 0
    };
    const diagnostics = state.sheetSnapshot?.derivedCorrections?.[providerKey]?.diagnostics || {};
    const scanValidation = state.sheetSnapshot?.scan?.validation || {};
    const rawDerivedMismatchCount = Number(scanValidation?.rawDerivedMismatchCount || 0);
    const rawDerivedComparedCount = Number(scanValidation?.rawDerivedComparedCount || 0);
    if (rawDerivedMismatchCount > 0) {
      addVerificationWarn(
        report,
        makeVerificationIssue(
          scope,
          query.startDate,
          "-",
          "RAW_DERIVED_VALUE_MISMATCH",
          `원본 재고행과 파생 계산값이 다릅니다 (${rawDerivedMismatchCount}/${rawDerivedComparedCount}).`
        )
      );
    } else {
      addVerificationPass(report);
    }
    if (diagnostics.totalCells) {
      const expectedTypeCounts = resolveExpectedTypeCounts(providerKey);
      const detectedTypeCounts = summarizeDetectedRoomTypeCounts(diagnostics.roomTypeCounts || {});
      const hasTypeMismatch =
        detectedTypeCounts.urban !== expectedTypeCounts.urban ||
        detectedTypeCounts.doubleTwin !== expectedTypeCounts.doubleTwin ||
        detectedTypeCounts.grand !== expectedTypeCounts.grand;
      if (hasTypeMismatch) {
        addVerificationWarn(
          report,
          makeVerificationIssue(
            scope,
            query.startDate,
            "-",
            "ROOM_TYPE_COUNT_MISMATCH",
            `타입별 객실 수 불일치 U ${detectedTypeCounts.urban}/${expectedTypeCounts.urban}, D ${detectedTypeCounts.doubleTwin}/${expectedTypeCounts.doubleTwin}, G ${detectedTypeCounts.grand}/${expectedTypeCounts.grand}`
          )
        );
      } else {
        addVerificationPass(report);
      }
    }

    preset.forEach((room) => {
      dates.forEach((day) => {
        const value = normalizeDisplayInventoryValue(index.get(`${day}::${room.id}`) ?? "");
        const baseline = resolveSheetDisplayCell(
          state.sheetSnapshot,
          providerKey,
          room.id,
          day,
          allowProviderFallback,
          roomValueMaps,
          state.correctionsApplied === true
        );
        const sourceKey = String(baseline.source || "none");
        if (Object.prototype.hasOwnProperty.call(sourceUsage, sourceKey)) sourceUsage[sourceKey] += 1;
        else sourceUsage.none += 1;
        if (baseline.source === "none") {
          addVerificationFail(
            report,
            makeVerificationIssue(scope, day, room.name, "MISSING_SHEET_RAW", "시트 원본 재고값을 읽지 못했습니다.")
          );
        } else {
          const expected = normalizeDisplayInventoryValue(baseline.text || "");
          if (value !== expected) {
            if (baseline.source === "room_raw") {
              addVerificationFail(
                report,
                makeVerificationIssue(
                  scope,
                  day,
                  room.name,
                  "RAW_RENDER_MISMATCH",
                  `표시값(${value || "-"})이 시트 원본값(${expected || "-"}, ${baseline.source})과 다릅니다.`
                )
              );
            } else {
              addVerificationWarn(
                report,
                makeVerificationIssue(
                  scope,
                  day,
                  room.name,
                  "LOW_CONFIDENCE_RENDER_MISMATCH",
                  `비엄격 소스(${baseline.source}) 기준 비교에서 표시값(${value || "-"})과 원본값(${expected || "-"})이 다릅니다.`
                )
              );
            }
          } else {
            addVerificationPass(report);
          }
        }
        const valueIssue = validateInventoryDisplayCell(value);
        if (valueIssue) {
          addVerificationFail(
            report,
            makeVerificationIssue(scope, day, room.name, valueIssue.type, valueIssue.detail)
          );
        } else {
          addVerificationPass(report);
        }
      });
    });

    if (sourceUsage.provider_raw > 0) {
      addVerificationWarn(
        report,
        makeVerificationIssue(
          scope,
          query.startDate,
          "-",
          "LOW_CONFIDENCE_PROVIDER_SOURCE",
          `룸 소스를 찾지 못한 ${sourceUsage.provider_raw}개 셀이 provider_raw로 판정되었습니다. 이 구간 불일치는 참고로만 보세요.`
        )
      );
    } else {
      addVerificationPass(report);
    }
    if (sourceUsage.room_derived > 0) {
      addVerificationWarn(
        report,
        makeVerificationIssue(
          scope,
          query.startDate,
          "-",
          "DERIVED_SOURCE_USED",
          `파생 소스(room_derived) ${sourceUsage.room_derived}개 셀이 포함되어 있습니다.`
        )
      );
    } else {
      addVerificationPass(report);
    }
  }

  function verifyProviderReservationsAgainstSheet(report, query) {
    if (typeof verifyProviderReservationsAgainstSheetCore !== "function") return;
    return verifyProviderReservationsAgainstSheetCore({
      report,
      query,
      sheetSnapshot: state.sheetSnapshot,
      sheetQuery: state.sheetQuery,
      providerKey: activeProviderKey(),
      providerReservationMeta: state.providerReservationMeta,
      providerReservations: state.providerReservations,
      isSameQuery
    });
  }

  function buildInventoryVerificationReport() {
    const report = createVerificationReport();
    const basis = [];

    if (state.query) {
      basis.push(`${TEXT.siteInventory}: ${state.query.startDate} ~ ${state.query.endDate}`);
      verifySiteInventoryAccuracy(report, state.query);
    }
    if (state.sheetQuery) {
      basis.push(`${TEXT.sheetInventory}: ${state.sheetQuery.startDate} ~ ${state.sheetQuery.endDate}`);
      verifySheetInventoryAccuracy(report, state.sheetQuery);
    }
    if (state.query && state.sheetQuery && isSameQuery(state.query, state.sheetQuery)) {
      basis.push(`PMS 예약: ${state.query.startDate} ~ ${state.query.endDate}`);
      verifyProviderReservationsAgainstSheet(report, state.query);
    }
    report.basis = basis.length ? basis.join(" | ") : TEXT.noPeriod;
    return report;
  }

  function buildVerificationIssueRows(report) {
    return (report?.issues || []).map((issue) => ({
      date: issue?.date || "-",
      type: issue?.scope ? `${issue.scope} / ${issue.type || "-"}` : String(issue?.type || "-"),
      detail: issue?.room && issue.room !== "-" ? `${issue.room}: ${issue.detail || "-"}` : String(issue?.detail || "-")
    }));
  }

  function renderInventoryVerification(report) {
    const data = report && typeof report === "object" ? report : createVerificationReport();
    const checked = Number(data.checkedCount || 0);
    const warnCount = Number(data.warnCount || 0);
    const failCount = Number(data.failCount || 0);
    const hasIssue = warnCount > 0 || failCount > 0;
    const ok = checked > 0 && !hasIssue;
    ui.verifyNote.classList.remove("warn", "error");
    ui.verifyNote.classList.toggle("hidden", checked <= 0);
    if (ok) {
      ui.verifyNote.textContent = `✓ ${TEXT.verifyDone}`;
    } else if (failCount > 0) {
      ui.verifyNote.classList.add("error");
      ui.verifyNote.textContent = `검증 실패 ${failCount}건, 경고 ${warnCount}건`;
    } else if (warnCount > 0) {
      ui.verifyNote.classList.add("warn");
      ui.verifyNote.textContent = `검증 경고 ${warnCount}건`;
    } else {
      ui.verifyNote.textContent = "";
    }

    const rows = buildVerificationIssueRows(data);
    renderIssueTable(ui.verifyIssueHead, ui.verifyIssueBody, rows);
    if (ui.verifyIssueWrap) ui.verifyIssueWrap.classList.toggle("hidden", rows.length <= 0);
  }

  function refreshInventoryVerification() {
    state.verificationReport = buildInventoryVerificationReport();
    state.syncPreview = {
      ...(state.syncPreview || {}),
      reservationPairs: state.verificationReport?.reservationPairs || [],
      reservationMismatches: state.verificationReport?.reservationMismatches || []
    };
    renderInventoryVerification(state.verificationReport);
  }

  function buildValueModel(rows, query, options = null) {
    const applyCorrections = options?.applyCorrections === true;
    const dates = buildDateRange(query.startDate, query.endDate);
    const safeRows = Array.isArray(rows) ? rows : [];
    const index = new Map();
    for (const row of safeRows) index.set(`${row.date}::${row.roomId}`, row);
    const providerKey = activeProviderKey();
    const preset = ROOM_PRESETS[context.providerType] || [];
    const presetOrder = new Map(preset.map((room, idx) => [String(room?.id || ""), idx]));
    const roomNameById = new Map(
      preset.map((room) => [String(room?.id || ""), String(room?.name || room?.id || "")])
    );
    safeRows.forEach((row) => {
      const roomId = String(row?.roomId || "");
      if (!roomId || roomNameById.has(roomId)) return;
      const candidateName =
        normalizeText(row?.roomName || "") ||
        normalizeText(row?.rawRoomName || "") ||
        normalizeText(row?.mappingMatchedName || "");
      roomNameById.set(roomId, candidateName || roomId);
    });
    const roomIds = [...new Set(safeRows.map((row) => String(row?.roomId || "")).filter(Boolean))];
    if (roomIds.length <= 0) {
      preset.forEach((room) => {
        const roomId = String(room?.id || "");
        if (roomId) roomIds.push(roomId);
      });
    }
    roomIds.sort((a, b) => {
      const ao = presetOrder.get(a);
      const bo = presetOrder.get(b);
      const hasOrderA = Number.isInteger(ao);
      const hasOrderB = Number.isInteger(bo);
      if (hasOrderA && hasOrderB && ao !== bo) return ao - bo;
      if (hasOrderA && !hasOrderB) return -1;
      if (!hasOrderA && hasOrderB) return 1;
      return a.localeCompare(b);
    });
    const valueRows = roomIds.map((roomId) => ({
      roomId,
      roomName: roomNameById.get(roomId) || roomId,
      roomType: roomTypeLabelFromSummaryKey(
        resolveRoomTypeKeyForItem(providerKey, roomId, roomNameById.get(roomId) || roomId)
      ),
      cells: dates.map((date) => {
        const rawText = normalizeDisplayInventoryValue(rowToValue(index.get(`${date}::${roomId}`)));
        if (!applyCorrections) return rawText;
        const corrected = autoCorrectInventoryDisplayValue(rawText);
        if (!corrected.corrected) return rawText;
        return {
          text: corrected.text,
          corrected: true,
          originalRaw: corrected.originalRaw
        };
      })
    }));
    return { dates, valueRows };
  }

  function mergeRoomInventoryValues(rawByRoom, derivedByRoom) {
    const out = {};
    const roomIds = new Set([
      ...Object.keys(rawByRoom || {}),
      ...Object.keys(derivedByRoom || {})
    ]);
    roomIds.forEach((roomId) => {
      const rawByDate = rawByRoom?.[roomId] || {};
      const derivedByDate = derivedByRoom?.[roomId] || {};
      const mergedByDate = {};
      const days = new Set([
        ...Object.keys(rawByDate || {}),
        ...Object.keys(derivedByDate || {})
      ]);
      days.forEach((day) => {
        const rawInv = rawByDate?.[day] || null;
        const derivedInv = derivedByDate?.[day] || null;
        if (normalizeText(rawInv?.raw || "")) {
          mergedByDate[day] = rawInv;
          return;
        }
        if (normalizeText(derivedInv?.raw || "")) {
          mergedByDate[day] = derivedInv;
          return;
        }
        if (rawInv) {
          mergedByDate[day] = rawInv;
          return;
        }
        if (derivedInv) mergedByDate[day] = derivedInv;
      });
      out[roomId] = mergedByDate;
    });
    return out;
  }

  function resolveProviderRoomValueMaps(snapshot, providerKey) {
    const rawRoomValuesById = providerKey === "STATION"
      ? snapshot?.stationRoomValues || {}
      : snapshot?.naverRoomValues || {};
    const derivedRoomValuesById = providerKey === "STATION"
      ? snapshot?.stationDerivedRoomValues || {}
      : snapshot?.naverDerivedRoomValues || {};
    return {
      rawRoomValuesById,
      derivedRoomValuesById,
      mergedRoomValuesById: mergeRoomInventoryValues(rawRoomValuesById, derivedRoomValuesById)
    };
  }

  function hasCompleteProviderRoomDataRows(snapshot, providerKey, expectedRoomCount = null) {
    const rows = providerKey === "STATION"
      ? snapshot?.inventoryDataRows?.STATION
      : snapshot?.inventoryDataRows?.NAVER;
    const providerType = providerKey === "STATION" ? "admin-station" : "naver-partner";
    const presetCount = (ROOM_PRESETS[providerType] || []).length;
    const expectedCount = Number.isInteger(expectedRoomCount) && expectedRoomCount > 0
      ? Number(expectedRoomCount)
      : presetCount;
    const validCount = Array.isArray(rows) ? rows.filter((row) => Number.isInteger(row)).length : 0;
    if (expectedCount <= 0) return validCount > 0;
    return validCount >= expectedCount;
  }

  function shouldAllowProviderFallback(snapshot, providerKey, expectedRoomCount = null) {
    return !hasCompleteProviderRoomDataRows(snapshot, providerKey, expectedRoomCount);
  }

  function resolveSheetSnapshotInventoryCell(
    snapshot,
    providerKey,
    roomId,
    day,
    allowProviderFallback = true,
    roomValueMapsOverride = null
  ) {
    const roomValueMaps = roomValueMapsOverride || resolveProviderRoomValueMaps(snapshot, providerKey);
    const roomValuesById = roomValueMaps.rawRoomValuesById || {};
    const derivedRoomValuesById = roomValueMaps.derivedRoomValuesById || {};
    const fallbackValuesByDate = providerKey === "STATION" ? snapshot?.stationValues || {} : snapshot?.naverValues || {};
    const completeRoomDataRows = hasCompleteProviderRoomDataRows(snapshot, providerKey);

    const providerRawInv = fallbackValuesByDate?.[day] || null;
    // Guardrail: when room data rows are incomplete, avoid mixed room_raw/provider_raw rendering.
    // In this state, always stick to provider aggregate row so "원본 표시" stays consistent with sheet raw row.
    if (!completeRoomDataRows) {
      if (allowProviderFallback && normalizeText(providerRawInv?.raw || "")) {
        return { inv: providerRawInv, source: "provider_raw" };
      }
      return { inv: null, source: "none" };
    }

    const roomRawInv = roomValuesById?.[roomId]?.[day] || null;
    const roomDerivedInv = derivedRoomValuesById?.[roomId]?.[day] || null;
    if (normalizeText(roomRawInv?.raw || "")) return { inv: roomRawInv, source: "room_raw" };
    if (normalizeText(roomDerivedInv?.raw || "")) return { inv: roomDerivedInv, source: "room_derived" };

    if (allowProviderFallback) {
      if (normalizeText(providerRawInv?.raw || "")) return { inv: providerRawInv, source: "provider_raw" };
    }

    return { inv: null, source: "none" };
  }

  function buildResolvedRoomValuesByRoom(
    snapshot,
    providerKey,
    roomPreset,
    dates,
    roomValueMapsOverride = null
  ) {
    const safePreset = Array.isArray(roomPreset) ? roomPreset : [];
    const safeDates = Array.isArray(dates) ? dates.filter(Boolean) : [];
    const roomValueMaps = roomValueMapsOverride || resolveProviderRoomValueMaps(snapshot, providerKey);
    const allowProviderFallback = shouldAllowProviderFallback(snapshot, providerKey, safePreset.length);
    const out = {};

    safePreset.forEach((room) => {
      const roomId = String(room?.id || "");
      if (!roomId) return;
      const byDate = {};
      safeDates.forEach((day) => {
        const resolved = resolveSheetSnapshotInventoryCell(
          snapshot,
          providerKey,
          roomId,
          day,
          allowProviderFallback,
          roomValueMaps
        );
        if (resolved?.inv && normalizeText(resolved.inv.raw || "")) {
          byDate[day] = resolved.inv;
        }
      });
      out[roomId] = byDate;
    });

    return out;
  }

  function summarizeSheetInventorySourceUsage(snapshot, providerKey, dates, preset) {
    const counts = {
      room_raw: 0,
      room_derived: 0,
      provider_raw: 0,
      none: 0
    };
    const safeDates = Array.isArray(dates) ? dates.filter(Boolean) : [];
    const safePreset = Array.isArray(preset) ? preset : [];
    if (!snapshot || !safeDates.length || !safePreset.length) {
      return { counts, total: 0 };
    }

    const roomValueMaps = resolveProviderRoomValueMaps(snapshot, providerKey);
    const allowProviderFallback = shouldAllowProviderFallback(snapshot, providerKey, safePreset.length);

    safePreset.forEach((room) => {
      safeDates.forEach((day) => {
        const resolved = resolveSheetSnapshotInventoryCell(
          snapshot,
          providerKey,
          room.id,
          day,
          allowProviderFallback,
          roomValueMaps
        );
        const sourceKey = normalizeText(resolved?.source || "none").toLowerCase();
        if (Object.prototype.hasOwnProperty.call(counts, sourceKey)) {
          counts[sourceKey] += 1;
        } else {
          counts.none += 1;
        }
      });
    });

    const total = Object.values(counts).reduce((acc, value) => acc + Number(value || 0), 0);
    return { counts, total };
  }

  function parseInventoryPairFromAny(inv) {
    const parsedRaw = parseStockValue(normalizeText(inv?.raw || ""));
    const current = Number.isInteger(inv?.current) ? Number(inv.current) : (
      Number.isInteger(parsedRaw?.current) ? Number(parsedRaw.current) : null
    );
    const maximum = Number.isInteger(inv?.maximum) ? Number(inv.maximum) : (
      Number.isInteger(parsedRaw?.maximum) ? Number(parsedRaw.maximum) : null
    );
    return {
      current: Number.isInteger(current) ? current : null,
      maximum: Number.isInteger(maximum) ? maximum : null
    };
  }

  function resolveSheetSignalCorrection(baseText, roomRawInv, roomDerivedInv, providerInv, providerKey, day) {
    const normalizedBase = normalizeDisplayInventoryValue(baseText || "");
    if (!normalizedBase || normalizedBase === TEXT.closed) {
      return { text: normalizedBase, corrected: false, reason: "", originalRaw: "" };
    }
    const rawPair = parseInventoryPairFromAny(roomRawInv || {});
    const derivedPair = parseInventoryPairFromAny(roomDerivedInv || {});
    const providerPair = parseInventoryPairFromAny(providerInv || {});
    const current = Number.isInteger(derivedPair.current)
      ? derivedPair.current
      : Number.isInteger(rawPair.current)
        ? rawPair.current
        : Number.isInteger(providerPair.current)
          ? providerPair.current
          : null;
    let maximum = Number.isInteger(derivedPair.maximum)
      ? derivedPair.maximum
      : Number.isInteger(rawPair.maximum)
        ? rawPair.maximum
        : Number.isInteger(providerPair.maximum)
          ? providerPair.maximum
          : null;
    if (!Number.isInteger(maximum)) {
      maximum = resolveInventoryMaximum(roomDerivedInv || roomRawInv || providerInv || {}, providerKey, day);
    }
    if (!Number.isInteger(current) || !Number.isInteger(maximum)) {
      return { text: normalizedBase, corrected: false, reason: "", originalRaw: "" };
    }
    if (current >= maximum) {
      if (normalizedBase === TEXT.closed) {
        return { text: normalizedBase, corrected: false, reason: "", originalRaw: "" };
      }
      return {
        text: TEXT.closed,
        corrected: true,
        reason: "N_GE_M_RECALC",
        originalRaw: normalizedBase
      };
    }
    const normalizedNext = normalizeDisplayInventoryValue(`${current}/${maximum}`);
    if (!normalizedNext || areInventoryRawsEquivalent(normalizedBase, normalizedNext, providerKey, day)) {
      return { text: normalizedBase, corrected: false, reason: "", originalRaw: "" };
    }
    return {
      text: normalizedNext,
      corrected: true,
      reason: "VAC_BASED_RECALC",
      originalRaw: normalizedBase
    };
  }

  function resolveSheetDisplayCell(
    snapshot,
    providerKey,
    roomId,
    day,
    allowProviderFallback,
    roomValueMaps,
    applyCorrections = false
  ) {
    const maps = roomValueMaps || resolveProviderRoomValueMaps(snapshot, providerKey);
    const providerValuesByDate = providerKey === "STATION" ? snapshot?.stationValues || {} : snapshot?.naverValues || {};
    const resolved = resolveSheetSnapshotInventoryCell(
      snapshot,
      providerKey,
      roomId,
      day,
      allowProviderFallback,
      maps
    );
    const source = resolved?.source || "none";
    const inv = resolved?.inv || null;
    const baseText = normalizeDisplayInventoryValue(inv?.raw || "");
    if (!applyCorrections) {
      return { text: baseText, corrected: false, originalRaw: "", source, reason: "" };
    }

    let text = baseText;
    let corrected = false;
    let originalRaw = "";
    let reason = "";
    const roomRawInv = maps?.rawRoomValuesById?.[roomId]?.[day] || null;
    const roomDerivedInv = maps?.derivedRoomValuesById?.[roomId]?.[day] || null;
    const providerInv = providerValuesByDate?.[day] || null;

    if (source === "room_raw") {
      const derivedText = normalizeDisplayInventoryValue(roomDerivedInv?.raw || "");
      if (derivedText && !areInventoryRawsEquivalent(baseText, derivedText, providerKey, day)) {
        text = derivedText;
        corrected = true;
        originalRaw = baseText;
        reason = "ROOM_DERIVED_DIFF";
      }
    }

    if (source === "room_raw" || source === "room_derived") {
      const signalFix = resolveSheetSignalCorrection(
        text,
        roomRawInv || inv || null,
        roomDerivedInv || null,
        providerInv,
        providerKey,
        day
      );
      if (signalFix.corrected) {
        text = signalFix.text;
        corrected = true;
        originalRaw = normalizeText(signalFix.originalRaw || originalRaw || text);
        reason = signalFix.reason || reason || "VAC_BASED_RECALC";
      }
    }

    const overflowFix = autoCorrectInventoryDisplayValue(text);
    if (overflowFix.corrected) {
      return {
        text: overflowFix.text,
        corrected: true,
        originalRaw: normalizeText(originalRaw || overflowFix.originalRaw || text),
        source,
        reason: "N_GE_M"
      };
    }

    if (source === "room_raw" && inv?.corrected === true) {
      return {
        text,
        corrected: true,
        originalRaw: normalizeText(inv?.originalRaw || originalRaw || ""),
        source,
        reason: reason || "DERIVED_FORMULA_MISMATCH"
      };
    }

    return {
      text,
      corrected,
      originalRaw: normalizeText(originalRaw || ""),
      source,
      reason
    };
  }

  function buildSheetValueModel(snapshot, providerKey, options = null) {
    const applyCorrections = options?.applyCorrections === true;
    const dates = Array.isArray(snapshot?.dateCols) ? snapshot.dateCols.map((dc) => dc.dateKey) : [];
    const providerType = providerKey === "STATION" ? "admin-station" : "naver-partner";
    const preset = ROOM_PRESETS[providerType] || ROOM_PRESETS[context.providerType] || [];
    const presetOrder = new Map(preset.map((room, idx) => [String(room?.id || ""), idx]));
    const roomValueMaps = resolveProviderRoomValueMaps(snapshot, providerKey);
    const roomNameById = new Map(
      preset.map((room) => [String(room?.id || ""), String(room?.name || room?.id || "")])
    );
    (state.rows || []).forEach((row) => {
      const roomId = String(row?.roomId || "");
      if (!roomId || roomNameById.has(roomId)) return;
      const candidateName =
        normalizeText(row?.roomName || "") ||
        normalizeText(row?.rawRoomName || "") ||
        normalizeText(row?.mappingMatchedName || "");
      roomNameById.set(roomId, candidateName || roomId);
    });
    const roomIds = [
      ...new Set([
        ...preset.map((room) => String(room?.id || "")).filter(Boolean),
        ...Object.keys(roomValueMaps?.mergedRoomValuesById || {}).map((id) => String(id || "")).filter(Boolean),
        ...Object.keys(snapshot?.derivedCorrections?.[providerKey]?.roomTypeMap || {}).map((id) => String(id || "")).filter(Boolean)
      ])
    ];
    roomIds.sort((a, b) => {
      const ao = presetOrder.get(a);
      const bo = presetOrder.get(b);
      const hasOrderA = Number.isInteger(ao);
      const hasOrderB = Number.isInteger(bo);
      if (hasOrderA && hasOrderB && ao !== bo) return ao - bo;
      if (hasOrderA && !hasOrderB) return -1;
      if (!hasOrderA && hasOrderB) return 1;
      return a.localeCompare(b);
    });
    const allowProviderFallback = shouldAllowProviderFallback(snapshot, providerKey, roomIds.length);
    const valueRows = roomIds.map((roomId) => ({
      roomId,
      roomName: roomNameById.get(roomId) || roomId,
      roomType: roomTypeLabelFromSummaryKey(
        resolveRoomTypeKeyForItem(providerKey, roomId, roomNameById.get(roomId) || roomId)
      ),
      cells: (() => {
        return dates.map((day) => {
          const display = resolveSheetDisplayCell(
            snapshot,
            providerKey,
            roomId,
            day,
            allowProviderFallback,
            roomValueMaps,
            applyCorrections
          );
          if (display.corrected) {
            return {
              text: display.text,
              corrected: true,
              originalRaw: normalizeText(display.originalRaw || ""),
              reason: normalizeText(display.reason || "")
            };
          }
          return display.text;
        });
      })()
    }));
    return { dates, valueRows };
  }

  function buildValueCellIndex(dates, valueRows) {
    const safeDates = Array.isArray(dates) ? dates : [];
    const safeRows = Array.isArray(valueRows) ? valueRows : [];
    if (!safeDates.length || !safeRows.length) return new Map();

    let byDates = valueCellIndexCache.get(safeRows);
    if (!byDates) {
      byDates = new WeakMap();
      valueCellIndexCache.set(safeRows, byDates);
    }
    const cached = byDates.get(safeDates);
    if (cached) return cached;

    const map = new Map();
    safeRows.forEach((row) => {
      const roomId = String(row?.roomId || "");
      if (!roomId) return;
      const cells = Array.isArray(row?.cells) ? row.cells : [];
      safeDates.forEach((date, idx) => {
        map.set(`${date}::${roomId}`, normalizeDisplayInventoryValue(tableCellDisplayText(cells[idx])));
      });
    });
    byDates.set(safeDates, map);
    return map;
  }

  function countCorrectedCells(valueRows) {
    return (Array.isArray(valueRows) ? valueRows : []).reduce((acc, row) => {
      const cells = Array.isArray(row?.cells) ? row.cells : [];
      return acc + cells.filter((cell) => tableCellIsCorrected(cell)).length;
    }, 0);
  }

  function resolveExpectedTypeCounts(providerKey) {
    const fallback = countExpectedRoomTypesFromMap(ROOM_TYPE_BY_ROOM_NO);
    const formulaCounts = state.sheetSnapshot?.scan?.formulaHints?.expectedTypeCounts || {};
    const derivedTotals = state.sheetSnapshot?.derivedCorrections?.[providerKey]?.expectedTypeTotalsByKey || {};
    const toPositiveIntOrNull = (value) => {
      const n = Number(value);
      if (!Number.isInteger(n) || n <= 0) return null;
      return n;
    };
    const resolveCount = (type, label) => {
      const formula = toPositiveIntOrNull(formulaCounts?.[type]);
      if (formula !== null) return formula;
      const key = roomNameKey(label);
      const derived = toPositiveIntOrNull(derivedTotals?.[key]);
      if (derived !== null) return derived;
      return Number(fallback?.[type] || 0);
    };
    return {
      urban: resolveCount("urban", ROOM_TYPE_LABELS.urban),
      doubleTwin: resolveCount("doubleTwin", ROOM_TYPE_LABELS.doubleTwin),
      grand: resolveCount("grand", ROOM_TYPE_LABELS.grand)
    };
  }

  function normalizeRoomTypeKeyForSummary(typeKeyRaw) {
    const key = roomNameKey(typeKeyRaw);
    if (key === roomNameKey(ROOM_TYPE_LABELS.urban)) return "urban";
    if (key === roomNameKey(ROOM_TYPE_LABELS.doubleTwin)) return "doubleTwin";
    if (key === roomNameKey(ROOM_TYPE_LABELS.grand)) return "grand";
    return "unknown";
  }

  function buildReservationBlockSummary(snapshot) {
    const perType = {
      urban: { NAVER: { blocks: 0, nights: 0 }, STATION: { blocks: 0, nights: 0 } },
      doubleTwin: { NAVER: { blocks: 0, nights: 0 }, STATION: { blocks: 0, nights: 0 } },
      grand: { NAVER: { blocks: 0, nights: 0 }, STATION: { blocks: 0, nights: 0 } },
      unknown: { NAVER: { blocks: 0, nights: 0 }, STATION: { blocks: 0, nights: 0 } }
    };
    const totals = { NAVER: { blocks: 0, nights: 0 }, STATION: { blocks: 0, nights: 0 } };
    const add = (typeKeyRaw, channelRaw, nightsRaw = 0, blocksRaw = 1) => {
      const channel = normalizeText(channelRaw || "").toUpperCase();
      if (channel !== "NAVER" && channel !== "STATION") return;
      const typeKey = normalizeRoomTypeKeyForSummary(typeKeyRaw);
      const nights = Math.max(0, Number(nightsRaw || 0));
      const blocks = Math.max(0, Number(blocksRaw || 0));
      perType[typeKey][channel].blocks += blocks;
      perType[typeKey][channel].nights += nights;
      totals[channel].blocks += blocks;
      totals[channel].nights += nights;
    };

    const fromScan = snapshot?.scan?.reservationBlockSummary?.byTypeChannel;
    if (fromScan && typeof fromScan === "object") {
      Object.entries(fromScan).forEach(([typeKey, byChannel]) => {
        Object.entries(byChannel || {}).forEach(([channel, stat]) => {
          add(typeKey, channel, stat?.nights || 0, stat?.blocks || 0);
        });
      });
      return { perType, totals };
    }

    const blocks = Array.isArray(snapshot?.reservationBlocks) ? snapshot.reservationBlocks : [];
    blocks.forEach((block) => add(block?.roomTypeKey || block?.roomType || "", block?.channel || "", block?.nights || 0, 1));
    return { perType, totals };
  }

  function formatReservationBlockSummaryLine(snapshot) {
    const summary = buildReservationBlockSummary(snapshot);
    const typeParts = [
      ["urban", "U"],
      ["doubleTwin", "D"],
      ["grand", "G"]
    ].map(([typeKey, label]) => {
      const n = summary.perType?.[typeKey]?.NAVER || { blocks: 0, nights: 0 };
      const s = summary.perType?.[typeKey]?.STATION || { blocks: 0, nights: 0 };
      return `${label}(N ${n.blocks}/${n.nights}박, S ${s.blocks}/${s.nights}박)`;
    });
    const totalN = summary.totals?.NAVER || { blocks: 0, nights: 0 };
    const totalS = summary.totals?.STATION || { blocks: 0, nights: 0 };
    return `예약블록(타입별 N/S): ${typeParts.join(" | ")}, 합계 N ${totalN.blocks}/${totalN.nights}박, S ${totalS.blocks}/${totalS.nights}박`;
  }

  function formatProviderValueCandidates(candidates, limit = 5) {
    return (Array.isArray(candidates) ? candidates : [])
      .slice(0, Math.max(1, Number(limit) || 1))
      .map((item) => {
        const row = Number.isInteger(item?.row) ? item.row : "-";
        const parsed = Number(item?.parsedCount || 0);
        const raw = Number(item?.rawCount || 0);
        const score = Number(item?.score || 0);
        return `r${row}(p${parsed}/raw${raw}/s${score})`;
      })
      .join(", ");
  }

  function setSettingsOpen(flag, options = {}) {
    if (flag) openUtilityTab("settings");
    else if (state.secondarySurfaceKind === "utility" && state.activeUtilityTab === "settings") {
      state.secondarySurfaceKind = "evidence";
      syncDerivedSurfaceState();
    }
    if (ui.toggleConfig) ui.toggleConfig.title = state.secondarySurfaceKind === "utility" ? "Utility 닫기" : "Utility";
    renderWorkspaceShellState();
  }

  async function setOpsSectionExpanded(flag, options = {}) {
    if (flag) openUtilityTab("ops");
    else if (state.secondarySurfaceKind === "utility" && state.activeUtilityTab === "ops") {
      state.secondarySurfaceKind = "evidence";
      syncDerivedSurfaceState();
      renderWorkspaceShellState();
    }
    if (options.persist === true && state.syncConfig) {
      state.syncConfig = sanitizeSyncConfig({
        ...state.syncConfig,
        opsUiCollapsed: !(state.secondarySurfaceKind === "utility" && state.activeUtilityTab === "ops")
      });
      await saveSyncConfig(state.syncConfig);
    }
  }

  function updateScanModeUiState() {
    if (state.loading) return;
    [ui.cfgDateAnchorRow, ui.cfgManualRanges].forEach((el) => {
      if (!el) return;
      el.disabled = false;
    });
    renderManualRangePreview();
  }

  function setEmbeddedAuthUiState() {
    const targets = [ui.cfgClientId, ui.cfgClientSecret, ui.cfgAccessToken, ui.cfgRefreshToken];
    targets.forEach((el) => {
      const field = el?.closest(".field");
      if (!field) return;
      field.classList.toggle("hidden", EMBEDDED_AUTH_MODE);
      if (EMBEDDED_AUTH_MODE) el.disabled = true;
    });
    if (ui.toggleSecretsBtn) ui.toggleSecretsBtn.classList.toggle("hidden", EMBEDDED_AUTH_MODE);
  }

  function setSyncResultVisible(flag) {
    state.syncResultVisible = Boolean(flag);
    if (state.syncResultVisible) openEvidenceTab("result");
    if (!ui.syncResultWrap) return;
    syncSectionVisible(ui.syncResultWrap, state.syncResultVisible);
    renderWorkspaceShellState();
  }

  function setErrorExpanded(flag) {
    state.errorExpanded = Boolean(flag);
    syncSectionVisible(ui.errorWrap, state.errorExpanded);
    const errorCount = Number(state.syncPreview?.errorCount || 0);
    ui.toggleErrorBtn.textContent = `${state.errorExpanded ? TEXT.errorHide : TEXT.errorToggle} (${errorCount})`;
    renderWorkspaceShellState();
  }

  function renderIssueTable(headEl, bodyEl, rows) {
    if (!headEl || !bodyEl) return;
    headEl.innerHTML = `<tr><th>${TEXT.errorDate}</th><th>${TEXT.errorType}</th><th>${TEXT.errorDetail}</th></tr>`;
    bodyEl.innerHTML = (rows || [])
      .map((row) => {
        const date = escapeHtml(redactSensitiveText(row?.date ?? "-"));
        const type = escapeHtml(redactSensitiveText(row?.type ?? "-"));
        const roomId = normalizeText(row?.roomId || "");
        const detailText = roomId ? `[${roomId}] ${String(row?.detail ?? "-")}` : String(row?.detail ?? "-");
        const detail = escapeHtml(redactSensitiveText(detailText));
        return `<tr><td>${date}</td><td>${type}</td><td>${detail}</td></tr>`;
      })
      .join("");
  }

  function renderErrorRows(rows) {
    renderIssueTable(ui.errorHead, ui.errorBody, rows);
  }

  function renderSyncBlockRows(rows) {
    const list = Array.isArray(rows) ? rows : [];
    renderIssueTable(ui.syncBlockHead, ui.syncBlockBody, list);
    syncSectionVisible(ui.syncBlockWrap, list.length > 0);
  }

  function clearSyncErrorCellMarkers() {
    state.syncErrorCellKeys = new Set();
    state.syncErrorCellDetailByKey = new Map();
  }

  function setSyncErrorCellMarker(dateRaw, roomIdRaw, detailRaw) {
    const day = normalizeText(dateRaw || "");
    const roomId = normalizeText(roomIdRaw || "");
    if (!day || !roomId) return;
    const detail = normalizeText(detailRaw || "") || "동기화 실패";
    const key = `${day}::${roomId}`;
    state.syncErrorCellKeys.add(key);
    state.syncErrorCellDetailByKey.set(key, detail);
  }

  function applySyncErrorCellMarkers(errors) {
    clearSyncErrorCellMarkers();
    const providerKey = activeProviderKey();
    (Array.isArray(errors) ? errors : []).forEach((row) => {
      const day = normalizeText(row?.date || "");
      const roomId = normalizeText(row?.roomId || "");
      if (!day || !roomId) return;
      const detail = normalizeText(row?.detail || "") || "동기화 실패";
      setSyncErrorCellMarker(day, roomId, detail);
      const typeKey = resolveRoomTypeKeyForItem(providerKey, roomId, roomId);
      if (typeKey && typeKey !== "unknown") {
        setSyncErrorCellMarker(day, `type:${typeKey}`, detail);
      }
    });
  }

  function renderSyncResult(summary) {
    const data = summary && typeof summary === "object" ? summary : {};
    ui.resTotal.textContent = String(data.totalCount ?? 0);
    ui.resSuccess.textContent = String(data.successCount ?? 0);
    ui.resFail.textContent = String(data.failCount ?? 0);
    ui.resClosed.textContent = String(data.closedCount ?? 0);

    const blocks = Array.isArray(data.blocks) ? data.blocks : [];
    renderSyncBlockRows(blocks);
    const errors = Array.isArray(data.errors) ? data.errors : [];
    applySyncErrorCellMarkers(errors);
    state.syncPreview = { ...(state.syncPreview || {}), errorCount: errors.length };
    renderErrorRows(errors);
    if (errors.length <= 0) setErrorExpanded(false);
    else setErrorExpanded(state.errorExpanded);
    applySyncFeatureUiState();
    renderUserOpsSummary();
    renderOpsMetaSummary();
    renderWorkspaceShellState();
  }

  function setFieldValue(el, value) {
    if (!el) return;
    el.value = value === null || value === undefined ? "" : String(value);
  }

  function getFieldValue(el) {
    return el ? String(el.value || "") : "";
  }

  function currentProviderApplyKey() {
    if (context.providerType === "admin-station") return "admin-station";
    if (context.providerType === "naver-partner") return "naver-partner";
    return "";
  }

  function currentProviderApplyLabel() {
    if (!currentProviderApplyKey()) return "WINGS 시작 호스트에서는 OTA 쓰기 설정을 사용하지 않습니다.";
    return currentProviderApplyKey() === "admin-station"
      ? TEXT.syncProviderApplyHintStation
      : TEXT.syncProviderApplyHintNaver;
  }

  function isCurrentProviderApplyAllowed(config = state.syncConfig || {}) {
    if (!currentProviderApplyKey()) return false;
    const providerApply = config?.providerApply && typeof config.providerApply === "object"
      ? config.providerApply
      : {};
    return providerApply[currentProviderApplyKey()] !== false;
  }

  function formatAuthBundleForTextarea(bundle) {
    if (!bundle || typeof bundle !== "object") return "";
    try {
      return JSON.stringify(bundle, null, 2);
    } catch (_) {
      return "";
    }
  }

  function readCurrentProviderAuthBundleFromUI() {
    return parseAuthBundleMaybe(getFieldValue(ui.cfgAuthBundle), context.providerType);
  }

  function normalizeRangePairText(startRaw, endRaw) {
    const start = parseOptionalPositiveInt(startRaw);
    const end = parseOptionalPositiveInt(endRaw);
    if (!start && !end) return "";
    const s = start || end;
    const e = end || start;
    if (!s || !e) return "";
    return `${Math.min(s, e)}-${Math.max(s, e)}`;
  }

  function formatManualRangesText(scan) {
    const room = [
      `U=${normalizeRangePairText(scan?.urbanStartRow, scan?.urbanEndRow)}`,
      `D=${normalizeRangePairText(scan?.doubleTwinStartRow, scan?.doubleTwinEndRow)}`,
      `G=${normalizeRangePairText(scan?.grandStartRow, scan?.grandEndRow)}`
    ];
    const station = [
      `U=${normalizeRangePairText(scan?.stationUrbanStartRow, scan?.stationUrbanEndRow)}`,
      `D=${normalizeRangePairText(scan?.stationDoubleTwinStartRow, scan?.stationDoubleTwinEndRow)}`,
      `G=${normalizeRangePairText(scan?.stationGrandStartRow, scan?.stationGrandEndRow)}`
    ];
    const naver = [
      `U=${normalizeRangePairText(scan?.naverUrbanStartRow, scan?.naverUrbanEndRow)}`,
      `D=${normalizeRangePairText(scan?.naverDoubleTwinStartRow, scan?.naverDoubleTwinEndRow)}`,
      `G=${normalizeRangePairText(scan?.naverGrandStartRow, scan?.naverGrandEndRow)}`
    ];
    const hasAnyRoom = room.some((token) => !token.endsWith("="));
    const hasAnyStation = station.some((token) => !token.endsWith("="));
    const hasAnyNaver = naver.some((token) => !token.endsWith("="));
    const lines = [];
    if (hasAnyRoom) lines.push(`ROOM ${room.join(",")}`);
    if (hasAnyStation) lines.push(`STATION ${station.join(",")}`);
    if (hasAnyNaver) lines.push(`NAVER ${naver.join(",")}`);
    return lines.join("\n");
  }

  function parseManualRangesText(text) {
    const out = {
      room: { U: null, D: null, G: null },
      station: { U: null, D: null, G: null },
      naver: { U: null, D: null, G: null },
      hasAny: false
    };
    const rows = String(text || "").split(/\r?\n|;/).map((line) => line.trim()).filter(Boolean);
    const pickTarget = (line) => {
      const lower = normalizeText(line).toLowerCase();
      if (/^(room|r|객실)\b/.test(lower)) return { target: out.room, body: line.replace(/^(room|r|객실)\s*[:\-]?\s*/i, "") };
      if (/^(station|s|스테이션)\b/.test(lower)) return { target: out.station, body: line.replace(/^(station|s|스테이션)\s*[:\-]?\s*/i, "") };
      if (/^(naver|n|네이버)\b/.test(lower)) return { target: out.naver, body: line.replace(/^(naver|n|네이버)\s*[:\-]?\s*/i, "") };
      return { target: null, body: "" };
    };
    rows.forEach((lineRaw) => {
      const { target, body } = pickTarget(lineRaw);
      if (!target || !body) return;
      const tokenRe = /([UDG])\s*[:=]?\s*(\d+)\s*[-~]\s*(\d+)/gi;
      let m = null;
      while ((m = tokenRe.exec(body))) {
        const typeKey = String(m[1] || "").toUpperCase();
        const a = parseOptionalPositiveInt(m[2]);
        const b = parseOptionalPositiveInt(m[3]);
        if (!a || !b || !["U", "D", "G"].includes(typeKey)) continue;
        target[typeKey] = { start: Math.min(a, b), end: Math.max(a, b) };
        out.hasAny = true;
      }
    });
    return out;
  }

  function formatParsedRange(range) {
    if (!range || !Number.isInteger(range.start) || !Number.isInteger(range.end)) return "-";
    return `${Math.min(range.start, range.end)}~${Math.max(range.start, range.end)}`;
  }

  function renderManualRangePreview() {
    if (!ui.cfgManualRangesPreview) return;
    const parsed = parseManualRangesText(getFieldValue(ui.cfgManualRanges));
    const hasAny = parsed.hasAny === true;
    const selectedMode = normalizeText(getFieldValue(ui.cfgScanMode)).toLowerCase() === "manual" ? "manual" : "auto";
    const dateAnchor = parseOptionalPositiveInt(getFieldValue(ui.cfgDateAnchorRow));
    const manualActive = Boolean(hasAny || dateAnchor);
    const lines = [
      `모드: ${selectedMode}${manualActive ? " (수동 범위 입력 감지 → 저장 시 manual 강제 적용)" : " (자동 탐색)"}`,
      `ROOM U ${formatParsedRange(parsed.room.U)} / D ${formatParsedRange(parsed.room.D)} / G ${formatParsedRange(parsed.room.G)}`,
      `STATION U ${formatParsedRange(parsed.station.U)} / D ${formatParsedRange(parsed.station.D)} / G ${formatParsedRange(parsed.station.G)}`,
      `NAVER U ${formatParsedRange(parsed.naver.U)} / D ${formatParsedRange(parsed.naver.D)} / G ${formatParsedRange(parsed.naver.G)}`
    ];
    ui.cfgManualRangesPreview.textContent = lines.join("\n");
    ui.cfgManualRangesPreview.classList.toggle("warn", manualActive);
  }

  function buildManualRangesTextFromSnapshot(snapshot) {
    const scan = snapshot?.scan || {};
    const roomRange = scan?.roomTypeRanges || {};
    const providerRanges = scan?.inventoryTypeRanges || {};
    const oneRange = (range) => {
      const start = parseOptionalPositiveInt(range?.startRow);
      const end = parseOptionalPositiveInt(range?.endRow);
      if (!start && !end) return "";
      const s = start || end;
      const e = end || start;
      if (!s || !e) return "";
      return `${Math.min(s, e)}-${Math.max(s, e)}`;
    };
    const oneProvider = (source) => {
      const rows = Array.isArray(source) ? source.filter((x) => Number.isInteger(Number(x))).map((x) => Number(x)) : [];
      if (rows.length >= 3) {
        return `U=${rows[0]}-${rows[0]},D=${rows[1]}-${rows[1]},G=${rows[2]}-${rows[2]}`;
      }
      return "";
    };
    const room = `U=${oneRange(roomRange?.urban)},D=${oneRange(roomRange?.doubleTwin)},G=${oneRange(roomRange?.grand)}`;
    const station = oneProvider(scan?.inventoryDataRows?.STATION) ||
      `U=${oneRange(providerRanges?.STATION?.urban)},D=${oneRange(providerRanges?.STATION?.doubleTwin)},G=${oneRange(providerRanges?.STATION?.grand)}`;
    const naver = oneProvider(scan?.inventoryDataRows?.NAVER) ||
      `U=${oneRange(providerRanges?.NAVER?.urban)},D=${oneRange(providerRanges?.NAVER?.doubleTwin)},G=${oneRange(providerRanges?.NAVER?.grand)}`;
    const lines = [];
    if (/\d/.test(room)) lines.push(`ROOM ${room}`);
    if (/\d/.test(station)) lines.push(`STATION ${station}`);
    if (/\d/.test(naver)) lines.push(`NAVER ${naver}`);
    return lines.join("\n");
  }

  function readPmsPresetFromUI() {
    return sanitizeWingsPmsPreset({
      presetKey: getFieldValue(ui.cfgPmsPresetKey),
      propertyNo: getFieldValue(ui.cfgPmsPropertyNo),
      bsnsCode: getFieldValue(ui.cfgPmsBsnsCode),
      pageId: getFieldValue(ui.cfgPmsPageId),
      pageSize: getFieldValue(ui.cfgPmsPageSize)
    });
  }

  function renderPmsPresetPreview() {
    if (!ui.cfgPmsPresetPreview) return;
    const preset = readPmsPresetFromUI();
    if (!preset.presetKey) {
      ui.cfgPmsPresetPreview.textContent = "직접 입력 모드";
      ui.cfgPmsPresetPreview.classList.remove("warn");
      return;
    }
    const generated = buildWingsPmsPresetRequest(preset, getFieldValue(ui.cfgPmsReservationUrl));
    if (!generated) {
      ui.cfgPmsPresetPreview.textContent = "PROPERTY_NO, BSNS_CODE, PAGE_ID를 채우면 Wings 조회 템플릿을 생성합니다.";
      ui.cfgPmsPresetPreview.classList.add("warn");
      return;
    }
    const parsedBundle = parseAuthBundleMaybe(JSON.stringify(generated.bundle), null) || generated.bundle;
    const body = normalizeText(parsedBundle.requestBody || "");
    const lines = [
      generated.url,
      `POST ${body.slice(0, 160)}${body.length > 160 ? "..." : ""}`
    ];
    ui.cfgPmsPresetPreview.textContent = lines.join("\n");
    ui.cfgPmsPresetPreview.classList.remove("warn");
  }

  function applyPmsPresetTemplate() {
    const preset = readPmsPresetFromUI();
    const generated = buildWingsPmsPresetRequest(preset, getFieldValue(ui.cfgPmsReservationUrl));
    if (!generated) {
      setStatus("Wings 프리셋을 만들려면 PROPERTY_NO, BSNS_CODE, PAGE_ID가 필요합니다.", "error");
      return false;
    }
    const existingBundle = parseAuthBundleMaybe(getFieldValue(ui.cfgPmsAuthBundle), null) || {};
    const mergedBundle = {
      ...existingBundle,
      ...generated.bundle,
      headers: {
        ...((existingBundle.headers && typeof existingBundle.headers === "object") ? existingBundle.headers : {}),
        ...((generated.bundle.headers && typeof generated.bundle.headers === "object") ? generated.bundle.headers : {})
      }
    };
    setFieldValue(ui.cfgPmsReservationUrl, generated.url);
    setFieldValue(ui.cfgPmsAuthBundle, formatAuthBundleForTextarea(mergedBundle));
    setSecretsMasked(state.secretsMasked);
    renderPmsPresetPreview();
    setStatus("Wings 조회 템플릿을 채웠습니다.");
    ui.status.classList.add("ok");
    return true;
  }

  function applyPmsHarTemplate() {
    const converted = convertHarToWingsPmsConfig(getFieldValue(ui.cfgPmsHarInput));
    if (!converted) {
      setStatus("HAR에서 읽기 전용 Wings 조회 요청을 찾지 못했습니다. export한 HAR JSON 전체를 붙여넣으세요.", "error");
      return false;
    }
    const existingBundle = parseAuthBundleMaybe(getFieldValue(ui.cfgPmsAuthBundle), null) || {};
    const nextBundle = converted.bundle || {};
    const mergedBundle = {
      ...existingBundle,
      ...nextBundle,
      headers: {
        ...((existingBundle.headers && typeof existingBundle.headers === "object") ? existingBundle.headers : {}),
        ...((nextBundle.headers && typeof nextBundle.headers === "object") ? nextBundle.headers : {})
      }
    };
    const preset = sanitizeWingsPmsPreset(converted.preset || {});
    setFieldValue(ui.cfgPmsPresetKey, preset.presetKey || "");
    setFieldValue(ui.cfgPmsPropertyNo, preset.propertyNo || "");
    setFieldValue(ui.cfgPmsBsnsCode, preset.bsnsCode || "");
    setFieldValue(ui.cfgPmsPageId, preset.pageId || "");
    setFieldValue(ui.cfgPmsPageSize, preset.pageSize || "");
    setFieldValue(ui.cfgPmsReservationUrl, converted.url || "");
    setFieldValue(ui.cfgPmsAuthBundle, formatAuthBundleForTextarea(mergedBundle));
    setSecretsMasked(state.secretsMasked);
    renderPmsPresetPreview();
    const matchedName = normalizeText(converted.matchedPath || "").split("/").pop() || "Wings 요청";
    setStatus(`HAR에서 ${matchedName} 요청을 추출했습니다.`);
    ui.status.classList.add("ok");
    return true;
  }

  function writeSyncConfigToUI(config) {
    const cfg = sanitizeSyncConfig(config);
    const scan = sanitizeScanConfig(cfg.scan || {});
    const pmsPreset = sanitizeWingsPmsPreset(cfg.pmsPreset || {});
    const dateAnchorRow = scan.dateRow || (scan.weekdayRow ? Math.max(1, Number(scan.weekdayRow) - 1) : "");
    setFieldValue(ui.cfgSpreadsheet, cfg.spreadsheet);
    setFieldValue(ui.cfgSheetName, cfg.sheetName);
    setFieldValue(ui.cfgStartRow, cfg.startRow);
    setFieldValue(ui.cfgYear, cfg.year);
    setFieldValue(ui.cfgStockMode, cfg.stockMode);
    if (ui.cfgAllowPkgInventoryRows) ui.cfgAllowPkgInventoryRows.checked = scan.allowPkgInventoryRows === true;
    setFieldValue(ui.cfgScanMode, scan.mode);
    setFieldValue(ui.cfgDateAnchorRow, dateAnchorRow);
    setFieldValue(ui.cfgManualRanges, formatManualRangesText(scan));
    setFieldValue(ui.cfgClientId, cfg.clientId);
    setFieldValue(ui.cfgClientSecret, cfg.clientSecret);
    if (ui.cfgProviderApply) ui.cfgProviderApply.checked = isCurrentProviderApplyAllowed(cfg);
    if (ui.cfgProviderApplyHint) ui.cfgProviderApplyHint.textContent = currentProviderApplyLabel();
    setFieldValue(ui.cfgAccessToken, cfg.accessToken);
    setFieldValue(ui.cfgRefreshToken, cfg.refreshToken);
    setFieldValue(ui.cfgPmsPresetKey, pmsPreset.presetKey || "");
    setFieldValue(ui.cfgPmsPropertyNo, pmsPreset.propertyNo || "");
    setFieldValue(ui.cfgPmsBsnsCode, pmsPreset.bsnsCode || "");
    setFieldValue(ui.cfgPmsPageId, pmsPreset.pageId || "");
    setFieldValue(ui.cfgPmsPageSize, pmsPreset.pageSize || "");
    setFieldValue(ui.cfgPmsReservationUrl, cfg.pmsReservationUrl || "");
    setFieldValue(ui.cfgPmsAuthBundle, formatAuthBundleForTextarea(cfg.pmsAuthBundle || null));
    setFieldValue(ui.cfgAuthBundle, formatAuthBundleForTextarea(cfg.authBundles?.[context.providerType] || null));
    state.opsSectionExpanded = cfg.opsUiCollapsed !== true;
    state.lastUtilityTab = state.opsSectionExpanded ? "ops" : state.lastUtilityTab || "scope";
    updateScanModeUiState();
    renderPmsPresetPreview();
    syncDerivedSurfaceState();
    setSecretsMasked(state.secretsMasked);
    renderSupportPolicySurface();
    renderUserOpsSummary();
    renderOpsMetaSummary();
  }

  function readSyncConfigFromUI() {
    const tokenBundle = parseTokenBundleMaybe(getFieldValue(ui.cfgAccessToken));
    const dateAnchorRaw = getFieldValue(ui.cfgDateAnchorRow);
    const dateAnchor = parseOptionalPositiveInt(dateAnchorRaw);
    const allowPkgInventoryRows = ui.cfgAllowPkgInventoryRows?.checked === true;
    const parsedManualRanges = parseManualRangesText(getFieldValue(ui.cfgManualRanges));
    const hasManualFrame = Boolean(dateAnchor) || parsedManualRanges.hasAny;
    const selectedMode = normalizeText(getFieldValue(ui.cfgScanMode)).toLowerCase() === "manual" ? "manual" : "auto";
    const effectiveMode = hasManualFrame ? "manual" : selectedMode;
    const providerApplyKey = currentProviderApplyKey();
    const raw = {
      spreadsheet: getFieldValue(ui.cfgSpreadsheet),
      sheetName: getFieldValue(ui.cfgSheetName),
      startRow: getFieldValue(ui.cfgStartRow),
      year: getFieldValue(ui.cfgYear),
      stockMode: getFieldValue(ui.cfgStockMode),
      scan: {
        mode: effectiveMode,
        allowPkgInventoryRows,
        dateRow: dateAnchor || "",
        weekdayRow: dateAnchor ? String(dateAnchor + 1) : "",
        urbanStartRow: parsedManualRanges.room.U?.start || "",
        urbanEndRow: parsedManualRanges.room.U?.end || "",
        doubleTwinStartRow: parsedManualRanges.room.D?.start || "",
        doubleTwinEndRow: parsedManualRanges.room.D?.end || "",
        grandStartRow: parsedManualRanges.room.G?.start || "",
        grandEndRow: parsedManualRanges.room.G?.end || "",
        stationUrbanStartRow: parsedManualRanges.station.U?.start || "",
        stationUrbanEndRow: parsedManualRanges.station.U?.end || "",
        stationDoubleTwinStartRow: parsedManualRanges.station.D?.start || "",
        stationDoubleTwinEndRow: parsedManualRanges.station.D?.end || "",
        stationGrandStartRow: parsedManualRanges.station.G?.start || "",
        stationGrandEndRow: parsedManualRanges.station.G?.end || "",
        naverUrbanStartRow: parsedManualRanges.naver.U?.start || "",
        naverUrbanEndRow: parsedManualRanges.naver.U?.end || "",
        naverDoubleTwinStartRow: parsedManualRanges.naver.D?.start || "",
        naverDoubleTwinEndRow: parsedManualRanges.naver.D?.end || "",
        naverGrandStartRow: parsedManualRanges.naver.G?.start || "",
        naverGrandEndRow: parsedManualRanges.naver.G?.end || "",
        dateStartCol: "",
        dateEndCol: "",
        roomStartRow: "",
        inventorySearchStartRow: "",
        stationInventoryRow: "",
        naverInventoryRow: "",
        roomSoldVacScanStartRow: "",
        roomSoldVacScanEndRow: ""
      },
      clientId: getFieldValue(ui.cfgClientId),
      clientSecret: getFieldValue(ui.cfgClientSecret),
      providerApply: {
        ...((state.syncConfig?.providerApply && typeof state.syncConfig.providerApply === "object") ? state.syncConfig.providerApply : {}),
        ...(providerApplyKey ? { [providerApplyKey]: ui.cfgProviderApply?.checked === true } : {})
      },
      naverExecution: sanitizeNaverExecutionConfig(state.syncConfig?.naverExecution || {}),
      accessToken: tokenBundle?.accessToken || getFieldValue(ui.cfgAccessToken),
      refreshToken: tokenBundle?.refreshToken || getFieldValue(ui.cfgRefreshToken),
      pmsPreset: readPmsPresetFromUI(),
      pmsReservationUrl: getFieldValue(ui.cfgPmsReservationUrl),
      pmsAuthBundle: parseAuthBundleMaybe(getFieldValue(ui.cfgPmsAuthBundle), null),
      accessTokenExpiresAt: tokenBundle?.expiresAt || state.syncConfig.accessTokenExpiresAt || 0,
      sleepMs: state.syncConfig.sleepMs || DEFAULT_SYNC_SLEEP_MS,
      opsUiCollapsed: !(state.lastUtilityTab === "ops" || (state.secondarySurfaceKind === "utility" && state.activeUtilityTab === "ops")),
      authBundles: { ...(state.syncConfig.authBundles || {}) },
      stationBranchId:
        context.providerType === "admin-station"
          ? resolveActiveStationBranchId(state.syncConfig)
          : normalizeText(state.syncConfig?.stationBranchId || ""),
      naverBusinessId:
        context.providerType === "naver-partner"
          ? normalizeText(state.syncConfig?.naverBusinessId || "")
          : normalizeText(state.syncConfig?.naverBusinessId || "")
    };
    if (raw.pmsPreset?.presetKey) {
      const generated = buildWingsPmsPresetRequest(raw.pmsPreset, raw.pmsReservationUrl);
      if (generated) {
        raw.pmsReservationUrl = generated.url;
        raw.pmsAuthBundle = {
          ...(raw.pmsAuthBundle || {}),
          ...generated.bundle,
          headers: {
            ...(((raw.pmsAuthBundle || {}).headers && typeof raw.pmsAuthBundle.headers === "object") ? raw.pmsAuthBundle.headers : {}),
            ...((generated.bundle.headers && typeof generated.bundle.headers === "object") ? generated.bundle.headers : {})
          }
        };
      }
    }
    if (tokenBundle?.clientId) raw.clientId = tokenBundle.clientId;
    if (tokenBundle?.clientSecret) raw.clientSecret = tokenBundle.clientSecret;
    const authBundle = sanitizeProviderAuthBundle(context.providerType, readCurrentProviderAuthBundleFromUI());
    if (authBundle) raw.authBundles[context.providerType] = authBundle;
    else delete raw.authBundles[context.providerType];
    return sanitizeSyncConfig(raw);
  }

  async function persistSyncConfig(showMessage = false) {
    const cfg = readSyncConfigFromUI();
    state.syncConfig = await saveSyncConfig(cfg);
    writeSyncConfigToUI(state.syncConfig);
    if (showMessage) {
      setStatus(TEXT.statusSyncSaved);
      ui.status.classList.add("ok");
    }
    return state.syncConfig;
  }

  function setSyncButtonState(labelRaw, className, options = {}) {
    if (!ui.syncBtn) return;
    const label = normalizeText(labelRaw || "");
    const loading = options.loading === true;
    const nextClass = [className || "btn gray", loading ? "is-loading" : ""]
      .filter(Boolean)
      .join(" ");
    ui.syncBtn.className = nextClass;
    ui.syncBtn.setAttribute("aria-busy", loading ? "true" : "false");
    if (ui.syncBtnLabel) ui.syncBtnLabel.textContent = label;
    else ui.syncBtn.textContent = label;
    if (ui.syncBtnSpinner) ui.syncBtnSpinner.classList.toggle("hidden", !loading);
  }

  function updateSyncButtonText() {
    if (state.syncRunning === true) {
      setSyncButtonState(TEXT.syncRunProcessing, "btn ready", { loading: true });
      renderWorkflowProgress();
      return;
    }
    const mismatchCount = isSyncPreviewForActiveQuery() ? Number(state.syncPreview?.mismatchCount || 0) : 0;
    if (READ_ONLY_TOOL_MODE === true) {
      const query = resolveActiveQuery();
      const hasLoadedPair = hasLoadedBothInventoryForQuery(query);
      const label = mismatchCount > 0 ? `${TEXT.syncRun} (${mismatchCount})` : TEXT.syncRun;
      setSyncButtonState(label, `btn ${hasLoadedPair ? "ready" : "gray"}`);
      renderWorkflowProgress();
      return;
    }
    if (!isCurrentProviderApplyAllowed()) {
      setSyncButtonState(TEXT.syncRunProviderBlocked, "btn gray");
      renderWorkflowProgress();
      return;
    }
    if (isSyncApprovalRequired() && state.syncApprovalChecked !== true) {
      setSyncButtonState(mismatchCount > 0 ? `${TEXT.syncRunNeedApprove} (${mismatchCount})` : TEXT.syncRunNeedApprove, "btn gray");
      renderWorkflowProgress();
      return;
    }
    setSyncButtonState(mismatchCount > 0 ? `${TEXT.syncRun} (${mismatchCount})` : TEXT.syncRun, `btn ${mismatchCount > 0 ? "ready" : "gray"}`);
    renderWorkflowProgress();
  }

  async function fetchWithAuthVariants(session, url, init, label) {
    const variants = await session.buildVariants(url, init);
    let response = null;
    let lastFetchError = null;
    for (const reqInit of variants) {
      try {
        response = await fetch(url, reqInit);
      } catch (error) {
        lastFetchError = error;
        continue;
      }
      if (response.ok) break;
      if (response.status !== 401 && response.status !== 403) break;
    }

    if (!response?.ok) {
      if (response) {
        const text = await response.text().catch(() => "");
        throw new Error(`${label} (${response.status}): ${text.slice(0, 240)}`);
      }
      throw new Error(lastFetchError?.message || `${label}: 호출 실패`);
    }
    return response;
  }

  function shouldRetryApplyError(error) {
    const text = String(error?.message || "");
    return /\((429|5\d\d)\)/.test(text);
  }

  function resolveActiveStationBranchId(syncConfig = state.syncConfig) {
    const cfgBranchId = normalizeText(syncConfig?.stationBranchId || "");
    if (typeof resolveStationBranchId === "function") {
      return resolveStationBranchId(cfgBranchId || FIXED_STATION_BRANCH_ID);
    }
    const normalized = normalizeText(cfgBranchId || FIXED_STATION_BRANCH_ID);
    return /^\d+$/.test(normalized) && Number(normalized) > 0 ? normalized : FIXED_STATION_BRANCH_ID;
  }

  async function runWithRetry(task, baseDelayMs) {
    let attempt = 0;
    while (true) {
      try {
        return await task();
      } catch (error) {
        if (attempt >= APPLY_RETRY_LIMIT || !shouldRetryApplyError(error)) throw error;
        const waitMs = Math.max(250, baseDelayMs * (attempt + 1)) + Math.floor(Math.random() * APPLY_JITTER_MS);
        await sleep(waitMs);
        attempt += 1;
      }
    }
  }

  function nextApplyDelay(baseDelayMs) {
    return Math.max(300, Number(baseDelayMs) || DEFAULT_SYNC_SLEEP_MS) + Math.floor(Math.random() * APPLY_JITTER_MS);
  }

  async function applyStationActions(actions, sleepMs) {
    const session = createSessionRequestContext("admin-station");
    const branchId = resolveActiveStationBranchId();
    const url = buildStationApplyUrl(branchId);
    const results = [];

    for (const action of actions) {
      if (!action?.hasChange) {
        results.push({ date: action?.date, status: "SKIPPED_NO_CHANGE" });
        continue;
      }
      try {
        const baseInit = {
          method: "PATCH",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify(action.payload)
        };
        await runWithRetry(
          () => fetchWithAuthVariants(session, url, baseInit, `${TEXT.station} API`),
          sleepMs
        );
        results.push({ date: action.date, status: "APPLIED" });
      } catch (error) {
        const changedRoomIds = Array.isArray(action?.roomChanges)
          ? action.roomChanges
              .filter((row) => Number(row?.from) !== Number(row?.to))
              .map((row) => normalizeText(row?.roomId || ""))
              .filter(Boolean)
          : [];
        results.push({
          date: action.date,
          status: "FAILED",
          error: error?.message ?? String(error),
          actionType: "SET_STOCK",
          roomIds: changedRoomIds,
          branchId
        });
      }
      await sleep(nextApplyDelay(sleepMs));
    }

    return results;
  }

  async function applyNaverActions(actions, sleepMs) {
    const session = createSessionRequestContext("naver-partner");
    const results = [];

    for (const action of actions) {
      const rid = String(action.bizItemId);
      const url =
        action.type === "stock"
          ? buildNaverStockSchedulesUrl(FIXED_NAVER_BUSINESS_ID, rid)
          : buildNaverSaleSchedulesUrl(FIXED_NAVER_BUSINESS_ID, rid);
      const init = await session.build(url, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(action.payload)
      });
      try {
        await runWithRetry(async () => {
          const response = await fetch(url, init);
          if (!response.ok) {
            const text = await response.text().catch(() => "");
            throw new Error(`${TEXT.naver} API (${response.status}): ${text.slice(0, 240)}`);
          }
        }, sleepMs);
        results.push({ type: action.type, bizItemId: rid, date: action.date, status: "APPLIED" });
      } catch (error) {
        results.push({
          type: action.type,
          bizItemId: rid,
          date: action.date,
          status: "FAILED",
          error: error?.message ?? String(error)
        });
      }
      await sleep(nextApplyDelay(sleepMs));
    }

    return results;
  }

  function resolveNaverExecutionConfig(syncConfig) {
    return sanitizeNaverExecutionConfig(syncConfig?.naverExecution || {});
  }

  function buildNaverQueueCellKey(bizItemId, day) {
    return `${String(bizItemId || "")}::${String(day || "")}`;
  }

  function enqueueNaverActions(actions = []) {
    const queue = state.naverQueue;
    let upsertCount = 0;
    const now = Date.now();
    (Array.isArray(actions) ? actions : []).forEach((action) => {
      const type = String(action?.type || "");
      if (type !== "stock" && type !== "sale-day") return;
      const bizItemId = String(action?.bizItemId || "");
      const day = String(action?.date || "");
      if (!bizItemId || !day) return;
      const cellKey = buildNaverQueueCellKey(bizItemId, day);
      const entry = queue.get(cellKey) || {
        bizItemId,
        date: day,
        stockAction: null,
        saleAction: null,
        errorCount: 0,
        updatedAt: now
      };
      if (type === "stock") entry.stockAction = { ...action, bizItemId, date: day };
      else entry.saleAction = { ...action, bizItemId, date: day };
      entry.updatedAt = now;
      queue.set(cellKey, entry);
      upsertCount += 1;
    });
    return {
      upsertCount,
      queueSize: queue.size
    };
  }

  function shouldFlushNaverQueue(config, trigger = "manual") {
    if (String(trigger || "manual") !== "manual") return false;
    const queueSize = state.naverQueue.size;
    if (queueSize <= 0) return false;
    return true;
  }

  function buildNaverBatchFromQueue(config) {
    const maxBatchActions = Math.max(1, Number(config?.maxBatchActions || 1));
    const entries = [...state.naverQueue.entries()].sort((a, b) => Number(a?.[1]?.updatedAt || 0) - Number(b?.[1]?.updatedAt || 0));
    const selectedKeys = [];
    const selectedEntries = new Map();
    const actions = [];
    for (const [cellKey, entry] of entries) {
      const pair = [];
      if (entry?.stockAction) pair.push({ ...entry.stockAction });
      if (entry?.saleAction) pair.push({ ...entry.saleAction });
      if (pair.length <= 0) continue;
      if (actions.length > 0 && actions.length + pair.length > maxBatchActions) break;
      selectedKeys.push(cellKey);
      selectedEntries.set(cellKey, entry);
      actions.push(...pair);
      if (actions.length >= maxBatchActions) break;
    }
    return { actions, selectedKeys, selectedEntries };
  }

  function requeueNaverFailedResults(results, actionByResultKey, selectedEntries, retryLimit) {
    (results || []).forEach((row) => {
      if (row?.status !== "FAILED") return;
      const actionKey = buildNaverResultKey(row?.type, row?.bizItemId, row?.date);
      const action = actionByResultKey.get(actionKey);
      if (!action) return;
      const cellKey = buildNaverQueueCellKey(row?.bizItemId, row?.date);
      const baseEntry = selectedEntries.get(cellKey) || {
        bizItemId: String(row?.bizItemId || ""),
        date: String(row?.date || ""),
        stockAction: null,
        saleAction: null,
        errorCount: 0,
        updatedAt: Date.now()
      };
      const nextErrorCount = Number(baseEntry.errorCount || 0) + 1;
      if (nextErrorCount > retryLimit) return;
      const nextEntry = {
        ...baseEntry,
        stockAction: baseEntry.stockAction,
        saleAction: baseEntry.saleAction,
        errorCount: nextErrorCount,
        updatedAt: Date.now()
      };
      if (String(action?.type || "") === "stock") nextEntry.stockAction = { ...action };
      if (String(action?.type || "") === "sale-day") nextEntry.saleAction = { ...action };
      state.naverQueue.set(cellKey, nextEntry);
    });
  }

  async function executeQueuedNaverActions(syncConfig, sleepMs, trigger = "manual") {
    const naverCfg = resolveNaverExecutionConfig(syncConfig);
    if (naverCfg.mode !== "sync") {
      return {
        mode: naverCfg.mode,
        queueSize: state.naverQueue.size,
        results: []
      };
    }
    if (!shouldFlushNaverQueue(naverCfg, trigger)) {
      return {
        mode: naverCfg.mode,
        queueSize: state.naverQueue.size,
        results: []
      };
    }
    const { actions, selectedKeys, selectedEntries } = buildNaverBatchFromQueue(naverCfg);
    if (actions.length <= 0) {
      return {
        mode: naverCfg.mode,
        queueSize: state.naverQueue.size,
        results: []
      };
    }
    if (actions.length > Number(naverCfg.maxChangesPerRun || actions.length)) {
      return {
        mode: naverCfg.mode,
        queueSize: state.naverQueue.size,
        results: actions.map((action) => ({
          type: action.type,
          bizItemId: action.bizItemId,
          date: action.date,
          status: "FAILED",
          error: `NAVER guard: batch actions ${actions.length} exceeds maxChangesPerRun ${naverCfg.maxChangesPerRun}`
        }))
      };
    }
    selectedKeys.forEach((cellKey) => state.naverQueue.delete(cellKey));
    const actionByResultKey = new Map(
      actions.map((action) => [buildNaverResultKey(action?.type, action?.bizItemId, action?.date), action])
    );
    const effectiveSleepMs = Math.max(Number(sleepMs) || 0, Number(naverCfg.rateLimitMs) || 0);
    const results = await applyNaverActions(actions, effectiveSleepMs);
    requeueNaverFailedResults(results, actionByResultKey, selectedEntries, Number(naverCfg.retryLimit || 0));
    state.naverQueueMeta.lastFlushedAt = Date.now();
    return {
      mode: naverCfg.mode,
      queueSize: state.naverQueue.size,
      results
    };
  }

  function buildPreviewRows(providerKey, actions) {
    const rows = [];
    if (providerKey === "STATION") {
      actions.forEach((action) => {
        const changed = (action.roomChanges || []).filter((row) => Number(row.from) !== Number(row.to));
        if (!changed.length) return;
        rows.push({
          date: action.date,
          action: "SET_STOCK",
          detail: changed.map((row) => `${row.roomId}:${row.from}->${row.to}`).join(", ")
        });
      });
      return rows;
    }

    actions.forEach((action) => {
      if (action.type === "stock") {
        rows.push({
          date: action.date,
          action: "SET_STOCK",
          detail: `${action.bizItemId}: ${action.currentStock} -> ${action.targetStock}`
        });
      } else {
        rows.push({
          date: action.date,
          action: "SET_SALE_DAY",
          detail: `${action.bizItemId}: ${action.currentSaleDay} -> ${action.targetSaleDay}`
        });
      }
    });
    return rows;
  }

  function countClosedItems(providerKey, actions) {
    if (providerKey === "STATION") {
      let count = 0;
      (actions || []).forEach((action) => {
        (action.roomChanges || []).forEach((row) => {
          if (Number(row.from) > 0 && Number(row.to) === 0) count += 1;
        });
      });
      return count;
    }

    const keys = new Set();
    (actions || []).forEach((action) => {
      if (action.type === "stock" && Number(action.currentStock) > 0 && Number(action.targetStock) === 0) {
        keys.add(`${action.date}:${action.bizItemId}`);
      }
      if (action.type === "sale-day" && action.currentSaleDay === true && action.targetSaleDay === false) {
        keys.add(`${action.date}:${action.bizItemId}`);
      }
    });
    return keys.size;
  }

  function buildErrorRowsFromResults(providerKey, results) {
    const rows = [];
    (results || []).forEach((row) => {
      if (row.status !== "FAILED") return;
      const naverType =
        row.type === "stock" ? "재고" : row.type === "sale-day" ? "판매일" : "요청";
      if (providerKey === "STATION") {
        const roomIds = Array.isArray(row.roomIds) ? row.roomIds.filter(Boolean) : [];
        if (roomIds.length > 0) {
          roomIds.forEach((roomId) => {
            rows.push({
              date: row.date || "-",
              roomId,
              type: "적용 실패(스테이션)",
              detail: String(row.error || "요청 실패")
            });
          });
          return;
        }
        rows.push({
          date: row.date || "-",
          type: "적용 실패(스테이션)",
          detail: String(row.error || "요청 실패")
        });
        return;
      }
      rows.push({
        date: row.date || "-",
        roomId: String(row.bizItemId || ""),
        type: `적용 실패(${naverType})`,
        detail: String(row.error || "요청 실패")
      });
    });
    return rows;
  }

  function buildRowsByDateRoomIndex(rows) {
    const index = new Map();
    (rows || []).forEach((row) => {
      const day = String(row?.date || "");
      const roomId = String(row?.roomId || "");
      if (!day || !roomId) return;
      index.set(`${day}::${roomId}`, row);
    });
    return index;
  }

  function buildNaverResultKey(type, bizItemId, day) {
    return `${String(type || "")}::${String(bizItemId || "")}::${String(day || "")}`;
  }

  function buildPostApplyReadbackErrorRows(providerKey, actions, results, rows) {
    const roomPreset = ROOM_PRESETS[providerKey === "STATION" ? "admin-station" : "naver-partner"] || [];
    const roomNameById = new Map(roomPreset.map((room) => [String(room.id), String(room.name || room.id)]));
    const index = buildRowsByDateRoomIndex(rows);
    const errorRows = [];

    if (providerKey === "STATION") {
      const appliedDates = new Set(
        (results || [])
          .filter((row) => row?.status === "APPLIED")
          .map((row) => String(row?.date || ""))
          .filter(Boolean)
      );
      if (appliedDates.size <= 0) return [];
      if (index.size <= 0) {
        return [{ date: "-", type: "적용 후 검증", detail: "재조회 데이터가 없어 스테이션 적용 결과를 검증하지 못했습니다." }];
      }

      (actions || []).forEach((action) => {
        const day = String(action?.date || "");
        if (!day || !appliedDates.has(day)) return;
        (action?.roomChanges || []).forEach((change) => {
          const from = safeInt(change?.from ?? 0);
          const to = safeInt(change?.to ?? 0);
          if (from === to) return;
          const roomId = String(change?.roomId || "");
          const roomName = roomNameById.get(roomId) || roomId || "-";
          const row = index.get(`${day}::${roomId}`);
          if (!row) {
            errorRows.push({
              date: day,
              type: "적용 후 검증(스테이션)",
              detail: `${roomName}: 재조회 행이 없어 목표값 ${to}를 확인할 수 없습니다.`
            });
            return;
          }
          const actual = safeInt(row.settingStock ?? row.availableStock ?? row.stockCount ?? row.stock);
          if (actual !== to) {
            errorRows.push({
              date: day,
              type: "적용 후 검증(스테이션)",
              detail: `${roomName}: 목표 ${to}, 재조회 ${actual}`
            });
          }
        });
      });
      return errorRows;
    }

    const appliedKeys = new Set(
      (results || [])
        .filter((row) => row?.status === "APPLIED")
        .map((row) => buildNaverResultKey(row?.type, row?.bizItemId, row?.date))
    );
    if (appliedKeys.size <= 0) return [];
    if (index.size <= 0) {
      return [{ date: "-", type: "적용 후 검증", detail: "재조회 데이터가 없어 네이버 적용 결과를 검증하지 못했습니다." }];
    }

    (actions || []).forEach((action) => {
      const type = String(action?.type || "");
      const roomId = String(action?.bizItemId || "");
      const day = String(action?.date || "");
      const actionKey = buildNaverResultKey(type, roomId, day);
      if (!appliedKeys.has(actionKey)) return;

      const roomName = roomNameById.get(roomId) || roomId || "-";
      const row = index.get(`${day}::${roomId}`);
      if (!row) {
        errorRows.push({
          date: day || "-",
          type: type === "sale-day" ? "적용 후 검증(네이버 판매일)" : "적용 후 검증(네이버 재고)",
          detail: `${roomName}: 재조회 행이 없어 적용 값을 확인할 수 없습니다.`
        });
        return;
      }

      if (type === "stock") {
        const expected = safeInt(action?.targetStock ?? 0);
        const actual = safeInt(row.availableStock ?? row.settingStock ?? row.stock);
        if (actual !== expected) {
          errorRows.push({
            date: day || "-",
            type: "적용 후 검증(네이버 재고)",
            detail: `${roomName}: 목표 ${expected}, 재조회 ${actual}`
          });
        }
        return;
      }

      if (type === "sale-day") {
        const expected = Boolean(action?.targetSaleDay);
        const normalizedOpen = normalizeOpenStatus(row.openStatus);
        if (normalizedOpen === "UNKNOWN") {
          errorRows.push({
            date: day || "-",
            type: "적용 후 검증(네이버 판매일)",
            detail: `${roomName}: 재조회 오픈 상태를 판별할 수 없습니다.`
          });
          return;
        }
        const actual = normalizedOpen === "OPEN";
        if (actual !== expected) {
          errorRows.push({
            date: day || "-",
            type: "적용 후 검증(네이버 판매일)",
            detail: `${roomName}: 목표 ${expected ? "오픈" : "닫음"}, 재조회 ${actual ? "오픈" : "닫음"}`
          });
        }
      }
    });

    return errorRows;
  }

  function countPreviewMismatches(providerKey, actions) {
    if (providerKey === "STATION") {
      return (actions || []).reduce((acc, action) => acc + Number(action?.mismatchCount || 0), 0);
    }
    return (actions || []).filter((action) => action?.countAsMismatch !== false).length;
  }

  function buildValidationRows(validation) {
    return (validation?.issues || []).map((issue) => ({
      date: issue?.date || "-",
      type: issue?.level === "error" ? "SHEET_ERROR" : "SHEET_WARN",
      detail: String(issue?.message || "")
    }));
  }

  function normalizePlannerWarning(warning) {
    if (!warning) return null;
    if (typeof warning === "string") {
      const calendarMatch = warning.match(/\[station\]\s+no calendar rows for\s+(\d{4}-\d{2}-\d{2})/i);
      if (calendarMatch) {
        return {
          provider: "STATION",
          code: "STATION_NO_CALENDAR_ROWS",
          date: calendarMatch[1],
          message: warning
        };
      }
      const priceSetMatch = warning.match(/\[station\]\s+no priceSetId for\s+(\d{4}-\d{2}-\d{2})/i);
      if (priceSetMatch) {
        return {
          provider: "STATION",
          code: "STATION_NO_PRICE_SET_ID",
          date: priceSetMatch[1],
          message: warning
        };
      }
      return {
        provider: "STATION",
        code: "STATION_PLANNER_WARNING",
        date: "-",
        message: warning
      };
    }
    if (typeof warning !== "object" || Array.isArray(warning)) return null;
    return {
      provider: normalizeText(warning.provider || "STATION").toUpperCase() || "STATION",
      code: normalizeText(warning.code || "STATION_PLANNER_WARNING").toUpperCase() || "STATION_PLANNER_WARNING",
      date: normalizeText(warning.date || "-") || "-",
      message: String(warning.message || "")
    };
  }

  function providerTypeFromProviderKey(providerKey) {
    return normalizeText(providerKey).toUpperCase() === "STATION" ? "admin-station" : "naver-partner";
  }

  function buildSyncApplyPolicy(preview) {
    const issues = [];
    const pushIssue = (row) => {
      if (!row || typeof row !== "object") return;
      issues.push({
        date: row.date || "-",
        type: row.type || "적용 차단",
        detail: row.detail || ""
      });
    };

    const scanIssues = Array.isArray(preview?.snapshot?.scan?.validation?.issues)
      ? preview.snapshot.scan.validation.issues
      : [];
    scanIssues.forEach((issue) => {
      const severity = normalizeText(issue?.severity || "").toLowerCase();
      const code = normalizeText(issue?.code || "").toUpperCase();
      const message = String(issue?.message || code || "scan issue");
      if (severity === "error") {
        pushIssue({ type: "적용 차단(SCAN_ERROR)", detail: message });
        return;
      }
      if (severity === "warn" && APPLY_BLOCKING_SCAN_WARN_CODES.has(code)) {
        pushIssue({ type: "적용 차단(SCAN_WARN)", detail: message });
      }
    });

    (preview?.validation?.issues || []).forEach((issue) => {
      const level = normalizeText(issue?.level || "").toLowerCase();
      const code = normalizeText(issue?.code || "").toUpperCase();
      const message = String(issue?.message || code || "validation issue");
      if (level === "error") {
        pushIssue({ date: issue?.date || "-", type: "적용 차단(SHEET_ERROR)", detail: message });
        return;
      }
      if (level === "warn" && APPLY_BLOCKING_PREVIEW_WARN_CODES.has(code)) {
        pushIssue({ date: issue?.date || "-", type: "적용 차단(SHEET_WARN)", detail: message });
      }
    });

    (preview?.warnings || [])
      .map((warning) => normalizePlannerWarning(warning))
      .filter(Boolean)
      .forEach((warning) => {
        if (!APPLY_BLOCKING_PLANNER_WARNING_CODES.has(warning.code)) return;
        pushIssue({
          date: warning.date || "-",
          type: "적용 차단(PLAN_WARN)",
          detail: warning.message || warning.code
        });
      });

    const providerType = providerTypeFromProviderKey(preview?.providerKey || "");
    const providerApply = preview?.syncConfig?.providerApply && typeof preview.syncConfig.providerApply === "object"
      ? preview.syncConfig.providerApply
      : {};
    if (providerApply[providerType] === false) {
      pushIssue({
        type: "적용 차단(SETTINGS)",
        detail: `${providerType === "naver-partner" ? TEXT.syncProviderApplyHintNaver : TEXT.syncProviderApplyHintStation} 설정이 꺼져 있습니다.`
      });
    }

    const previewSourceUsage = getPreviewSourceUsage(preview);
    const providerRawCount = Number(previewSourceUsage?.counts?.provider_raw || 0);
    if (providerRawCount > 0) {
      pushIssue({
        type: "적용 차단(LOW_TRUST_SOURCE)",
        detail: `저신뢰 소스(provider_raw) ${providerRawCount}개가 감지되어 실제 적용을 차단했습니다. 시트 재고 데이터행을 먼저 고정하세요.`
      });
    }

    return {
      blocked: issues.length > 0,
      issues
    };
  }

  function hasAnyInventoryRawByDate(valuesByDate) {
    return Object.values(valuesByDate || {}).some((inv) => normalizeText(inv?.raw || ""));
  }

  function hasAnyInventoryRawByRoom(roomValuesByRoom) {
    return Object.values(roomValuesByRoom || {}).some((valuesByDate) => hasAnyInventoryRawByDate(valuesByDate));
  }

  function assertProviderInventorySource(snapshot, providerKey) {
    const valuesByDate = providerKey === "STATION" ? snapshot.stationValues : snapshot.naverValues;
    const roomValueMaps = resolveProviderRoomValueMaps(snapshot, providerKey);
    const roomValuesByRoom = roomValueMaps.rawRoomValuesById;
    const derivedRoomValuesByRoom = roomValueMaps.derivedRoomValuesById;
    const hasProviderRow = snapshot.inventoryRows?.[providerKey] !== undefined;
    const hasProviderValues = hasAnyInventoryRawByDate(valuesByDate);
    const hasRoomValues = hasAnyInventoryRawByRoom(roomValuesByRoom);
    const hasDerivedRoomValues = hasAnyInventoryRawByRoom(derivedRoomValuesByRoom);
    if (!hasProviderRow && !hasProviderValues && !hasRoomValues && !hasDerivedRoomValues) {
      throw new Error(`Sheet inventory source is missing for provider: ${providerKey}`);
    }
  }

  function buildTargetMapByRoom(roomValuesByRoom, roomIds, mode, providerKey) {
    const out = {};
    (roomIds || []).forEach((roomIdRaw) => {
      const roomId = String(roomIdRaw || "");
      if (!roomId) return;
      const valuesByDate = roomValuesByRoom?.[roomId] || {};
      Object.entries(valuesByDate || {}).forEach(([day, inv]) => {
        const target = inventoryValueToTargetUnits(inv, mode, providerKey, day);
        if (target === null || target === undefined) return;
        if (!out[day]) out[day] = {};
        out[day][roomId] = Math.max(0, Number(target) || 0);
      });
    });
    return out;
  }

  function analyzeTargetMapByRoom(roomValuesByRoom, targetsByDay, roomPreset, providerKey) {
    const issues = [];
    const details = [];
    (roomPreset || []).forEach((room) => {
      const roomId = String(room?.id || "");
      if (!roomId) return;
      const valuesByDate = roomValuesByRoom?.[roomId] || {};
      const roomTargets = {};
      Object.entries(targetsByDay || {}).forEach(([day, targetByRoom]) => {
        if (!targetByRoom || typeof targetByRoom !== "object" || Array.isArray(targetByRoom)) return;
        if (!Object.prototype.hasOwnProperty.call(targetByRoom, roomId)) return;
        roomTargets[day] = Number(targetByRoom[roomId]) || 0;
      });
      const analyzed = analyzeTargetMap(valuesByDate, roomTargets, providerKey);
      (analyzed.issues || []).forEach((issue) => {
        issues.push({
          ...issue,
          roomId,
          roomName: room?.name || roomId,
          message: `[${room?.name || roomId}] ${issue?.message || ""}`
        });
      });
      (analyzed.details || []).forEach((detail) => {
        details.push({
          ...detail,
          roomId,
          roomName: room?.name || roomId
        });
      });
    });
    return {
      issues,
      details,
      errorCount: issues.filter((x) => x.level === "error").length,
      warnCount: issues.filter((x) => x.level === "warn").length
    };
  }

  function buildTraceSettingsSnapshot(syncConfig, snapshot, providerKey, targetMode, query) {
    const safeScan = snapshot?.scan || {};
    return {
      providerKey,
      targetMode,
      stockMode: normalizeText(syncConfig?.stockMode || ""),
      providerApply: { ...((syncConfig?.providerApply && typeof syncConfig.providerApply === "object") ? syncConfig.providerApply : {}) },
      naverExecution: resolveNaverExecutionConfig(syncConfig),
      query: {
        startDate: query?.startDate || "",
        endDate: query?.endDate || ""
      },
      scan: {
        mode: safeScan?.mode || "",
        blockDetailMode: safeScan?.blockDetailMode || "light",
        dateRow: safeScan?.dateRow ?? null,
        dateStartCol: safeScan?.dateStartCol ?? null,
        dateEndCol: safeScan?.dateEndCol ?? null,
        roomStartRow: safeScan?.roomStartRow ?? null,
        roomEndRow: safeScan?.roomEndRow ?? null,
        inventoryRows: { ...(safeScan?.inventoryRows || {}) },
        inventoryValueRows: { ...(safeScan?.inventoryValueRows || {}) },
        roomTypeRanges: { ...(safeScan?.roomTypeRanges || {}) },
        inventoryTypeRanges: { ...(safeScan?.inventoryTypeRanges || {}) },
        roomSoldVacScanRange: { ...(safeScan?.roomSoldVacScanRange || {}) }
      }
    };
  }

  function collectBlockScanEscalationReasons(preview) {
    const reasons = [];
    const scanIssues = Array.isArray(preview?.snapshot?.scan?.validation?.issues)
      ? preview.snapshot.scan.validation.issues
      : [];
    const scanErrorCount = scanIssues.filter(
      (issue) => normalizeText(issue?.severity || "").toLowerCase() === "error"
    ).length;
    const scanWarnCount = scanIssues.filter((issue) => {
      if (normalizeText(issue?.severity || "").toLowerCase() !== "warn") return false;
      const code = normalizeText(issue?.code || "").toUpperCase();
      return APPLY_BLOCKING_SCAN_WARN_CODES.has(code);
    }).length;
    if (scanErrorCount > 0) reasons.push("scan-validation-error");
    else if (scanWarnCount > 0) reasons.push("scan-validation-warn");

    if (Number(preview?.validation?.errorCount || 0) > 0) {
      reasons.push("preview-validation-error");
    }

    const traceState = normalizeText(preview?.tracePacket?.traceState || "").toLowerCase();
    const traceMatchedBlocks = Number(preview?.tracePacket?.joinSelection?.reservationBlocks?.matchedCount || 0);
    if (traceState === "mismatch" && traceMatchedBlocks <= 0) {
      reasons.push("trace-mismatch-no-reservation-block");
    }

    const mismatchCount = Number(preview?.mismatchCount || 0);
    const reservationBlockCount = Number(preview?.snapshot?.scan?.reservationBlockCount || 0);
    if (mismatchCount > 0 && reservationBlockCount <= 0) {
      reasons.push("mismatch-without-reservation-block");
    }

    return Array.from(new Set(reasons));
  }

  function annotatePreviewBlockScan(preview, meta) {
    const safeMeta = meta && typeof meta === "object" ? meta : {};
    return {
      ...preview,
      blockScan: {
        mode: safeMeta.mode || "light",
        escalated: safeMeta.escalated === true,
        reasons: Array.isArray(safeMeta.reasons) ? [...safeMeta.reasons] : [],
        fromMode: safeMeta.fromMode || null,
        toMode: safeMeta.toMode || null,
        escalationError: safeMeta.escalationError || ""
      }
    };
  }

  function buildTracePacketForMismatch(
    query,
    syncConfig,
    providerKey,
    roomPreset,
    rows,
    snapshot,
    targets,
    targetMode,
    validation
  ) {
    const preset = Array.isArray(roomPreset) ? roomPreset : [];
    const dates = buildDateRange(query.startDate, query.endDate);
    if (!preset.length || !dates.length) return null;

    const siteRowIndex = new Map();
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      const day = String(row?.date || "");
      const roomId = String(row?.roomId || "");
      if (!day || !roomId) return;
      siteRowIndex.set(`${day}::${roomId}`, row);
    });

    const roomValueMaps = resolveProviderRoomValueMaps(snapshot, providerKey);
    const inventoryDataRows = providerKey === "STATION"
      ? snapshot?.inventoryDataRows?.STATION
      : snapshot?.inventoryDataRows?.NAVER;
    const allowProviderFallback = shouldAllowProviderFallback(snapshot, providerKey, preset.length);

    let selected = null;
    let firstComparable = null;
    for (const day of dates) {
      for (const room of preset) {
        const roomId = String(room?.id || "");
        if (!roomId) continue;
        const siteRow = siteRowIndex.get(`${day}::${roomId}`) || null;
        if (!siteRow) continue;
        const siteRaw = rowToValue(siteRow);
        const siteNormalized = normalizeDisplayInventoryValue(siteRaw);
        const sheetResolved = resolveSheetSnapshotInventoryCell(
          snapshot,
          providerKey,
          roomId,
          day,
          allowProviderFallback,
          roomValueMaps
        );
        const sheetInv = sheetResolved.inv || null;
        const sheetRaw = normalizeText(sheetInv?.raw || "");
        const sheetNormalized = normalizeDisplayInventoryValue(sheetRaw);
        const base = {
          day,
          roomId,
          roomName: String(room?.name || roomId),
          siteRow,
          siteRaw,
          siteNormalized,
          sheetResolved,
          sheetInv,
          sheetRaw,
          sheetNormalized
        };
        if (!firstComparable) firstComparable = base;
        if (siteNormalized !== sheetNormalized) {
          selected = base;
          break;
        }
      }
      if (selected) break;
    }

    const packetCase = selected || firstComparable;
    if (!packetCase) return null;
    const dayTargetRaw = targets?.[packetCase.day];
    const finalOutput = (
      dayTargetRaw &&
      typeof dayTargetRaw === "object" &&
      !Array.isArray(dayTargetRaw)
    )
      ? Number(dayTargetRaw?.[packetCase.roomId] ?? 0)
      : Number(dayTargetRaw ?? 0);
    const providerTrace = snapshot?.trace?.providerValueSources?.[providerKey] || {};
    const providerCellTrace = providerTrace?.cellTraceByDate?.[packetCase.day] || null;
    const traceState = packetCase === selected ? "mismatch" : "matched";
    const roomTypeKeyByRoomId = snapshot?.derivedCorrections?.[providerKey]?.roomTypeMap || {};
    const packetRoomTypeKey = normalizeText(roomTypeKeyByRoomId?.[packetCase.roomId] || "");
    const matchedReservationBlocks = (Array.isArray(snapshot?.reservationBlocks) ? snapshot.reservationBlocks : [])
      .filter((block) => {
        const dateKeys = Array.isArray(block?.dateKeys) ? block.dateKeys : [];
        if (!dateKeys.includes(packetCase.day)) return false;
        if (packetRoomTypeKey && normalizeText(block?.roomTypeKey || "") !== packetRoomTypeKey) return false;
        return true;
      })
      .map((block) => ({
        blockId: normalizeText(block?.blockId || ""),
        kind: normalizeText(block?.kind || ""),
        channel: normalizeText(block?.channel || ""),
        roomType: normalizeText(block?.roomType || ""),
        roomTypeKey: normalizeText(block?.roomTypeKey || ""),
        roomNo: normalizeText(block?.roomNo || ""),
        row: Number(block?.row) || null,
        source: normalizeText(block?.source || ""),
        startDate: normalizeText(block?.startDate || ""),
        endDate: normalizeText(block?.endDate || ""),
        nights: Number(block?.nights || 0),
        startColA1: normalizeText(block?.startColA1 || ""),
        endColA1: normalizeText(block?.endColA1 || ""),
        noteKey: normalizeText(block?.noteKey || "")
      }));
    const reservationBlockChannels = matchedReservationBlocks.reduce((acc, block) => {
      const key = normalizeText(block?.channel || "") || "UNKNOWN";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const selectedReservationBlock = matchedReservationBlocks.length > 0 ? matchedReservationBlocks[0] : null;

    return {
      tracePacketVersion: 1,
      traceState,
      caseId: `${providerKey}:${packetCase.day}:${packetCase.roomId}`,
      createdAt: new Date().toISOString(),
      inputRange: {
        spreadsheetId: snapshot?.spreadsheetId || "",
        sheetName: snapshot?.sheetName || "",
        queryStartDate: query.startDate,
        queryEndDate: query.endDate,
        readRangeA1: snapshot?.trace?.range?.readRangeA1 || null,
        dateRow: snapshot?.scan?.dateRow ?? null,
        dateColumnA1: (() => {
          const col = (snapshot?.dateCols || []).find((dc) => dc?.dateKey === packetCase.day)?.col;
          return Number.isInteger(col) ? oneBasedColToA1(col + 1) : null;
        })()
      },
      sheetRowOriginal: {
        displayedValue: packetCase.sheetRaw,
        parserRead: packetCase.sheetInv
          ? {
              raw: normalizeText(packetCase.sheetInv?.raw || ""),
              current: Number.isInteger(packetCase.sheetInv?.current) ? Number(packetCase.sheetInv.current) : null,
              maximum: Number.isInteger(packetCase.sheetInv?.maximum) ? Number(packetCase.sheetInv.maximum) : null,
              corrected: packetCase.sheetInv?.corrected === true,
              originalRaw: normalizeText(packetCase.sheetInv?.originalRaw || "")
            }
          : null,
        sourceType: packetCase.sheetResolved?.source || "none",
        valueType: providerCellTrace?.effectiveValueType || providerCellTrace?.userEnteredValueType || "",
        formula: providerCellTrace?.formula || "",
        userEnteredValueType: providerCellTrace?.userEnteredValueType || "",
        userEnteredValueRaw: providerCellTrace?.userEnteredValueRaw ?? null,
        effectiveValueType: providerCellTrace?.effectiveValueType || "",
        effectiveValueRaw: providerCellTrace?.effectiveValueRaw ?? null
      },
      sheetDisplayValue: packetCase.sheetRaw,
      apiReadValue: {
        site: {
          date: String(packetCase.siteRow?.date || ""),
          roomId: String(packetCase.siteRow?.roomId || ""),
          roomName: String(packetCase.siteRow?.roomName || ""),
          openStatus: normalizeText(packetCase.siteRow?.openStatus || ""),
          settingStock: safeInt(packetCase.siteRow?.settingStock ?? null),
          availableStock: safeInt(packetCase.siteRow?.availableStock ?? null),
          stock: safeInt(packetCase.siteRow?.stock ?? null),
          saleDay: typeof packetCase.siteRow?.isSaleDay === "boolean" ? packetCase.siteRow.isSaleDay : null,
          renderedValue: packetCase.siteRaw
        },
        sheet: packetCase.sheetInv
          ? {
              raw: normalizeText(packetCase.sheetInv?.raw || ""),
              current: Number.isInteger(packetCase.sheetInv?.current) ? Number(packetCase.sheetInv.current) : null,
              maximum: Number.isInteger(packetCase.sheetInv?.maximum) ? Number(packetCase.sheetInv.maximum) : null,
              source: packetCase.sheetResolved?.source || "none"
            }
          : null
      },
      normalizedValue: {
        site: packetCase.siteNormalized,
        sheet: packetCase.sheetNormalized
      },
      joinSelection: {
        providerValueSource: {
          providerRow: providerTrace?.providerRow ?? null,
          selectedRow: providerTrace?.selectedRow ?? null,
          selectedReason: providerTrace?.selectedReason || "",
          candidates: Array.isArray(providerTrace?.candidates) ? providerTrace.candidates : []
        },
        roomValueSource: {
          roomDataRows: Array.isArray(inventoryDataRows) ? [...inventoryDataRows] : [],
          resolvedSource: packetCase.sheetResolved?.source || "none"
        },
        reservationBlocks: {
          roomTypeKey: packetRoomTypeKey || "",
          matchedCount: matchedReservationBlocks.length,
          channels: reservationBlockChannels,
          selected: selectedReservationBlock,
          candidates: matchedReservationBlocks
        }
      },
      finalOutputValue: {
        targetUnits: Number.isFinite(finalOutput) ? finalOutput : 0,
        targetMode
      },
      settingsSnapshot: buildTraceSettingsSnapshot(syncConfig, snapshot, providerKey, targetMode, query),
      validationSummary: {
        errorCount: Number(validation?.errorCount || 0),
        warnCount: Number(validation?.warnCount || 0)
      }
    };
  }

  function buildTracePacketsForMismatches(
    query,
    providerKey,
    roomPreset,
    rows,
    snapshot,
    targets,
    targetMode
  ) {
    const preset = Array.isArray(roomPreset) ? roomPreset : [];
    const dates = buildDateRange(query.startDate, query.endDate);
    if (!preset.length || !dates.length) return [];

    const siteRowIndex = new Map();
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      const day = String(row?.date || "");
      const roomId = String(row?.roomId || "");
      if (!day || !roomId) return;
      siteRowIndex.set(`${day}::${roomId}`, row);
    });

    const roomValueMaps = resolveProviderRoomValueMaps(snapshot, providerKey);
    const inventoryDataRows = providerKey === "STATION"
      ? snapshot?.inventoryDataRows?.STATION
      : snapshot?.inventoryDataRows?.NAVER;
    const allowProviderFallback = shouldAllowProviderFallback(snapshot, providerKey, preset.length);

    const providerTrace = snapshot?.trace?.providerValueSources?.[providerKey] || {};
    const dateColByDay = new Map(
      (Array.isArray(snapshot?.dateCols) ? snapshot.dateCols : [])
        .filter((dc) => dc?.dateKey && Number.isInteger(dc?.col))
        .map((dc) => [dc.dateKey, Number(dc.col)])
    );
    const providerSelectedRow = Number(providerTrace?.selectedRow);
    const providerRowFallback = Number(providerTrace?.providerRow);
    const createdAt = new Date().toISOString();
    const packets = [];
    dates.forEach((day) => {
      preset.forEach((room, roomIndex) => {
        const roomId = String(room?.id || "");
        if (!roomId) return;
        const siteRow = siteRowIndex.get(`${day}::${roomId}`) || null;
        if (!siteRow) return;

        const siteRaw = rowToValue(siteRow);
        const siteNormalized = normalizeDisplayInventoryValue(siteRaw);
        const sheetResolved = resolveSheetSnapshotInventoryCell(
          snapshot,
          providerKey,
          roomId,
          day,
          allowProviderFallback,
          roomValueMaps
        );
        const sheetInv = sheetResolved.inv || null;
        const sheetRaw = normalizeText(sheetInv?.raw || "");
        const sheetNormalized = normalizeDisplayInventoryValue(sheetRaw);
        if (siteNormalized === sheetNormalized) return;

        const dayTargetRaw = targets?.[day];
        const finalOutput = (
          dayTargetRaw &&
          typeof dayTargetRaw === "object" &&
          !Array.isArray(dayTargetRaw)
        )
          ? Number(dayTargetRaw?.[roomId] ?? 0)
          : Number(dayTargetRaw ?? 0);
        const providerCellTrace = providerTrace?.cellTraceByDate?.[day] || null;
        const dateCol = dateColByDay.get(day);
        let sourceRow = null;
        if (sheetResolved?.source === "provider_raw") {
          sourceRow = Number.isInteger(providerSelectedRow)
            ? providerSelectedRow
            : Number.isInteger(providerRowFallback)
              ? providerRowFallback
              : null;
        } else if (
          (sheetResolved?.source === "room_raw" || sheetResolved?.source === "room_derived") &&
          Array.isArray(inventoryDataRows) &&
          Number.isInteger(inventoryDataRows[roomIndex])
        ) {
          sourceRow = Number(inventoryDataRows[roomIndex]) + 1;
        }
        if (!Number.isInteger(sourceRow) && Number.isInteger(providerCellTrace?.row)) {
          sourceRow = Number(providerCellTrace.row);
        }

        packets.push({
          caseId: `${providerKey}:${day}:${roomId}`,
          traceState: "mismatch",
          date: day,
          roomId,
          roomName: String(room?.name || roomId),
          sourceType: sheetResolved?.source || "none",
          sheetRow: Number.isInteger(sourceRow) ? sourceRow : null,
          sheetCol: Number.isInteger(dateCol) ? dateCol + 1 : null,
          sheetColA1: Number.isInteger(dateCol) ? oneBasedColToA1(dateCol + 1) : null,
          siteValueRaw: siteRaw,
          sheetValueRaw: sheetRaw,
          siteValue: siteNormalized,
          sheetValue: sheetNormalized,
          targetUnits: Number.isFinite(finalOutput) ? finalOutput : 0,
          targetMode,
          providerSelectedRow: providerTrace?.selectedRow ?? null,
          providerReason: providerTrace?.selectedReason || "",
          createdAt
        });
      });
    });
    return packets;
  }

  function buildSyncPreviewContext(snapshot, rows) {
    const isStation = context.providerType === "admin-station";
    const providerKey = isStation ? "STATION" : "NAVER";
    const normalizedRows = Array.isArray(rows) ? rows : [];
    const valuesByDate = isStation ? snapshot.stationValues : snapshot.naverValues;
    const roomValueMaps = resolveProviderRoomValueMaps(snapshot, providerKey);
    const dates = Array.isArray(snapshot?.dateCols) ? snapshot.dateCols.map((dc) => dc?.dateKey).filter(Boolean) : [];
    const roomPreset = (() => {
      const preset = ROOM_PRESETS[context.providerType] || [];
      const roomTypeMap = snapshot?.derivedCorrections?.[providerKey]?.roomTypeMap || {};
      const presetNameById = new Map(
        preset.map((room) => [String(room?.id || ""), String(room?.name || room?.id || "")])
      );
      const presetOrder = new Map(preset.map((room, index) => [String(room?.id || ""), index]));
      const namesById = new Map();
      const pushName = (idRaw, nameRaw) => {
        const id = String(idRaw || "");
        const name = String(nameRaw || "").trim();
        if (!id || !name || namesById.has(id)) return;
        namesById.set(id, name);
      };
      preset.forEach((room) => pushName(room?.id, room?.name));
      normalizedRows.forEach((row) => {
        const id = String(row?.roomId || row?.providerItemId || "");
        if (!id) return;
        pushName(id, row?.roomName);
        pushName(id, row?.rawRoomName);
        pushName(id, row?.mappingMatchedName);
      });
      const discoveredIds = new Set();
      normalizedRows.forEach((row) => {
        const id = String(row?.roomId || row?.providerItemId || "");
        if (id) discoveredIds.add(id);
      });
      Object.keys(roomValueMaps?.mergedRoomValuesById || {}).forEach((id) => {
        if (id) discoveredIds.add(String(id));
      });
      if (discoveredIds.size <= 0) {
        preset.forEach((room) => {
          const id = String(room?.id || "");
          if (id) discoveredIds.add(id);
        });
      }
      const toRoomType = (id, name) => {
        const explicit = normalizeText(roomTypeMap?.[id] || "");
        if (explicit) return explicit;
        const normalized = normalizeRoomTypeKeyForSummary(name || "");
        if (normalized === "urban") return ROOM_TYPE_LABELS.urban;
        if (normalized === "doubleTwin") return ROOM_TYPE_LABELS.doubleTwin;
        if (normalized === "grand") return ROOM_TYPE_LABELS.grand;
        return "UNKNOWN";
      };
      return [...discoveredIds]
        .filter(Boolean)
        .sort((a, b) => {
          const ao = presetOrder.get(a);
          const bo = presetOrder.get(b);
          const hasOrderA = Number.isInteger(ao);
          const hasOrderB = Number.isInteger(bo);
          if (hasOrderA && hasOrderB && ao !== bo) return ao - bo;
          if (hasOrderA && !hasOrderB) return -1;
          if (!hasOrderA && hasOrderB) return 1;
          return a.localeCompare(b);
        })
        .map((id) => {
          const name = namesById.get(id) || presetNameById.get(id) || id;
          return {
            id,
            name,
            roomType: toRoomType(id, name)
          };
        });
    })();
    const roomIds = roomPreset.map((row) => row.id).filter(Boolean);
    const roomValuesByRoom = buildResolvedRoomValuesByRoom(
      snapshot,
      providerKey,
      roomPreset,
      dates,
      roomValueMaps
    );
    assertProviderInventorySource(snapshot, providerKey);
    return {
      roomPreset,
      roomIds,
      providerItemMap: roomPreset.reduce((acc, item) => {
        const id = String(item?.id || "");
        if (!id) return acc;
        acc[id] = {
          roomType: String(item?.roomType || "UNKNOWN"),
          roomName: String(item?.name || id)
        };
        return acc;
      }, {}),
      isStation,
      providerKey,
      valuesByDate,
      roomValueMaps,
      dates,
      roomValuesByRoom,
      hasCompleteRoomDataRows: hasCompleteProviderRoomDataRows(snapshot, providerKey, roomIds.length),
      normalizedRows,
      snapshot
    };
  }

  function hasCompleteRoomTargetCoverage(targetsByDay, roomIds, dates) {
    const safeRoomIds = Array.isArray(roomIds) ? roomIds.filter(Boolean) : [];
    const safeDates = Array.isArray(dates) ? dates.filter(Boolean) : [];
    if (!safeRoomIds.length || !safeDates.length) return false;
    return safeDates.every((day) => {
      const byRoom = targetsByDay?.[day];
      if (!byRoom || typeof byRoom !== "object" || Array.isArray(byRoom)) return false;
      return safeRoomIds.every((roomId) => Object.prototype.hasOwnProperty.call(byRoom, roomId));
    });
  }

  function resolveSyncPreviewTargets(previewContext, stockMode) {
    const providerTargets = buildTargetMap(previewContext.valuesByDate, stockMode, previewContext.providerKey);
    const roomTargets = buildTargetMapByRoom(
      previewContext.roomValuesByRoom,
      previewContext.roomIds,
      stockMode,
      previewContext.providerKey
    );
    const hasRoomTargets =
      previewContext.hasCompleteRoomDataRows &&
      hasCompleteRoomTargetCoverage(roomTargets, previewContext.roomIds, previewContext.dates);
    const targets = hasRoomTargets ? roomTargets : providerTargets;
    if (!Object.keys(targets).length) {
      throw new Error(`선택한 기간에서 ${previewContext.providerKey} 목표값을 해석하지 못했습니다.`);
    }
    const validation = hasRoomTargets
      ? analyzeTargetMapByRoom(
        previewContext.roomValuesByRoom,
        roomTargets,
        previewContext.roomPreset,
        previewContext.providerKey
      )
      : analyzeTargetMap(previewContext.valuesByDate, providerTargets, previewContext.providerKey);
    return {
      providerTargets,
      roomTargets,
      targets,
      targetMode: hasRoomTargets ? "room" : "provider",
      validation
    };
  }

  function planSyncPreviewActions(previewContext, targets) {
    if (previewContext.isStation) {
      const branchId = resolveActiveStationBranchId(previewContext.syncConfig);
      const planned = planStationActions(
        targets,
        previewContext.normalizedRows,
        previewContext.roomIds,
        branchId
      );
      return {
        actions: planned.actions,
        warnings: planned.warnings
      };
    }
    return {
      actions: planNaverActions(targets, previewContext.roomIds, previewContext.normalizedRows, "extension-sheet-sync"),
      warnings: []
    };
  }

  function cloneSyncPreviewTargets(targets) {
    const cloned = {};
    Object.entries(targets || {}).forEach(([day, value]) => {
      if (value && typeof value === "object" && !Array.isArray(value)) cloned[day] = { ...value };
      else cloned[day] = value;
    });
    return cloned;
  }

  function buildSyncPreviewTraceArtifacts(query, syncConfig, previewContext, targets, targetMode, validation) {
    return {
      tracePacket: buildTracePacketForMismatch(
        query,
        syncConfig,
        previewContext.providerKey,
        previewContext.roomPreset,
        previewContext.normalizedRows,
        previewContext.snapshot,
        targets,
        targetMode,
        validation
      ),
      tracePackets: buildTracePacketsForMismatches(
        query,
        previewContext.providerKey,
        previewContext.roomPreset,
        previewContext.normalizedRows,
        previewContext.snapshot,
        targets,
        targetMode
      )
    };
  }

  function buildSyncPreviewFromData(query, syncConfig, rows, snapshot) {
    const previewContext = buildSyncPreviewContext(snapshot, rows);
    const {
      providerTargets,
      roomTargets,
      targets,
      targetMode,
      validation
    } = resolveSyncPreviewTargets(previewContext, syncConfig.stockMode);
    const { actions, warnings } = planSyncPreviewActions(previewContext, targets);
    const mismatchCount = countPreviewMismatches(previewContext.providerKey, actions);
    const forcedTargets = cloneSyncPreviewTargets(targets);
    const { tracePacket, tracePackets } = buildSyncPreviewTraceArtifacts(
      query,
      syncConfig,
      previewContext,
      targets,
      targetMode,
      validation
    );
    const preview = {
      providerKey: previewContext.providerKey,
      query,
      snapshot,
      targets,
      targetMode,
      providerTargets,
      roomTargets,
      providerItemMap: previewContext.providerItemMap,
      validation,
      actions,
      warnings,
      forced: { targets: forcedTargets, overrides: [] },
      mismatchCount,
      previewRows: buildPreviewRows(previewContext.providerKey, actions),
      tracePacket,
      tracePackets,
      syncConfig,
      rows: previewContext.normalizedRows
    };

    return {
      ...preview,
      policy: buildSyncApplyPolicy(preview)
    };
  }

  async function buildSyncPreview(query, syncConfig, loadedRows = null, loadedSnapshot = null) {
    const snapshot = loadedSnapshot || (
      await fetchSheetSnapshot(syncConfig, query, false, false, { blockDetailMode: "light" })
    );
    const rows = Array.isArray(loadedRows)
      ? loadedRows
      : normalizeRows(await fetchProviderRows(context.providerType, query), query, context.providerType);
    const basePreview = buildSyncPreviewFromData(query, syncConfig, rows, snapshot);
    const currentMode = normalizeText(basePreview?.snapshot?.scan?.blockDetailMode || "light").toLowerCase() === "full"
      ? "full"
      : "light";
    if (currentMode === "full") {
      return annotatePreviewBlockScan(basePreview, { mode: "full", escalated: false, reasons: [] });
    }

    const escalationReasons = collectBlockScanEscalationReasons(basePreview);
    if (escalationReasons.length <= 0) {
      return annotatePreviewBlockScan(basePreview, { mode: "light", escalated: false, reasons: [] });
    }

    try {
      const fullSnapshot = await fetchSheetSnapshot(syncConfig, query, false, false, {
        blockDetailMode: "full"
      });
      const fullPreview = buildSyncPreviewFromData(query, syncConfig, rows, fullSnapshot);
      return annotatePreviewBlockScan(fullPreview, {
        mode: "full",
        escalated: true,
        reasons: escalationReasons,
        fromMode: "light",
        toMode: "full"
      });
    } catch (escalationError) {
      return annotatePreviewBlockScan(basePreview, {
        mode: "light",
        escalated: false,
        reasons: escalationReasons,
        fromMode: "light",
        toMode: "full",
        escalationError: escalationError?.message ?? String(escalationError)
      });
    }
  }

  async function refreshSyncPreview(query, loadedRows = null, loadedSnapshot = null) {
    const syncConfig = await persistSyncConfig(false);
    const preview = await buildSyncPreview(query, syncConfig, loadedRows, loadedSnapshot);
    state.sheetQuery = query;
    state.sheetSnapshot = preview.snapshot;
    const validationRows = buildValidationRows(preview.validation);
    state.syncPreview = preview;
    renderSyncResult({
      totalCount: preview.mismatchCount,
      successCount: 0,
      failCount: 0,
      closedCount: countClosedItems(preview.providerKey, preview.actions),
      blocks: preview?.policy?.issues || [],
      errors: validationRows
    });
    updateSyncButtonText();
    renderMismatchRows(null, query);
    return preview;
  }

  async function reloadProviderRows(query) {
    const [rawRows, reservationMetaRaw] = await Promise.all([
      fetchProviderRows(context.providerType, query),
      fetchProviderReservations(context.providerType, query, state.syncConfig).catch((error) => ({
        records: [],
        source: "error",
        url: "",
        candidateCount: 0,
        attempts: [],
        error: error?.message ?? String(error)
      }))
    ]);
    const rows = normalizeRows(rawRows, query, context.providerType);
    const reservationMeta = reservationMetaRaw && typeof reservationMetaRaw === "object" ? reservationMetaRaw : {};

    state.query = query;
    state.rows = rows;
    state.providerReservations = Array.isArray(reservationMeta.records) ? reservationMeta.records : [];
    state.providerReservationMeta = reservationMeta;

    const model = buildValueModel(rows, query, { applyCorrections: state.correctionsApplied === true });
    state.dates = model.dates;
    state.valueRows = model.valueRows;
    renderSummary(rows);
    renderSiteValueTable(state.dates, state.valueRows);
    refreshInventoryVerification();
    await storageSet(PREF_KEY, { startDate: query.startDate, endDate: query.endDate });
    return rows;
  }

  async function reloadSheetSnapshot(query) {
    const syncConfig = await persistSyncConfig(false);
    const snapshot = await fetchSheetSnapshot(syncConfig, query, false, false, { blockDetailMode: "light" });
    const providerKey = requireInventoryProviderKey();
    assertProviderInventorySource(snapshot, providerKey);

    state.sheetQuery = query;
    state.sheetSnapshot = snapshot;
    const model = buildSheetValueModel(snapshot, providerKey, { applyCorrections: state.correctionsApplied === true });
    state.sheetDates = model.dates;
    state.sheetValueRows = model.valueRows;
    renderSheetValueTable(state.sheetDates, state.sheetValueRows);
    renderSheetInsightPanel(snapshot, state.sheetDates, state.sheetValueRows, providerKey);
    refreshInventoryVerification();
    return snapshot;
  }

  function clearMismatchView(query = null) {
    state.syncPreview = { ...(state.syncPreview || {}), mismatchCount: 0 };
    updateSyncButtonText();
    renderMismatchRows([], query);
  }

  async function refreshMismatchFromLoaded(options = {}) {
    const query = state.query;
    if (!query || !state.sheetSnapshot || !state.sheetQuery || !isSameQuery(query, state.sheetQuery)) {
      clearMismatchView(query || state.sheetQuery || null);
      return null;
    }

    const currentConfig = sanitizeSyncConfig(readSyncConfigFromUI());
    state.syncConfig = currentConfig;
    const prevSnapshotRef = state.sheetSnapshot;
    const preview = await buildSyncPreview(query, currentConfig, state.rows, state.sheetSnapshot);
    state.syncPreview = preview;
    if (preview?.snapshot) {
      state.sheetSnapshot = preview.snapshot;
      state.sheetQuery = query;
      if (preview.snapshot !== prevSnapshotRef) {
        const providerKey = requireInventoryProviderKey();
        const model = buildSheetValueModel(preview.snapshot, providerKey, { applyCorrections: state.correctionsApplied === true });
        state.sheetDates = model.dates;
        state.sheetValueRows = model.valueRows;
        renderSheetValueTable(state.sheetDates, state.sheetValueRows);
        renderSheetInsightPanel(preview.snapshot, state.sheetDates, state.sheetValueRows, providerKey);
        refreshInventoryVerification();
      }
    }
    updateSyncButtonText();
    updateCorrectionButtonState();
    renderMismatchRows(null, query);

    if (options?.renderSyncResult !== false) {
      renderSyncResult({
        totalCount: preview.mismatchCount,
        successCount: 0,
        failCount: 0,
        closedCount: countClosedItems(preview.providerKey, preview.actions),
        blocks: preview?.policy?.issues || [],
        errors: buildValidationRows(preview.validation)
      });
    }
    markActionTime("comparison");
    return preview;
  }

  function rebuildLoadedValueTablesForDisplayMode() {
    if (state.query && Array.isArray(state.rows) && state.rows.length > 0) {
      const siteModel = buildValueModel(state.rows, state.query, {
        applyCorrections: state.correctionsApplied === true
      });
      state.dates = siteModel.dates;
      state.valueRows = siteModel.valueRows;
      renderSummary(state.rows);
      renderSiteValueTable(state.dates, state.valueRows);
    }

    if (state.sheetSnapshot && state.sheetQuery) {
      const providerKey = requireInventoryProviderKey();
      const sheetModel = buildSheetValueModel(state.sheetSnapshot, providerKey, {
        applyCorrections: state.correctionsApplied === true
      });
      state.sheetDates = sheetModel.dates;
      state.sheetValueRows = sheetModel.valueRows;
      renderSheetValueTable(state.sheetDates, state.sheetValueRows);
      renderSheetInsightPanel(state.sheetSnapshot, state.sheetDates, state.sheetValueRows, providerKey);
    }
    refreshInventoryVerification();
    renderMismatchRows(null, resolveActiveQuery());
  }

  function buildTableSnapshotRows(scope, dates, valueRows) {
    const out = [];
    const safeDates = Array.isArray(dates) ? dates : [];
    const safeRows = Array.isArray(valueRows) ? valueRows : [];
    safeRows.forEach((row) => {
      const roomId = normalizeText(row?.roomId || "");
      const roomName = normalizeText(row?.roomName || "");
      const cells = Array.isArray(row?.cells) ? row.cells : [];
      safeDates.forEach((day, idx) => {
        const value = normalizeDisplayInventoryValue(tableCellDisplayText(cells[idx]));
        out.push({
          scope,
          date: normalizeText(day || ""),
          roomId,
          roomName,
          value
        });
      });
    });
    return out;
  }

  function buildCorrectionDiffCsv(beforeRows, afterRows) {
    const beforeIndex = new Map();
    (Array.isArray(beforeRows) ? beforeRows : []).forEach((row) => {
      beforeIndex.set(`${row.scope}::${row.date}::${row.roomId}`, row);
    });
    const diffRows = [];
    (Array.isArray(afterRows) ? afterRows : []).forEach((row) => {
      const key = `${row.scope}::${row.date}::${row.roomId}`;
      const before = beforeIndex.get(key);
      if (!before) return;
      const fromValue = normalizeDisplayInventoryValue(before.value || "");
      const toValue = normalizeDisplayInventoryValue(row.value || "");
      if (fromValue === toValue) return;
      diffRows.push({
        scope: row.scope,
        date: row.date,
        roomId: row.roomId,
        roomName: row.roomName,
        before: fromValue,
        after: toValue
      });
    });

    const headers = ["scope", "date", "room_id", "room_name", "before", "after"];
    const lines = [headers.join(",")];
    diffRows.forEach((row) => {
      lines.push(
        [
          toCsvCell(row.scope),
          toCsvCell(row.date),
          toCsvCell(row.roomId),
          toCsvCell(row.roomName),
          toCsvCell(row.before),
          toCsvCell(row.after)
        ].join(",")
      );
    });
    return {
      csv: lines.join("\n"),
      rows: diffRows
    };
  }

  function buildUnknownColorCsv(rows) {
    const headers = ["provider", "date", "row", "col", "col_a1", "room_no", "room_type", "color_hex", "error_code"];
    const lines = [headers.join(",")];
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      lines.push(
        [
          toCsvCell(row.provider),
          toCsvCell(row.date),
          toCsvCell(row.row),
          toCsvCell(row.col),
          toCsvCell(row.colA1),
          toCsvCell(row.roomNo),
          toCsvCell(row.roomType),
          toCsvCell(row.colorHex),
          toCsvCell(row.errorCode)
        ].join(",")
      );
    });
    return lines.join("\n");
  }

  function toCsvDocument(headers, rows) {
    const lines = [headers.join(",")];
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      lines.push(headers.map((key) => toCsvCell(row?.[key] ?? "")).join(","));
    });
    return lines.join("\n");
  }

  function summarizeReservationForGoldenSet(summary) {
    const guestNameDisplay = firstKnownValue(summary?.guestNames || []);
    const phoneTail = firstKnownValue(summary?.phoneTails || []);
    return {
      reservation_no: normalizeReservationNoFromText(summary?.reservationNo || ""),
      reservation_ref: [...toNormalizedSet(summary?.reservationRefs || [], (value) => normalizeText(value))].join("|"),
      status_bucket: reservationSummaryStatusBucket(summary),
      raw_status: [...toNormalizedSet(summary?.statuses || [], (value) => normalizeText(value))].join("|"),
      channel: summarizeReservationChannelList(summary).join("|"),
      ota: summarizeReservationChannelList(summary).join("|"),
      checkin: normalizeText(summary?.checkin || ""),
      checkout: normalizeText(summary?.checkout || ""),
      nights: Number(summary?.nights || 0),
      room_id: [...toNormalizedSet(summary?.roomNos || [], (value) => normalizeText(value))].join("|"),
      room_name: [...toNormalizedSet(summary?.roomNames || [], (value) => normalizeText(value))].join("|"),
      guest_name_display: guestNameDisplay,
      phone_tail: phoneTail,
      identity_soft_key: [...toNormalizedSet(summary?.identitySoftKeys || [], (value) => normalizeText(value))].join("|"),
      remark_token_hash_count: [...toNormalizedSet(summary?.identityTokenHashes || [], (value) => normalizeText(value))].length,
      note_head_redacted: redactSensitiveText(buildReservationSummaryDetail(summary)).slice(0, 160),
      audit_anomaly_flag: summaryHasAuditAnomaly(summary) ? "Y" : ""
    };
  }

  function buildGoldenSetBundle() {
    const query = resolveActiveQuery();
    if (!query) throw new Error("골든셋 export 전에 조회 기간을 먼저 선택하세요.");
    const report = state.verificationReport || buildInventoryVerificationReport();
    const providerKey = activeProviderKey();
    const sheetSource = buildSheetReservationVerificationSource(state.sheetSnapshot, providerKey);
    const pmsSource = buildPmsReservationVerificationSource(state.providerReservations, query);
    const now = new Date();
    const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
    const manifest = {
      exportedAt: now.toISOString(),
      provider: providerKey,
      query,
      sheet: {
        spreadsheet: normalizeText(state.syncConfig?.spreadsheet || ""),
        sheetName: normalizeText(state.syncConfig?.sheetName || "")
      },
      scanMode: normalizeText(state.syncConfig?.scan?.mode || "auto"),
      policyVersion: Number(state.syncConfig?.reservationPolicyVersion || 1),
      redactionPolicy: normalizeText(state.syncConfig?.goldenExportRedaction || "default"),
      counts: {
        siteInventory: buildTableSnapshotRows("SITE", state.dates, state.valueRows).length,
        sheetInventory: buildTableSnapshotRows("SHEET", state.sheetDates, state.sheetValueRows).length,
        pmsReservations: (pmsSource.summaries || []).length,
        sheetReservationBlocks: (sheetSource.summaries || []).length,
        reservationPairs: (report?.reservationPairs || []).length,
        reservationMismatches: (report?.reservationMismatches || []).length,
        policyIssues: (state.syncPreview?.policy?.issues || []).length
      },
      anomalyCounts: {
        auditAnomaly: countReservationAuditAnomalies()
      }
    };

    const siteRows = buildTableSnapshotRows("SITE", state.dates, state.valueRows);
    const sheetRows = buildTableSnapshotRows("SHEET", state.sheetDates, state.sheetValueRows);
    const pmsRows = (pmsSource.summaries || []).map((summary) => summarizeReservationForGoldenSet(summary));
    const sheetReservationRows = (sheetSource.summaries || []).map((summary) => ({
      reservation_key: normalizeText(summary?.summaryKey || ""),
      status_guess: "ACTIVE",
      ...summarizeReservationForGoldenSet(summary)
    }));
    const pairRows = (report?.reservationPairs || []).map((row) => ({
      pair_status: row.pairStatus || "",
      exact_match_used: row.exactMatchUsed ? "Y" : "",
      soft_match_used: row.softMatchUsed ? "Y" : "",
      matched_by: row.matchedBy || "",
      matched_condition_count: Number(row.matchedConditionCount || 0),
      matched_conditions: row.matchedConditions || "",
      pms_reservation_key: row.pmsReservationKey || "",
      sheet_reservation_key: row.sheetReservationKey || ""
    }));
    const mismatchRows = (report?.reservationMismatches || []).map((row) => ({
      issue_code: row.issueCode || "",
      severity: row.severity || "",
      ota: row.ota || "",
      checkin: row.checkin || "",
      checkout: row.checkout || "",
      nights: Number(row.nights || 0),
      room_id: row.roomId || "",
      room_name: row.roomName || "",
      pms_status_bucket: row.pmsStatusBucket || "",
      sheet_status_guess: row.sheetStatusGuess || "",
      guest_name_display: row.guestNameDisplay || "",
      phone_tail: row.phoneTail || "",
      detail: redactSensitiveText(row.detail || "")
    }));
    const policyRows = (state.syncPreview?.policy?.issues || []).map((row) => ({
      issue_code: row.code || row.type || "",
      severity: row.severity || "",
      scope: row.scope || "",
      blocked: row.blocked ? "Y" : "",
      summary: row.summary || row.type || "",
      detail: redactSensitiveText(row.detail || "")
    }));
    const traceJson = {
      debugDetails: redactSensitiveText(state.debugDetails || ""),
      tracePacket: state.syncPreview?.tracePacket || null,
      tracePackets: Array.isArray(state.syncPreview?.tracePackets) ? state.syncPreview.tracePackets : [],
      verificationBasis: report?.basis || ""
    };

    const files = [
      { name: `golden_set_manifest_${stamp}.json`, content: JSON.stringify(manifest, null, 2), mime: "application/json;charset=utf-8" },
      { name: `site_inventory_${stamp}.csv`, content: toCsvDocument(["scope", "date", "roomId", "roomName", "value"], siteRows), mime: "text/csv;charset=utf-8" },
      { name: `sheet_inventory_${stamp}.csv`, content: toCsvDocument(["scope", "date", "roomId", "roomName", "value"], sheetRows), mime: "text/csv;charset=utf-8" },
      { name: `pms_reservations_${stamp}.csv`, content: toCsvDocument(["reservation_no", "reservation_ref", "status_bucket", "raw_status", "channel", "ota", "checkin", "checkout", "nights", "room_id", "room_name", "guest_name_display", "phone_tail", "identity_soft_key", "remark_token_hash_count", "audit_anomaly_flag"], pmsRows), mime: "text/csv;charset=utf-8" },
      { name: `sheet_reservation_blocks_${stamp}.csv`, content: toCsvDocument(["reservation_key", "status_guess", "reservation_no", "reservation_ref", "status_bucket", "raw_status", "channel", "ota", "checkin", "checkout", "nights", "room_id", "room_name", "guest_name_display", "phone_tail", "identity_soft_key", "remark_token_hash_count", "note_head_redacted", "audit_anomaly_flag"], sheetReservationRows), mime: "text/csv;charset=utf-8" },
      { name: `reservation_pairs_${stamp}.csv`, content: toCsvDocument(["pair_status", "exact_match_used", "soft_match_used", "matched_by", "matched_condition_count", "matched_conditions", "pms_reservation_key", "sheet_reservation_key"], pairRows), mime: "text/csv;charset=utf-8" },
      { name: `reservation_mismatches_${stamp}.csv`, content: toCsvDocument(["issue_code", "severity", "ota", "checkin", "checkout", "nights", "room_id", "room_name", "pms_status_bucket", "sheet_status_guess", "guest_name_display", "phone_tail", "detail"], mismatchRows), mime: "text/csv;charset=utf-8" },
      { name: `policy_issues_${stamp}.csv`, content: toCsvDocument(["issue_code", "severity", "scope", "blocked", "summary", "detail"], policyRows), mime: "text/csv;charset=utf-8" },
      { name: `scan_trace_${stamp}.json`, content: JSON.stringify(traceJson, null, 2), mime: "application/json;charset=utf-8" }
    ];

    return {
      summary: {
        fileCount: files.length,
        mismatchCount: mismatchRows.length,
        pairCount: pairRows.length
      },
      files
    };
  }

  function formatCorrectionAppliedAt(date = new Date()) {
    const yyyy = String(date.getFullYear());
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    const hh = String(date.getHours()).padStart(2, "0");
    const mi = String(date.getMinutes()).padStart(2, "0");
    const ss = String(date.getSeconds()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
  }

  function downloadCorrectionDiffCsv() {
    const csv = String(state.correctionDiffCsv || "");
    const count = Number(state.correctionDiffCount || 0);
    if (!csv.trim() || count <= 0) {
      setStatus("다운로드할 보정 diff CSV가 없습니다.", "error");
      return;
    }
    const now = new Date();
    const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
    downloadTextFile(`correction_diff_${stamp}.csv`, state.correctionDiffCsv, "text/csv;charset=utf-8");
    setStatus(`보정 diff CSV 저장 완료 (${count}건)`);
    ui.status.classList.add("ok");
  }

  function downloadUnknownColorCsv() {
    if (!state.sheetSnapshot || !state.sheetQuery) {
      setStatus("시트 조회 후 미인식 색상 CSV를 내보낼 수 있습니다.", "error");
      return;
    }
    const providerKey = activeProviderKey();
    const rows = collectUnknownColorRowsFromSnapshot(state.sheetSnapshot, providerKey);
    if (!rows.length) {
      setStatus("내보낼 미인식 색상 항목이 없습니다.", "error");
      return;
    }
    const now = new Date();
    const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
    downloadTextFile(`unknown_colors_${providerKey.toLowerCase()}_${stamp}.csv`, buildUnknownColorCsv(rows), "text/csv;charset=utf-8");
    setStatus(`미인식 색상 CSV 저장 완료 (${rows.length}건)`);
    ui.status.classList.add("ok");
  }

  function downloadGoldenSetBundle() {
    const bundle = buildGoldenSetBundle();
    bundle.files.forEach((file) => {
      downloadTextFile(file.name, file.content, file.mime);
    });
    state.syncPreview = {
      ...(state.syncPreview || {}),
      goldenSetSummary: bundle.summary
    };
    setStatus(`골든셋 JSON+CSV 저장 완료 (${bundle.summary.fileCount}개 파일)`);
    ui.status.classList.add("ok");
  }

  function clearRuntimeArtifacts() {
    dateRangeCache.clear();
    valueCellIndexCache = new WeakMap();
    runtime.valueCellIndexCache = valueCellIndexCache;
    sheetReadHintsCache.clear();
    sheetSnapshotCache.clear();
    stationTokenCache = { token: null, expiresAt: 0 };
    runtime.stationTokenCache = stationTokenCache;
    naverBizItemsCache = { ts: 0, items: [] };
    runtime.naverBizItemsCache = naverBizItemsCache;
    state.naverQueue = new Map();
    runtime.naverQueue = state.naverQueue;
    state.naverQueueMeta = { lastFlushedAt: 0 };
    runtime.naverQueueMeta = state.naverQueueMeta;
    state.providerReservations = [];
    state.providerReservationMeta = null;
    state.verificationReport = null;
    state.statusLogs = [];
    setDebugDetails("-");
    clearSheetInsightPanel();
    setDebugExpanded(false);
    setErrorExpanded(false);
    setCorrectionsApplied(false);
    state.syncPreview = { mismatchCount: 0 };
    state.syncApprovalChecked = false;
    state.syncApprovalFingerprint = "";
    state.verificationReport = createVerificationReport();
    renderInventoryVerification(state.verificationReport);
    renderSyncResult({ totalCount: 0, successCount: 0, failCount: 0, closedCount: 0, errors: [] });
    setSyncResultVisible(false);
    updateSyncApprovalUi({ reset: true });
    updateSyncButtonText();
    setStatus(TEXT.statusRuntimeCleared);
    ui.status.classList.add("ok");
  }

  function applyAutoCorrectionsToLoadedValues() {
    if (!hasLoadedInventoryForCorrection()) {
      setStatus("사이트 또는 시트 값을 먼저 조회하세요.", "error");
      return;
    }
    if (state.correctionsApplied === true) return;
    const beforeRows = [
      ...buildTableSnapshotRows("SITE", state.dates, state.valueRows),
      ...buildTableSnapshotRows("SHEET", state.sheetDates, state.sheetValueRows)
    ];
    setCorrectionsApplied(true);
    rebuildLoadedValueTablesForDisplayMode();
    const afterRows = [
      ...buildTableSnapshotRows("SITE", state.dates, state.valueRows),
      ...buildTableSnapshotRows("SHEET", state.sheetDates, state.sheetValueRows)
    ];
    const diff = buildCorrectionDiffCsv(beforeRows, afterRows);
    state.correctionDiffCsv = diff.csv;
    state.correctionDiffCount = diff.rows.length;
    const correctedCount = countCorrectedCells(state.valueRows) + countCorrectedCells(state.sheetValueRows);
    state.correctionAppliedCount = correctedCount;
    state.correctionAppliedAt = formatCorrectionAppliedAt(new Date());
    updateCorrectionButtonState();
    const summary = correctedCount > 0 ? `보정 미리보기 적용: ${correctedCount}건` : "보정 미리보기 적용: 변경 없음";
    setStatus(summary);
    ui.status.classList.add("ok");
  }

  function renderSyncPreviewResult(preview, errors = null) {
    const previewErrors = Array.isArray(errors) ? errors : buildValidationRows(preview.validation);
    renderSyncResult({
      totalCount: preview.mismatchCount,
      successCount: 0,
      failCount: 0,
      closedCount: countClosedItems(preview.providerKey, preview.actions),
      blocks: preview?.policy?.issues || [],
      errors: previewErrors
    });
    updateSyncButtonText();
    renderMismatchRows(null, preview?.query || resolveActiveQuery());
    markActionTime("comparison");
  }

  function assertSyncRunReady(query) {
    if (!hasLoadedBothInventoryForQuery(query)) {
      setStatus(TEXT.statusSyncNeedLoadBeforeRun, "warn");
      return false;
    }
    if (READ_ONLY_TOOL_MODE === true) {
      return true;
    }
    const missingAuth = getEmbeddedAuthMissingFields(state.syncConfig);
    if (missingAuth.length > 0) {
      throw new Error(`내장 인증 누락 항목: ${missingAuth.join(", ")}`);
    }
    return true;
  }

  async function prepareSyncPreviewForRun(query) {
    const syncConfig = await persistSyncConfig(false);
    const preview = buildSyncPreviewFromData(query, syncConfig, state.rows, state.sheetSnapshot);
    state.syncPreview = preview;
    renderSyncPreviewResult(preview);
    return preview;
  }

  function blockSyncRunForValidation(preview) {
    if (preview.mismatchCount <= 0) {
      setStatus(TEXT.statusSyncNoDiff);
      ui.status.classList.add("ok");
      return true;
    }
    const policy = preview?.policy && typeof preview.policy === "object"
      ? preview.policy
      : buildSyncApplyPolicy(preview);
    if (policy.blocked) {
      renderSyncResult({
        totalCount: preview.mismatchCount,
        successCount: 0,
        failCount: 1,
        closedCount: countClosedItems(preview.providerKey, preview.actions),
        blocks: policy.issues,
        errors: []
      });
      setStatus(policy.issues[0]?.detail || "적용 차단 규칙에 의해 실행을 중단했습니다.", "error");
      return true;
    }
    if (isSyncApprovalRequired() && state.syncApprovalChecked !== true) {
      setStatus(TEXT.statusNeedSyncApproval, "warn");
      return true;
    }
    return false;
  }

  function blockSyncRunForPreviewMode(preview) {
    if (isSyncApplyEnabled()) return false;
    renderSyncPreviewResult(preview, []);
    state.syncPreview = preview;
    setStatus(TEXT.statusSyncApplySkipped);
    ui.status.classList.add("ok");
    return true;
  }

  function getPreviewSourceUsage(preview) {
    const previewDates = Array.isArray(preview?.snapshot?.dateCols)
      ? preview.snapshot.dateCols.map((dc) => dc?.dateKey).filter(Boolean)
      : [];
    const previewPreset = ROOM_PRESETS[context.providerType] || [];
    return summarizeSheetInventorySourceUsage(
      preview?.snapshot,
      preview?.providerKey,
      previewDates,
      previewPreset
    );
  }

  function confirmSyncRun(preview, query) {
    const providerName = preview.providerKey === "STATION" ? TEXT.station : TEXT.naver;
    return window.confirm(
      `${providerName} 불일치 ${preview.mismatchCount}건을 적용하시겠습니까?` +
        `\n기간: ${query.startDate} ~ ${query.endDate}`
    );
  }

  async function executeSyncPreviewActions(preview) {
    if (preview.providerKey === "STATION") {
      const results = await applyStationActions(preview.actions, preview.syncConfig.sleepMs);
      return { mode: "immediate", queueSize: 0, results };
    }
    enqueueNaverActions(preview.actions);
    return executeQueuedNaverActions(preview.syncConfig, preview.syncConfig.sleepMs, "manual");
  }

  function finalizeSyncRun(preview, results) {
    const successCount = (results || []).filter((row) => row.status === "APPLIED").length;
    const apiFailCount = (results || []).filter((row) => row.status === "FAILED").length;
    const summary = {
      totalCount: preview.mismatchCount,
      successCount,
      failCount: apiFailCount,
      closedCount: countClosedItems(preview.providerKey, preview.actions),
      errors: buildErrorRowsFromResults(preview.providerKey, results)
    };
    renderSyncResult(summary);

    state.syncPreview = { ...preview, mismatchCount: summary.failCount > 0 ? Math.max(1, summary.failCount) : 0 };
    state.syncApprovalChecked = false;
    updateSyncApprovalUi({ reset: true });
    updateSyncButtonText();
    if (summary.failCount > 0) {
      setStatus(`${TEXT.statusSyncDone}: 성공 ${successCount}건, 실패 ${summary.failCount}건`, "error");
    } else {
      setStatus(`${TEXT.statusSyncDone}: 성공 ${successCount}건. ${TEXT.statusSyncVerifyByManualLoad}`);
      ui.status.classList.add("ok");
    }
  }

  function handleSyncRunError(error) {
    setStatus(error?.message ?? String(error), "error");
    renderSyncResult({
      totalCount: 0,
      successCount: 0,
      failCount: 1,
      closedCount: 0,
      blocks: [],
      errors: [{ date: "-", type: "실행 오류", detail: error?.message ?? String(error) }]
    });
    state.syncPreview = { mismatchCount: 0 };
    updateSyncButtonText();
  }

  async function runSheetSync() {
    try {
      state.syncRunning = true;
      updateSyncButtonText();
      setSyncResultVisible(true);
      setLoading(true);
      setStatus(TEXT.statusSyncing);

      const query = getSelectedQuery();
      if (!assertSyncRunReady(query)) return;
      const preview = await prepareSyncPreviewForRun(query);
      renderSyncPreviewResult(preview, []);
      state.syncPreview = preview;
      if (preview.mismatchCount > 0) {
        setStatus(`${TEXT.statusSyncDone}: 불일치 ${preview.mismatchCount}건`);
      } else {
        setStatus(TEXT.statusSyncNoDiff);
      }
      ui.status.classList.add("ok");
    } catch (error) {
      handleSyncRunError(error);
    } finally {
      state.syncRunning = false;
      setLoading(false);
      updateSyncButtonText();
    }
  }

  async function loadInventory() {
    try {
      setLoading(true);
      setSyncResultVisible(false);
      setCorrectionsApplied(false);
      setStatus(TEXT.statusLoadingSite);
      const query = getSelectedQuery();
      const rows = await reloadProviderRows(query);
      try {
        await refreshMismatchFromLoaded();
      } catch (_) {
        clearMismatchView(query);
      }

      const sourceLabel = context.providerType === "naver-partner" ? "simple-management API" : "calendar API";
      const dayCount = buildDateRange(query.startDate, query.endDate).length;
      const roomTypeCount = new Set((rows || []).map((row) => String(row?.roomId || ""))).size;
      const sourceCount = (rows || []).reduce(
        (acc, row) => {
          const key = normalizeText(row?.source || "api").toLowerCase();
          if (key === "dom_fallback") acc.dom += 1;
          else acc.api += 1;
          return acc;
        },
        { api: 0, dom: 0 }
      );
      const sourceMixLabel = sourceCount.dom > 0
        ? `, 소스 API ${sourceCount.api} + DOM ${sourceCount.dom}`
        : `, 소스 API ${sourceCount.api}`;
      const reservationSource = normalizeText(state.providerReservationMeta?.source || "").toLowerCase();
      const reservationCounts = state.providerReservationMeta?.statusCounts && typeof state.providerReservationMeta.statusCounts === "object"
        ? state.providerReservationMeta.statusCounts
        : {};
      const activeReservationCount = Number.isFinite(Number(reservationCounts.active))
        ? Number(reservationCounts.active)
        : (state.providerReservations || []).filter((row) => normalizeReservationStatusBucket(row?.statusBucket || row?.status || "") === "ACTIVE").length;
      const canceledReservationCount = Number.isFinite(Number(reservationCounts.canceled))
        ? Number(reservationCounts.canceled)
        : (state.providerReservations || []).filter((row) => normalizeReservationStatusBucket(row?.statusBucket || row?.status || "") === "CANCELED").length;
      const reservationLabel =
        reservationSource === "pms-api"
          ? `, PMS 예약 활성 ${activeReservationCount}건 / 취소 ${canceledReservationCount}건`
          : state.providerReservations.length > 0
            ? `, PMS 예약 활성 ${activeReservationCount}건 / 취소 ${canceledReservationCount}건`
            : reservationSource === "pms-unconfigured"
              ? ", PMS 예약 설정 없음"
              : "";
      setStatus(
        `${TEXT.statusLoadedSite} (${sourceLabel}): ${rows.length}건 (객실타입 ${roomTypeCount} x ${dayCount}일, 원본 표시${sourceMixLabel}${reservationLabel})`
      );
      markActionTime("query");
      ui.status.classList.add("ok");
    } catch (error) {
      setStatus(error?.message ?? String(error), "error");
    } finally {
      setLoading(false);
    }
  }

  async function loadSheetInventory() {
    try {
      setLoading(true);
      setSyncResultVisible(false);
      setCorrectionsApplied(false);
      setStatus(TEXT.statusLoadingSheet);
      const query = getSelectedQuery();
      await reloadSheetSnapshot(query);
      renderSheetSummary(query, state.sheetSnapshot);
      try {
        await refreshMismatchFromLoaded();
      } catch (previewError) {
        clearMismatchView(query);
        renderSyncResult({
          totalCount: 0,
          successCount: 0,
          failCount: 1,
          closedCount: 0,
          errors: [{ date: "-", type: "미리검증 실패", detail: previewError?.message ?? String(previewError) }]
        });
      }
      renderSheetSummary(query, state.sheetSnapshot);
      const providerKey = requireInventoryProviderKey();
      const correctedCount = countCorrectedCells(state.sheetValueRows);
      const derivedCorrectionCount = Number(state.sheetSnapshot?.derivedCorrections?.[providerKey]?.count || 0);
      const correctedLabel = correctedCount > 0 ? `, 보정표시: ${correctedCount}` : "";
      const scan = state.sheetSnapshot?.scan || {};
      const diagnostics = state.sheetSnapshot?.derivedCorrections?.[providerKey]?.diagnostics || {};
      const preset = ROOM_PRESETS[context.providerType] || [];
      const sourceUsage = summarizeSheetInventorySourceUsage(
        state.sheetSnapshot,
        providerKey,
        state.sheetDates,
        preset
      );
      const statusCounts = diagnostics.statusCounts || {};
      const expectedTypeCounts = resolveExpectedTypeCounts(providerKey);
      const formulaTypeCounts = scan?.formulaHints?.expectedTypeCounts || {};
      const toPositiveIntOrNull = (value) => {
        const n = Number(value);
        if (!Number.isInteger(n) || n <= 0) return null;
        return n;
      };
      const hasFormulaExpectedType =
        toPositiveIntOrNull(formulaTypeCounts?.urban) !== null ||
        toPositiveIntOrNull(formulaTypeCounts?.doubleTwin) !== null ||
        toPositiveIntOrNull(formulaTypeCounts?.grand) !== null;
      const detectedTypeCounts = summarizeDetectedRoomTypeCounts(diagnostics.roomTypeCounts || {});
      const expectedPartitionCounts = countExpectedPartitionRooms(ROOM_TYPE_BY_ROOM_NO);
      const detectedPartitionCounts = summarizeDetectedPartitionCounts(diagnostics.partitionCounts || {});
      const scanValidation = scan?.validation || {};
      const validationIssues = Array.isArray(scanValidation?.issues) ? scanValidation.issues : [];
      const validationErrorCount = validationIssues.filter(
        (issue) => String(issue?.severity || "").toLowerCase() === "error"
      ).length;
      const validationWarnCount = validationIssues.filter(
        (issue) => String(issue?.severity || "").toLowerCase() === "warn"
      ).length;
      const previewValidation = state.syncPreview?.validation || {};
      const previewValidationErrorCount = Number(previewValidation?.errorCount || 0);
      const previewValidationWarnCount = Number(previewValidation?.warnCount || 0);
      const validationGatePass = validationErrorCount <= 0 && previewValidationErrorCount <= 0;
      const validationGateLabel = `검증게이트: ${validationGatePass ? "PASS" : "FAIL"} (scan e${validationErrorCount}/w${validationWarnCount}, preview e${previewValidationErrorCount}/w${previewValidationWarnCount})`;
      const typeLabel =
        `, 타입행 U:${detectedTypeCounts.urban}/${expectedTypeCounts.urban}` +
        ` D:${detectedTypeCounts.doubleTwin}/${expectedTypeCounts.doubleTwin}` +
        ` G:${detectedTypeCounts.grand}/${expectedTypeCounts.grand}`;
      const partitionLabel =
        `, 분할 U(N/A):${detectedPartitionCounts.urban_num}/${expectedPartitionCounts.urban_num}` +
        `/${detectedPartitionCounts.urban_alpha}/${expectedPartitionCounts.urban_alpha}` +
        ` D(N/A):${detectedPartitionCounts.double_num}/${expectedPartitionCounts.double_num}` +
        `/${detectedPartitionCounts.double_alpha}/${expectedPartitionCounts.double_alpha}` +
        ` G:${detectedPartitionCounts.grand}/${expectedPartitionCounts.grand}`;
      const hasTypeMismatch =
        detectedTypeCounts.urban !== expectedTypeCounts.urban ||
        detectedTypeCounts.doubleTwin !== expectedTypeCounts.doubleTwin ||
        detectedTypeCounts.grand !== expectedTypeCounts.grand;
      const hasPartitionMismatch =
        detectedPartitionCounts.urban_num !== expectedPartitionCounts.urban_num ||
        detectedPartitionCounts.urban_alpha !== expectedPartitionCounts.urban_alpha ||
        detectedPartitionCounts.double_num !== expectedPartitionCounts.double_num ||
        detectedPartitionCounts.double_alpha !== expectedPartitionCounts.double_alpha ||
        detectedPartitionCounts.grand !== expectedPartitionCounts.grand;
      const guideLabel = hasTypeMismatch || hasPartitionMismatch
        ? hasFormulaExpectedType
          ? ", 가이드: 수식 기반 타입 감지값과 실제 객실행을 확인하세요."
          : ", 가이드: 수동 범위 Urban 67~86 / Double 87~106 / Grand 107~107"
        : "";
      const fetchModeLabel = `읽기모드: ${scan.fetchMode || "fast"}`;
      const blockModeLabel = `블록모드: ${scan.blockDetailMode || "light"}`;
      const allowPkgLabel = `PKG행 포함: ${scan.allowPkgInventoryRows ? "Y" : "N"}`;
      const blockScanMeta = state.syncPreview?.blockScan || null;
      const blockEscalationLabel = blockScanMeta
        ? `블록승격: ${blockScanMeta.escalated ? "Y" : "N"}, 사유 ${JSON.stringify(blockScanMeta.reasons || [])}` +
          `${blockScanMeta.escalationError ? `, 실패 ${blockScanMeta.escalationError}` : ""}`
        : "블록승격: -";
      const validationLabel = scanValidation?.providerKey
        ? `재검증(${scanValidation.providerKey}): 타입불일치 ${scanValidation.hasTypeMismatch ? "Y" : "N"}, ` +
          `분할불일치 ${scanValidation.hasPartitionMismatch ? "Y" : "N"}, ` +
          `객실행부족 ${scanValidation.hasInsufficientRows ? "Y" : "N"}, ` +
          `행수 ${scanValidation.detectedRoomCount ?? "-"} / 기대 ${scanValidation.expectedRoomCount ?? "-"}`
        : "재검증: -";
      const rawDerivedLabel = scanValidation?.providerKey
        ? `감사(raw-derive): 불일치 ${scanValidation.rawDerivedMismatchCount ?? 0} / 비교 ${scanValidation.rawDerivedComparedCount ?? 0}`
        : "감사(raw-derive): -";
      const providerValueRowAuditLabel = scanValidation?.providerKey
        ? `감사(provider-row): 불일치 ${scanValidation.providerValueRowMismatchCount ?? 0} / 비교 ${scanValidation.providerValueRowComparedCount ?? 0}`
        : "감사(provider-row): -";
      const providerValueCoverageLabel = scanValidation?.providerKey
        ? `감사(provider-value): raw ${scanValidation.providerValueRawCount ?? 0} / parsed ${scanValidation.providerValueParsedCount ?? 0}`
        : "감사(provider-value): -";
      const providerTrace = state.sheetSnapshot?.trace?.providerValueSources?.[providerKey] || {};
      const providerSelectionLabel =
        `읽기근거(provider-row): provider ${providerTrace?.providerRow ?? "-"} -> selected ${providerTrace?.selectedRow ?? "-"} (${providerTrace?.selectedReason || "-"})`;
      const providerCandidatesLabel =
        `읽기근거(candidates): ${formatProviderValueCandidates(providerTrace?.candidates || []) || "-"}`;
      const stationRawTraceByDate = state.sheetSnapshot?.trace?.providerValueSources?.STATION?.cellTraceByDate || {};
      const stationIrregularDays = Object.entries(stationRawTraceByDate)
        .filter(([_, trace]) => {
          const parsedRaw = parseStockValue(normalizeText(trace?.formattedValue || ""));
          return Number.isInteger(parsedRaw?.maximum) && ![0, 1].includes(Number(parsedRaw.maximum));
        })
        .map(([day]) => day)
        .sort();
      const stationIrregularLabel = stationIrregularDays.length > 0
        ? `STATION 원시 이상값(max!=0/1): ${stationIrregularDays.join(", ")}`
        : "STATION 원시 이상값(max!=0/1): 없음";
      const scanLabel =
        `스캔: 날짜행 ${scan.dateRow ?? "-"}, 날짜열 ${scan.dateStartCol ?? "-"}~${scan.dateEndCol ?? "-"} (${scan.dateCount ?? 0}일), ` +
        `객실 ${scan.roomStartRow ?? "-"}~${scan.roomEndRow ?? "-"}, 재고 N ${scan.inventoryRows?.NAVER ?? "-"} / S ${scan.inventoryRows?.STATION ?? "-"}`;
      const valueRowLabel =
        `재고값행: N ${scan.inventoryValueRows?.NAVER ?? "-"} / S ${scan.inventoryValueRows?.STATION ?? "-"}`;
      const dataRowLabel =
        `재고데이터행: N ${JSON.stringify(scan.inventoryDataRows?.NAVER || [])} / S ${JSON.stringify(scan.inventoryDataRows?.STATION || [])}`;
      const blockScanLabel =
        `예약블록: 총 ${scan.reservationBlockCount ?? 0}, 채널 ${JSON.stringify(scan.reservationBlockChannels || {})}`;
      const blockTypeChannelSummaryLabel = formatReservationBlockSummaryLine(state.sheetSnapshot);
      const sourceUsageLabel =
        `판정소스: room_raw ${sourceUsage?.counts?.room_raw ?? 0}, room_derived ${sourceUsage?.counts?.room_derived ?? 0}, ` +
        `provider_raw ${sourceUsage?.counts?.provider_raw ?? 0}, none ${sourceUsage?.counts?.none ?? 0}`;
      const criteriaLabel =
        "판정기준: strict=room_raw 불일치만 FAIL, low-confidence(room_derived/provider_raw)는 WARN";
      const correctionReasonEntries = Object.entries(
        summarizeCorrectionReasons(state.sheetValueRows, state.sheetDates, "SHEET").counts || {}
      );
      const correctionReasonLabel = correctionReasonEntries.length > 0
        ? correctionReasonEntries.map(([reason, count]) => `${reason}:${count}`).join(", ")
        : "-";
      const correctionBasisLabel =
        `보정근거: 표시보정(공실/예약/최대 기반) ${correctedCount}건 [${correctionReasonLabel}], ` +
        `파생보정(총객실-(VAC+VIP+마케팅+OOO)) ${derivedCorrectionCount}건`;
      const typeRange = scan.inventoryTypeRanges || {};
      const formatRange = (r) => `${r?.startRow ?? "-"}~${r?.endRow ?? "-"}`;
      const providerTypeRangeLabel =
        `타입범위(N): U ${formatRange(typeRange?.NAVER?.urban)} / D ${formatRange(typeRange?.NAVER?.doubleTwin)} / G ${formatRange(typeRange?.NAVER?.grand)}, ` +
        `타입범위(S): U ${formatRange(typeRange?.STATION?.urban)} / D ${formatRange(typeRange?.STATION?.doubleTwin)} / G ${formatRange(typeRange?.STATION?.grand)}`;
      const formulaScanLabel = `수식범위(ROOM SOLD/VAC): ${formatRange(scan.roomSoldVacScanRange)}`;
      const unknownColorCount = Number(diagnostics.unknownColorCount || 0);
      const diagLabel = diagnostics.totalCells
        ? `객실행: ${diagnostics.roomRows || 0}${typeLabel}${partitionLabel}, 셀통계 VAC ${statusCounts.VAC || 0} / EMPTY ${statusCounts.EMPTY || 0} / OTHER ${statusCounts.OTHER || 0} / UNKNOWN_COLOR ${unknownColorCount}`
        : "객실행: 0";
      const formulaLabel = "계산식: 예약=총객실-(VAC+VIP+마케팅+OOO), 공실=VAC";
      const formulaMatches = Array.isArray(scan?.formulaHints?.matches) ? scan.formulaHints.matches : [];
      const formulaRanges = scan?.formulaHints || {};
      const formatFormulaRange = (r) => `${r?.startRow ?? "-"}~${r?.endRow ?? "-"}`;
      const formulaRangeLabel =
        `수식범위(분리): SOLD U ${formatFormulaRange(formulaRanges?.soldRanges?.urban)} / D ${formatFormulaRange(formulaRanges?.soldRanges?.doubleTwin)} / G ${formatFormulaRange(formulaRanges?.soldRanges?.grand)}, ` +
        `VAC U ${formatFormulaRange(formulaRanges?.vacRanges?.urban)} / D ${formatFormulaRange(formulaRanges?.vacRanges?.doubleTwin)} / G ${formatFormulaRange(formulaRanges?.vacRanges?.grand)}`;
      const formulaHintLabel = formulaMatches.length > 0
        ? `수식감지: ${formulaMatches
            .map((row) => `${row.type} ${row.startRow}-${row.endRow}${Number.isInteger(row.total) ? `(${row.total})` : ""}`)
            .join(", ")}`
        : "수식감지: 없음";
      const tracePacket = state.syncPreview?.tracePacket || null;
      const tracePackets = Array.isArray(state.syncPreview?.tracePackets) ? state.syncPreview.tracePackets : [];
      const traceLabel = tracePacket
        ? `TracePacket: ${tracePacket.caseId || "-"} (${tracePacket.traceState || "-"})`
        : "TracePacket: -";
      const tracePacketsLabel = `TracePackets: ${tracePackets.length}`;
      const traceValueLabel = tracePacket
        ? `Trace값: site=${tracePacket?.normalizedValue?.site ?? "-"} / sheet=${tracePacket?.normalizedValue?.sheet ?? "-"} / target=${tracePacket?.finalOutputValue?.targetUnits ?? "-"}`
        : "Trace값: -";
      const traceBlockLabel = tracePacket
        ? `Trace블록: roomTypeKey=${tracePacket?.joinSelection?.reservationBlocks?.roomTypeKey || "-"}, matched=${tracePacket?.joinSelection?.reservationBlocks?.matchedCount ?? 0}, channels=${JSON.stringify(tracePacket?.joinSelection?.reservationBlocks?.channels || {})}`
        : "Trace블록: -";
      const debugLines = [
        `${TEXT.statusLoadedSheet}: ${state.sheetDates.length}일`,
        `표시모드: ${state.correctionsApplied === true ? "보정표시" : "원본표시"}`,
        `자동보정: ${correctedCount}`,
        `파생보정(감사): ${derivedCorrectionCount}`,
        fetchModeLabel,
        blockModeLabel,
        allowPkgLabel,
        blockEscalationLabel,
        scanLabel,
        providerTypeRangeLabel,
        formulaScanLabel,
        formulaRangeLabel,
        formulaHintLabel,
        validationGateLabel,
        validationLabel,
        rawDerivedLabel,
        providerValueRowAuditLabel,
        providerValueCoverageLabel,
        providerSelectionLabel,
        providerCandidatesLabel,
        stationIrregularLabel,
        `검증이슈: error ${validationErrorCount}, warn ${validationWarnCount}`,
        `타입행:${typeLabel.replace(/^,\s*/, " ")}`,
        `분할:${partitionLabel.replace(/^,\s*/, " ")}`,
        valueRowLabel,
        dataRowLabel,
        correctionBasisLabel,
        sourceUsageLabel,
        criteriaLabel,
        blockScanLabel,
        blockTypeChannelSummaryLabel,
        diagLabel,
        formulaLabel,
        traceLabel,
        tracePacketsLabel,
        traceValueLabel,
        traceBlockLabel,
        guideLabel ? guideLabel.replace(/^,\s*/, "") : "가이드: 정상"
      ];
      setDebugDetails(debugLines.join("\n"));
      setStatus(
        `${TEXT.statusLoadedSheet}: ${state.sheetDates.length}일 (원본 표시${correctedLabel})`
      );
      markActionTime("query");
      ui.status.classList.add(hasTypeMismatch || hasPartitionMismatch ? "warn" : "ok");
    } catch (error) {
      setDebugDetails(`시트 재고 조회 오류\n${error?.message ?? String(error)}`);
      clearSheetInsightPanel();
      setStatus(error?.message ?? String(error), "error");
    } finally {
      setLoading(false);
    }
  }

  async function loadAllInventory() {
    let hadError = false;
    setStatus(TEXT.statusLoadingAll);
    try {
      await loadInventory();
      hadError = hadError || ui.status.classList.contains("error");
    } catch (_) {
      hadError = true;
    }
    try {
      await loadSheetInventory();
      hadError = hadError || ui.status.classList.contains("error");
    } catch (_) {
      hadError = true;
    }
    if (!hadError) {
      setStatus(TEXT.statusLoadedAll);
      ui.status.classList.add("ok");
    }
  }

  async function copyTextToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch (_) {
      const temp = document.createElement("textarea");
      temp.value = text;
      shadow.appendChild(temp);
      temp.select();
      document.execCommand("copy");
      temp.remove();
    }
  }

  function getTracePacketsForExport() {
    const fromList = Array.isArray(state.syncPreview?.tracePackets) ? state.syncPreview.tracePackets : [];
    if (fromList.length > 0) return fromList;
    if (state.syncPreview?.tracePacket) return [state.syncPreview.tracePacket];
    return [];
  }

  function downloadTextFile(filename, text, mimeType = "text/plain;charset=utf-8") {
    const blob = new Blob([String(text || "")], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function toCsvCell(value) {
    const text = String(value ?? "");
    if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, "\"\"")}"`;
    return text;
  }

  function tracePacketsToCsv(packets) {
    const rows = Array.isArray(packets) ? packets : [];
    const headers = [
      "caseId",
      "traceState",
      "date",
      "roomId",
      "roomName",
      "sourceType",
      "sheetRow",
      "sheetCol",
      "sheetColA1",
      "siteValueRaw",
      "sheetValueRaw",
      "siteValue",
      "sheetValue",
      "targetUnits",
      "targetMode",
      "providerSelectedRow",
      "providerReason",
      "createdAt"
    ];
    const body = rows.map((row) => headers.map((key) => toCsvCell(row?.[key] ?? "")).join(","));
    return [headers.join(","), ...body].join("\n");
  }

  function downloadTracePacketsJson() {
    const packets = getTracePacketsForExport();
    if (!packets.length) {
      setStatus("내보낼 TracePacket이 없습니다.", "error");
      return;
    }
    const now = new Date();
    const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
    const payload = {
      generatedAt: new Date().toISOString(),
      provider: state.syncPreview?.providerKey || "",
      query: state.syncPreview?.query || null,
      count: packets.length,
      packets
    };
    downloadTextFile(`trace_packets_${stamp}.json`, JSON.stringify(payload, null, 2), "application/json;charset=utf-8");
    setStatus(`Trace JSON 저장 완료 (${packets.length}건)`);
    ui.status.classList.add("ok");
  }

  function downloadTracePacketsCsv() {
    const packets = getTracePacketsForExport();
    if (!packets.length) {
      setStatus("내보낼 TracePacket이 없습니다.", "error");
      return;
    }
    const now = new Date();
    const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
    downloadTextFile(`trace_packets_${stamp}.csv`, tracePacketsToCsv(packets), "text/csv;charset=utf-8");
    setStatus(`Trace CSV 저장 완료 (${packets.length}건)`);
    ui.status.classList.add("ok");
  }

  globalThis.App = globalThis.App || {};
  globalThis.App.runtime = globalThis.App.runtime || {};
  globalThis.App.runtime.sheetScannerDebug = {
    buildGoldenSetBundle,
    evaluateReservationSoftMatch,
    pairReservationSummaries,
    buildSheetReservationVerificationSource,
    buildPmsReservationVerificationSource,
    summarizeReservationForGoldenSet
  };

  async function copySiteValuesOnly() {
    try {
      const selectedQuery = getSelectedQuery();
      if (!state.valueRows.length) {
        if (!Array.isArray(state.rows) || !state.rows.length) throw new Error(TEXT.statusNeedSiteLoad);
        const model = buildValueModel(state.rows, selectedQuery, { applyCorrections: state.correctionsApplied === true });
        state.dates = model.dates;
        state.valueRows = model.valueRows;
        renderSiteValueTable(state.dates, state.valueRows);
      }
      const queryForCopy = state.query || selectedQuery;
      if (!state.sheetSnapshot || !state.sheetQuery || !isSameQuery(queryForCopy, state.sheetQuery)) {
        await reloadSheetSnapshot(queryForCopy).catch(() => null);
      }
      const rowTemplateRows = resolveCopyTemplateRows(queryForCopy, context.providerType);
      const text = valueRowsToTsv(state.valueRows, rowTemplateRows);
      if (!text.trim()) throw new Error(TEXT.statusNoCopy);
      await copyTextToClipboard(text);
      setStatus(TEXT.statusCopiedSite);
      ui.status.classList.add("ok");
    } catch (error) {
      setStatus(error?.message ?? String(error), "error");
    }
  }

  async function copySheetValuesOnly() {
    try {
      if (!state.sheetValueRows.length) {
        if (!state.sheetSnapshot || !state.sheetQuery) throw new Error(TEXT.statusNeedSheetLoad);
        const providerKey = requireInventoryProviderKey();
        const model = buildSheetValueModel(state.sheetSnapshot, providerKey, { applyCorrections: state.correctionsApplied === true });
        state.sheetDates = model.dates;
        state.sheetValueRows = model.valueRows;
        renderSheetValueTable(state.sheetDates, state.sheetValueRows);
        renderSheetInsightPanel(state.sheetSnapshot, state.sheetDates, state.sheetValueRows, providerKey);
      }
      const queryForCopy = state.sheetQuery || state.query;
      const rowTemplateRows = resolveCopyTemplateRows(queryForCopy, context.providerType);
      const text = valueRowsToTsv(state.sheetValueRows, rowTemplateRows);
      if (!text.trim()) throw new Error(TEXT.statusNoCopy);
      await copyTextToClipboard(text);
      setStatus(TEXT.statusCopiedSheet);
      ui.status.classList.add("ok");
    } catch (error) {
      setStatus(error?.message ?? String(error), "error");
    }
  }

  function goPrevMonth() {
    state.monthCursor = new Date(state.monthCursor.getFullYear(), state.monthCursor.getMonth() - 1, 1);
    renderCalendar();
  }

  function goNextMonth() {
    state.monthCursor = new Date(state.monthCursor.getFullYear(), state.monthCursor.getMonth() + 1, 1);
    renderCalendar();
  }

  function applyProviderTheme() {
    ui.wrap.classList.remove("provider-naver", "provider-station");
    if (context.providerType === "naver-partner") ui.wrap.classList.add("provider-naver");
    if (context.providerType === "admin-station") ui.wrap.classList.add("provider-station");
  }

  const panelEventsApi = bindPanelEvents({
    ui,
    state,
    context,
    windowRef: window,
    navigatorRef: navigator,
    actions: {
      TEXT,
      PREF_KEY,
      isPanelVisible,
      setPanelOpen,
      applyProviderTheme,
      setCorrectionsApplied,
      renderSyncResult,
      setSyncResultVisible,
      setSettingsOpen,
      setErrorExpanded,
      setDebugExpanded,
      setDebugDetails,
      loadSyncApplyEnabled,
      storageGet,
      updateSyncButtonText,
      isDate,
      fromDateKey,
      monthStart,
      loadSyncConfig,
      writeSyncConfigToUI,
      setEmbeddedAuthUiState,
      setSecretsMasked,
      applySyncFeatureUiState,
      updateSyncApprovalUi,
      getEmbeddedAuthMissingFields,
      setStatus,
      renderCalendar,
      renderSummary,
      renderSiteValueTable,
      renderSheetValueTable,
      clearSheetInsightPanel,
      renderMismatchRows,
      createVerificationReport,
      renderInventoryVerification,
      updateCorrectionButtonState,
      renderWorkflowProgress,
      renderUserOpsSummary,
      renderOpsMetaSummary,
      setActiveTask,
      setFitMode,
      setPanelWidthMode,
      setScopeDrawerOpen,
      openEvidenceTab,
      openUtilityTab,
      openTaskEvidenceSurface,
      openTaskUtilitySurface,
      syncSelectedRangeFromHost,
      refreshProductFlowState,
      renderWorkspaceShellState,
      syncViewportFitMode,
      applyQuickRange,
      setLoadingAction,
      loadInventory,
      loadAllInventory,
      loadSheetInventory,
      applyAutoCorrectionsToLoadedValues,
      downloadCorrectionDiffCsv,
      downloadUnknownColorCsv,
      copySiteValuesOnly,
      copySheetValuesOnly,
      persistSyncConfig,
      clearMismatchView,
      resolveActiveQuery,
      isSyncApplyEnabled,
      setSyncFeatureEnabled,
      setOpsSectionExpanded,
      updateScanModeUiState,
      renderManualRangePreview,
      readPmsPresetFromUI,
      normalizeText,
      getFieldValue,
      setFieldValue,
      renderPmsPresetPreview,
      applyPmsPresetTemplate,
      applyPmsHarTemplate,
      buildManualRangesTextFromSnapshot,
      captureProviderAuthBundle,
      formatAuthBundleForTextarea,
      clearRuntimeArtifacts,
      downloadTracePacketsJson,
      downloadTracePacketsCsv,
      downloadGoldenSetBundle,
      runSheetSync,
      goPrevMonth,
      goNextMonth,
      resetDateRange
    }
  }) || {};

  if (chrome?.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      const type = String(message?.type || "").trim();
      if (type !== "inventory.ui.togglePanel") return false;

      const mode = String(message?.mode || "toggle").trim().toLowerCase();
      const current = isPanelVisible();
      const nextOpen = mode === "open" ? true : mode === "close" ? false : !current;

      setPanelOpen(nextOpen);
      if (nextOpen && typeof panelEventsApi.ensureStarted === "function") {
        Promise.resolve(panelEventsApi.ensureStarted()).catch((error) => {
          console.error("[InventoryBoard] ensureStarted failed", error);
        });
      }

      if (typeof sendResponse === "function") sendResponse({ ok: true, open: nextOpen });
      return false;
    });
  }
})();
