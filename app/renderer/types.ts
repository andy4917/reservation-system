import type {
  FetchSheetSnapshotSummary,
  ManualScanAnchorValues,
  OperatorExportBundle,
  OperatorExportHandoffFormat,
  RecommendationTrace,
  SavedManualScanAnchor,
  SearchHit,
  SheetArtifactVisibleSlice,
  LiveSupportLevel,
  RuntimeMode
} from "../contracts";

export type AppTaskId =
  | "inventory-compare"
  | "reservation-audit"
  | "apply-review"
  | "settings";

export type RightPanelTab = "evidence" | "ops" | "validation" | "logs" | "handoff";
export type HandoffHistoryFilter = "all" | "pending" | "needs-follow-up" | "confirmed";
export type BranchSelection = "GANGNAM" | "COEX";

export interface BridgeStatus {
  connected: boolean;
  sessionAvailable: boolean;
  capability: "ready" | "degraded";
  activeHost: string;
  provider: string;
  message: string;
  code: string | null;
  recoveryAction: string | null;
  authConfigured: boolean;
  writeEnabled: boolean;
}

export interface AppRunContext {
  id: string;
  branch: BranchSelection;
  startDate: string;
  endDate: string;
  runtimeMode: RuntimeMode;
  requestedAt: string;
  sourceProvider: string | null;
}

export interface ActiveFocusTarget {
  task: AppTaskId;
  rowId?: string | null;
  anchorId?: string | null;
  sectionKey?: string | null;
  lineIndex?: number | null;
}

export interface SummaryMetric {
  label: string;
  value: string;
  tone?: "default" | "warn" | "critical" | "ok";
}

export interface SheetRef {
  spreadsheetId: string;
  sheetName: string;
  sheetId: string | null;
  branch: string | null;
  timezone: string | null;
}

export type MappingDomain = "inventory" | "provider" | "validation" | "mapping" | "reservation" | "anchor";
export type MappingSeverity = "critical" | "high" | "medium" | "low";

export interface Anchor {
  anchorId: string;
  kind: "named-range" | "developer-metadata" | "grid-hash";
  scope: string;
  sheetRef: SheetRef;
}

export interface SheetTerm {
  termId: string;
  canonicalName: string;
  synonyms: string[];
  datatype: string;
  description: string;
}

export interface TermBinding {
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

export interface UnresolvedBinding {
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
  bindings: TermBinding[];
  unresolved: UnresolvedBinding[];
  providerValueSource: ProviderValueSource;
  structuralSummary: StructuralVariant[];
  validationSummary: FetchSheetSnapshotSummary["validationSummary"];
  metrics?: MappingArtifactMetrics;
  truthSignals?: MappingTruthArtifactLink[];
}

export interface ProcessModule {
  id: string;
  title: string;
  owner: "app" | "extension";
  status: "ready" | "active" | "blocked" | "pending";
  detail: string;
}

export interface ProviderCapabilityCard {
  provider: "naver-partner" | "admin-station" | "wings-pms";
  label: string;
  capabilities: string[];
  owner: "app" | "extension" | "hybrid";
  status: "ready" | "bridge-required" | "hold";
}

export interface JobStatusCard {
  id: string;
  title: string;
  status: "idle" | "running" | "blocked" | "ready";
  detail: string;
}

export interface BridgeSummary {
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
}

export interface AuthBundleSettingsSnapshot {
  provider: string;
  host: string;
  updatedAt: string;
  bridgeSummary: BridgeSummary;
}

export interface InventoryCompareRow {
  id: string;
  branch?: string;
  date: string;
  roomType: string;
  channel: string;
  siteRaw: string;
  sheetRaw: string;
  diff: string;
  status: "match" | "mismatch" | "warning";
  reason: string;
  action: string;
}

export interface InventoryCompareSnapshot {
  title: string;
  supportLevel: LiveSupportLevel;
  sourceLabel: string;
  lastRunAt: string;
  rows: InventoryCompareRow[];
  mismatchCount: number;
  warningCount: number;
  matchedCount: number;
  evidenceLines: string[];
  opsLines: string[];
  validationLines: string[];
  logs: string[];
}

export interface ReservationAuditRow {
  id: string;
  reservationNo: string;
  guestName: string;
  channel: string;
  checkin: string;
  checkout: string;
  status: "ACTIVE" | "CANCELED";
  auditStatus: "ok" | "anomaly" | "review";
  reason: string;
  action: string;
  branch?: string;
  sourceCode?: string;
  nationalityCode?: string;
  languageCode?: string;
  languageName?: string;
  endpointCapability?: string;
  roomNo?: string;
}

export interface ReservationAuditSnapshot {
  title: string;
  supportLevel: LiveSupportLevel;
  sourceLabel: string;
  lastRunAt: string;
  rows: ReservationAuditRow[];
  anomalyCount: number;
  reviewCount: number;
  activeCount: number;
  canceledCount: number;
  evidenceLines: string[];
  opsLines: string[];
  validationLines: string[];
  logs: string[];
}

export interface SheetReadSnapshot {
  supportLevel: LiveSupportLevel;
  sourceLabel: string;
  lastRunAt: string;
  selectedRunId: string | null;
  summary: FetchSheetSnapshotSummary | null;
  visibleSlice: SheetArtifactVisibleSlice;
  mappingArtifacts: MappingArtifact[];
}

export interface WorkspaceMockState {
  runtimeMode: RuntimeMode;
  activeTask: AppTaskId;
  selectedBranch: BranchSelection;
  selectedRange: {
    startDate: string;
    endDate: string;
  };
  activeRunContext: AppRunContext | null;
  activeFocus: ActiveFocusTarget | null;
  bridgeStatus: BridgeStatus;
  metrics: SummaryMetric[];
  logs: string[];
  evidenceLines: string[];
  opsLines: string[];
  validationLines: string[];
  inventoryCompare: InventoryCompareSnapshot;
  inventoryCompareLoading: boolean;
  sheetRead: SheetReadSnapshot;
  manualScanAnchor: SavedManualScanAnchor | null;
  manualScanAnchorDraft: ManualScanAnchorValues;
  sheetTerms: SheetTerm[];
  termBindings: TermBinding[];
  unresolvedBindings: UnresolvedBinding[];
  recommendationTraces: RecommendationTrace[];
  operatorExport: OperatorExportBundle | null;
  handoffHistoryFilter: HandoffHistoryFilter;
  reservationAudit: ReservationAuditSnapshot;
  reservationAuditLoading: boolean;
  searchQuery: string;
  searchResults: SearchHit[];
  processModules: ProcessModule[];
  providerCards: ProviderCapabilityCard[];
  jobStatusCards: JobStatusCard[];
  bridgeSummary: BridgeSummary;
  authBundleSettingsSnapshot: AuthBundleSettingsSnapshot | null;
  hasPendingQueryChanges: boolean;
}
