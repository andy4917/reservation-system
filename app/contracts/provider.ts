import type { ProviderType } from "./auth.js";

export interface DateRangeQuery {
  startDate: string;
  endDate: string;
}

export interface ProviderInventoryCompareRow {
  provider?: ProviderType;
  branch?: string;
  reservationRef?: string;
  roomNo?: string;
  date: string;
  roomType: string;
  channel: string;
  siteRaw: string;
  sheetRaw: string;
  diff?: string;
  status?: "match" | "mismatch" | "warning";
  reason?: string;
  action?: string;
  rawLine?: string;
  sourceLineIndex?: number | null;
  candidateBasis?: string[];
  signals?: Array<{
    kind: string;
    value: string;
    source: "line" | "context";
  }>;
  tags?: Array<{
    kind: string;
    value: string;
  }>;
}

export interface FetchProviderRowsRequest {
  type: "provider.fetchRows";
  provider: ProviderType;
  query: DateRangeQuery;
}

export interface FetchProviderRowsResponse<T = unknown> {
  ok: true;
  provider: ProviderType;
  payload: T[];
  usedDomFallback: boolean;
  source?: string;
  endpointCapability?: string;
  profilesFetched?: Array<{
    branch?: string;
    url?: string;
    endpointCapability?: string;
    recordCount?: number;
    error?: string;
  }>;
}

export interface FetchReservationsRequest {
  type: "provider.fetchReservations";
  provider: ProviderType;
  query: DateRangeQuery;
}

export interface FetchSheetSnapshotRequest {
  type: "provider.fetchSheetSnapshot";
  query: DateRangeQuery & {
    branch?: string;
  };
}

export type SheetReadFailureCategory = "none" | "access" | "sheet-structure" | "mapping" | "value-parse";

export interface FetchSheetAnchorSummary {
  namedRangeCount: number;
  metadataCount: number;
  hasScanConfigNamedRange: boolean;
  hasRoomMapNamedRange: boolean;
  hasMetadataScanConfig: boolean;
}

export interface FetchSheetHintSummary {
  fingerprint: string;
  roomMapCount: number;
  scanMode: string;
  manualMode: boolean;
  hasRoomTypeMap: boolean;
}

export interface FetchSheetValidationSummary {
  providerKey: string;
  issueCount: number;
  errorCount: number;
  warningCount: number;
  issueCodes: string[];
  hasTypeMismatch: boolean;
  hasPartitionMismatch: boolean;
  hasInsufficientRows: boolean;
  providerValueRawCount: number;
  providerValueParsedCount: number;
}

export interface FetchSheetCoverageSummary {
  dateCount: number;
  inventoryRowsDetected: {
    NAVER: boolean;
    STATION: boolean;
  };
  inventoryValueRowsDetected: {
    NAVER: boolean;
    STATION: boolean;
  };
  inventoryDataRowCounts: {
    NAVER: number;
    STATION: number;
  };
  providerValueDays: {
    NAVER: number;
    STATION: number;
  };
  reservationBlockCount: number;
}

export interface SheetArtifactVisibleSlice {
  runId: string | null;
  offset: number;
  limit: number;
  total: number;
  lines: string[];
}

export interface BindingDecisionSheetRef {
  spreadsheetId: string;
  sheetName: string;
  sheetId: string | null;
  timezone: string | null;
}

export interface SavedBindingDecision {
  decisionKey: string;
  branch: string;
  sheetRef: BindingDecisionSheetRef;
  anchorId: string;
  rawHeader: string;
  termId: string;
  method: "manual";
  decidedAt: string;
  confidence: number;
}

export interface SaveBindingDecisionInput {
  branch: string;
  sheetRef: BindingDecisionSheetRef;
  anchorId: string;
  rawHeader: string;
  termId: string;
  confidence?: number;
}

export interface FetchSheetSnapshotSummary {
  spreadsheetId: string;
  sheetName: string;
  startDate: string;
  endDate: string;
  readMode: string;
  retryReason: string | null;
  retryTrace: string[];
  failureCategory: SheetReadFailureCategory;
  failureDetail: string;
  reservationBlockCount: number;
  validationIssueCount: number;
  inventoryRows: {
    NAVER: number | null;
    STATION: number | null;
  };
  providerValueDays: {
    NAVER: number;
    STATION: number;
  };
  anchorSummary: FetchSheetAnchorSummary;
  hintSummary: FetchSheetHintSummary;
  validationSummary: FetchSheetValidationSummary;
  coverage: FetchSheetCoverageSummary;
}

