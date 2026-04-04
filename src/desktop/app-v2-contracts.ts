export const APP_PROVIDERS = ["wings-pms", "naver-partner", "admin-station"] as const;
export const APP_BRANCHES = ["COEX", "GANGNAM", "SEOLLEUNG", "SAMSUNG"] as const;
export const APP_SHELL_MODULES = ["pms-read", "ota-read", "sheet-read", "reservation-management", "settings"] as const;
export const APP_RESERVATION_ACTIONS = ["compare", "validate", "reconcile", "edit", "apply", "order-list", "arrival"] as const;
export const APP_READ_SOURCES = ["pms", "ota", "sheet"] as const;
export const DEFAULT_APP_REPORT_WINDOW_DAYS = 5;
export const DEFAULT_APP_BGE_MODEL_ID = "Xenova/bge-m3";
export const DEFAULT_APP_BGE_TOP_K = 5;
export const DEFAULT_APP_BGE_SCORE_THRESHOLD = 0.72;

export type AppProvider = (typeof APP_PROVIDERS)[number];
export type AppBranch = (typeof APP_BRANCHES)[number];
export type AppBranchAvailability = "active" | "inactive";
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
export type AppAuthMode = "config-auth" | "session-auth";
export type AppAuthTarget = "google-sheets" | AppProvider;
export type AppLiveReadStatus = "idle" | "loading" | "done" | "error";
export type AppBgeM3Runtime = "local-path" | "download-if-missing";
export type AppBgeInstallStatus = "ready" | "installed" | "error";
export type AppReservationEngineStatus = "pending-source" | "planned";

export interface AppProviderOption {
  provider: AppProvider;
  label: string;
  shortLabel: string;
  partition: string;
  startUrl: string;
  sessionOrigin: string;
  apiOrigin: string;
  cookieScopeUrls: readonly string[];
  allowedHostSuffixes: readonly string[];
  readyHosts: readonly string[];
  loginUrlHints: readonly string[];
}

export const APP_PROVIDER_OPTIONS: readonly AppProviderOption[] = [
  {
    provider: "wings-pms",
    label: "Wings",
    shortLabel: "WINGS",
    partition: "persist:app-v2-wings",
    startUrl: "https://pms.sanhait.com/",
    sessionOrigin: "https://pms.sanhait.com",
    apiOrigin: "https://pms.sanhait.com",
    cookieScopeUrls: ["https://pms.sanhait.com/"],
    allowedHostSuffixes: ["sanhait.com"],
    readyHosts: ["pms.sanhait.com"],
    loginUrlHints: ["identity/samlsso", "sso", "redirect"],
  },
  {
    provider: "naver-partner",
    label: "네이버 파트너",
    shortLabel: "OTA",
    partition: "persist:app-v2-naver",
    startUrl: "https://partner.booking.naver.com/",
    sessionOrigin: "https://partner.booking.naver.com",
    apiOrigin: "https://api-partner.booking.naver.com",
    cookieScopeUrls: ["https://partner.booking.naver.com/", "https://new.smartplace.naver.com/"],
    allowedHostSuffixes: ["naver.com"],
    readyHosts: ["partner.booking.naver.com", "new.smartplace.naver.com"],
    loginUrlHints: [],
  },
  {
    provider: "admin-station",
    label: "Station",
    shortLabel: "STATION",
    partition: "persist:app-v2-station",
    startUrl: "https://admin.admin-stationbyuhc.com/",
    sessionOrigin: "https://admin.admin-stationbyuhc.com",
    apiOrigin: "https://api.admin-stationbyuhc.com",
    cookieScopeUrls: ["https://admin.admin-stationbyuhc.com/"],
    allowedHostSuffixes: ["admin-stationbyuhc.com"],
    readyHosts: ["admin.admin-stationbyuhc.com"],
    loginUrlHints: [],
  },
] as const;

export interface AppBranchOption {
  branch: AppBranch;
  label: string;
  availability: AppBranchAvailability;
  reason: string;
}

export const APP_BRANCH_OPTIONS: readonly AppBranchOption[] = [
  { branch: "COEX", label: "코엑스", availability: "active", reason: "운영 지점" },
  { branch: "GANGNAM", label: "강남", availability: "active", reason: "운영 지점" },
  { branch: "SEOLLEUNG", label: "선릉", availability: "active", reason: "운영 지점" },
  { branch: "SAMSUNG", label: "삼성", availability: "inactive", reason: "preopen inactive branch" },
] as const;

