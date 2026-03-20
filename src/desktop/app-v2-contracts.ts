export const APP_PROVIDERS = ["wings-pms", "naver-partner", "admin-station"] as const;
export const APP_BRANCHES = ["COEX", "GANGNAM"] as const;
export const APP_SHELL_MODULES = ["pms-read", "ota-read", "sheet-read", "reservation-management", "settings"] as const;
export const APP_RESERVATION_ACTIONS = ["compare", "validate", "reconcile", "edit", "apply", "order-list", "arrival"] as const;
export const APP_READ_SOURCES = ["pms", "ota", "sheet"] as const;

export type AppProvider = (typeof APP_PROVIDERS)[number];
export type AppBranch = (typeof APP_BRANCHES)[number];
export type AppShellModule = (typeof APP_SHELL_MODULES)[number];
export type AppReservationAction = (typeof APP_RESERVATION_ACTIONS)[number];
export type AppReadSource = (typeof APP_READ_SOURCES)[number];
export type AppProviderWindowState = "hidden" | "visible" | "closed";
export type AppProviderPageState = "idle" | "loading" | "loaded" | "error";
export type AppProviderOperatingStatus = "ready" | "needs-login" | "attention" | "error";
export type AppPreflightStatus = "ready" | "needs-settings" | "attention";
export type AppRuntimeVerifyFocus = "live-read" | "sheet-live";
export type AppRuntimeSupportLevel = "offline-preview" | "sheet-live" | "read-live";
export type AppRuntimeGate = "locked" | "open";
export type AppReadinessBlockingSource = AppProvider | "sheet" | "sheet-auth" | "runtime-error";
export type AppSheetReadinessStatus = "ready" | "needs-settings" | "invalid-settings" | "needs-auth" | "missing-sheet" | "error";
export type AppLiveReadStatus = "idle" | "loading" | "done" | "error";
export type AppBgeM3Runtime = "local-path" | "download-if-missing";
export type AppBgeInstallStatus = "ready" | "installed" | "error";
export type AppReservationEngineStatus = "fallback" | "pending-source" | "planned";

export interface AppSheetTabSettings {
  coexMain: string;
  coexAnnex: string;
  gangnam: string;
}

export interface AppBgeM3Settings {
  enabled: boolean;
  modelId: string;
  runtime: AppBgeM3Runtime;
  modelPath: string;
  topK: number;
  scoreThreshold: number;
}

export interface AppBgeInstallSnapshot {
  checkedAt: string;
  status: AppBgeInstallStatus;
  modelId: string;
  installRoot: string;
  modelPath: string;
  installed: boolean;
  summary: string;
  files: string[];
}

export interface AppOpsViewSettings {
  excludeRoomMakeup: boolean;
  flagContinuationCandidates: boolean;
}

export interface AppSettings {
  spreadsheet: string;
  sheetName: string;
  sheetTabs?: AppSheetTabSettings | null;
  opsView?: AppOpsViewSettings | null;
  reportWindowDays?: number;
  bgeM3?: AppBgeM3Settings | null;
}

export interface AppSettingsSnapshot {
  config: AppSettings | null;
  isConfigured: boolean;
  missingRequired: Array<keyof AppSettings>;
  updatedAt: string | null;
  storagePath: string;
}

export interface AppProviderRawRuntimeSignals {
  pageState: AppProviderPageState;
  currentUrl: string | null;
  currentPath: string | null;
  currentHost: string | null;
  title: string | null;
  cookieCount: number;
  providerCookieCount: number;
  lastError: string | null;
  lastLoadedAt: string | null;
  lastLoadStartedAt: string | null;
  lastLoadFinishedAt: string | null;
  lastLoadFailedAt: string | null;
}

export interface AppProviderBrowserState extends AppProviderRawRuntimeSignals {
  provider: AppProvider;
  owner: "electron-main";
  partition: string;
  label: string;
  startUrl: string;
  windowState: AppProviderWindowState;
}

export interface AppProviderOperatingEvidence {
  provider: AppProvider;
  derivedStatus: AppProviderOperatingStatus;
  rawSignals: AppProviderRawRuntimeSignals;
  sourceError: string | null;
  reasons: string[];
}

