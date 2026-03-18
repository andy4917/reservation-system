import type {
  BridgeContextResponse,
  BridgePingResponse,
  DeleteBindingDecisionRequest,
  DeleteBindingDecisionResponse,
  DeleteManualScanAnchorsRequest,
  DeleteManualScanAnchorsResponse,
  FetchLiveReadBundleRequest,
  FetchLiveReadBundleResponse,
  FetchSheetSnapshotSummary,
  FetchSheetSnapshotRequest,
  FetchSheetSnapshotResponse,
  FetchProviderRowsRequest,
  FetchProviderRowsResponse,
  BuildOperatorExportRequest,
  BuildOperatorExportResponse,
  ExportOperatorHandoffRequest,
  ExportOperatorHandoffResponse,
  RepeatOperatorHandoffRequest,
  RepeatOperatorHandoffResponse,
  UpdateOperatorHandoffStatusRequest,
  UpdateOperatorHandoffStatusResponse,
  IndexWorkspaceSearchRequest,
  IndexWorkspaceSearchResponse,
  LoadRecommendationTracesRequest,
  LoadRecommendationTracesResponse,
  LoadBindingDecisionsRequest,
  LoadBindingDecisionsResponse,
  LoadManualScanAnchorsRequest,
  LoadManualScanAnchorsResponse,
  QueryWorkspaceSearchRequest,
  QueryWorkspaceSearchResponse,
  SaveManualScanAnchorsRequest,
  SaveManualScanAnchorsResponse,
  SavedManualScanAnchor,
  ProviderInventoryCompareRow,
  RecommendationTrace,
  SaveRecommendationTraceRequest,
  SaveRecommendationTraceResponse,
  SaveBindingDecisionRequest,
  SaveBindingDecisionResponse,
  BridgeRuntimeStatus,
  FetchReservationsRequest,
  FetchReservationsResponse,
  FetchWingsLiveContractRequest,
  FetchWingsLiveContractResponse,
  ProviderReservationRow
} from "../contracts/index.js";

function createFallbackSheetSummary(
  query: { startDate: string; endDate: string },
  source: string,
  error: string
): FetchSheetSnapshotSummary {
  return {
    spreadsheetId: "",
    sheetName: "",
    startDate: String(query.startDate || "").trim(),
    endDate: String(query.endDate || "").trim(),
    readMode: "unavailable",
    retryReason: null,
    retryTrace: [],
    failureCategory: "access",
    failureDetail: error,
    reservationBlockCount: 0,
    validationIssueCount: 0,
    inventoryRows: {
      NAVER: null,
      STATION: null
    },
    providerValueDays: {
      NAVER: 0,
      STATION: 0
    },
    anchorSummary: {
      namedRangeCount: 0,
      metadataCount: 0,
      hasScanConfigNamedRange: false,
      hasRoomMapNamedRange: false,
      hasMetadataScanConfig: false,
      manualAnchorUsed: false,
      manualAnchorFields: []
    },
    hintSummary: {
      fingerprint: "",
      roomMapCount: 0,
      scanMode: "unknown",
      manualMode: false,
      hasRoomTypeMap: false,
      branch: "",
      branchSectionEvidence: []
    },
    validationSummary: {
      providerKey: "",
      issueCount: 0,
      errorCount: 0,
      warningCount: 0,
      issueCodes: [],
      hasTypeMismatch: false,
      hasPartitionMismatch: false,
      hasInsufficientRows: false,
      providerValueRawCount: 0,
      providerValueParsedCount: 0,
      providerRow: null,
      providerValueRow: null,
      providerRowRole: "none",
      providerValueSourceKind: "none",
      providerValueSourceReason: "",
      typedSlotRows: {
        urban: null,
        doubleTwin: null,
        grand: null
      },
      typedSlotComplete: false,
      typedSlotDuplicate: false,
      physicalOrderVariant: false
    },
    coverage: {
      dateCount: 0,
      inventoryRowsDetected: {
        NAVER: false,
        STATION: false
      },
      inventoryValueRowsDetected: {
        NAVER: false,
        STATION: false
      },
      inventoryDataRowCounts: {
        NAVER: 0,
        STATION: 0
      },
      providerValueDays: {
        NAVER: 0,
        STATION: 0
      },
      reservationBlockCount: 0
    }
  };
}