export interface AppBgeM3Settings {
  enabled: boolean;
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

export interface AppWingsLoginSettings {
  loginId: string;
  password: string;
}

export interface AppSettings {
  spreadsheet: string;
  sheetName: string;
  opsView?: AppOpsViewSettings | null;
  reportWindowDays?: number;
  bgeM3?: AppBgeM3Settings | null;
  wingsLogin?: AppWingsLoginSettings | null;
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

export interface AppAuthRequirement {
  target: AppAuthTarget;
  label: string;
  authMode: AppAuthMode;
  ready: boolean;
  status: AppSheetReadinessStatus | AppProviderOperatingStatus;
  summary: string;
  nextAction: string;
  hints: string[];
  evidence: string[];
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
  kind?: "summary" | "reservation-block";
  branchLabel?: string;
  roomNo?: string;
  roomType?: string;
  guestName?: string;
  reservationNo?: string;
  checkin?: string;
  checkout?: string;
  nightCount?: number;
  channel?: string;
  noteHead?: string;
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

export interface AppOpsOrderRow {
  date: string;
  weekday: string;
  branch: string;
  building: string;
  roomNo: string;
  opsRoomLabel: string;
  roomType: string;
  taskLabel: string;
  taskRuleId: string;
  arrivalCount: number;
  departureCount: number;
  stayoverCount: number;
  turnoverFlag: boolean;
  arrivalReservationNos: string;
  departureReservationNos: string;
  stayoverReservationNos: string;
  channels: string;
  noteHeads: string;
  continuationCandidate: boolean;
  continuationBasis: string;
}

export interface AppOpsArrivalRow {
  section: string;
  date: string;
  weekday: string;
  branch: string;
  building: string;
  roomNo: string;
  opsRoomLabel: string;
  roomType: string;
  reservationNo: string;
  reservationKey: string;
  channel: string;
  checkin: string;
  checkout: string;
  nights: number;
  turnoverFlag: boolean;
  arrivalReservationNos: string;
  departureReservationNos: string;
  arrivalChannels: string;
  departureChannels: string;
  noteHead: string;
  nationalityNights: string;
  continuationCandidate: boolean;
  continuationBasis: string;
}

export interface AppOpsViewSnapshot {
  orderListRows: AppOpsOrderRow[];
  arrivalRows: AppOpsArrivalRow[];
}

export interface AppOpsSheetApplyInput {
  action: "order-list" | "arrival";
  branch: AppBranch;
  startDate: string;
  endDate: string;
  spreadsheet: string;
  sheetNames: string[];
  reportDate?: string;
}

export interface AppOpsSheetApplySnapshot {
  action: "order-list" | "arrival";
  branch: AppBranch;
  reportDate: string;
  summary: string;
  appliedCount: number;
  spreadsheetId: string;
  targetSheetNames: string[];
  appliedAt: string;
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
  opsView?: AppOpsViewSnapshot | null;
}

export interface AppWingsLoginAttemptSnapshot {
  attempted: boolean;
  submitted: boolean;
  summary: string;
  loginId: string;
  loggedAt: string | null;
}

export interface DesktopAppApi {
  loadSettings: () => Promise<AppSettingsSnapshot>;
  saveSettings: (input: Partial<AppSettings>) => Promise<AppSettingsSnapshot>;
  installBgeM3Model: () => Promise<AppBgeInstallSnapshot>;
  listAuthRequirements: () => Promise<AppAuthRequirement[]>;
  getRuntimeReadiness: (focus: AppRuntimeVerifyFocus) => Promise<AppRuntimeVerifySnapshot>;
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
  attemptWingsLogin: () => Promise<AppWingsLoginAttemptSnapshot>;
  applyOpsSheetOutput: (input: AppOpsSheetApplyInput) => Promise<AppOpsSheetApplySnapshot>;
}

export function isAppProvider(value: unknown): value is AppProvider {
  return typeof value === "string" && APP_PROVIDERS.includes(value as AppProvider);
}

export function getAppProviderOption(provider: AppProvider): AppProviderOption {
  return APP_PROVIDER_OPTIONS.find((item) => item.provider === provider) ?? APP_PROVIDER_OPTIONS[0];
}

export function getAppBranchOption(branch: AppBranch): AppBranchOption {
  return APP_BRANCH_OPTIONS.find((item) => item.branch === branch) ?? APP_BRANCH_OPTIONS[0];
}
