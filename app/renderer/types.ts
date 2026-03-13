import type {
  FetchSheetSnapshotSummary,
  LiveSupportLevel,
  RuntimeMode
} from "../contracts";

export type AppTaskId =
  | "inventory-compare"
  | "reservation-audit"
  | "apply-review"
  | "settings";

export type RightPanelTab = "evidence" | "ops" | "validation" | "logs";
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

export interface SummaryMetric {
  label: string;
  value: string;
  tone?: "default" | "warn" | "critical" | "ok";
}

export interface SearchResult {
  id: string;
  kind: "inventory-row" | "audit-row" | "evidence" | "ops" | "validation" | "log";
  title: string;
  excerpt: string;
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
  summary: FetchSheetSnapshotSummary | null;
  logs: string[];
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
  bridgeStatus: BridgeStatus;
  metrics: SummaryMetric[];
  logs: string[];
  evidenceLines: string[];
  opsLines: string[];
  validationLines: string[];
  inventoryCompare: InventoryCompareSnapshot;
  inventoryCompareLoading: boolean;
  sheetRead: SheetReadSnapshot;
  reservationAudit: ReservationAuditSnapshot;
  reservationAuditLoading: boolean;
  searchQuery: string;
  searchResults: SearchResult[];
  processModules: ProcessModule[];
  providerCards: ProviderCapabilityCard[];
  jobStatusCards: JobStatusCard[];
  bridgeSummary: BridgeSummary;
  authBundleSettingsSnapshot: AuthBundleSettingsSnapshot | null;
  hasPendingQueryChanges: boolean;
}
