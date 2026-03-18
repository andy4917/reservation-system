import type { ProviderType } from "./auth.js";

export interface DateRangeQuery {
  startDate: string;
  endDate: string;
}

export interface LiveReadQuery extends DateRangeQuery {
  branch?: string;
  runId?: string | null;
}

export interface LiveReadRunContext extends LiveReadQuery {
  runId: string;
  branch: string;
  requestedAt: string;
  runtimeMode?: string;
  sourceProvider?: string | null;
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
  query: LiveReadQuery;
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
  query: LiveReadQuery;
}

export interface FetchSheetSnapshotRequest {
  type: "provider.fetchSheetSnapshot";
  query: LiveReadQuery;
}

export type LiveReadSourceStatus =
  | "read-live"
  | "partial-live"
  | "empty"
  | "unconfigured"
  | "unavailable"
  | "error"
  | "unsupported";

export interface LiveReadSourceCoverage {
  provider: "sheet" | ProviderType;
  status: LiveReadSourceStatus;
  source: string;
  rowCount: number;
  branchScoped: boolean;
  readOnly: true;
  usedFallback: boolean;
  error: string;
  endpointCapability?: string;
}

export interface LiveReadCoverage {
  runId: string;
  branch: string;
  startDate: string;
  endDate: string;
  requestedAt: string;
  overallStatus: "read-live" | "partial-live" | "offline-preview";
  sources: {
    sheet: LiveReadSourceCoverage;
    naverPartner: LiveReadSourceCoverage;
    adminStation: LiveReadSourceCoverage;
    wingsPms: LiveReadSourceCoverage;
  };
}

export type SheetReadFailureCategory = "none" | "access" | "sheet-structure" | "mapping" | "value-parse";

export interface FetchSheetAnchorSummary {
  namedRangeCount: number;
  metadataCount: number;
  hasScanConfigNamedRange: boolean;
  hasRoomMapNamedRange: boolean;
  hasMetadataScanConfig: boolean;
  manualAnchorUsed: boolean;
  manualAnchorFields: string[];
}

