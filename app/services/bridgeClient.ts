import type {
  BridgeContextResponse,
  BridgePingResponse,
  DeleteBindingDecisionRequest,
  DeleteBindingDecisionResponse,
  DeleteManualScanAnchorsRequest,
  DeleteManualScanAnchorsResponse,
  FetchSheetSnapshotSummary,
  FetchSheetSnapshotRequest,
  FetchSheetSnapshotResponse,
  FetchProviderRowsRequest,
  FetchProviderRowsResponse,
  LoadBindingDecisionsRequest,
  LoadBindingDecisionsResponse,
  LoadManualScanAnchorsRequest,
  LoadManualScanAnchorsResponse,
  SaveManualScanAnchorsRequest,
  SaveManualScanAnchorsResponse,
  SavedManualScanAnchor,
  ProviderInventoryCompareRow,
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
      hasMetadataScanConfig: false
    },
    hintSummary: {
      fingerprint: "",
      roomMapCount: 0,
      scanMode: "unknown",
      manualMode: false,
      hasRoomTypeMap: false
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
      providerValueParsedCount: 0
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
      loadManualScanAnchor: (request: LoadManualScanAnchorsRequest) => Promise<LoadManualScanAnchorsResponse>;
      saveManualScanAnchor: (request: SaveManualScanAnchorsRequest) => Promise<SaveManualScanAnchorsResponse>;
      deleteManualScanAnchor: (request: DeleteManualScanAnchorsRequest) => Promise<DeleteManualScanAnchorsResponse>;
      fetchSheetSnapshot: (request: FetchSheetSnapshotRequest) => Promise<FetchSheetSnapshotResponse>;
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