export interface AppProviderOperatingSnapshot extends AppProviderBrowserState {
  operatingStatus: AppProviderOperatingStatus;
  operatingSummary: string;
  rawSignals: AppProviderRawRuntimeSignals;
  operatingEvidence: AppProviderOperatingEvidence;
}

export interface AppPreflightSnapshot {
  checkedAt: string;
  overallStatus: AppPreflightStatus;
  canRun: boolean;
  summary: string;
  settings: AppSettingsSnapshot;
  providers: AppProviderOperatingSnapshot[];
}

export interface AppSheetReadinessSnapshot {
  checkedAt: string;
  status: AppSheetReadinessStatus;
  summary: string;
  spreadsheetId: string | null;
  sheetName: string | null;
  accessMode: "none" | "access-token" | "refresh-token";
  lastError: string | null;
}

export interface AppRuntimeVerifySnapshot {
  checkedAt: string;
  focus: AppRuntimeVerifyFocus;
  preflightStatus: AppPreflightStatus;
  overallReady: boolean;
  blockingSources: AppReadinessBlockingSource[];
  supportLevel: AppRuntimeSupportLevel;
  v2Gate: AppRuntimeGate;
  settings: AppSettingsSnapshot;
  sheet: AppSheetReadinessSnapshot;
  preflight: AppPreflightSnapshot | null;
}

export interface AppLiveReadInput {
  branch: AppBranch;
  startDate: string;
  endDate: string;
}

export interface AppLiveReadPreviewItem {
  id: string;
  title: string;
  subtitle: string;
  statusLabel: string;
}

export interface AppLiveReadSnapshot {
  source: AppReadSource;
  branch: AppBranch;
  checkedAt: string;
  status: AppLiveReadStatus;
  summary: string;
  recordsImported: number;
  blockedReason: string | null;
  items: AppLiveReadPreviewItem[];
  evidence: string[];
}

export interface AppReservationActionInput {
  action: AppReservationAction;
  branch: AppBranch;
  startDate: string;
  endDate: string;
  excludeRoomMakeup?: boolean;
  flagContinuationCandidates?: boolean;
  approvePlanToken?: string;
  executeApply?: boolean;
}

export interface AppReservationActionRow {
  id: string;
  primary: string;
  secondary: string;
  statusLabel: string;
  detail?: string;
}

export interface AppReservationActionSnapshot {
  action: AppReservationAction;
  branch: AppBranch;
  startDate: string;
  endDate: string;
  checkedAt: string;
  status: AppLiveReadStatus;
  summary: string;
  evidence: string[];
  rows: AppReservationActionRow[];
  outputPath: string | null;
  engineStatus?: AppReservationEngineStatus;
  issueCount?: number;
  planToken?: string | null;
  requiresApproval?: boolean;
  applyAllowed?: boolean;
}

export interface DesktopAppApi {
  loadSettings: () => Promise<AppSettingsSnapshot>;
  saveSettings: (input: Partial<AppSettings>) => Promise<AppSettingsSnapshot>;
  installBgeM3Model: () => Promise<AppBgeInstallSnapshot>;
  ensureProviderBrowser: (provider: AppProvider) => Promise<AppProviderBrowserState>;
  getProviderBrowserState: (provider: AppProvider) => Promise<AppProviderBrowserState>;
  listProviderBrowsers: () => Promise<AppProviderBrowserState[]>;
  openProviderBrowser: (provider: AppProvider) => Promise<AppProviderBrowserState>;
  hideProviderBrowser: (provider: AppProvider) => Promise<AppProviderBrowserState>;
  reloadProviderBrowser: (provider: AppProvider) => Promise<AppProviderBrowserState>;
  runPreflight: () => Promise<AppPreflightSnapshot>;
  runPmsRead: (input: AppLiveReadInput) => Promise<AppLiveReadSnapshot>;
  runOtaRead: (input: AppLiveReadInput) => Promise<AppLiveReadSnapshot>;
  runSheetRead: (input: AppLiveReadInput) => Promise<AppLiveReadSnapshot>;
  runReservationAction: (input: AppReservationActionInput) => Promise<AppReservationActionSnapshot>;
}

export function isAppProvider(value: unknown): value is AppProvider {
  return typeof value === "string" && APP_PROVIDERS.includes(value as AppProvider);
}