function createFallbackVisibleSlice(lines: string[] = []) {
  return {
    runId: null,
    offset: 0,
    limit: 12,
    total: lines.length,
    lines
  };
}

declare global {
  interface Window {
    desktopBridge?: {
      ping: () => Promise<{ ok: true; runtime: string; ts: string }>;
      getContext: () => Promise<BridgeContextResponse>;
      loadBindingDecisions: (request: LoadBindingDecisionsRequest) => Promise<LoadBindingDecisionsResponse>;
      saveBindingDecision: (request: SaveBindingDecisionRequest) => Promise<SaveBindingDecisionResponse>;
      deleteBindingDecision: (request: DeleteBindingDecisionRequest) => Promise<DeleteBindingDecisionResponse>;
      loadRecommendationTraces: (request: LoadRecommendationTracesRequest) => Promise<LoadRecommendationTracesResponse>;
      saveRecommendationTrace: (request: SaveRecommendationTraceRequest) => Promise<SaveRecommendationTraceResponse>;
      loadManualScanAnchor: (request: LoadManualScanAnchorsRequest) => Promise<LoadManualScanAnchorsResponse>;
      saveManualScanAnchor: (request: SaveManualScanAnchorsRequest) => Promise<SaveManualScanAnchorsResponse>;
      deleteManualScanAnchor: (request: DeleteManualScanAnchorsRequest) => Promise<DeleteManualScanAnchorsResponse>;
      fetchSheetSnapshot: (request: FetchSheetSnapshotRequest) => Promise<FetchSheetSnapshotResponse>;
      fetchLiveReadBundle: (request: FetchLiveReadBundleRequest) => Promise<FetchLiveReadBundleResponse>;
      indexWorkspaceSearch: (request: IndexWorkspaceSearchRequest) => Promise<IndexWorkspaceSearchResponse>;
      queryWorkspaceSearch: (request: QueryWorkspaceSearchRequest) => Promise<QueryWorkspaceSearchResponse>;
      buildOperatorExport: (request: BuildOperatorExportRequest) => Promise<BuildOperatorExportResponse>;
      exportOperatorHandoff: (request: ExportOperatorHandoffRequest) => Promise<ExportOperatorHandoffResponse>;
      repeatOperatorHandoff: (request: RepeatOperatorHandoffRequest) => Promise<RepeatOperatorHandoffResponse>;
      updateOperatorHandoffStatus: (
        request: UpdateOperatorHandoffStatusRequest
      ) => Promise<UpdateOperatorHandoffStatusResponse>;
      fetchProviderRows: (
        request: FetchProviderRowsRequest
      ) => Promise<FetchProviderRowsResponse<ProviderInventoryCompareRow>>;
      fetchProviderReservations: (
        request: FetchReservationsRequest
      ) => Promise<FetchReservationsResponse<ProviderReservationRow>>;
      fetchWingsLiveContract: (
        request: FetchWingsLiveContractRequest
      ) => Promise<FetchWingsLiveContractResponse>;
      openWingsLogin: () => Promise<{ ok: true; opened: boolean; url: string }>;
      captureWingsSession: () => Promise<{
        ok: true;
        sessionAvailable: boolean;
        authSummary: {
          cookieCount: number;
          domains: string[];
          hasBearer: boolean;
          hasCsrf: boolean;
          hasRole: boolean;
        };
        url: string;
      }>;
      getBridgeMeta: () => Promise<{ ok: true; port: number }>;
      getBridgeRuntime: () => Promise<BridgeRuntimeStatus>;
      getBridgeSummary: (
        provider?: string | null
      ) => Promise<{
        ok: true;
        authSummary: {
          cookieCount: number;
          domains: string[];
          hasBearer: boolean;
          hasCsrf: boolean;
          hasRole: boolean;
        } | null;
        infoSummary: {
          count: number;
          channels: string[];
          dates: string[];
        } | null;
        preview: {
          title: string | null;
          url: string | null;
          updatedAt: string;
          bodyTextSample: string;
          rows: Array<{
            date: string;
            roomType: string;
            channel: string;
            reason?: string;
            rawLine?: string;
            sourceLineIndex?: number | null;
            candidateBasis?: string[];
          }>;
        } | null;
      }>;
    };
  }
}

