import type { WorkspaceMockState } from "../renderer/types";
import { getProviderCapabilityCards } from "../services/providerRegistry";

export const uiMockState: WorkspaceMockState = {
  runtimeMode: "preview",
  activeTask: "inventory-compare",
  selectedBranch: "GANGNAM",
  selectedRange: {
    startDate: "2026-03-12",
    endDate: "2026-03-15"
  },
  activeRunContext: null,
  activeFocus: null,
  bridgeStatus: {
    connected: false,
    sessionAvailable: false,
    capability: "degraded",
    activeHost: "bridge not connected",
    provider: "NAVER/STATION",
    message: "Preview mode. Live session bridge is not attached yet.",
    code: "BRIDGE_UNAVAILABLE",
    recoveryAction: "Run the desktop app with bridge capability enabled and attach an extension session.",
    authConfigured: false,
    writeEnabled: false
  },
  metrics: [
    { label: "Mismatch", value: "12", tone: "critical" },
    { label: "Preview Warn", value: "3", tone: "warn" },
    { label: "Reservation Audit", value: "5 anomaly", tone: "warn" },
    { label: "Apply Ready", value: "Blocked", tone: "critical" }
  ],
  logs: [
    "Workspace booted in preview mode.",
    "Mock inventory rows loaded.",
    "Mock sheet snapshot loaded.",
    "Validation summary assembled."
  ],
  evidenceLines: [
    "Mismatch evidence: Urban 03-13 site=4 / sheet=6",
    "TracePacket count: 12",
    "Provider source usage: room_raw=18, room_derived=2"
  ],
  opsLines: [
    "Policy: ACTIVE / CANCELED model",
    "Retention: reservation_no, ota, date, nights, room, normalized guest, phone tail, token hash",
    "Anomaly candidates: 5"
  ],
  validationLines: [
    "Scan validation: error 0 / warn 2",
    "Preview validation: error 1 / warn 3",
    "Type coverage: Urban 20/20, Double 20/20, Grand 1/1"
  ],
  inventoryCompareLoading: false,
  sheetRead: {
    supportLevel: "preview-only",
    sourceLabel: "Preview sheet snapshot",
    lastRunAt: "2026-03-10T06:56:46.000Z",
    summary: null,
    selectedRunId: null,
    mappingArtifacts: [],
    visibleSlice: {
      runId: null,
      offset: 0,
      limit: 12,
      total: 1,
      lines: ["Sheet runtime not requested yet."]
    }
  },
  manualScanAnchor: null,
  manualScanAnchorDraft: {},
  sheetTerms: [],
  termBindings: [],
  unresolvedBindings: [],
  recommendationTraces: [],
  operatorExport: null,
  handoffHistoryFilter: "all",
  reservationAuditLoading: false,
  searchQuery: "",
  searchResults: [],
  processModules: [
    {
      id: "search-engine",
      title: "Search Engine",
      owner: "app",
      status: "ready",
      detail: "logs, evidence, validation, inventory rows를 앱에서 검색"
    },
    {
      id: "workflow-orchestrator",
      title: "Process Orchestrator",
      owner: "app",
      status: "active",
      detail: "task별 실행 단계와 blocker를 앱에서 정리"
    },
    {
      id: "session-auth",
      title: "Session/Auth Bridge",
      owner: "extension",
      status: "pending",
      detail: "현재 탭 세션 heartbeat 대기 중"
    }
  ],
  providerCards: getProviderCapabilityCards(),
  jobStatusCards: [
    { id: "sheet-sync", title: "Sheet Snapshot", status: "ready", detail: "앱 소유 조회/스캔 경로 사용" },
    { id: "provider-read", title: "Provider Read", status: "blocked", detail: "확장 세션 heartbeat 필요" }
  ],
  bridgeSummary: {
    authSummary: null,
    infoSummary: null,
    preview: null
  },
  authBundleSettingsSnapshot: null,
  inventoryCompare: {
    title: "Inventory Compare",
    supportLevel: "preview-only",
    sourceLabel: "Preview snapshot",
    lastRunAt: "2026-03-10T06:56:46.000Z",
    mismatchCount: 2,
    warningCount: 1,
    matchedCount: 1,
    rows: [
      {
        id: "urban-0312",
        date: "2026-03-12",
        roomType: "Urban",
        channel: "NAVER",
        siteRaw: "4/6",
        sheetRaw: "6/6",
        diff: "-2",
        status: "mismatch",
        reason: "site sold count lagging behind sheet snapshot",
        action: "bridge live read before apply"
      },
      {
        id: "urban-0313",
        date: "2026-03-13",
        roomType: "Urban",
        channel: "STATION",
        siteRaw: "4/6",
        sheetRaw: "6/6",
        diff: "-2",
        status: "mismatch",
        reason: "raw row and derived row disagree",
        action: "compare provider row vs value row"
      },
      {
        id: "double-0313",
        date: "2026-03-13",
        roomType: "Double Twin",
        channel: "NAVER",
        siteRaw: "2/3",
        sheetRaw: "2/3",
        diff: "0",
        status: "match",
        reason: "sheet and provider aligned",
        action: "keep"
      },
      {
        id: "grand-0314",
        date: "2026-03-14",
        roomType: "Grand",
        channel: "STATION",
        siteRaw: "closed",
        sheetRaw: "0/1",
        diff: "warn",
        status: "warning",
        reason: "provider closed text parsed via fallback",
        action: "require dom snapshot on live bridge"
      }
    ],
    evidenceLines: [
      "Compare source: preview",
      "Mismatch rows: 2",
      "2026-03-12 Urban NAVER 4/6 vs 6/6",
      "2026-03-13 Urban STATION 4/6 vs 6/6"
    ],
    opsLines: [
      "Bridge contract path: bridge.getContext -> provider.fetchRows -> provider.domSnapshot",
      "Support level: preview-only",
      "Warnings requiring manual review: 1"
    ],
    validationLines: [
      "Validation gate: mismatch rows remain, apply blocked",
      "Validation gate: fixture snapshot loaded"
    ],
    logs: [
      "Inventory compare loaded for preview mode.",
      "Rows prepared: 4",
      "Mismatch summary built: 2"
    ]
  },
  reservationAudit: {
    title: "Reservation Audit",
    supportLevel: "preview-only",
    sourceLabel: "Preview audit snapshot",
    lastRunAt: "2026-03-10T06:56:46.000Z",
    anomalyCount: 1,
    reviewCount: 1,
    activeCount: 2,
    canceledCount: 1,
    rows: [
      {
        id: "rsvn-240312-kim",
        reservationNo: "240312-001",
        guestName: "김지연",
        channel: "NAVER",
        checkin: "2026-03-12",
        checkout: "2026-03-13",
        status: "ACTIVE",
        auditStatus: "anomaly",
        reason: "OTA ACTIVE지만 PMS remark에 night audit 흔적이 남아 있습니다.",
        action: "remark / PMS source row 확인"
      },
      {
        id: "rsvn-240313-park",
        reservationNo: "240313-014",
        guestName: "박서준",
        channel: "STATION",
        checkin: "2026-03-13",
        checkout: "2026-03-15",
        status: "ACTIVE",
        auditStatus: "review",
        reason: "전화 끝자리와 OTA token hash는 맞지만 객실 표현이 달라 review가 필요합니다.",
        action: "room alias / note head 검증"
      },
      {
        id: "rsvn-240314-choi",
        reservationNo: "240314-102",
        guestName: "최은정",
        channel: "WINGS",
        checkin: "2026-03-14",
        checkout: "2026-03-16",
        status: "CANCELED",
        auditStatus: "ok",
        reason: "취소 상태가 OTA / PMS 모두 일치합니다.",
        action: "keep"
      }
    ],
    evidenceLines: [
      "Audit source: Preview audit snapshot",
      "Audit anomalies: 1",
      "240312-001 김지연 NAVER OTA ACTIVE지만 PMS remark에 night audit 흔적이 남아 있습니다."
    ],
    opsLines: [
      "Reservation retention: reservation_no, ota, date, nights, room, guest, phone tail, token hash",
      "Support level: preview-only",
      "Manual review candidates: 1"
    ],
    validationLines: [
      "Validation gate: audit anomalies remain, apply-review stays blocked",
      "Validation gate: reservation audit fixture loaded"
    ],
    logs: [
      "Reservation audit loaded for Preview audit snapshot.",
      "Audit rows prepared: 3",
      "Audit anomaly summary built: 1"
    ]
  },
  hasPendingQueryChanges: false
};