export interface FetchSheetHintSummary {
  fingerprint: string;
  roomMapCount: number;
  scanMode: string;
  manualMode: boolean;
  hasRoomTypeMap: boolean;
  branch: string;
  branchSectionEvidence: string[];
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
  providerRow: number | null;
  providerValueRow: number | null;
  providerRowRole: "none" | "aggregate-only" | "aggregate+typed-slot";
  providerValueSourceKind: "none" | "provider-row" | "typed-row";
  providerValueSourceReason: string;
  typedSlotRows: {
    urban: number | null;
    doubleTwin: number | null;
    grand: number | null;
  };
  typedSlotComplete: boolean;
  typedSlotDuplicate: boolean;
  physicalOrderVariant: boolean;
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

export type MappingDomain = "inventory" | "provider" | "validation" | "mapping" | "reservation" | "anchor";
export type MappingSeverity = "critical" | "high" | "medium" | "low";

export interface SectionRef {
  spreadsheetId: string;
  sheetName: string;
  sheetId: string | null;
  sectionKey: string;
  state: "active" | "preopen";
  titleRow: number | null;
  headerRow: number | null;
  roomStartRow: number | null;
  inventoryStartRow: number | null;
}

export interface AnchorEvidence {
  why: string;
  competingCandidates: string[];
  signals: string[];
}

export interface MappingAnchor {
  anchorId: string;
  kind: "dateRow" | "roomStartRow" | "inventorySearchStartRow" | "stationInventoryRow" | "naverInventoryRow";
  source: "manual" | "scan" | "metadata" | "namedRange";
  row: number | null;
  confidence: number;
  evidence: AnchorEvidence;
}

export interface MappingTermBinding {
  anchorId: string;
  termId: string;
  confidence: number;
  method: "rule" | "manual" | "embedding";
  decidedAt: string;
  resolvedCanonicalId?: string | null;
  mappingDomain?: MappingDomain;
  severity?: MappingSeverity;
  decisionKey?: string | null;
  rawHeader?: string | null;
  evidenceSource?: string;
  evidenceSignals?: string[];
  ruleId?: string | null;
  evidenceLineage?: string[];
}

export interface MappingUnresolvedBinding {
  anchorId: string;
  rawHeader: string;
  sampleValues: string[];
  candidateTerms: string[];
  reason: string;
  status: "open" | "reviewed" | "resolved";
  mappingDomain?: MappingDomain;
  severity?: MappingSeverity;
  confidence?: number;
  evidenceSource?: string;
  evidenceSignals?: string[];
  ruleId?: string;
}

export interface ProviderValueSource {
  providerKey: string;
  providerRow: number | null;
  providerValueRow: number | null;
  providerRowRole: "none" | "aggregate-only" | "aggregate+typed-slot";
  sourceKind: "none" | "provider-row" | "typed-row";
  sourceReason: string;
  typedSlotRows: {
    urban: number | null;
    doubleTwin: number | null;
    grand: number | null;
  };
  typedSlotComplete: boolean;
  typedSlotDuplicate: boolean;
}

export interface StructuralVariant {
  kind: "physicalOrderVariant" | "manualAnchorUsed" | "branchSectionEvidence";
  value: boolean | string | number | null;
  detail: string;
}

export interface MappingArtifactMetrics {
  autoBindingCount: number;
  manualBindingCount: number;
  unresolvedByDomain: Partial<Record<MappingDomain, number>>;
  exactAutoBindingCount: number;
  roomAliasBindingCount: number;
  reservationIdentityBindingCount: number;
  softTriageCount: number;
  targetedUnresolvedCount: number;
  precisionScore: number;
  precisionGate: "ready" | "needs-review" | "not-applicable";
  confidenceBands: {
    high: number;
    medium: number;
    low: number;
  };
}

export interface MappingTruthArtifactLink {
  kind: "room-alias-graph" | "reservation-identity-graph" | "provider-taxonomy" | "branch-provider-mapping";
  version: string;
  source: string;
  available: boolean;
  confidence: number;
  detail: string;
  signals: string[];
}

export interface MappingArtifact {
  runId: string | null;
  section: SectionRef;
  anchors: MappingAnchor[];
  bindings: MappingTermBinding[];
  unresolved: MappingUnresolvedBinding[];
  providerValueSource: ProviderValueSource;
  structuralSummary: StructuralVariant[];
  validationSummary: FetchSheetValidationSummary;
  metrics?: MappingArtifactMetrics;
  truthSignals?: MappingTruthArtifactLink[];
}

export type SearchDocumentKind =
  | "inventory-explanation"
  | "reservation-explanation"
  | "settings-explanation"
  | "binding-summary"
  | "unresolved-binding"
  | "decision-trace"
  | "validation-summary"
  | "structural-summary"
  | "verify-output"
  | "acceptance-trace";

export interface SearchDocument {
  docId: string;
  runId: string;
  kind: SearchDocumentKind;
  sectionKey: string | null;
  source: string;
  sourceLineIndex: number | null;
  rawText: string;
  canonicalFields: string[];
  candidateBasis: string[];
  signals: string[];
  tags: string[];
  evidenceLineage: string[];
  jumpTarget: {
    runId: string;
    task: "inventory-compare" | "reservation-audit" | "settings";
    panel?: "evidence" | "ops" | "validation" | "logs";
    rowId?: string | null;
    anchorId?: string | null;
    sectionKey?: string | null;
    lineIndex?: number | null;
  };
}

export interface SearchHit {
  docId: string;
  kind: SearchDocumentKind;
  sectionKey: string | null;
  source: string;
  score: number;
  matchReason: string;
  excerpt: string;
  candidateBasis: string[];
  evidenceLineage: string[];
  jumpTarget: SearchDocument["jumpTarget"];
}

export interface WorkspaceSearchInventoryRow {
  id: string;
  date: string;
  roomType: string;
  channel: string;
  siteRaw: string;
  sheetRaw: string;
  reason: string;
  action: string;
}

export interface WorkspaceSearchReservationRow {
  id: string;
  reservationNo: string;
  guestName: string;
  channel: string;
  checkin: string;
  checkout: string;
  status: string;
  auditStatus: string;
  reason: string;
  action: string;
}

export interface WorkspaceSearchIndexInput {
  runId: string;
  branch: string;
  activeTask: "inventory-compare" | "reservation-audit" | "settings";
  inventoryRows: WorkspaceSearchInventoryRow[];
  reservationRows: WorkspaceSearchReservationRow[];
  evidenceLines: string[];
  opsLines: string[];
  validationLines: string[];
  logs: string[];
  mappingArtifacts: MappingArtifact[];
  artifactLines: string[];
  sheetSource: string;
  sheetError: string;
  sheetSummary: FetchSheetSnapshotSummary | null;
  savedDecisions: SavedBindingDecision[];
  recommendationTraces: RecommendationTrace[];
}

export interface IndexWorkspaceSearchRequest {
  type: "search.indexWorkspace";
  payload: WorkspaceSearchIndexInput;
}

export interface IndexWorkspaceSearchResponse {
  ok: true;
  runId: string;
  documentCount: number;
}

export interface QueryWorkspaceSearchRequest {
  type: "search.queryWorkspace";
  runId: string;
  query: string;
  limit?: number;
}

export interface QueryWorkspaceSearchResponse {
  ok: true;
  runId: string;
  hits: SearchHit[];
}

export interface SavedBindingDecision {
  decisionKey: string;
  branch: string;
  sheetRef: BindingDecisionSheetRef;
  sectionKey: string | null;
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
  sectionKey?: string | null;
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
  mappingArtifacts: MappingArtifact[];
}

export interface FetchSheetSnapshotResponse {
  ok: true;
  payload: FetchSheetSnapshotPayload;
  source?: string;
  error?: string;
}

export interface FetchLiveReadBundleRequest {
  type: "provider.fetchLiveReadBundle";
  context: LiveReadRunContext;
}

export interface FetchLiveReadBundlePayload {
  context: LiveReadRunContext;
  sheet: FetchSheetSnapshotResponse;
  providerRows: {
    "naver-partner": FetchProviderRowsResponse<ProviderInventoryCompareRow>;
    "admin-station": FetchProviderRowsResponse<ProviderInventoryCompareRow>;
  };
  reservations: FetchReservationsResponse<ProviderReservationRow>;
  coverage: LiveReadCoverage;
}

export interface FetchLiveReadBundleResponse {
  ok: true;
  payload: FetchLiveReadBundlePayload;
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

export interface RecommendationTrace {
  referenceKey: string;
  traceKey: string;
  branch: string;
  sheetRef: BindingDecisionSheetRef;
  runId: string | null;
  sectionKey: string | null;
  anchorId: string;
  rawHeader: string;
  candidateId: string;
  candidateBasis: string[];
  evidenceLineage: string[];
  modelVersion: string;
  outcome: "accepted" | "rejected";
  decidedAt: string;
}

export interface SaveRecommendationTraceInput {
  branch: string;
  sheetRef: BindingDecisionSheetRef;
  runId?: string | null;
  sectionKey?: string | null;
  anchorId: string;
  rawHeader: string;
  candidateId: string;
  candidateBasis: string[];
  evidenceLineage: string[];
  modelVersion: string;
  outcome: "accepted" | "rejected";
}

export interface LoadRecommendationTracesRequest {
  type: "recommendation.loadTraces";
  branch: string;
  sheetRef: BindingDecisionSheetRef;
}

export interface LoadRecommendationTracesResponse {
  ok: true;
  traces: RecommendationTrace[];
}

export interface SaveRecommendationTraceRequest {
  type: "recommendation.saveTrace";
  trace: SaveRecommendationTraceInput;
}

export interface SaveRecommendationTraceResponse {
  ok: true;
  trace: RecommendationTrace;
}

export type OperatorExportVerifyClassification = "live-success" | "sheet-unconfigured" | "failure" | "unavailable";

export interface OperatorExportVerifyEvidence {
  source: string;
  classification: OperatorExportVerifyClassification;
  failureCategory: SheetReadFailureCategory;
  failureDetail: string;
  summaryLines: string[];
}

export interface OperatorExportSectionSummary {
  sectionKey: string;
  state: "active" | "preopen";
  bindingCount: number;
  unresolvedCount: number;
  exactAutoBindingCount: number;
  softTriageCount: number;
  precisionScore: number;
  precisionGate: "ready" | "needs-review" | "not-applicable";
  latestAcceptedCount: number;
  latestRejectedCount: number;
}

export type OperatorExportHandoffFormat = "copy-text" | "json" | "csv";
export type OperatorExportHandoffStatus = "sent" | "confirmed" | "needs-follow-up";
export type OperatorExportImpactScope = "operations" | "implementation" | "mixed";

export interface OperatorExportManifest {
  runId: string;
  branch: string;
  generatedAt: string;
  source: string;
  verifyClassification: OperatorExportVerifyClassification;
  spreadsheetId: string;
  sheetName: string;
  startDate: string;
  endDate: string;
  sectionCount: number;
  unresolvedCount: number;
  exactAutoBindingCount: number;
  softTriageCount: number;
  precisionScore: number;
  precisionGate: "ready" | "needs-review" | "not-applicable";
  triageCoverage: number;
  traceCount: number;
  latestAcceptedCount: number;
  latestRejectedCount: number;
}

export interface OperatorExportHandoffPayload {
  format: OperatorExportHandoffFormat;
  fileName: string;
  mimeType: string;
  content: string;
}

export interface OperatorExportHandoffHistoryItem {
  handoffId: string;
  runId: string;
  branch: string;
  sheetRef: BindingDecisionSheetRef;
  target: "clipboard" | "file";
  format: OperatorExportHandoffFormat;
  exportedAt: string;
  fileName: string | null;
  filePath: string | null;
  bytes: number;
  verifyClassification: OperatorExportVerifyClassification;
  source: string;
  startDate: string;
  endDate: string;
  evidenceLineage: string[];
  status: OperatorExportHandoffStatus;
  impactScope: OperatorExportImpactScope;
  impactReasons: string[];
  repeatedFromHandoffId?: string | null;
  payload: OperatorExportHandoffPayload;
}

export interface OperatorExportBundle {
  runId: string;
  branch: string;
  generatedAt: string;
  sheetRef: BindingDecisionSheetRef;
  dateRange: {
    startDate: string;
    endDate: string;
  };
  verifyEvidence: OperatorExportVerifyEvidence;
  metrics: {
    sectionCount: number;
    manualDecisionCount: number;
    unresolvedCount: number;
    exactAutoBindingCount: number;
    softTriageCount: number;
    precisionScore: number;
    precisionGate: "ready" | "needs-review" | "not-applicable";
    latestAcceptedCount: number;
    latestRejectedCount: number;
    triagedCandidateCount: number;
    triageCoverage: number;
    supersededTraceCount: number;
    traceCount: number;
  };
  sections: OperatorExportSectionSummary[];
  traces: RecommendationTrace[];
  manifest: OperatorExportManifest;
  evidenceLineage: string[];
  operatorLoopLines: string[];
  handoffSummary: {
    totalCount: number;
    pendingCount: number;
    needsFollowUpCount: number;
    confirmedCount: number;
    hiddenNeedsFollowUpCount: number;
  };
  handoffHistory: OperatorExportHandoffHistoryItem[];
  followUpQueue: OperatorExportHandoffHistoryItem[];
  handoff: {
    copyText: string;
    files: OperatorExportHandoffPayload[];
  };
  previewLines: string[];
}

export interface BuildOperatorExportRequest {
  type: "operator.buildExport";
  runId: string;
  branch: string;
}

export interface BuildOperatorExportResponse {
  ok: true;
  exportBundle: OperatorExportBundle | null;
}

export interface ExportOperatorHandoffRequest {
  type: "operator.exportHandoff";
  runId: string;
  branch: string;
  format: OperatorExportHandoffFormat;
  target: "clipboard" | "file";
}

export interface ExportOperatorHandoffResponse {
  ok: true;
  exported: boolean;
  target: "clipboard" | "file";
  format: OperatorExportHandoffFormat;
  filePath: string | null;
  fileName: string | null;
  bytes: number;
}

export interface RepeatOperatorHandoffRequest {
  type: "operator.repeatHandoff";
  handoffId: string;
  target: "clipboard" | "file";
}

export interface RepeatOperatorHandoffResponse {
  ok: true;
  repeated: boolean;
  handoff: OperatorExportHandoffHistoryItem | null;
  filePath: string | null;
}

export interface UpdateOperatorHandoffStatusRequest {
  type: "operator.updateHandoffStatus";
  handoffId: string;
  status: OperatorExportHandoffStatus;
}

export interface UpdateOperatorHandoffStatusResponse {
  ok: true;
  handoff: OperatorExportHandoffHistoryItem | null;
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