export async function pingDesktopRuntime(): Promise<BridgePingResponse | null> {
  if (!window.desktopBridge?.ping) return null;
  const result = await window.desktopBridge.ping();
  return {
    ok: true,
    connected: result.ok === true,
    bridgeVersion: `${result.runtime}@${result.ts}`
  };
}

export async function getBridgeContext(): Promise<BridgeContextResponse> {
  if (window.desktopBridge?.getContext) {
    return window.desktopBridge.getContext();
  }

  return {
    ok: true,
    provider: null,
    host: null,
    url: null,
    sessionAvailable: false
  };
}

export async function fetchSheetSnapshot(
  request: FetchSheetSnapshotRequest
): Promise<FetchSheetSnapshotResponse> {
  if (window.desktopBridge?.fetchSheetSnapshot) {
    return window.desktopBridge.fetchSheetSnapshot(request);
  }

  const summary = createFallbackSheetSummary(request.query, "bridge-unavailable", "Sheet runtime unavailable");
  return {
    ok: true,
    payload: {
      runId: null,
      summary,
      mappingArtifacts: [],
      visibleSlice: createFallbackVisibleSlice([
        `시트 ${summary.startDate}..${summary.endDate}`,
        "mode=unavailable | failure=access",
        "detail=Sheet runtime unavailable"
      ])
    },
    source: "bridge-unavailable",
    error: "Sheet runtime unavailable"
  };
}

export async function fetchLiveReadBundle(
  request: FetchLiveReadBundleRequest
): Promise<FetchLiveReadBundleResponse | null> {
  if (window.desktopBridge?.fetchLiveReadBundle) {
    return window.desktopBridge.fetchLiveReadBundle(request);
  }
  return null;
}

export async function buildOperatorExport(
  request: BuildOperatorExportRequest
): Promise<BuildOperatorExportResponse> {
  if (window.desktopBridge?.buildOperatorExport) {
    return window.desktopBridge.buildOperatorExport(request);
  }
  return {
    ok: true,
    exportBundle: null
  };
}

export async function exportOperatorHandoff(
  request: ExportOperatorHandoffRequest
): Promise<ExportOperatorHandoffResponse | null> {
  if (!window.desktopBridge?.exportOperatorHandoff) return null;
  return window.desktopBridge.exportOperatorHandoff(request);
}

export async function repeatOperatorHandoff(
  request: RepeatOperatorHandoffRequest
): Promise<RepeatOperatorHandoffResponse | null> {
  if (!window.desktopBridge?.repeatOperatorHandoff) return null;
  return window.desktopBridge.repeatOperatorHandoff(request);
}

export async function updateOperatorHandoffStatus(
  request: UpdateOperatorHandoffStatusRequest
): Promise<UpdateOperatorHandoffStatusResponse | null> {
  if (!window.desktopBridge?.updateOperatorHandoffStatus) return null;
  return window.desktopBridge.updateOperatorHandoffStatus(request);
}

export async function indexWorkspaceSearch(
  request: IndexWorkspaceSearchRequest
): Promise<IndexWorkspaceSearchResponse> {
  if (window.desktopBridge?.indexWorkspaceSearch) {
    return window.desktopBridge.indexWorkspaceSearch(request);
  }
  return {
    ok: true,
    runId: request.payload.runId,
    documentCount: 0
  };
}

export async function queryWorkspaceSearch(
  request: QueryWorkspaceSearchRequest
): Promise<QueryWorkspaceSearchResponse> {
  if (window.desktopBridge?.queryWorkspaceSearch) {
    return window.desktopBridge.queryWorkspaceSearch(request);
  }
  return {
    ok: true,
    runId: request.runId,
    hits: []
  };
}

export async function loadBindingDecisions(
  request: LoadBindingDecisionsRequest
): Promise<LoadBindingDecisionsResponse> {
  if (window.desktopBridge?.loadBindingDecisions) {
    return window.desktopBridge.loadBindingDecisions(request);
  }
  return {
    ok: true,
    decisions: []
  };
}

