import { startTransition, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type {
  AppAuthRequirement,
  AppOpsArrivalRow,
  AppOpsOrderRow,
  AppBranch,
  AppCoexWing,
  AppErrorWorkbenchState,
  AppErrorPanelTab,
  AppInventoryBoardMode,
  AppInventoryWorkbenchState,
  AppIssueStatus,
  AppLiveReadPreviewItem,
  AppLiveReadSnapshot,
  AppOtaMode,
  AppPreflightSnapshot,
  AppProvider,
  AppProviderBrowserState,
  AppReservationAction,
  AppReservationManagementView,
  AppReservationActionRow,
  AppReservationActionSnapshot,
  AppRuntimeVerifySnapshot,
  AppSettingsSnapshot,
  AppShellModule,
  AppWingsLoginAttemptSnapshot,
} from "../../src/desktop/app-v2-contracts.js";
import {
  DEFAULT_APP_BGE_SCORE_THRESHOLD,
  DEFAULT_APP_BGE_TOP_K,
  DEFAULT_APP_REPORT_WINDOW_DAYS,
  getAppBranchOption,
  getAppProviderOption
} from "../../src/desktop/app-v2-contracts.js";
import {
  buildActionOutputRows,
  buildResultSummary,
  BRANCH_OPTIONS,
  createIdleRead,
  deriveReservationActionAvailability,
  RESERVATION_ACTION_LABELS,
} from "./shellState.js";
import uhSuiteLogo from "./assets/uh-suite-logo.svg";

const MODULE_LABELS: Record<Exclude<AppShellModule, "settings">, string> = {
  "pms-read": "PMS 조회",
  "ota-read": "OTA 조회",
  "sheet-read": "예약 시트 조회",
  "reservation-management": "예약 관리",
};

type WorkspacePhase = "idle" | "working" | "result";
type AppReadSource = "pms" | "ota" | "sheet";
const channelColorMap: Record<string, { label: string; bg: string; fg: string; accent: string }> = {
  AGODA: { label: "아고다", bg: "#EA9999", fg: "#1f1111", accent: "#c35f5f" },
  BOOKING: { label: "부킹닷컴", bg: "#6D9EEB", fg: "#111827", accent: "#3f6eb6" },
  TRIP: { label: "트립닷컴", bg: "#45818E", fg: "#ffffff", accent: "#2f5f69" },
  EXPEDIA: { label: "익스피디아", bg: "#F6B26B", fg: "#24150a", accent: "#d18c45" },
  AIRBNB: { label: "에어비앤비", bg: "#B6D7A8", fg: "#173019", accent: "#7ba765" },
  TRAVELOKA: { label: "트리블로카", bg: "#C9DAF8", fg: "#17304f", accent: "#88aede" },
  NAVER: { label: "네이버", bg: "#C6E0B4", fg: "#173019", accent: "#6AA84F" },
  YANOLJA: { label: "야놀자", bg: "#FFFF00", fg: "#292400", accent: "#b6a600" },
  HERE: { label: "여기어때", bg: "#EAD1DC", fg: "#3f1f2f", accent: "#c08ca7" },
  COUPANG_TRAVEL: { label: "쿠팡트래블", bg: "#980000", fg: "#ffffff", accent: "#6d0000" },
  STATION: { label: "스테이션", bg: "#00FFFF", fg: "#00393c", accent: "#00b8b8" },
  DIDA_TRAVEL: { label: "디다트레블", bg: "#8E7CC3", fg: "#ffffff", accent: "#6f5ba6" },
  ETC: { label: "현장 숙박 결제", bg: "#999999", fg: "#111111", accent: "#666666" },
  UNKNOWN: { label: "기타 비용", bg: "#5B9BD5", fg: "#ffffff", accent: "#3c79b4" },
};

function toDateInputValue(value: Date) {
  return value.toISOString().slice(0, 10);
}

function nowIso() {
  return new Date().toISOString();
}

function addDays(value: string, days: number) {
  const parsed = new Date(`${value}T00:00:00`);
  parsed.setDate(parsed.getDate() + days);
  return toDateInputValue(parsed);
}

function buildDefaultWindow(days = DEFAULT_APP_REPORT_WINDOW_DAYS) {
  const start = toDateInputValue(new Date());
  return {
    start,
    end: addDays(start, Math.max(days - 1, 0)),
  };
}

function formatDateTime(value: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("ko-KR");
}

function providerLabel(provider: AppProvider) {
  return getAppProviderOption(provider).shortLabel;
}

function authStatusLabel(status: AppAuthRequirement["status"]) {
  if (status === "ready") return "준비됨";
  if (status === "needs-settings") return "설정 필요";
  if (status === "needs-auth" || status === "needs-login") return "인증 필요";
  if (status === "attention") return "확인 필요";
  if (status === "missing-sheet") return "시트 누락";
  if (status === "invalid-settings") return "설정 오류";
  return "오류";
}

function findEvidenceValue(evidence: string[], prefix: string) {
  const matched = evidence.find((entry) => entry.startsWith(prefix));
  return matched ? matched.slice(prefix.length) : "";
}

function formatEvidenceChip(entry: string) {
  if (entry.startsWith("sessionReadiness:")) return "세션 준비";
  if (entry.startsWith("runtimeHost:")) {
    const host = findEvidenceValue([entry], "runtimeHost:");
    return `호스트 ${host || "-"}`;
  }
  if (entry.startsWith("sourceLineage:")) {
    const lineage = findEvidenceValue([entry], "sourceLineage:");
    return `읽기 경로 ${lineage || "-"}`;
  }
  if (entry.startsWith("window:")) {
    const value = findEvidenceValue([entry], "window:");
    return `조회 기간 ${value.replace("..", " ~ ")}`;
  }
  if (entry.startsWith("accessMode:")) {
    const accessMode = findEvidenceValue([entry], "accessMode:");
    return `시트 인증 ${accessMode || "-"}`;
  }
  if (entry.startsWith("pageState:")) {
    const pageState = findEvidenceValue([entry], "pageState:");
    return `페이지 ${pageState || "-"}`;
  }
  if (entry.startsWith("providerCookies:")) {
    const count = findEvidenceValue([entry], "providerCookies:");
    return `쿠키 ${count || "0"}개`;
  }
  if (entry.startsWith("naverBusinessId:")) {
    const businessId = findEvidenceValue([entry], "naverBusinessId:");
    return `네이버 사업장 ${businessId || "-"}`;
  }
  if (entry.startsWith("stationBranchId:")) {
    const branchId = findEvidenceValue([entry], "stationBranchId:");
    return `스테이션 지점 ${branchId || "-"}`;
  }
  return entry;
}

function pickEvidenceChips(evidence: string[]) {
  const preferredPrefixes = [
    "sessionReadiness:",
    "runtimeHost:",
    "sourceLineage:",
    "accessMode:",
    "pageState:",
    "window:",
    "providerCookies:",
    "naverBusinessId:",
    "stationBranchId:",
  ];
  const selected = preferredPrefixes
    .map((prefix) => evidence.find((entry) => entry.startsWith(prefix)))
    .filter(Boolean) as string[];
  return Array.from(new Set(selected.map((entry) => formatEvidenceChip(entry)))).slice(0, 4);
}

function buildLiveReadStatus(
  requirement: AppAuthRequirement | undefined,
  read: AppLiveReadSnapshot,
  proofDetected = read.status === "done",
) {
  if (proofDetected) return "실조회 확인";
  if (requirement?.ready) return requirement.authMode === "session-auth" ? "세션 준비" : "읽기 가능";
  if (requirement) return authStatusLabel(requirement.status);
  if (read.status === "error") return "실패";
  if (read.status === "loading") return "조회 중";
  return "대기";
}

function sourceFromModule(module: AppShellModule) {
  if (module === "pms-read") return "pms" as const;
  if (module === "ota-read") return "ota" as const;
  if (module === "sheet-read") return "sheet" as const;
  return null;
}

function buildInitialReads(branch: AppBranch) {
  return {
    pms: createIdleRead("pms", branch),
    ota: createIdleRead("ota", branch),
    sheet: createIdleRead("sheet", branch),
  };
}

function buildManagementTitle(action: AppReservationAction) {
  if (action === "compare") return "조회 결과 비교";
  if (action === "validate") return "기준 검증";
  if (action === "reconcile") return "대조 결과 정리";
  if (action === "edit") return "수정 작업";
  if (action === "apply") return "OTA 적용 가능 확인";
  if (action === "order-list") return "오더리스트";
  return "어라이벌";
}

function buildActionSurfaceEyebrow(action: AppReservationAction) {
  if (action === "compare" || action === "validate" || action === "reconcile") return "검토 기준";
  if (action === "edit") return "수정 기준";
  if (action === "apply") return "적용 범위";
  if (action === "order-list") return "오더리스트";
  return "어라이벌";
}

function parseIsoDate(value?: string) {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function buildWindowDays(startDate: string, endDate: string) {
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  if (!start || !end || start > end) return [];
  const days: Array<{ iso: string; label: string; weekday: string }> = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    days.push({
      iso: toDateInputValue(cursor),
      label: String(cursor.getDate()).padStart(2, "0"),
      weekday: cursor.toLocaleDateString("ko-KR", { weekday: "short" }),
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

function isReservationBlockItem(item: AppLiveReadPreviewItem) {
  return item.kind === "reservation-block" && Boolean(item.roomNo && item.checkin && item.checkout);
}

function matchesStayDay(item: AppLiveReadPreviewItem, dayIso: string) {
  const day = parseIsoDate(dayIso);
  const checkin = parseIsoDate(item.checkin);
  const checkout = parseIsoDate(item.checkout);
  if (!day || !checkin || !checkout) return false;
  return day >= checkin && day < checkout;
}

function formatStayRange(item: AppLiveReadPreviewItem) {
  if (!item.checkin || !item.checkout) return "-";
  return `${item.checkin} ~ ${item.checkout}`;
}

function summarizeReference(item: AppLiveReadPreviewItem | null, emptyLabel: string) {
  if (!item) return emptyLabel;
  return [item.title, item.subtitle].filter(Boolean).join(" · ");
}

async function copyTextToClipboard(text: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  if (typeof document === "undefined") {
    throw new Error("Clipboard API is not available.");
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);
  if (!copied) {
    throw new Error("Clipboard copy failed.");
  }
}

function buildApplyInventoryCopyText(rows: AppReservationActionRow[], branchLabel: string, startDate: string, endDate: string) {
  const lines = [`${branchLabel} OTA 적용 가능 상태`, `기간 ${startDate} ~ ${endDate}`, ""];
  for (const row of rows) {
    lines.push([row.primary, row.secondary, row.detail, row.statusLabel].filter(Boolean).join(" / "));
  }
  return lines.join("\n");
}

function getChannelVisual(channel?: string) {
  const normalized = String(channel || "").trim().toUpperCase();
  return channelColorMap[normalized] ?? channelColorMap.UNKNOWN;
}

const opsTaskToneMap: Record<string, { bg: string; fg: string; accent: string }> = {
  긴급클리닝: { bg: "#ffd9d4", fg: "#7f221f", accent: "#ce6e65" },
  룸메이크업: { bg: "#dfe7fb", fg: "#314a7a", accent: "#90a7d7" },
  룸클리닝: { bg: "#eef5cc", fg: "#5e651f", accent: "#b4bf57" },
  TURNOVER: { bg: "#ffd9d4", fg: "#7f221f", accent: "#ce6e65" },
  ARRIVAL: { bg: "#dff7f1", fg: "#136359", accent: "#69d3c3" },
  DEPARTURE: { bg: "#fff3bf", fg: "#7a5a08", accent: "#e0c35a" },
};

function getOpsTaskTone(label: string) {
  return opsTaskToneMap[label] ?? { bg: "#edf2f6", fg: "#415160", accent: "#8ca0af" };
}

function roomSortKey(value: string) {
  return value.replace(/[^0-9A-Z]/gi, "").padStart(8, "0");
}

function formatDisplayDate(value: string) {
  const parsed = parseIsoDate(value);
  if (!parsed) return value;
  return parsed.toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "long" });
}

function buildOrderRowComment(row: AppOpsOrderRow) {
  const parts = [
    row.turnoverFlag ? "턴오버" : "",
    row.noteHeads,
    row.arrivalReservationNos,
    row.departureReservationNos,
    row.continuationCandidate ? row.continuationBasis || "연박 후보" : "",
  ].filter(Boolean);
  return parts.join(" · ") || "추가 메모 없음";
}

function inferArrivalDepartureText(row: AppOpsArrivalRow, linkedOrderRow?: AppOpsOrderRow | null) {
  if (row.section === "TURNOVER") {
    return {
      departureText: linkedOrderRow?.taskLabel || "전체청소",
      arrivalText: row.nationalityNights || row.noteHead || "전체청소",
    };
  }
  if (row.section === "DEPARTURE") {
    return {
      departureText: linkedOrderRow?.taskLabel || row.noteHead || (row.turnoverFlag ? "전체청소" : "퇴실"),
      arrivalText: "",
    };
  }
  return {
    departureText: linkedOrderRow?.taskLabel && !linkedOrderRow.taskLabel.includes("긴급") ? linkedOrderRow.taskLabel : "",
    arrivalText: row.nationalityNights || row.noteHead || "입실",
  };
}

function classifyArrivalCellTone(text: string) {
  if (!text) return getOpsTaskTone("");
  if (text.includes("전체청소")) return getOpsTaskTone("긴급클리닝");
  if (text.includes("룸메이크업") || text.includes("재실")) return getOpsTaskTone("룸메이크업");
  if (text.includes("룸클리닝")) return getOpsTaskTone("룸클리닝");
  if (text.includes("퇴실예정")) return getOpsTaskTone("ARRIVAL");
  if (text.includes("VIP") || text.includes("얼리") || text.includes("장기")) return getOpsTaskTone("DEPARTURE");
  return getOpsTaskTone("ARRIVAL");
}

interface InventoryBoardCell {
  id: string;
  dayIso: string;
  baseValue: string;
  nextValue: string;
  previousValue: string;
  changed: boolean;
  occupied: boolean;
}

interface InventoryBoardRow {
  id: string;
  roomLabel: string;
  roomType: string;
  guestLabel: string;
  issueStatus: AppIssueStatus;
  sourceItem: AppLiveReadPreviewItem;
  cells: InventoryBoardCell[];
}

interface ErrorWorkbenchIssue {
  id: string;
  roomLabel: string;
  roomType: string;
  guestLabel: string;
  date: string;
  summary: string;
  detail: string;
  guidance: string;
  status: AppIssueStatus;
}

interface InventoryProviderDraftState {
  syncedAt: string | null;
  copiedAt: string | null;
  writeRequestedAt: string | null;
}

function matchesReservationActionRow(item: AppLiveReadPreviewItem, row: AppReservationActionRow) {
  const haystack = [row.primary, row.secondary, row.detail, row.statusLabel].join(" ").toLowerCase();
  return [item.roomNo, item.roomType, item.guestName, item.reservationNo].some((value) => Boolean(value && haystack.includes(String(value).toLowerCase())));
}

function inferReservationIssueStatus(
  item: AppLiveReadPreviewItem,
  rows: AppReservationActionRow[],
  decisionMap: Record<string, AppIssueStatus> = {},
) {
  const manual = decisionMap[item.id];
  if (manual) return manual;
  const matchedRow = rows.find((row) => matchesReservationActionRow(item, row));
  const matchedText = [matchedRow?.statusLabel, matchedRow?.detail, matchedRow?.secondary].join(" ").toLowerCase();
  if (
    matchedText.includes("error") ||
    matchedText.includes("warn") ||
    matchedText.includes("mismatch") ||
    matchedText.includes("blocked")
  ) {
    return "error" as const;
  }
  if (!item.guestName || !item.reservationNo || !item.roomType || !item.channel || Boolean(item.noteHead)) {
    return "needs-review" as const;
  }
  return "normal" as const;
}

function toIssueSortDistance(date: string) {
  const parsed = parseIsoDate(date);
  if (!parsed) return Number.MAX_SAFE_INTEGER;
  return Math.abs(parsed.getTime() - new Date().setHours(0, 0, 0, 0));
}

function buildErrorWorkbenchIssues(
  items: AppLiveReadPreviewItem[],
  rows: AppReservationActionRow[],
  decisionMap: Record<string, AppIssueStatus> = {},
) {
  return items
    .map((item) => {
      const status = inferReservationIssueStatus(item, rows, decisionMap);
      const matchedRow = rows.find((row) => matchesReservationActionRow(item, row));
      return {
        id: item.id,
        roomLabel: item.roomNo || "-",
        roomType: item.roomType || "객실 미확인",
        guestLabel: item.guestName || item.reservationNo || item.title,
        date: item.checkin || "",
        summary: matchedRow?.primary || `${item.roomNo || "-"} PMS 비교`,
        detail: matchedRow?.secondary || item.subtitle || "현재 비교 정보가 없습니다.",
        guidance: [item.checkin || "-", item.guestName || "이름 미기입", item.roomType || "객실타입 미기입"].join(" / "),
        status,
      } satisfies ErrorWorkbenchIssue;
    })
    .sort((a, b) => toIssueSortDistance(a.date) - toIssueSortDistance(b.date));
}

function buildInventoryBoardRows(
  items: AppLiveReadPreviewItem[],
  days: Array<{ iso: string; label: string; weekday: string }>,
  synced: boolean,
  otaMode: AppOtaMode,
  decisionMap: Record<string, AppIssueStatus> = {},
) {
  return items.map((item) => {
    const issueStatus = inferReservationIssueStatus(item, [], decisionMap);
    const cells = days.map((day) => {
      const occupied = matchesStayDay(item, day.iso);
      const changed = synced && occupied;
      const nextValue = changed ? "닫음" : occupied ? "예약" : "열림";
      const previousValue = occupied ? "예약" : "열림";
      return {
        id: `${item.id}:${otaMode}:${day.iso}`,
        dayIso: day.iso,
        baseValue: occupied ? "예약" : "열림",
        nextValue,
        previousValue,
        changed,
        occupied,
      } satisfies InventoryBoardCell;
    });
    return {
      id: item.id,
      roomLabel: item.roomNo || "-",
      roomType: item.roomType || "객실",
      guestLabel: item.guestName || item.reservationNo || item.title,
      issueStatus,
      sourceItem: item,
      cells,
    } satisfies InventoryBoardRow;
  });
}

export default function App() {
  const [authRequirements, setAuthRequirements] = useState<AppAuthRequirement[]>([]);
  const [settingsSnapshot, setSettingsSnapshot] = useState<AppSettingsSnapshot | null>(null);
  const [providers, setProviders] = useState<AppProviderBrowserState[]>([]);
  const [preflight, setPreflight] = useState<AppPreflightSnapshot | null>(null);
  const [runtimeReadiness, setRuntimeReadiness] = useState<AppRuntimeVerifySnapshot | null>(null);
  const [spreadsheet, setSpreadsheet] = useState("");
  const [sheetName, setSheetName] = useState("");
  const [reportWindowDays, setReportWindowDays] = useState(String(DEFAULT_APP_REPORT_WINDOW_DAYS));
  const [excludeRoomMakeup, setExcludeRoomMakeup] = useState(false);
  const [flagContinuationCandidates, setFlagContinuationCandidates] = useState(true);
  const [bgeEnabled, setBgeEnabled] = useState(true);
  const [bgeRuntime, setBgeRuntime] = useState<"local-path" | "download-if-missing">("local-path");
  const [bgeModelPath, setBgeModelPath] = useState("");
  const [bgeTopK, setBgeTopK] = useState(String(DEFAULT_APP_BGE_TOP_K));
  const [bgeScoreThreshold, setBgeScoreThreshold] = useState(String(DEFAULT_APP_BGE_SCORE_THRESHOLD));
  const [bgeInstallSummary, setBgeInstallSummary] = useState("BGE-M3 상태를 아직 확인하지 않았습니다.");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<AppBranch>("COEX");
  const [activeModule, setActiveModule] = useState<AppShellModule>("reservation-management");
  const [activeManagementView, setActiveManagementView] = useState<AppReservationManagementView>("inventory-management");
  const [activeSource, setActiveSource] = useState<AppReadSource>("sheet");
  const [activeReservationAction, setActiveReservationAction] = useState<AppReservationAction>("validate");
  const [workspacePhase, setWorkspacePhase] = useState<WorkspacePhase>("idle");
  const [workspaceMessage, setWorkspaceMessage] = useState("준비됨");
  const [windowStart, setWindowStart] = useState(buildDefaultWindow().start);
  const [windowEnd, setWindowEnd] = useState(buildDefaultWindow().end);
  const [reads, setReads] = useState(buildInitialReads("COEX"));
  const [reservationResult, setReservationResult] = useState<AppReservationActionSnapshot | null>(null);
  const [selectedRoomDetailId, setSelectedRoomDetailId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [opsBoardDate, setOpsBoardDate] = useState("");
  const [opsApplySummary, setOpsApplySummary] = useState("");
  const [wingsLoginSummary, setWingsLoginSummary] = useState("WINGS 공용 계정을 아직 가져오지 않았습니다.");
  const [inventoryWorkbench, setInventoryWorkbench] = useState<AppInventoryWorkbenchState>({
    view: "inventory-management",
    rowLimit: 21,
    boardMode: "sheet",
    editMode: false,
    otaMode: "naver",
    coexWing: "A",
    hoveredDiffId: null,
    motionKey: 0,
  });
  const [inventoryProviderDrafts, setInventoryProviderDrafts] = useState<Record<AppOtaMode, InventoryProviderDraftState>>({
    naver: { syncedAt: null, copiedAt: null, writeRequestedAt: null },
    station: { syncedAt: null, copiedAt: null, writeRequestedAt: null },
  });
  const [errorWorkbench, setErrorWorkbench] = useState<AppErrorWorkbenchState>({
    panelTab: null,
    selectedIssueId: null,
    resolvedIssueIds: [],
    quickScanPassedIds: [],
    decisionMap: {},
  });
  const previousModuleRef = useRef<AppShellModule>("reservation-management");
  const previousActionRef = useRef<AppReservationAction>("validate");
  const autoOpenedProvidersRef = useRef<Set<AppProvider>>(new Set());
  const autoWingsLoginAttemptedRef = useRef(false);
  const errorPanelRef = useRef<HTMLDivElement | null>(null);

  const api = window.desktopApp;
  const activeBranchSheetNames = useMemo(() => (sheetName ? [sheetName] : []), [sheetName]);
  const importedWingsCredential = settingsSnapshot?.config?.wingsSharedCredentials?.branches?.[selectedBranch] ?? null;
  const wingsCompanyId = settingsSnapshot?.config?.wingsSharedCredentials?.companyId ?? "UHSUITE";

  async function refreshSettings() {
    if (!api?.loadSettings) return;
    const snapshot = await api.loadSettings();
    const nextWindowDays = snapshot.config?.reportWindowDays ?? DEFAULT_APP_REPORT_WINDOW_DAYS;
    const defaultWindow = buildDefaultWindow(nextWindowDays);
    startTransition(() => {
      setSettingsSnapshot(snapshot);
      setSpreadsheet(snapshot.config?.spreadsheet ?? "");
      setSheetName(snapshot.config?.sheetName ?? "");
      setReportWindowDays(String(nextWindowDays));
      setExcludeRoomMakeup(snapshot.config?.opsView?.excludeRoomMakeup ?? false);
      setFlagContinuationCandidates(snapshot.config?.opsView?.flagContinuationCandidates ?? true);
      setBgeEnabled(snapshot.config?.bgeM3?.enabled ?? true);
      setBgeRuntime(snapshot.config?.bgeM3?.runtime ?? "local-path");
      setBgeModelPath(snapshot.config?.bgeM3?.modelPath ?? "");
      setBgeTopK(String(snapshot.config?.bgeM3?.topK ?? DEFAULT_APP_BGE_TOP_K));
      setBgeScoreThreshold(String(snapshot.config?.bgeM3?.scoreThreshold ?? DEFAULT_APP_BGE_SCORE_THRESHOLD));
      setBgeInstallSummary(snapshot.config?.bgeM3?.modelPath ? "BGE-M3 설정을 불러왔습니다." : "BGE-M3 상태를 아직 확인하지 않았습니다.");
      const importedCredential = snapshot.config?.wingsSharedCredentials?.branches?.[selectedBranch] ?? null;
      setWingsLoginSummary(
        importedCredential
          ? `${selectedBranch} 지점 공용 계정을 사용합니다.`
          : "WINGS 공용 계정을 아직 가져오지 않았습니다."
      );
      setWindowStart(defaultWindow.start);
      setWindowEnd(defaultWindow.end);
    });
  }

  async function refreshProviders() {
    if (!api?.listProviderBrowsers) return;
    const nextProviders = await api.listProviderBrowsers();
    startTransition(() => setProviders(nextProviders));
  }

  async function refreshAuthRequirements() {
    if (!api?.listAuthRequirements) return;
    const nextRequirements = await api.listAuthRequirements();
    startTransition(() => setAuthRequirements(nextRequirements));
  }

  async function refreshPreflight() {
    if (!api?.runPreflight) return;
    const snapshot = await api.runPreflight();
    startTransition(() => {
      setPreflight(snapshot);
      setProviders(snapshot.providers);
    });
  }

  async function refreshRuntimeReadiness() {
    if (!api?.getRuntimeReadiness) return;
    const snapshot = await api.getRuntimeReadiness("live-read");
    startTransition(() => {
      setRuntimeReadiness(snapshot);
      setPreflight(snapshot.preflight);
      setProviders(snapshot.preflight?.providers ?? []);
    });
  }

  async function bootstrap() {
    if (!api) return;
    await Promise.all([refreshSettings(), refreshProviders(), refreshPreflight(), refreshAuthRequirements(), refreshRuntimeReadiness()]);
  }

  useEffect(() => {
    document.body.dataset.appShell = "end-user";
    void bootstrap();
  }, []);

  useEffect(() => {
    setReads(buildInitialReads(selectedBranch));
    setWorkspacePhase("idle");
    setWorkspaceMessage(`${selectedBranch} 작업을 준비했습니다.`);
    setReservationResult(null);
    setSelectedRoomDetailId(null);
    setActiveSource("sheet");
    setOpsApplySummary("");
    setActiveManagementView("inventory-management");
    setInventoryWorkbench({
      view: "inventory-management",
      rowLimit: 21,
      boardMode: "sheet",
      editMode: false,
      otaMode: "naver",
      coexWing: "A",
      hoveredDiffId: null,
      motionKey: 0,
    });
    setInventoryProviderDrafts({
      naver: { syncedAt: null, copiedAt: null, writeRequestedAt: null },
      station: { syncedAt: null, copiedAt: null, writeRequestedAt: null },
    });
    setErrorWorkbench({
      panelTab: null,
      selectedIssueId: null,
      resolvedIssueIds: [],
      quickScanPassedIds: [],
      decisionMap: {},
    });
    autoWingsLoginAttemptedRef.current = false;
  }, [selectedBranch]);

  async function saveSettings() {
    if (!api?.saveSettings) return;
    setBusyKey("save-settings");
    try {
      const nextSnapshot = await api.saveSettings({
        spreadsheet,
        sheetName,
        opsView: {
          excludeRoomMakeup,
          flagContinuationCandidates,
        },
        reportWindowDays: Number(reportWindowDays),
        bgeM3: {
          enabled: bgeEnabled,
          runtime: bgeRuntime,
          modelPath: bgeModelPath,
          topK: Number(bgeTopK),
          scoreThreshold: Number(bgeScoreThreshold),
        },
        wingsSharedCredentials: settingsSnapshot?.config?.wingsSharedCredentials ?? null,
      });
      startTransition(() => setSettingsSnapshot(nextSnapshot));
      setWorkspaceMessage("설정을 저장했습니다. 다음 조회부터 같은 기준을 사용합니다.");
      const importedCredential = nextSnapshot.config?.wingsSharedCredentials?.branches?.[selectedBranch] ?? null;
      setWingsLoginSummary(importedCredential ? `${selectedBranch} 지점 공용 계정을 유지합니다.` : "WINGS 공용 계정을 아직 가져오지 않았습니다.");
      const defaultWindow = buildDefaultWindow(Number(reportWindowDays));
      setWindowStart(defaultWindow.start);
      setWindowEnd(defaultWindow.end);
      await Promise.all([refreshPreflight(), refreshAuthRequirements(), refreshRuntimeReadiness()]);
    } finally {
      setBusyKey(null);
    }
  }

  async function installBgeM3Model() {
    if (!api?.installBgeM3Model) return;
    setBusyKey("install-bge-m3");
    setWorkspacePhase("working");
    setWorkspaceMessage("BGE-M3 로컬 모델을 설치 중입니다.");
    try {
      const snapshot = await api.installBgeM3Model();
      setBgeEnabled(true);
      setBgeRuntime("local-path");
      setBgeModelPath(snapshot.modelPath);
      setBgeInstallSummary(snapshot.summary);
      setWorkspacePhase("result");
      setWorkspaceMessage(snapshot.summary);
      await refreshSettings();
    } catch (error) {
      setBgeInstallSummary("BGE-M3 설치에 실패했습니다.");
      setWorkspacePhase("result");
      setWorkspaceMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyKey(null);
    }
  }

  async function openProviderSession(provider: AppProvider) {
    if (!api?.openProviderBrowser) return;
    setBusyKey(`provider:${provider}`);
    setWorkspacePhase("working");
    setWorkspaceMessage(`${providerLabel(provider)} 브라우저 세션 창을 여는 중입니다.`);
    try {
      await api.openProviderBrowser(provider);
      await Promise.all([refreshProviders(), refreshPreflight(), refreshAuthRequirements(), refreshRuntimeReadiness()]);
      setWorkspacePhase("result");
      setWorkspaceMessage(`${providerLabel(provider)} 창을 열었습니다. 로그인 후 상태를 새로고침해 주세요.`);
    } finally {
      setBusyKey(null);
    }
  }

  async function reloadProviderSession(provider: AppProvider) {
    if (!api?.reloadProviderBrowser) return;
    setBusyKey(`provider-reload:${provider}`);
    setWorkspacePhase("working");
    setWorkspaceMessage(`${providerLabel(provider)} 세션 상태를 다시 확인하는 중입니다.`);
    try {
      await api.reloadProviderBrowser(provider);
      await Promise.all([refreshProviders(), refreshPreflight(), refreshAuthRequirements(), refreshRuntimeReadiness()]);
      setWorkspacePhase("result");
      setWorkspaceMessage(`${providerLabel(provider)} 세션 상태를 새로고침했습니다.`);
    } finally {
      setBusyKey(null);
    }
  }

  async function runStoredWingsLogin() {
    if (!api?.attemptWingsLogin) return;
    setBusyKey("wings-login");
    try {
      const snapshot = (await api.attemptWingsLogin(selectedBranch)) as AppWingsLoginAttemptSnapshot;
      setWingsLoginSummary(snapshot.summary);
      setWorkspaceMessage(snapshot.summary);
      await Promise.all([refreshProviders(), refreshPreflight(), refreshAuthRequirements(), refreshRuntimeReadiness()]);
    } finally {
      setBusyKey(null);
    }
  }

  async function importWingsSharedCredentials() {
    if (!api?.importWingsSharedCredentials) return;
    setBusyKey("wings-import");
    try {
      const snapshot = await api.importWingsSharedCredentials();
      startTransition(() => setSettingsSnapshot(snapshot));
      const importedCredential = snapshot.config?.wingsSharedCredentials?.branches?.[selectedBranch] ?? null;
      setWingsLoginSummary(
        importedCredential
          ? `${selectedBranch} 지점 공용 계정을 가져왔습니다.`
          : "지점 공용 계정을 가져왔지만 현재 지점 계정은 비어 있습니다."
      );
      setWorkspaceMessage("WINGS 공용 계정 가져오기를 완료했습니다.");
      await Promise.all([refreshPreflight(), refreshAuthRequirements(), refreshRuntimeReadiness()]);
    } finally {
      setBusyKey(null);
    }
  }

  async function applyOpsSheetOutput(action: "order-list" | "arrival") {
    if (!api?.applyOpsSheetOutput) return;
    setBusyKey(`ops-sheet:${action}`);
    setWorkspaceMessage("구글 스프레드시트에 결과를 적용하는 중입니다.");
    try {
      const snapshot = await api.applyOpsSheetOutput({
        action,
        branch: selectedBranch,
        startDate: windowStart,
        endDate: windowEnd,
        spreadsheet,
        sheetNames: activeBranchSheetNames,
        reportDate: activeOpsDate || windowStart,
      });
      setOpsApplySummary(snapshot.summary);
      setWorkspaceMessage(snapshot.summary);
    } finally {
      setBusyKey(null);
    }
  }

  async function runRead(module: Extract<AppShellModule, "pms-read" | "ota-read" | "sheet-read">) {
    if (!api) return;
    const source = sourceFromModule(module);
    if (!source) return;
    setBusyKey(module);
    setWorkspacePhase("working");
    setWorkspaceMessage(`${MODULE_LABELS[module]} 작업을 진행 중입니다.`);
    try {
      const result =
        module === "pms-read"
          ? await api.runPmsRead({ branch: selectedBranch, startDate: windowStart, endDate: windowEnd })
          : module === "ota-read"
            ? await api.runOtaRead({ branch: selectedBranch, startDate: windowStart, endDate: windowEnd })
            : await api.runSheetRead({ branch: selectedBranch, startDate: windowStart, endDate: windowEnd });
      startTransition(() => {
        setReads((current) => ({ ...current, [source]: result }));
        if (source === "sheet") {
          setSelectedRoomDetailId(result.items.find((item) => isReservationBlockItem(item))?.id ?? null);
          setActiveSource("sheet");
        } else {
          setActiveSource(source);
        }
        setWorkspacePhase("result");
        setWorkspaceMessage(result.summary);
      });
      await Promise.all([refreshPreflight(), refreshProviders(), refreshAuthRequirements(), refreshRuntimeReadiness()]);
    } finally {
      setBusyKey(null);
    }
  }

  async function executeReservationAction(
    actionOverride?: AppReservationAction,
    options?: { approvePlanToken?: string; executeApply?: boolean },
  ) {
    const action = actionOverride ?? activeReservationAction;
    setBusyKey(`reservation:${action}`);
    setWorkspacePhase("working");
    setWorkspaceMessage(`${RESERVATION_ACTION_LABELS[action]} 작업을 진행 중입니다.`);
    try {
      if (api?.runReservationAction) {
        const result = await api.runReservationAction({
          action,
          branch: selectedBranch,
          startDate: windowStart,
          endDate: windowEnd,
          excludeRoomMakeup,
          flagContinuationCandidates,
          approvePlanToken: options?.approvePlanToken,
          executeApply: options?.executeApply,
        });
        startTransition(() => {
          setActiveReservationAction(action);
          setReservationResult(result);
          setWorkspacePhase("result");
          setWorkspaceMessage(result.summary);
        });
        return;
      }
      setWorkspacePhase("result");
      setWorkspaceMessage("예약 관리 IPC가 연결되지 않았습니다. 결과를 생성하지 않았습니다.");
    } finally {
      setBusyKey(null);
    }
  }

  async function copyApplyInventoryBoard() {
    if (activeReservationAction !== "apply" && activeManagementView !== "inventory-management") return;
    setBusyKey("copy-apply-board");
    try {
      if (inventoryWorkbench.boardMode === "ota") {
        if (!reads.ota.copyText) throw new Error("OTA 원본 조회 결과가 아직 없습니다.");
        await copyTextToClipboard(reads.ota.copyText);
        setInventoryProviderDrafts((current) => ({
          ...current,
          [inventoryWorkbench.otaMode]: { ...current[inventoryWorkbench.otaMode], copiedAt: nowIso() },
        }));
        setWorkspaceMessage("OTA 원본 재고값을 클립보드에 복사했습니다.");
      } else {
        if (actionOutputRows.length === 0) throw new Error("복사할 시트 기준 재고표가 없습니다.");
        await copyTextToClipboard(buildApplyInventoryCopyText(actionOutputRows, branchOption.label, windowStart, windowEnd));
        setInventoryProviderDrafts((current) => ({
          ...current,
          [inventoryWorkbench.otaMode]: { ...current[inventoryWorkbench.otaMode], copiedAt: nowIso() },
        }));
        setWorkspaceMessage("시트 기준 재고표를 클립보드에 복사했습니다.");
      }
    } catch (error) {
      setWorkspaceMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyKey(null);
    }
  }

  function handleManagementViewChange(view: AppReservationManagementView) {
    setActiveModule("reservation-management");
    setActiveManagementView(view);
    setInventoryWorkbench((current) => ({ ...current, view }));
    setWorkspacePhase("idle");
    setWorkspaceMessage(view === "inventory-management" ? "재고 관리 화면을 준비했습니다." : "오류 관리 화면을 준비했습니다.");
    if (view === "inventory-management") {
      setActiveReservationAction("apply");
    } else {
      setActiveReservationAction("validate");
    }
  }

  async function syncInventoryBoard() {
    setInventoryWorkbench((current) => ({
      ...current,
      boardMode: "combined",
      editMode: true,
      motionKey: current.motionKey + 1,
    }));
    await executeReservationAction("apply");
    setInventoryProviderDrafts((current) => ({
      ...current,
      [inventoryWorkbench.otaMode]: { ...current[inventoryWorkbench.otaMode], syncedAt: nowIso() },
    }));
  }

  async function executeInventoryWrite() {
    if (!reservationResult?.applyAllowed || !reservationResult.planToken) {
      setWorkspaceMessage("실제 반영 전에 동기화 결과와 승인 토큰이 필요합니다.");
      return;
    }
    setInventoryProviderDrafts((current) => ({
      ...current,
      [inventoryWorkbench.otaMode]: { ...current[inventoryWorkbench.otaMode], writeRequestedAt: nowIso() },
    }));
    await executeReservationAction("apply", {
      approvePlanToken: reservationResult.planToken,
      executeApply: true,
    });
  }

  function handleInventoryBoardMode(mode: AppInventoryBoardMode) {
    setInventoryWorkbench((current) => ({
      ...current,
      boardMode: mode,
      editMode: mode === "combined" ? true : current.editMode && mode !== "sheet",
    }));
  }

  function handleInventoryOtaModeChange(mode: AppOtaMode) {
    setInventoryWorkbench((current) => ({
      ...current,
      otaMode: mode,
      motionKey: current.motionKey + 1,
    }));
    setWorkspaceMessage(mode === "naver" ? "네이버 재고 작업으로 전환했습니다." : "스테이션 재고 작업으로 전환했습니다.");
  }

  function updateIssueDecision(issueId: string, status: AppIssueStatus) {
    setErrorWorkbench((current) => ({
      ...current,
      selectedIssueId: issueId,
      decisionMap: { ...current.decisionMap, [issueId]: status },
    }));
  }

  function openIssuePanel(tab: AppErrorPanelTab) {
    setActiveManagementView("error-management");
    setInventoryWorkbench((current) => ({ ...current, view: "error-management" }));
    setErrorWorkbench((current) => ({ ...current, panelTab: tab }));
  }

  function completeIssue(issueId: string) {
    setErrorWorkbench((current) => ({
      ...current,
      resolvedIssueIds: Array.from(new Set([...current.resolvedIssueIds, issueId])),
      quickScanPassedIds: Array.from(new Set([...current.quickScanPassedIds, issueId])),
    }));
    setWorkspaceMessage("선택한 오류 건을 부분 점검했고 결과 보드에 반영했습니다.");
  }

  function handleModuleChange(module: AppShellModule) {
    if (module === "settings") {
      previousModuleRef.current = activeModule;
      previousActionRef.current = activeReservationAction;
      setSettingsOpen(true);
      setWorkspaceMessage("설정을 열었습니다.");
      return;
    }
    setActiveModule(module);
    setWorkspacePhase("idle");
    setReservationResult(null);
    setOpsApplySummary("");
  }

  function handleReservationAction(action: AppReservationAction, enabled: boolean) {
    if (!enabled) return;
    setActiveModule("reservation-management");
    setActiveReservationAction(action);
    setWorkspacePhase("idle");
    setReservationResult(null);
    setWorkspaceMessage(`${RESERVATION_ACTION_LABELS[action]} 화면을 준비했습니다.`);
    setOpsApplySummary("");
  }

  function closeSettings() {
    setSettingsOpen(false);
    setActiveModule(previousModuleRef.current);
    setActiveReservationAction(previousActionRef.current);
    setWorkspaceMessage("이전 작업으로 돌아왔습니다.");
  }

  const branchOption = useMemo(() => getAppBranchOption(selectedBranch), [selectedBranch]);
  const reservationAvailability = useMemo(() => deriveReservationActionAvailability(reads, selectedBranch), [reads, selectedBranch]);
  const actionOutputRows = buildActionOutputRows(activeReservationAction, selectedBranch, windowStart, windowEnd, reservationResult);
  const orderedProviders = ["wings-pms", "naver-partner", "admin-station"]
    .map((provider) => providers.find((candidate) => candidate.provider === provider))
    .filter(Boolean) as AppProviderBrowserState[];
  const authBlockingRequirements = authRequirements.filter((item) => !item.ready);
  const configAuthRequirements = authBlockingRequirements.filter((item) => item.authMode === "config-auth");
  const sessionAuthRequirements = authBlockingRequirements.filter((item) => item.authMode === "session-auth");
  const authRequirementMap = useMemo(() => new Map(authRequirements.map((item) => [item.target, item] as const)), [authRequirements]);
  const liveReadProofCards = useMemo(() => {
    const sheetRequirement = authRequirementMap.get("google-sheets");
    const pmsRequirement = authRequirementMap.get("wings-pms");
    const naverRequirement = authRequirementMap.get("naver-partner");
    const stationRequirement = authRequirementMap.get("admin-station");
    const otaEvidence = reads.ota.evidence;
    const hasNaverProof = reads.ota.status === "done" && otaEvidence.some((entry) => entry === "provider:naver-partner");
    const hasStationProof = reads.ota.status === "done" && otaEvidence.some((entry) => entry === "provider:admin-station");

    return [
      {
        key: "sheet",
        title: "시트 기준",
        status: buildLiveReadStatus(sheetRequirement, reads.sheet, reads.sheet.status === "done"),
        summary:
          reads.sheet.status === "done"
            ? reads.sheet.summary
            : (sheetRequirement?.nextAction ?? "예약 시트 설정을 저장하면 실제 읽기를 준비할 수 있습니다."),
        checkedAt: formatDateTime(reads.sheet.status === "done" ? reads.sheet.checkedAt : runtimeReadiness?.sheet.checkedAt ?? null),
        evidence: pickEvidenceChips([
          ...(reads.sheet.status === "done" ? reads.sheet.evidence : []),
          ...(sheetRequirement?.evidence ?? []),
        ]),
      },
      {
        key: "pms",
        title: "윙스 PMS",
        status: buildLiveReadStatus(pmsRequirement, reads.pms, reads.pms.status === "done"),
        summary:
          reads.pms.status === "done"
            ? reads.pms.summary
            : (pmsRequirement?.nextAction ?? "WINGS 창을 열고 로그인하면 PMS 실조회를 준비할 수 있습니다."),
        checkedAt: formatDateTime(reads.pms.status === "done" ? reads.pms.checkedAt : runtimeReadiness?.preflight?.checkedAt ?? null),
        evidence: pickEvidenceChips([
          ...(reads.pms.status === "done" ? reads.pms.evidence : []),
          ...(pmsRequirement?.evidence ?? []),
        ]),
      },
      {
        key: "naver",
        title: "네이버 OTA",
        status: buildLiveReadStatus(naverRequirement, reads.ota, hasNaverProof),
        summary:
          hasNaverProof
            ? "최근 네이버 OTA 실조회 근거가 있습니다."
            : (naverRequirement?.nextAction ?? "네이버 파트너 창을 열어 세션을 준비해야 합니다."),
        checkedAt: formatDateTime(hasNaverProof ? reads.ota.checkedAt : runtimeReadiness?.preflight?.checkedAt ?? null),
        evidence: pickEvidenceChips([
          ...otaEvidence.filter(
            (entry) =>
              entry === "provider:naver-partner" ||
              entry.startsWith("runtimeHost:") ||
              entry.startsWith("sessionReadiness:") ||
              entry.startsWith("sourceLineage:") ||
              entry.startsWith("naverBusinessId:") ||
              entry.startsWith("window:"),
          ),
          ...(naverRequirement?.evidence ?? []),
        ]),
      },
      {
        key: "station",
        title: "스테이션 OTA",
        status: buildLiveReadStatus(stationRequirement, reads.ota, hasStationProof),
        summary:
          hasStationProof
            ? "최근 스테이션 OTA 실조회 근거가 있습니다."
            : (stationRequirement?.nextAction ?? "스테이션 창을 열어 세션을 준비해야 합니다."),
        checkedAt: formatDateTime(hasStationProof ? reads.ota.checkedAt : runtimeReadiness?.preflight?.checkedAt ?? null),
        evidence: pickEvidenceChips([
          ...otaEvidence.filter(
            (entry) =>
              entry === "provider:admin-station" ||
              entry.startsWith("runtimeHost:") ||
              entry.startsWith("sessionReadiness:") ||
              entry.startsWith("sourceLineage:") ||
              entry.startsWith("stationBranchId:") ||
              entry.startsWith("window:"),
          ),
          ...(stationRequirement?.evidence ?? []),
        ]),
      },
    ];
  }, [authRequirementMap, reads.ota, reads.pms, reads.sheet, runtimeReadiness]);
  const liveReadProofSummary = useMemo(() => {
    if (!runtimeReadiness) return "실조회 기준을 불러오는 중입니다.";
    if (runtimeReadiness.overallReady) return "현재 세션으로 실조회가 가능합니다.";
    if (runtimeReadiness.blockingSources.length === 0) return "실조회 준비 상태를 다시 확인해 주세요.";
    return `현재 실조회 전에 ${runtimeReadiness.blockingSources.length}개 항목을 먼저 준비해야 합니다.`;
  }, [runtimeReadiness]);
  const sheetReservationItems = useMemo(
    () =>
      reads.sheet.items.filter((item) => {
        if (!isReservationBlockItem(item)) return false;
        const haystack = [item.roomNo, item.roomType, item.guestName, item.reservationNo, item.channel, item.noteHead].join(" ").toLowerCase();
        return haystack.includes(searchQuery.trim().toLowerCase());
      }),
    [reads.sheet.items, searchQuery],
  );
  const selectedRoomDetail =
    sheetReservationItems.find((item) => item.id === selectedRoomDetailId) ?? sheetReservationItems[0] ?? null;
  const windowDays = useMemo(() => buildWindowDays(windowStart, windowEnd), [windowStart, windowEnd]);
  const opsView = reservationResult?.action === activeReservationAction ? reservationResult.opsView ?? null : null;
  const applyContractSummary = useMemo(() => {
    if (reservationResult?.action !== "apply") {
      return { stationCount: 0, naverCount: 0, requiresApproval: false, applyAllowed: false, planReady: false };
    }
    return {
      stationCount: reservationResult.rows.filter((row) => row.statusLabel.includes("STATION")).length,
      naverCount: reservationResult.rows.filter((row) => row.statusLabel.includes("NAVER")).length,
      requiresApproval: reservationResult.requiresApproval === true,
      applyAllowed: reservationResult.applyAllowed === true,
      planReady: Boolean(reservationResult.planToken),
    };
  }, [reservationResult]);
  const opsAvailableDates = useMemo(() => {
    if (!opsView) return [];
    return Array.from(new Set([...opsView.orderListRows.map((row) => row.date), ...opsView.arrivalRows.map((row) => row.date)].filter(Boolean))).sort();
  }, [opsView]);
  const activeOpsDate = opsBoardDate && opsAvailableDates.includes(opsBoardDate) ? opsBoardDate : opsAvailableDates[0] ?? "";
  const filteredOrderRows = useMemo(
    () =>
      (opsView?.orderListRows ?? []).filter((row) => {
        if (activeOpsDate && row.date !== activeOpsDate) return false;
        const haystack = [row.roomNo, row.opsRoomLabel, row.taskLabel, row.noteHeads, row.channels, row.arrivalReservationNos, row.departureReservationNos].join(" ").toLowerCase();
        return haystack.includes(searchQuery.trim().toLowerCase());
      }),
    [activeOpsDate, opsView, searchQuery],
  );
  const filteredArrivalRows = useMemo(
    () =>
      (opsView?.arrivalRows ?? []).filter((row) => {
        if (activeOpsDate && row.date !== activeOpsDate) return false;
        const haystack = [row.roomNo, row.opsRoomLabel, row.section, row.noteHead, row.nationalityNights, row.reservationNo, row.channel].join(" ").toLowerCase();
        return haystack.includes(searchQuery.trim().toLowerCase());
      }),
    [activeOpsDate, opsView, searchQuery],
  );
  const orderTaskCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of filteredOrderRows) {
      counts.set(row.taskLabel, (counts.get(row.taskLabel) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [filteredOrderRows]);
  const opsSpecialInstructions = useMemo(() => {
    const items = [
      ...filteredOrderRows
        .filter((row) => row.noteHeads || row.continuationCandidate || row.turnoverFlag)
        .map((row) => ({
          id: `order:${row.date}:${row.roomNo}:${row.taskLabel}`,
          roomLabel: row.opsRoomLabel || row.roomNo,
          text: buildOrderRowComment(row),
          tone: getOpsTaskTone(row.taskLabel),
        })),
      ...filteredArrivalRows
        .filter((row) => row.noteHead || row.nationalityNights || row.continuationCandidate)
        .map((row) => ({
          id: `arrival:${row.date}:${row.roomNo}:${row.section}`,
          roomLabel: row.opsRoomLabel || row.roomNo,
          text: [row.nationalityNights, row.noteHead, row.continuationCandidate ? row.continuationBasis || "연박 후보" : ""].filter(Boolean).join(" · "),
          tone: getOpsTaskTone(row.section),
        })),
    ];
    return items.slice(0, 6);
  }, [filteredArrivalRows, filteredOrderRows]);
  const arrivalBoardRows = useMemo(() => {
    const orderByRoom = new Map(filteredOrderRows.map((row) => [row.roomNo, row] as const));
    const boardMap = new Map<string, {
      id: string;
      building: string;
      roomLabel: string;
      departureText: string;
      arrivalText: string;
      departureTone: { bg: string; fg: string; accent: string };
      arrivalTone: { bg: string; fg: string; accent: string };
    }>();

    const ensureRow = (building: string, roomLabel: string, roomNo: string) => {
      const key = `${building}:${roomNo}`;
      if (!boardMap.has(key)) {
        boardMap.set(key, {
          id: key,
          building,
          roomLabel,
          departureText: "",
          arrivalText: "",
          departureTone: getOpsTaskTone(""),
          arrivalTone: getOpsTaskTone(""),
        });
      }
      return boardMap.get(key)!;
    };

    for (const row of filteredOrderRows) {
      const item = ensureRow(row.building || "-", row.opsRoomLabel || row.roomNo, row.roomNo);
      if (!item.departureText) {
        item.departureText = row.taskLabel;
        item.departureTone = getOpsTaskTone(row.taskLabel);
      }
    }

    for (const row of filteredArrivalRows) {
      const linkedOrderRow = orderByRoom.get(row.roomNo) ?? null;
      const item = ensureRow(row.building || "-", row.opsRoomLabel || row.roomNo, row.roomNo);
      const inferred = inferArrivalDepartureText(row, linkedOrderRow);
      if (inferred.departureText) {
        item.departureText = inferred.departureText;
        item.departureTone = classifyArrivalCellTone(inferred.departureText);
      }
      if (inferred.arrivalText) {
        item.arrivalText = inferred.arrivalText;
        item.arrivalTone = classifyArrivalCellTone(inferred.arrivalText);
      }
    }

    return Array.from(boardMap.values()).sort((a, b) => {
      if (a.building !== b.building) return a.building.localeCompare(b.building, "ko");
      return roomSortKey(a.roomLabel).localeCompare(roomSortKey(b.roomLabel), "ko");
    });
  }, [filteredArrivalRows, filteredOrderRows]);
  const arrivalBoardByBuilding = useMemo(() => {
    const groups = new Map<string, typeof arrivalBoardRows>();
    for (const row of arrivalBoardRows) {
      groups.set(row.building, [...(groups.get(row.building) ?? []), row]);
    }
    return Array.from(groups.entries());
  }, [arrivalBoardRows]);
  const isSingleArrivalBoard = useMemo(() => {
    const meaningfulBuildings = new Set(
      arrivalBoardRows
        .map((row) => row.building.trim())
        .filter((building) => building && building !== "-"),
    );
    return meaningfulBuildings.size <= 1;
  }, [arrivalBoardRows]);
  const arrivalCounts = useMemo(() => {
    const arrivals = filteredArrivalRows.filter((row) => row.section === "ARRIVAL" || row.section === "TURNOVER").length;
    const departures = filteredArrivalRows.filter((row) => row.section === "DEPARTURE" || row.section === "TURNOVER").length;
    const stayovers = filteredOrderRows.filter((row) => row.taskLabel === "룸메이크업" || row.taskLabel === "룸클리닝").length;
    return { arrivals, departures, stayovers, totalOrders: filteredOrderRows.length };
  }, [filteredArrivalRows, filteredOrderRows]);
  const arrivalSpecialNotes = useMemo(() => {
    const departureItems = filteredArrivalRows
      .filter((row) => row.section === "DEPARTURE" || row.section === "TURNOVER")
      .map((row) => ({
        id: `departure-note:${row.date}:${row.roomNo}:${row.reservationNo}`,
        roomLabel: row.opsRoomLabel || row.roomNo,
        text: [row.noteHead, row.continuationCandidate ? row.continuationBasis || "연박 후보" : ""].filter(Boolean).join(" · "),
      }))
      .filter((item) => item.text);
    const arrivalItems = filteredArrivalRows
      .filter((row) => row.section === "ARRIVAL" || row.section === "TURNOVER")
      .map((row) => ({
        id: `arrival-note:${row.date}:${row.roomNo}:${row.reservationNo}`,
        roomLabel: row.opsRoomLabel || row.roomNo,
        text: [row.nationalityNights, row.noteHead, row.continuationCandidate ? row.continuationBasis || "연박 후보" : ""].filter(Boolean).join(" · "),
      }))
      .filter((item) => item.text);
    return {
      departure: departureItems.slice(0, 8),
      arrival: arrivalItems.slice(0, 8),
    };
  }, [filteredArrivalRows]);
  const pmsReference =
    selectedRoomDetail
      ? reads.pms.items.find((item) => [item.title, item.subtitle].join(" ").includes(selectedRoomDetail.roomNo ?? ""))
      : null;
  const otaReference =
    selectedRoomDetail
      ? reads.ota.items.find((item) => [item.title, item.subtitle].join(" ").includes(selectedRoomDetail.roomNo ?? ""))
      : null;
  const selectedChannelVisual = getChannelVisual(selectedRoomDetail?.channel);
  const inventoryPreviewItems = useMemo(() => {
    const capped = sheetReservationItems.slice(0, inventoryWorkbench.rowLimit);
    if (selectedBranch !== "COEX") return capped;
    return capped.filter((item) => String(item.roomNo || "").toUpperCase().startsWith(inventoryWorkbench.coexWing));
  }, [inventoryWorkbench.coexWing, inventoryWorkbench.rowLimit, selectedBranch, sheetReservationItems]);
  const activeInventoryDraft = inventoryProviderDrafts[inventoryWorkbench.otaMode];
  const inventoryBoardRows = useMemo(
    () =>
      buildInventoryBoardRows(
        inventoryPreviewItems,
        windowDays,
        Boolean(activeInventoryDraft.syncedAt) || inventoryWorkbench.editMode,
        inventoryWorkbench.otaMode,
        errorWorkbench.decisionMap,
      ),
    [activeInventoryDraft.syncedAt, errorWorkbench.decisionMap, inventoryPreviewItems, inventoryWorkbench.editMode, inventoryWorkbench.otaMode, windowDays],
  );
  const inventoryBoardRowMap = useMemo(
    () => new Map(inventoryBoardRows.map((row) => [row.id, row] as const)),
    [inventoryBoardRows],
  );
  const errorIssues = useMemo(
    () => buildErrorWorkbenchIssues(sheetReservationItems, actionOutputRows, errorWorkbench.decisionMap),
    [actionOutputRows, errorWorkbench.decisionMap, sheetReservationItems],
  );
  const errorCounts = useMemo(
    () => ({
      normal: errorIssues.filter((issue) => issue.status === "normal" || errorWorkbench.resolvedIssueIds.includes(issue.id)).length,
      error: errorIssues.filter((issue) => issue.status === "error" && !errorWorkbench.resolvedIssueIds.includes(issue.id)).length,
      "needs-review": errorIssues.filter((issue) => issue.status === "needs-review" && !errorWorkbench.resolvedIssueIds.includes(issue.id)).length,
    }),
    [errorIssues, errorWorkbench.resolvedIssueIds],
  );
  const visibleErrorIssues = useMemo(() => {
    if (!errorWorkbench.panelTab) return [];
    return errorIssues.filter((issue) => issue.status === errorWorkbench.panelTab && !errorWorkbench.resolvedIssueIds.includes(issue.id));
  }, [errorIssues, errorWorkbench.panelTab, errorWorkbench.resolvedIssueIds]);
  const selectedErrorIssue =
    errorIssues.find((issue) => issue.id === errorWorkbench.selectedIssueId) ??
    visibleErrorIssues[0] ??
    null;

  useEffect(() => {
    const nextProvider = sessionAuthRequirements.find(
      (item) =>
        (item.status === "needs-login" || item.status === "attention") &&
        !autoOpenedProvidersRef.current.has(item.target as AppProvider),
    );
    if (!nextProvider) return;
    autoOpenedProvidersRef.current.add(nextProvider.target as AppProvider);
    void openProviderSession(nextProvider.target as AppProvider);
  }, [sessionAuthRequirements]);

  useEffect(() => {
    if (sheetReservationItems.length === 0) {
      setSelectedRoomDetailId(null);
      return;
    }
    if (!sheetReservationItems.some((item) => item.id === selectedRoomDetailId)) {
      setSelectedRoomDetailId(sheetReservationItems[0]?.id ?? null);
    }
  }, [selectedRoomDetailId, sheetReservationItems]);

  useEffect(() => {
    if (inventoryPreviewItems.length === 0) return;
    if (!inventoryPreviewItems.some((item) => item.id === selectedRoomDetailId)) {
      setSelectedRoomDetailId(inventoryPreviewItems[0]?.id ?? null);
    }
  }, [inventoryPreviewItems, selectedRoomDetailId]);

  useEffect(() => {
    if (opsAvailableDates.length === 0) {
      setOpsBoardDate("");
      return;
    }
    if (!opsAvailableDates.includes(opsBoardDate)) {
      setOpsBoardDate(opsAvailableDates[0]);
    }
  }, [opsAvailableDates, opsBoardDate]);

  useEffect(() => {
    const needsWingsLogin = sessionAuthRequirements.some((item) => item.target === "wings-pms" && item.status === "needs-login");
    if (!needsWingsLogin) {
      autoWingsLoginAttemptedRef.current = false;
      return;
    }
    if (!importedWingsCredential?.loginId || !importedWingsCredential.password) return;
    if (busyKey === "wings-login") return;
    if (autoWingsLoginAttemptedRef.current) return;
    autoWingsLoginAttemptedRef.current = true;
    void runStoredWingsLogin();
  }, [busyKey, importedWingsCredential, sessionAuthRequirements]);

  useEffect(() => {
    if (!errorWorkbench.panelTab) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (errorPanelRef.current?.contains(event.target as Node)) return;
      setErrorWorkbench((current) => ({ ...current, panelTab: null, selectedIssueId: null }));
    };
    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, [errorWorkbench.panelTab]);

  return (
    <div className="end-user-shell">
      <div className="shell-frame">
        <aside className="sidebar">
          <div className="sidebar-brand">
            <img src={uhSuiteLogo} alt="UH SUITE" className="sidebar-brand-logo" />
            <div className="sidebar-brand-copy">
              <strong>UH 작업관리자</strong>
            </div>
          </div>

          <div className="sidebar-block">
            <p className="eyebrow">지점</p>
            <label className="branch-select">
              <span>지점 선택</span>
              <select value={selectedBranch} onChange={(event) => setSelectedBranch(event.target.value as AppBranch)}>
                {BRANCH_OPTIONS.map((branch) => (
                  <option key={branch.branch} value={branch.branch} disabled={branch.availability !== "active"}>
                    {branch.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="detail-panel">{branchOption.label} 예약 작업 화면</div>
            <button type="button" className="sidebar-button settings-button" onClick={() => handleModuleChange("settings")}>
              설정
            </button>
          </div>

          <div className="sidebar-block">
            <p className="eyebrow">시작</p>
            <button
              type="button"
              className={`sidebar-button ${activeModule === "reservation-management" ? "active" : ""}`}
              onClick={() => handleManagementViewChange(activeManagementView)}
            >
              예약 관리
            </button>
            <div className="submenu">
              <button
                type="button"
                className={`submenu-button ${activeModule === "reservation-management" && activeManagementView === "inventory-management" ? "active" : ""}`}
                onClick={() => handleManagementViewChange("inventory-management")}
              >
                재고 관리
              </button>
              <button
                type="button"
                className={`submenu-button ${activeModule === "reservation-management" && activeManagementView === "error-management" ? "active" : ""}`}
                onClick={() => handleManagementViewChange("error-management")}
              >
                오류 관리
              </button>
            </div>
          </div>

          <div className="sidebar-block">
            <p className="eyebrow">보조 작업</p>
            <div className="submenu">
              {([
                ["order-list", "오더리스트"],
                ["arrival", "어라이벌 리스트"],
              ] as const).map(([action, label]) => {
                const state = reservationAvailability[action];
                return (
                  <button
                    key={action}
                    type="button"
                    className={`submenu-button ${activeReservationAction === action ? "active" : ""}`}
                    onClick={() => handleReservationAction(action, state.enabled)}
                    disabled={!state.enabled}
                    title={state.reason}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="sidebar-block read-badges">
            <span data-status={reads.sheet.status}>SHEET</span>
            <span data-status={reads.pms.status}>PMS</span>
            <span data-status={reads.ota.status}>OTA</span>
          </div>

          <div className="sidebar-login-card">
            <p className="eyebrow">Wings 연결</p>
            <div className="detail-panel">가져온 지점 공용 계정을 사용합니다. Company ID는 {wingsCompanyId}로 고정됩니다.</div>
            <div className="button-row compact-button-row">
              <button type="button" onClick={() => void importWingsSharedCredentials()} disabled={busyKey !== null}>
                WINGS 공용 계정 가져오기
              </button>
              <button type="button" className="ghost-button" onClick={() => void runStoredWingsLogin()} disabled={busyKey !== null}>
                WINGS 로그인
              </button>
            </div>
            <div className="detail-panel">{wingsLoginSummary}</div>
          </div>
        </aside>

        <main className="workspace">
          <header className="workspace-header">
            <div>
              <h2>{branchOption.label}</h2>
            </div>
            <div className="workspace-header-tools">
              {activeModule === "reservation-management" ? (
                <label className="search-field">
                  <span className="search-field-label">검색</span>
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="객실, 예약자, 예약번호 검색"
                  />
                </label>
              ) : null}
            </div>
          </header>

          <section className="auth-banner">
            <div className="auth-banner-header">
              <div>
                <p className="eyebrow">연결 상태</p>
                <h3>시트를 기준으로 보고, PMS와 OTA는 비교 참고값으로 사용합니다.</h3>
              </div>
              <button
                type="button"
                className="ghost-button"
                onClick={() => void Promise.all([refreshAuthRequirements(), refreshRuntimeReadiness(), refreshPreflight()])}
              >
                연결 새로고침
              </button>
            </div>
            <div className="source-toolbar">
              {([
                { key: "sheet", label: "시트 기준", module: "sheet-read" as const },
                { key: "pms", label: "PMS 참고", module: "pms-read" as const },
                { key: "ota", label: "OTA 참고", module: "ota-read" as const },
              ] as const).map((source) => (
                <article
                  key={source.key}
                  className={`source-card ${activeSource === source.key ? "active" : ""}`}
                  onClick={() => setActiveSource(source.key)}
                >
                  <div>
                    <p className="source-card-label">{source.label}</p>
                    <strong>{reads[source.key].summary}</strong>
                    <span>{reads[source.key].recordsImported}건</span>
                  </div>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      void runRead(source.module);
                    }}
                    disabled={busyKey !== null || branchOption.availability !== "active"}
                  >
                    다시 읽기
                  </button>
                </article>
              ))}
            </div>
            {authBlockingRequirements.length > 0 ? (
              <div className="auth-card-grid inline-auth-card-grid">
                {configAuthRequirements.map((requirement) => (
                  <article key={requirement.target} className="auth-card compact-auth-card">
                    <div className="auth-card-header">
                      <strong>{requirement.label}</strong>
                      <span>{authStatusLabel(requirement.status)}</span>
                    </div>
                    <p className="support-copy">{requirement.nextAction}</p>
                  </article>
                ))}
                {sessionAuthRequirements.map((requirement) => (
                  <article key={requirement.target} className="auth-card compact-auth-card">
                    <div className="auth-card-header">
                      <strong>{requirement.label}</strong>
                      <span>{authStatusLabel(requirement.status)}</span>
                    </div>
                    <p className="support-copy">{requirement.nextAction}</p>
                    <div className="button-row">
                      <button
                        type="button"
                        onClick={() => void openProviderSession(requirement.target as AppProvider)}
                        disabled={busyKey !== null}
                      >
                        창 열기
                      </button>
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => void reloadProviderSession(requirement.target as AppProvider)}
                        disabled={busyKey !== null}
                      >
                        다시 확인
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}
            <div className="live-read-proof">
              <div className="live-read-proof-header">
                <div>
                  <p className="eyebrow">실조회 준비 상태</p>
                  <h4>현재 세션으로 어디까지 실제 읽기가 가능한지 바로 확인합니다.</h4>
                  <p className="support-copy">{liveReadProofSummary}</p>
                </div>
                <div className="detail-panel">
                  {runtimeReadiness?.overallReady ? "실조회 가능" : "준비 필요"} · {runtimeReadiness?.supportLevel === "read-live" ? "운영 실조회" : "오프라인 미리보기"}
                </div>
              </div>
              <div className="live-read-proof-grid">
                {liveReadProofCards.map((card) => (
                  <article key={card.key} className="live-read-proof-card">
                    <div className="live-read-proof-card-header">
                      <strong>{card.title}</strong>
                      <span>{card.status}</span>
                    </div>
                    <p className="support-copy">{card.summary}</p>
                    <div className="live-read-proof-meta">
                      <span>최근 확인 {card.checkedAt}</span>
                    </div>
                    <div className="live-read-proof-chip-row">
                      {(card.evidence.length > 0 ? card.evidence : ["최근 실조회 근거 없음"]).map((entry) => (
                        <span key={`${card.key}:${entry}`} className="live-read-proof-chip">
                          {entry}
                        </span>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section className="reservation-workspace" data-phase={workspacePhase}>
            {activeReservationAction === "order-list" ? (
              <>
                <article className="hero-card reservation-summary-card">
                  <p className="eyebrow">오더리스트</p>
                  <h3>오더리스트 작업 로그</h3>
                  <p className="support-copy">{buildResultSummary(activeReservationAction, reservationResult)}</p>
                  <div className="detail-panel">{branchOption.label} · {windowStart} ~ {windowEnd}</div>
                  <div className="reservation-toolbar">
                    <label className="compact-field">
                      <span>시작일</span>
                      <input type="date" value={windowStart} onChange={(event) => setWindowStart(event.target.value)} />
                    </label>
                    <label className="compact-field">
                      <span>종료일</span>
                      <input type="date" value={windowEnd} onChange={(event) => setWindowEnd(event.target.value)} />
                    </label>
                  </div>
                  {opsAvailableDates.length > 0 ? (
                    <div className="step-chip-row">
                      {opsAvailableDates.map((date) => (
                        <button
                          key={date}
                          type="button"
                          className={`step-chip-button ${activeOpsDate === date ? "active" : ""}`}
                          onClick={() => setOpsBoardDate(date)}
                        >
                          {date}
                        </button>
                      ))}
                    </div>
          ) : null}
                  <div className="availability-note">{workspaceMessage}</div>
                  <div className="button-row">
                    <button
                      type="button"
                      onClick={() => void executeReservationAction()}
                      disabled={!reservationAvailability[activeReservationAction].enabled || busyKey !== null || branchOption.availability !== "active"}
                    >
                      오더리스트 실행
                    </button>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => void applyOpsSheetOutput("order-list")}
                      disabled={busyKey !== null || !reservationResult || reservationResult.action !== "order-list"}
                    >
                      시트 적용
                    </button>
                  </div>
                  {opsApplySummary ? <div className="detail-panel">{opsApplySummary}</div> : null}
                </article>

                <article className="review-card ops-order-shell">
                  <div className="ops-order-layout">
                    <div className="ops-order-table-card">
                      <div className="ops-panel-header">
                        <div>
                          <p className="eyebrow">작업 로그</p>
                          <h3>오더리스트 작업 로그</h3>
                        </div>
                        <div className="detail-panel">{filteredOrderRows.length}개 작업</div>
                      </div>
                      <div className="ops-order-table">
                        <div className="ops-order-table-head">
                          <span>요청일</span>
                          <span>위치 / 객실</span>
                          <span>업무형태</span>
                          <span>코멘트</span>
                        </div>
                        <div className="ops-order-table-body">
                          {filteredOrderRows.length > 0 ? filteredOrderRows.map((row) => {
                            const taskTone = getOpsTaskTone(row.taskLabel);
                            return (
                              <div key={`${row.date}:${row.roomNo}:${row.taskLabel}`} className="ops-order-row">
                                <div>
                                  <strong>{row.date}</strong>
                                  <small>{row.weekday}</small>
                                </div>
                                <div>
                                  <strong>{row.building || branchOption.label}</strong>
                                  <span>{row.opsRoomLabel || row.roomNo} · {row.roomType || "객실"}</span>
                                </div>
                                <div>
                                  <span
                                    className="ops-task-chip"
                                    style={{ "--ops-chip-bg": taskTone.bg, "--ops-chip-fg": taskTone.fg, "--ops-chip-accent": taskTone.accent } as CSSProperties}
                                  >
                                    {row.taskLabel}
                                  </span>
                                </div>
                                <div>
                                  <span>{buildOrderRowComment(row)}</span>
                                </div>
                              </div>
                            );
                          }) : <div className="detail-panel">오더리스트를 실행하면 실제 작업 로그가 여기에 표시됩니다.</div>}
                        </div>
                      </div>
                    </div>

                    <div className="ops-side-panels">
                      <article className="ops-side-card">
                        <p className="section-title">운영 카운트</p>
                        <div className="ops-count-list">
                          {orderTaskCounts.length > 0 ? orderTaskCounts.map(([label, count]) => (
                            <div key={label} className="ops-count-row">
                              <span>{label}</span>
                              <strong>{count}개</strong>
                            </div>
                          )) : <div className="detail-panel">실행 후 실제 카운트가 표시됩니다.</div>}
                        </div>
                      </article>
                      <article className="ops-side-card">
                        <p className="section-title">특이 사항</p>
                        <div className="ops-special-list">
                          {opsSpecialInstructions.length > 0 ? opsSpecialInstructions.map((item) => (
                            <div
                              key={item.id}
                              className="ops-special-item"
                              style={{ "--ops-chip-bg": item.tone.bg, "--ops-chip-fg": item.tone.fg, "--ops-chip-accent": item.tone.accent } as CSSProperties}
                            >
                              <strong>{item.roomLabel}</strong>
                              <span>{item.text}</span>
                            </div>
                          )) : <div className="detail-panel">특이 사항이 있으면 여기 모입니다.</div>}
                        </div>
                      </article>
                    </div>
                  </div>
                </article>
              </>
            ) : activeReservationAction === "arrival" ? (
              <>
                <article className="hero-card reservation-summary-card">
                  <p className="eyebrow">어라이벌</p>
                  <h3>어라이벌 일정판</h3>
                  <p className="support-copy">{buildResultSummary(activeReservationAction, reservationResult)}</p>
                  <div className="detail-panel">{branchOption.label} · {windowStart} ~ {windowEnd}</div>
                  <div className="reservation-toolbar">
                    <label className="compact-field">
                      <span>시작일</span>
                      <input type="date" value={windowStart} onChange={(event) => setWindowStart(event.target.value)} />
                    </label>
                    <label className="compact-field">
                      <span>종료일</span>
                      <input type="date" value={windowEnd} onChange={(event) => setWindowEnd(event.target.value)} />
                    </label>
                  </div>
                  {opsAvailableDates.length > 0 ? (
                    <div className="step-chip-row">
                      {opsAvailableDates.map((date) => (
                        <button
                          key={date}
                          type="button"
                          className={`step-chip-button ${activeOpsDate === date ? "active" : ""}`}
                          onClick={() => setOpsBoardDate(date)}
                        >
                          {date}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <div className="availability-note">{workspaceMessage}</div>
                  <div className="button-row">
                    <button
                      type="button"
                      onClick={() => void executeReservationAction()}
                      disabled={!reservationAvailability[activeReservationAction].enabled || busyKey !== null || branchOption.availability !== "active"}
                    >
                      어라이벌 실행
                    </button>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => void applyOpsSheetOutput("arrival")}
                      disabled={busyKey !== null || !reservationResult || reservationResult.action !== "arrival"}
                    >
                      시트 적용
                    </button>
                  </div>
                  {opsApplySummary ? <div className="detail-panel">{opsApplySummary}</div> : null}
                </article>

                <article className="review-card ops-arrival-shell">
                  <div className="ops-panel-header">
                    <div>
                      <p className="eyebrow">일정판</p>
                      <h3>어라이벌 일정판</h3>
                      <p className="support-copy">{activeOpsDate ? formatDisplayDate(activeOpsDate) : "실행 후 날짜별 일정판이 표시됩니다."}</p>
                    </div>
                    <div className="detail-panel">{arrivalBoardRows.length}개 객실</div>
                  </div>

                  {arrivalBoardRows.length > 0 ? (
                    isSingleArrivalBoard ? (
                      <div className="single-arrival-board">
                        <div className="single-arrival-date-head">
                          <strong>{activeOpsDate ? formatDisplayDate(activeOpsDate) : branchOption.label}</strong>
                        </div>
                        <div className="single-arrival-grid">
                          <div className="single-arrival-grid-header room">객실</div>
                          <div className="single-arrival-grid-header">체크아웃</div>
                          <div className="single-arrival-grid-header">체크인</div>
                          {arrivalBoardRows.map((row) => (
                            <div key={row.id} className="single-arrival-grid-row">
                              <div className="arrival-room-label single">{row.roomLabel}</div>
                              <div className="arrival-cell single">
                                {row.departureText ? (
                                  <div
                                    className="arrival-cell-block"
                                    style={{ "--ops-chip-bg": row.departureTone.bg, "--ops-chip-fg": row.departureTone.fg, "--ops-chip-accent": row.departureTone.accent } as CSSProperties}
                                  >
                                    {row.departureText}
                                  </div>
                                ) : null}
                              </div>
                              <div className="arrival-cell single">
                                {row.arrivalText ? (
                                  <div
                                    className="arrival-cell-block"
                                    style={{ "--ops-chip-bg": row.arrivalTone.bg, "--ops-chip-fg": row.arrivalTone.fg, "--ops-chip-accent": row.arrivalTone.accent } as CSSProperties}
                                  >
                                    {row.arrivalText}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="arrival-summary-strip">
                          <div><span>Check-out</span><strong>{arrivalCounts.departures}</strong></div>
                          <div><span>Check-In</span><strong>{arrivalCounts.arrivals}</strong></div>
                          <div><span>재실</span><strong>{arrivalCounts.stayovers}</strong></div>
                          <div><span>총 작업</span><strong>{arrivalCounts.totalOrders}</strong></div>
                        </div>
                        <div className="arrival-notes-grid">
                          <article className="ops-side-card arrival-note-card">
                            <p className="section-title">특이사항 (C.O)</p>
                            <div className="ops-special-list compact">
                              {arrivalSpecialNotes.departure.length > 0 ? arrivalSpecialNotes.departure.map((item) => (
                                <div key={item.id} className="arrival-note-line">
                                  <strong>{item.roomLabel}</strong>
                                  <span>{item.text}</span>
                                </div>
                              )) : <div className="detail-panel">특이사항이 없습니다.</div>}
                            </div>
                          </article>
                          <article className="ops-side-card arrival-note-card">
                            <p className="section-title">특이사항 (C.I)</p>
                            <div className="ops-special-list compact">
                              {arrivalSpecialNotes.arrival.length > 0 ? arrivalSpecialNotes.arrival.map((item) => (
                                <div key={item.id} className="arrival-note-line">
                                  <strong>{item.roomLabel}</strong>
                                  <span>{item.text}</span>
                                </div>
                              )) : <div className="detail-panel">특이사항이 없습니다.</div>}
                            </div>
                          </article>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="ops-arrival-board">
                          {arrivalBoardByBuilding.map(([building, rows]) => (
                            <section key={building} className="arrival-building-panel">
                              <div className="arrival-building-head">
                                <span>BUILDING</span>
                                <strong>{building || "-"}</strong>
                              </div>
                              <div className="arrival-building-grid">
                                <div className="arrival-grid-header">ROOM</div>
                                <div className="arrival-grid-header">DEPARTURE (C.O)</div>
                                <div className="arrival-grid-header">ARRIVAL (C.I)</div>
                                {rows.map((row) => (
                                  <div key={row.id} className="arrival-grid-row">
                                    <div className="arrival-room-label">{row.roomLabel}</div>
                                    <div className="arrival-cell">
                                      {row.departureText ? (
                                        <div
                                          className="arrival-cell-block"
                                          style={{ "--ops-chip-bg": row.departureTone.bg, "--ops-chip-fg": row.departureTone.fg, "--ops-chip-accent": row.departureTone.accent } as CSSProperties}
                                        >
                                          {row.departureText}
                                        </div>
                                      ) : null}
                                    </div>
                                    <div className="arrival-cell">
                                      {row.arrivalText ? (
                                        <div
                                          className="arrival-cell-block"
                                          style={{ "--ops-chip-bg": row.arrivalTone.bg, "--ops-chip-fg": row.arrivalTone.fg, "--ops-chip-accent": row.arrivalTone.accent } as CSSProperties}
                                        >
                                          {row.arrivalText}
                                        </div>
                                      ) : null}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </section>
                          ))}
                        </div>

                        <div className="ops-arrival-footer">
                          <article className="ops-side-card">
                            <p className="section-title">운영 카운트</p>
                            <div className="ops-count-list">
                              <div className="ops-count-row"><span>체크인</span><strong>{arrivalCounts.arrivals}개</strong></div>
                              <div className="ops-count-row"><span>체크아웃</span><strong>{arrivalCounts.departures}개</strong></div>
                              <div className="ops-count-row"><span>재실 작업</span><strong>{arrivalCounts.stayovers}개</strong></div>
                              <div className="ops-count-row"><span>총 작업</span><strong>{arrivalCounts.totalOrders}개</strong></div>
                            </div>
                          </article>
                          <article className="ops-side-card">
                            <p className="section-title">특이 사항</p>
                            <div className="ops-special-list">
                              {opsSpecialInstructions.length > 0 ? opsSpecialInstructions.map((item) => (
                                <div
                                  key={item.id}
                                  className="ops-special-item"
                                  style={{ "--ops-chip-bg": item.tone.bg, "--ops-chip-fg": item.tone.fg, "--ops-chip-accent": item.tone.accent } as CSSProperties}
                                >
                                  <strong>{item.roomLabel}</strong>
                                  <span>{item.text}</span>
                                </div>
                              )) : <div className="detail-panel">특이 사항이 있으면 여기 모입니다.</div>}
                            </div>
                          </article>
                        </div>
                      </>
                    )
                  ) : <div className="detail-panel">어라이벌을 실행하면 실제 일정판이 여기에 표시됩니다.</div>}
                </article>
              </>
            ) : activeManagementView === "inventory-management" ? (
              <>
                <article className="hero-card reservation-summary-card inventory-summary-card">
                  <p className="eyebrow">재고 관리</p>
                  <h3>예약 시트 재고 작업대</h3>
                  <p className="support-copy">조회한 시점의 예약 시트 스냅샷을 기준으로 재고표를 정리하고, OTA 반영 전 차이를 먼저 확인합니다.</p>
                  <div className="detail-panel small-label">{branchOption.label} · {windowStart} ~ {windowEnd} · 최대 {inventoryWorkbench.rowLimit}행</div>
                  <div className="reservation-toolbar">
                    <label className="compact-field">
                      <span>시작일</span>
                      <input type="date" value={windowStart} onChange={(event) => setWindowStart(event.target.value)} />
                    </label>
                    <label className="compact-field">
                      <span>종료일</span>
                      <input type="date" value={windowEnd} onChange={(event) => setWindowEnd(event.target.value)} />
                    </label>
                  </div>
                  {selectedBranch === "COEX" ? (
                    <div className="step-chip-row">
                      {(["A", "B"] as AppCoexWing[]).map((wing) => (
                        <button
                          key={wing}
                          type="button"
                          className={`step-chip-button ${inventoryWorkbench.coexWing === wing ? "active" : ""}`}
                          onClick={() => setInventoryWorkbench((current) => ({ ...current, coexWing: wing }))}
                        >
                          {wing}동
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <div className="availability-note">{workspaceMessage}</div>
                  <div className="button-row">
                    <button
                      type="button"
                      onClick={() => void syncInventoryBoard()}
                      disabled={busyKey !== null || !reservationAvailability.apply.enabled || branchOption.availability !== "active"}
                    >
                      동기화
                    </button>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() =>
                        setInventoryWorkbench((current) => ({
                          ...current,
                          boardMode: "combined",
                          editMode: !current.editMode,
                        }))
                      }
                      disabled={busyKey !== null}
                    >
                      수정 모드
                    </button>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => void executeInventoryWrite()}
                      disabled={busyKey !== null || !reservationResult?.applyAllowed || !reservationResult?.planToken}
                    >
                      OTA WRITE
                    </button>
                  </div>
                  {activeInventoryDraft.syncedAt ? (
                    <div className="detail-panel small-label">
                      {inventoryWorkbench.otaMode === "naver" ? "NAVER" : "STATION"} 작업 상태를 임시 저장했습니다. 마지막 동기화 {formatDateTime(activeInventoryDraft.syncedAt)}
                    </div>
                  ) : null}
                </article>

                <article className="review-card inventory-workbench">
                  <div className="ops-panel-header">
                    <div className="apply-header-main">
                      <p className="eyebrow">재고표</p>
                      <div className="apply-header-title-row">
                        <h3>객실 상세</h3>
                        <div className="inventory-mode-icon-row" aria-label="재고표 모드 선택">
                          <button
                            type="button"
                            className={`ghost-button inventory-mode-icon-button ${inventoryWorkbench.otaMode === "naver" ? "active" : ""}`}
                            onClick={() => handleInventoryOtaModeChange("naver")}
                            aria-label="NAVER 재고 작업"
                            title="NAVER 재고 작업"
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <path d="M6 18V6l12 12V6" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            className={`ghost-button inventory-mode-icon-button ${inventoryWorkbench.otaMode === "station" ? "active" : ""}`}
                            onClick={() => handleInventoryOtaModeChange("station")}
                            aria-label="STATION 재고 작업"
                            title="STATION 재고 작업"
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <path d="M5 12h14" />
                              <path d="M12 5l7 7-7 7" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            className={`ghost-button inventory-mode-icon-button ${inventoryWorkbench.boardMode === "sheet" ? "active" : ""}`}
                            onClick={() => handleInventoryBoardMode("sheet")}
                            aria-label="시트 재고표 모드"
                            title="시트 재고표 모드"
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <path d="M4 5h16v14H4z" />
                              <path d="M9 5v14" />
                              <path d="M15 5v14" />
                              <path d="M4 10h16" />
                              <path d="M4 14h16" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            className={`ghost-button inventory-mode-icon-button ${inventoryWorkbench.boardMode === "ota" ? "active" : ""}`}
                            onClick={() => handleInventoryBoardMode("ota")}
                            disabled={reads.ota.status !== "done" || !reads.ota.copyText}
                            aria-label="OTA 재고표 모드"
                            title="OTA 재고표 모드"
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <path d="M4 6h16v3H4z" />
                              <path d="M4 11h16v3H4z" />
                              <path d="M4 16h10v3H4z" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            className={`ghost-button inventory-mode-icon-button ${inventoryWorkbench.boardMode === "combined" ? "active" : ""}`}
                            onClick={() => handleInventoryBoardMode("combined")}
                            aria-label="동시 표기 모드"
                            title="동시 표기 모드"
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <path d="M4 6h7v12H4z" />
                              <path d="M13 6h7v12h-7z" />
                            </svg>
                          </button>
                        </div>
                      </div>
                      <p className="support-copy">시트 기준 재고값을 {inventoryWorkbench.otaMode === "naver" ? "NAVER" : "STATION"} OTA 관리 기준과 겹쳐 보고, 수정 모드에서는 위 시트 / 아래 OTA 순서로 확인합니다.</p>
                    </div>
                    <div className="ops-panel-actions">
                      <div className="detail-panel small-label">{inventoryPreviewItems.length}개 예약 블록</div>
                      <button
                        type="button"
                        className="ghost-button copy-icon-button"
                        onClick={() => void copyApplyInventoryBoard()}
                        disabled={busyKey !== null || (inventoryWorkbench.boardMode === "ota" ? !reads.ota.copyText : actionOutputRows.length === 0)}
                        aria-label={inventoryWorkbench.boardMode === "ota" ? "OTA 원본 복사" : "재고표 복사"}
                        title={inventoryWorkbench.boardMode === "ota" ? "OTA 원본 복사" : "재고표 복사"}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M9 9h9v11H9z" />
                          <path d="M6 5h9v2H8v9H6z" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  <div className="apply-contract-grid compact-contract-grid">
                    <article className="ops-side-card">
                      <p className="section-title">결과</p>
                      <div className="ops-count-list">
                        <div className="ops-count-row"><span>STATION</span><strong>{applyContractSummary.stationCount}건</strong></div>
                        <div className="ops-count-row"><span>NAVER</span><strong>{applyContractSummary.naverCount}건</strong></div>
                      </div>
                    </article>
                    <article className="ops-side-card">
                      <p className="section-title">작업</p>
                      <div className="ops-count-list">
                        <div className="ops-count-row"><span>승인 필요</span><strong>{applyContractSummary.requiresApproval ? "예" : "아니오"}</strong></div>
                        <div className="ops-count-row"><span>WRITE 가능</span><strong>{applyContractSummary.applyAllowed ? "가능" : "대기"}</strong></div>
                      </div>
                    </article>
                    <article className="ops-side-card">
                      <p className="section-title">안내</p>
                      <div className="ops-special-list compact">
                        <div className="arrival-note-line">
                          <strong>실조회 기준</strong>
                          <span>실시간이 아니라 조회한 상태 기준으로만 재고표를 유지합니다.</span>
                        </div>
                        <div className="arrival-note-line">
                          <strong>자동 마감</strong>
                          <span>시트 기준으로 닫혀야 하는 셀만 `닫음` 후보로 강조합니다.</span>
                        </div>
                      </div>
                    </article>
                  </div>

                  <div className="room-detail-layout">
                    <div className="room-detail-list">
                      {inventoryPreviewItems.length > 0 ? (
                        inventoryPreviewItems.map((item) => {
                          const issueStatus = inventoryBoardRowMap.get(item.id)?.issueStatus ?? "normal";
                          return (
                            <button
                              key={item.id}
                              type="button"
                              className={`room-detail-item room-detail-item-${issueStatus} ${selectedRoomDetail?.id === item.id ? "active" : ""}`}
                              onClick={() => setSelectedRoomDetailId(item.id)}
                            >
                              <strong>{item.roomNo} / {item.roomType || "객실"}</strong>
                              <span>{item.guestName || item.reservationNo || item.title}</span>
                              <small>{formatStayRange(item)}</small>
                            </button>
                          );
                        })
                      ) : (
                        <div className="detail-panel">시트 데이터를 먼저 읽어 오면 실제 지점과 룸타입이 여기 표시됩니다.</div>
                      )}
                    </div>

                    <div className="room-detail-main">
                      {selectedRoomDetail ? (
                        <>
                          <div className="room-detail-hero">
                            <div>
                              <p className="eyebrow">{selectedRoomDetail.branchLabel || branchOption.label}</p>
                              <h3>{selectedRoomDetail.roomNo} / {selectedRoomDetail.roomType || "객실"}</h3>
                              <p className="support-copy">
                                {selectedRoomDetail.guestName || "예약자 미기입"} · {selectedRoomDetail.reservationNo || "예약번호 미기입"} · {selectedRoomDetail.channel || "채널 미기입"}
                              </p>
                              {(inventoryBoardRowMap.get(selectedRoomDetail.id)?.issueStatus ?? "normal") === "error" ? (
                                <div className="room-detail-alert">오류 예약일시 강조 · {formatStayRange(selectedRoomDetail)}</div>
                              ) : null}
                            </div>
                            <div className="stay-summary-card">
                              <strong>{selectedRoomDetail.nightCount || 0}박</strong>
                              <span>{formatStayRange(selectedRoomDetail)}</span>
                            </div>
                          </div>

                          <div
                            className="room-detail-grid"
                            style={{ gridTemplateColumns: `220px repeat(${Math.max(windowDays.length, 1)}, minmax(92px, 1fr))` }}
                          >
                            <div className="room-detail-grid-label">room-detail</div>
                            {windowDays.map((day) => (
                              <div key={day.iso} className="room-day">
                                <span>{day.weekday}</span>
                                <strong>{day.label}</strong>
                              </div>
                            ))}
                            <div
                              className="room-detail-grid-row"
                              style={{ gridTemplateColumns: `220px repeat(${Math.max(windowDays.length, 1)}, minmax(92px, 1fr))` }}
                            >
                              <div className="room-detail-grid-meta">
                                <strong>{selectedRoomDetail.roomNo}</strong>
                                <span>{selectedRoomDetail.roomType || "객실"}</span>
                              </div>
                              {windowDays.map((day) => (
                                <div key={day.iso} className="room-block-cell">
                                  {matchesStayDay(selectedRoomDetail, day.iso) ? (
                                    <div
                                      className={`room-block ${(inventoryBoardRowMap.get(selectedRoomDetail.id)?.issueStatus ?? "normal") === "error" ? "room-block-error" : ""}`}
                                      data-channel={String(selectedRoomDetail.channel || "UNKNOWN").toUpperCase()}
                                      style={
                                        {
                                          "--room-block-bg": selectedChannelVisual.bg,
                                          "--room-block-fg": selectedChannelVisual.fg,
                                          "--room-block-accent": selectedChannelVisual.accent,
                                        } as CSSProperties
                                      }
                                    >
                                      <strong>{selectedRoomDetail.guestName || selectedRoomDetail.reservationNo || "예약"}</strong>
                                      <span>{selectedChannelVisual.label}</span>
                                    </div>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className={`inventory-board-stack inventory-board-motion-${inventoryWorkbench.motionKey % 2}`}>
                            <article className="detail-compare-card inventory-board-layer">
                              <p className="eyebrow">시트 재고표</p>
                              <strong>{selectedRoomDetail.roomNo} / {selectedRoomDetail.roomType || "객실"}</strong>
                              <div className="inventory-cell-strip">
                                {(inventoryBoardRowMap.get(selectedRoomDetail.id)?.cells ?? []).map((cell) => (
                                  <div key={cell.id} className="inventory-cell-block">
                                    <span>{cell.nextValue}</span>
                                  </div>
                                ))}
                              </div>
                            </article>
                            {inventoryWorkbench.boardMode !== "sheet" ? (
                              <article className="detail-compare-card inventory-board-layer emphasized">
                                <p className="eyebrow">OTA 재고표</p>
                                <strong>{inventoryWorkbench.otaMode === "naver" ? "NAVER" : "STATION"} 작업면</strong>
                                <div className="inventory-cell-strip">
                                  {(inventoryBoardRowMap.get(selectedRoomDetail.id)?.cells ?? []).map((cell) => (
                                    <div
                                      key={`${cell.id}:ota`}
                                      className={`inventory-cell-block ${cell.changed ? "changed" : ""}`}
                                      data-prev={cell.previousValue}
                                      onMouseEnter={() => setInventoryWorkbench((current) => ({ ...current, hoveredDiffId: cell.id }))}
                                      onMouseLeave={() => setInventoryWorkbench((current) => ({ ...current, hoveredDiffId: current.hoveredDiffId === cell.id ? null : current.hoveredDiffId }))}
                                    >
                                      <span>{cell.changed ? "닫음" : cell.baseValue}</span>
                                    </div>
                                  ))}
                                </div>
                              </article>
                            ) : null}
                          </div>

                          <div className="detail-compare-grid">
                            <article className="detail-compare-card">
                              <p className="eyebrow">시트</p>
                              <strong>{selectedRoomDetail.title}</strong>
                              <span>{selectedRoomDetail.subtitle}</span>
                            </article>
                            <article className="detail-compare-card">
                              <p className="eyebrow">PMS</p>
                              <strong>{summarizeReference(pmsReference ?? null, "같은 객실 참고값 없음")}</strong>
                            </article>
                            <article className="detail-compare-card">
                              <p className="eyebrow">OTA</p>
                              <strong>{summarizeReference(otaReference ?? null, "같은 객실 참고값 없음")}</strong>
                            </article>
                          </div>
                        </>
                      ) : (
                        <div className="detail-panel">선택된 객실이 없습니다.</div>
                      )}
                    </div>
                  </div>
                </article>

                <article className="progress-card">
                  <p className="section-title">실행 결과</p>
                  <div className="action-output-list">
                    {actionOutputRows.map((row) => (
                      <div key={row.id} className="list-row">
                        <div>
                          <strong>{row.primary}</strong>
                          <span>{row.secondary}</span>
                          {row.detail ? <small>{row.detail}</small> : null}
                        </div>
                        <em>{row.statusLabel}</em>
                      </div>
                    ))}
                  </div>
                </article>
              </>
            ) : (
              <>
                <article className="hero-card reservation-summary-card error-summary-card">
                  <p className="eyebrow">오류 관리</p>
                  <h3>PMS 비교 보드</h3>
                  <p className="support-copy">PMS `room available` 기준으로 예약 시트와 다른 부분을 찾고, 오류와 확인필요 항목을 같은 화면에서 빠르게 점검합니다.</p>
                  <div className="detail-panel small-label">{branchOption.label} · {windowStart} ~ {windowEnd}</div>
                  <div className="reservation-toolbar">
                    <label className="compact-field">
                      <span>시작일</span>
                      <input type="date" value={windowStart} onChange={(event) => setWindowStart(event.target.value)} />
                    </label>
                    <label className="compact-field">
                      <span>종료일</span>
                      <input type="date" value={windowEnd} onChange={(event) => setWindowEnd(event.target.value)} />
                    </label>
                  </div>
                  <div className="button-row">
                    <button
                      type="button"
                      onClick={() => void executeReservationAction("validate")}
                      disabled={busyKey !== null || !reservationAvailability.validate.enabled}
                    >
                      오류 점검
                    </button>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => void executeReservationAction("reconcile")}
                      disabled={busyKey !== null || !reservationAvailability.reconcile.enabled}
                    >
                      PMS 대조
                    </button>
                  </div>
                  <div className="availability-note">{workspaceMessage}</div>
                </article>

                <article className="review-card error-management-shell">
                  <div className="ops-panel-header">
                    <div>
                      <p className="eyebrow">PMS 메인 보드</p>
                      <h3>오류 관리</h3>
                      <p className="support-copy">하단 요약 셀을 눌러 우측 패널에서 가까운 날짜순으로 확인합니다.</p>
                    </div>
                    <div className="detail-panel small-label">{errorIssues.length}개 비교 대상</div>
                  </div>

                  <div className="error-main-layout">
                    <div className="error-visual-board">
                      {errorIssues.slice(0, 12).map((issue) => (
                        <button
                          key={issue.id}
                          type="button"
                          className={`error-visual-cell status-${issue.status} ${errorWorkbench.quickScanPassedIds.includes(issue.id) ? "verified" : ""}`}
                          onClick={() => {
                            setErrorWorkbench((current) => ({ ...current, selectedIssueId: issue.id }));
                            if (issue.status === "error" || issue.status === "needs-review") {
                              openIssuePanel(issue.status === "error" ? "error" : "needs-review");
                            }
                          }}
                        >
                          <strong>{issue.roomLabel}</strong>
                          <span>{issue.guestLabel}</span>
                          <small>{issue.date || "일자 미기입"}</small>
                        </button>
                      ))}
                    </div>

                    <aside ref={errorPanelRef} className={`error-side-panel ${errorWorkbench.panelTab ? "open" : ""}`}>
                      <div className="error-side-panel-head">
                        <strong>{errorWorkbench.panelTab === "error" ? "오류 리스트" : errorWorkbench.panelTab === "needs-review" ? "확인필요 리스트" : "사이드 패널"}</strong>
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() => setErrorWorkbench((current) => ({ ...current, panelTab: null, selectedIssueId: null }))}
                        >
                          닫기
                        </button>
                      </div>
                      <div className="error-side-list">
                        {visibleErrorIssues.map((issue) => (
                          <div key={issue.id} className={`error-side-item ${errorWorkbench.selectedIssueId === issue.id ? "active" : ""}`}>
                            <button
                              type="button"
                              className="error-side-item-button"
                              onClick={() => setErrorWorkbench((current) => ({ ...current, selectedIssueId: issue.id }))}
                            >
                              <strong>{issue.summary}</strong>
                              <span>{issue.date || "일자 미기입"} · {issue.guestLabel}</span>
                            </button>
                            {errorWorkbench.selectedIssueId === issue.id ? (
                              <div className="error-side-popup">
                                <strong>{issue.roomLabel} / {issue.roomType}</strong>
                                <p>{issue.detail}</p>
                                <div className="detail-panel small-label">{issue.guidance}</div>
                                {errorWorkbench.panelTab === "needs-review" ? (
                                  <div className="step-chip-row">
                                    {(["normal", "error", "needs-review"] as AppIssueStatus[]).map((status) => (
                                      <button
                                        key={status}
                                        type="button"
                                        className={`step-chip-button ${errorWorkbench.decisionMap[issue.id] === status ? "active" : ""}`}
                                        onClick={() => updateIssueDecision(issue.id, status)}
                                      >
                                        {status === "normal" ? "정상" : status === "error" ? "오류" : "미확인"}
                                      </button>
                                    ))}
                                  </div>
                                ) : null}
                                <div className="button-row">
                                  <button type="button" onClick={() => completeIssue(issue.id)}>완료</button>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </aside>
                  </div>

                  <div className="error-summary-strip">
                    <button type="button" className="summary-status-card normal" onClick={() => setErrorWorkbench((current) => ({ ...current, panelTab: null }))}>
                      <span>정상</span>
                      <strong>{errorCounts.normal}</strong>
                    </button>
                    <button type="button" className="summary-status-card error" onClick={() => openIssuePanel("error")}>
                      <span>오류</span>
                      <strong>{errorCounts.error}</strong>
                    </button>
                    <button type="button" className="summary-status-card needs-review" onClick={() => openIssuePanel("needs-review")}>
                      <span>확인필요</span>
                      <strong>{errorCounts["needs-review"]}</strong>
                    </button>
                  </div>
                </article>

                <article className="progress-card">
                  <p className="section-title">실행 결과</p>
                  <div className="action-output-list">
                    {actionOutputRows.map((row) => (
                      <div key={row.id} className="list-row">
                        <div>
                          <strong>{row.primary}</strong>
                          <span>{row.secondary}</span>
                          {row.detail ? <small>{row.detail}</small> : null}
                        </div>
                        <em>{row.statusLabel}</em>
                      </div>
                    ))}
                  </div>
                  {selectedErrorIssue ? (
                    <div className="detail-panel small-label">
                      수정 안내 · {selectedErrorIssue.guidance}
                    </div>
                  ) : null}
                </article>
              </>
            )}
          </section>
        </main>
        </div>

      {settingsOpen ? (
        <div className="overlay overlay-settings">
          <section className="settings-panel settings-shell">
            <aside className="settings-side-nav">
              <div className="settings-side-brand">
                <div className="settings-side-icon">⚙</div>
                <div>
                  <strong>설정</strong>
                  <span>전역 설정</span>
                </div>
              </div>
              <nav className="settings-side-links">
                <button type="button" className="settings-side-link active">직접 입력</button>
                <button type="button" className="settings-side-link">운영 선택값</button>
              </nav>
              <div className="settings-side-links settings-side-footer">
                <button type="button" className="settings-side-link" onClick={closeSettings}>닫기</button>
              </div>
            </aside>

            <div className="settings-main">
              <div className="settings-topbar">
                <div>
                  <p className="eyebrow">설정</p>
                  <h3>전역 설정</h3>
                  <p className="support-copy">직접 입력이 필요한 값과 운영 선택값만 한 화면에서 정리합니다.</p>
                </div>
                <label className="settings-search">
                  <span>검색</span>
                  <input type="search" placeholder="설정 항목 검색" />
                </label>
              </div>

              <div className="settings-reference-grid">
                <section className="settings-section settings-manual-card">
                  <div className="settings-section-head">
                    <div className="settings-section-icon">입력</div>
                    <div>
                      <h4>직접 입력 필요</h4>
                      <p>실제 주소, 계정, 모델 경로처럼 사용자가 직접 넣는 값입니다.</p>
                    </div>
                  </div>
                  <div className="settings-stack">
                    <label className="field">
                      <span>예약 시트 주소</span>
                      <input value={spreadsheet} onChange={(event) => setSpreadsheet(event.target.value)} />
                    </label>
                    <label className="field">
                      <span>예약 시트 탭 이름</span>
                      <input value={sheetName} onChange={(event) => setSheetName(event.target.value)} />
                    </label>
                    <div className="settings-note-card">
                      WINGS 공용 계정 가져오기를 실행하면 등록된 지점 계정을 앱 내부 설정으로 변환합니다. Company ID는 {wingsCompanyId}로 고정됩니다.
                    </div>
                    <div className="button-row">
                      <button type="button" onClick={() => void importWingsSharedCredentials()} disabled={busyKey !== null}>
                        WINGS 공용 계정 가져오기
                      </button>
                      <button type="button" className="ghost-button" onClick={() => void runStoredWingsLogin()} disabled={busyKey !== null}>
                        현재 지점 Wings 로그인
                      </button>
                    </div>
                    <label className="field">
                      <span>BGE-M3 로컬 모델 폴더 경로</span>
                      <input value={bgeModelPath} onChange={(event) => setBgeModelPath(event.target.value)} placeholder="local-path일 때만 필요" />
                    </label>
                    <div className="settings-note-card">{wingsLoginSummary}</div>
                  </div>
                </section>

                <section className="settings-section settings-selection-card">
                  <div className="settings-section-head">
                    <div className="settings-section-icon accent">선택</div>
                    <div>
                      <h4>운영 선택값</h4>
                      <p>조회 기간, 오더리스트 옵션, BGE-M3 사용 조건을 정리합니다.</p>
                    </div>
                  </div>
                  <div className="settings-two-column">
                    <div className="settings-stack">
                      <label className="field">
                        <span>기본 조회 기간(일)</span>
                        <input value={reportWindowDays} onChange={(event) => setReportWindowDays(event.target.value)} />
                      </label>
                      <div className="settings-range-pill">{reportWindowDays || String(DEFAULT_APP_REPORT_WINDOW_DAYS)} Days</div>
                      <label className="toggle-row settings-toggle-card">
                        <input type="checkbox" checked={excludeRoomMakeup} onChange={(event) => setExcludeRoomMakeup(event.target.checked)} />
                        <span>룸메이크업 제외</span>
                      </label>
                      <label className="toggle-row settings-toggle-card">
                        <input type="checkbox" checked={flagContinuationCandidates} onChange={(event) => setFlagContinuationCandidates(event.target.checked)} />
                        <span>연박 후보 표시</span>
                      </label>
                      <label className="toggle-row settings-toggle-card">
                        <input type="checkbox" checked={bgeEnabled} onChange={(event) => setBgeEnabled(event.target.checked)} />
                        <span>BGE-M3 사용 여부</span>
                      </label>
                    </div>
                    <div className="settings-stack">
                      <label className="field">
                        <span>BGE-M3 실행 모드</span>
                        <select value={bgeRuntime} onChange={(event) => setBgeRuntime(event.target.value as "local-path" | "download-if-missing")}>
                          <option value="local-path">로컬 경로</option>
                          <option value="download-if-missing">없으면 내려받기</option>
                        </select>
                      </label>
                      <div className="settings-inline-grid">
                        <label className="field">
                          <span>Top K</span>
                          <input value={bgeTopK} onChange={(event) => setBgeTopK(event.target.value)} />
                        </label>
                        <label className="field">
                          <span>Score Threshold</span>
                          <input value={bgeScoreThreshold} onChange={(event) => setBgeScoreThreshold(event.target.value)} />
                        </label>
                      </div>
                      <div className="settings-note-card">{bgeInstallSummary}</div>
                      <div className="settings-info-card">
                        하이브리드 검색이 예약번호, 예약키, 이름, 연락처, 채널, 노트 겹침, 날짜 인접성을 함께 사용해 연박 후보를 찾습니다.
                      </div>
                    </div>
                  </div>
                </section>
              </div>

              <div className="settings-floating-bar">
                <button type="button" className="ghost-button" onClick={closeSettings}>
                  변경 취소
                </button>
                <button type="button" onClick={() => void saveSettings()} disabled={busyKey !== null}>
                  설정 적용
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}

    </div>
  );
}