export interface FetchSheetSnapshotPayload {
  runId: string | null;
  summary: FetchSheetSnapshotSummary | null;
  visibleSlice: SheetArtifactVisibleSlice;
}

export interface FetchSheetSnapshotResponse {
  ok: true;
  payload: FetchSheetSnapshotPayload;
  source?: string;
  error?: string;
}

export interface LoadBindingDecisionsRequest {
  type: "binding.loadDecisions";
  branch: string;
  sheetRef: BindingDecisionSheetRef;
}

export interface LoadBindingDecisionsResponse {
  ok: true;
  decisions: SavedBindingDecision[];
}

export interface SaveBindingDecisionRequest {
  type: "binding.saveDecision";
  decision: SaveBindingDecisionInput;
}

export interface SaveBindingDecisionResponse {
  ok: true;
  decision: SavedBindingDecision;
}

export interface DeleteBindingDecisionRequest {
  type: "binding.deleteDecision";
  decisionKey: string;
}

export interface DeleteBindingDecisionResponse {
  ok: true;
  deleted: boolean;
}

export interface ManualScanAnchorValues {
  dateRow?: number | null;
  roomStartRow?: number | null;
  inventorySearchStartRow?: number | null;
  naverInventoryRow?: number | null;
  stationInventoryRow?: number | null;
}

export interface SavedManualScanAnchor {
  anchorKey: string;
  branch: string;
  sheetRef: BindingDecisionSheetRef;
  scan: ManualScanAnchorValues;
  updatedAt: string;
}

export interface LoadManualScanAnchorsRequest {
  type: "scanAnchor.load";
  branch: string;
  sheetRef: BindingDecisionSheetRef;
}

export interface LoadManualScanAnchorsResponse {
  ok: true;
  anchor: SavedManualScanAnchor | null;
}

export interface SaveManualScanAnchorsRequest {
  type: "scanAnchor.save";
  branch: string;
  sheetRef: BindingDecisionSheetRef;
  scan: ManualScanAnchorValues;
}

export interface SaveManualScanAnchorsResponse {
  ok: true;
  anchor: SavedManualScanAnchor;
}

export interface DeleteManualScanAnchorsRequest {
  type: "scanAnchor.delete";
  branch: string;
  sheetRef: BindingDecisionSheetRef;
}

export interface DeleteManualScanAnchorsResponse {
  ok: true;
  deleted: boolean;
}

export interface FetchReservationsResponse<T = unknown> {
  ok: true;
  provider: ProviderType;
  payload: T[];
  usedDomFallback: boolean;
  source?: string;
  endpointCapability?: string;
  profilesFetched?: Array<{
    branch?: string;
    url?: string;
    endpointCapability?: string;
    recordCount?: number;
    error?: string;
  }>;
}

export interface ProviderReservationRow {
  branch?: string;
  sourceSystem?: string;
  reservationNo: string;
  reservationRef?: string;
  channel?: string;
  checkin: string;
  checkout: string;
  nights?: number;
  roomNo?: string;
  roomNos?: string[];
  roomTypeCode?: string;
  roomTypeName?: string;
  price?: number | null;
  account?: string;
  sourceCode?: string;
  status?: string;
  statusBucket?: "ACTIVE" | "CANCELED";
  auditAnomaly?: boolean;
  nationalityCode?: string;
  languageCode?: string;
  languageName?: string;
  guestName?: string;
  phoneTail?: string;
  remarkHead?: string;
  endpointCapability?: string;
}

export interface FetchWingsLiveContractRequest {
  type: "provider.fetchWingsLiveContract";
  provider: "wings-pms";
  capability: string;
  request?: Record<string, unknown>;
}

export interface FetchWingsLiveContractResponse<T = unknown> {
  ok: true;
  provider: "wings-pms";
  capability: string;
  payload: T[];
  usedDomFallback: false;
  source?: string;
  endpointCapability?: string;
  profilesFetched?: Array<{
    branch?: string;
    url?: string;
    endpointCapability?: string;
    recordCount?: number;
    error?: string;
  }>;
}

export interface DomSnapshotRequest {
  type: "provider.domSnapshot";
  provider: ProviderType;
  query?: DateRangeQuery;
}

export interface DomSnapshotResponse<T = unknown> {
  ok: true;
  provider: ProviderType;
  payload: T;
  usedDomFallback: true;
}