export async function saveBindingDecision(
  request: SaveBindingDecisionRequest
): Promise<SaveBindingDecisionResponse | null> {
  if (!window.desktopBridge?.saveBindingDecision) return null;
  return window.desktopBridge.saveBindingDecision(request);
}

export async function deleteBindingDecision(
  request: DeleteBindingDecisionRequest
): Promise<DeleteBindingDecisionResponse | null> {
  if (!window.desktopBridge?.deleteBindingDecision) return null;
  return window.desktopBridge.deleteBindingDecision(request);
}

export async function loadRecommendationTraces(
  request: LoadRecommendationTracesRequest
): Promise<RecommendationTrace[]> {
  if (!window.desktopBridge?.loadRecommendationTraces) return [];
  const response = await window.desktopBridge.loadRecommendationTraces(request);
  return response.traces;
}

export async function saveRecommendationTrace(
  request: SaveRecommendationTraceRequest
): Promise<SaveRecommendationTraceResponse | null> {
  if (!window.desktopBridge?.saveRecommendationTrace) return null;
  return window.desktopBridge.saveRecommendationTrace(request);
}

export async function loadManualScanAnchor(
  request: LoadManualScanAnchorsRequest
): Promise<SavedManualScanAnchor | null> {
  if (!window.desktopBridge?.loadManualScanAnchor) return null;
  const response = await window.desktopBridge.loadManualScanAnchor(request);
  return response.anchor;
}

export async function saveManualScanAnchor(
  request: SaveManualScanAnchorsRequest
): Promise<SaveManualScanAnchorsResponse | null> {
  if (!window.desktopBridge?.saveManualScanAnchor) return null;
  return window.desktopBridge.saveManualScanAnchor(request);
}

export async function deleteManualScanAnchor(
  request: DeleteManualScanAnchorsRequest
): Promise<DeleteManualScanAnchorsResponse | null> {
  if (!window.desktopBridge?.deleteManualScanAnchor) return null;
  return window.desktopBridge.deleteManualScanAnchor(request);
}

export async function fetchProviderRows(
  request: FetchProviderRowsRequest
): Promise<FetchProviderRowsResponse<ProviderInventoryCompareRow>> {
  if (window.desktopBridge?.fetchProviderRows) {
    return window.desktopBridge.fetchProviderRows(request);
  }

  return {
    ok: true,
    provider: request.provider,
    payload: [],
    usedDomFallback: false
  };
}

export async function getBridgeMeta(): Promise<{ ok: true; port: number } | null> {
  if (!window.desktopBridge?.getBridgeMeta) return null;
  return window.desktopBridge.getBridgeMeta();
}

export async function openWingsLoginWindow() {
  if (!window.desktopBridge?.openWingsLogin) return null;
  return window.desktopBridge.openWingsLogin();
}

export async function captureWingsSession() {
  if (!window.desktopBridge?.captureWingsSession) return null;
  return window.desktopBridge.captureWingsSession();
}

export async function fetchProviderReservations(
  request: FetchReservationsRequest
): Promise<FetchReservationsResponse<ProviderReservationRow>> {
  if (window.desktopBridge?.fetchProviderReservations) {
    return window.desktopBridge.fetchProviderReservations(request);
  }

  return {
    ok: true,
    provider: request.provider,
    payload: [],
    usedDomFallback: false,
    source: "bridge-unavailable"
  };
}

export async function fetchWingsLiveContract(
  request: FetchWingsLiveContractRequest
): Promise<FetchWingsLiveContractResponse> {
  if (window.desktopBridge?.fetchWingsLiveContract) {
    return window.desktopBridge.fetchWingsLiveContract(request);
  }

  return {
    ok: true,
    provider: "wings-pms",
    capability: request.capability,
    payload: [],
    usedDomFallback: false,
    source: "bridge-unavailable"
  };
}

export async function getBridgeRuntime(): Promise<BridgeRuntimeStatus | null> {
  if (!window.desktopBridge?.getBridgeRuntime) return null;
  return window.desktopBridge.getBridgeRuntime();
}

export async function getBridgeSummary(provider?: string | null) {
  if (!window.desktopBridge?.getBridgeSummary) return null;
  return window.desktopBridge.getBridgeSummary(provider);
}
