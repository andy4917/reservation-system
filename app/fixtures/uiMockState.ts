import type { WorkspaceMockState } from "../renderer/types";
import { getProviderCapabilityCards } from "../services/providerRegistry";

export const uiMockState: WorkspaceMockState = {
  runtimeMode: "dry-run",
  activeTask: "inventory-compare",
  selectedBranch: "ALL",
  selectedRange: {
    startDate: "2026-03-12",
    endDate: "2026-03-15"
  },
  activeRunContext: null,
  bridgeStatus: {
    connected: false,
    sessionAvailable: false,
    capability: "degraded",
    activeHost: "bridge not connected",
    provider: "NAVER/STATION",
    message: "Dry-run mode. Live session bridge is not attached yet.",
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
    "Workspace booted in dry-run mode.",
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
    supportLevel: "dry-run-only",
    sourceLabel: "Dry-run sheet fixture",
    lastRunAt: "2026-03-10T06:56:46.000Z",
    summary: null,
    logs: ["Sheet runtime not requested yet."]
  },
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
  recommendationSettings: {
    enabled: true,
    modelId: "intfloat/multilingual-e5-small",
    runtimePreference: "lexical-fallback",
    localModelPath: "",
    cacheDir: "",
    scoreThreshold: 0.58
  },
  recommendationRuntime: {
    enabled: true,
    ready: false,
    activeRuntime: "lexical-fallback",
    modelId: "intfloat/multilingual-e5-small",
    localModelPath: "",
    cacheDir: "",
    reason: "Lexical fallback was selected in settings.",
    scoreThreshold: 0.58,
    runtimeBackend: "onnxruntime-node",
    runtimeProvider: "cpu",
    resolvedVariant: "none"
  },
  recommendationRuntimeDiagnostics: null,
  recommendationSampleEmbedResult: null,
  recommendationAssist: {
    enabled: true,
    summary: "2 mismatch / 1 warning rows를 유지한 채 4개의 review-only recommendation을 생성했습니다. 주요 원인군은 Normalization / Alias Drift 1건, DOM / Selector Drift 1건 입니다.",
    recommendations: [
      {
        input: {
          rawValue: "Urban",
          source: "urban-0313",
          provider: "naver-partner",
          fieldType: "roomType",
          evidence: ["raw row and derived row disagree", "compare provider row vs value row", "4/6 vs 6/6"],
          confidence: 0.66
        },
        candidates: [
          {
            value: "Double Twin",
            reason: "현재 compare row와 관측된 alias 후보를 기반으로 제안",
            score: 0.54,
            confidence: 0.54
          }
        ],
        reason: "현재 row의 roomType가 mismatch/warning 이유와 함께 관측되어 alias 후보만 제시합니다. 최종 확정은 검증 단계가 유지합니다.",
        confidence: 0.66,
        requires_review: true
      },
      {
        input: {
          rawValue: "2026-03-12..2026-03-15",
          source: "selected-range",
          provider: "naver-partner",
          fieldType: "range",
          evidence: ["observed row dates: 2026-03-12, 2026-03-13, 2026-03-14", "observed line dates: 2026-03-12, 2026-03-13"],
          confidence: 0.63
        },
        candidates: [
          {
            value: "2026-03-12..2026-03-14",
            reason: "row/log window에서 추정한 범위 후보",
            score: 0.63,
            confidence: 0.63
          }
        ],
        reason: "선택 범위와 row/log에서 보이는 날짜 창이 달라 범위 후보만 제안합니다. 자동 적용은 하지 않습니다.",
        confidence: 0.63,
        requires_review: true
      }
    ],
    mismatchGroups: [
      {
        id: "mapping-drift",
        title: "Normalization / Alias Drift",
        detail: "room/channel/raw-derived 불일치 표현이 있어 alias 또는 정규화 drift 후보로 분류했습니다. provider=naver-partner",
        count: 1,
        confidence: 0.72,
        examples: ["2026-03-13 Urban STATION"]
      },
      {
        id: "dom-drift",
        title: "DOM / Selector Drift",
        detail: "fallback, closed text, DOM snapshot 의존 흔적이 있어 selector drift 후보로 분류했습니다. provider=naver-partner",
        count: 1,
        confidence: 0.76,
        examples: ["2026-03-14 Grand STATION"]
      }
    ]
  },
  inventoryCompare: {
    title: "Inventory Compare",
    supportLevel: "dry-run-only",
    sourceLabel: "Dry-run fixture",
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
      "Compare source: dry-run",
      "Mismatch rows: 2",
      "2026-03-12 Urban NAVER 4/6 vs 6/6",
      "2026-03-13 Urban STATION 4/6 vs 6/6"
    ],
    opsLines: [
      "Bridge contract path: bridge.getContext -> provider.fetchRows -> provider.domSnapshot",
      "Support level: dry-run-only",
      "Warnings requiring manual review: 1"
    ],
    validationLines: [
      "Validation gate: mismatch rows remain, apply blocked",
      "Validation gate: fixture snapshot loaded"
    ],
    logs: [
      "Inventory compare loaded for dry-run mode.",
      "Rows prepared: 4",
      "Mismatch summary built: 2"
    ]
  },
  reservationAudit: {
    title: "Reservation Audit",
    supportLevel: "dry-run-only",
    sourceLabel: "Dry-run audit fixture",
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
      "Audit source: Dry-run audit fixture",
      "Audit anomalies: 1",
      "240312-001 김지연 NAVER OTA ACTIVE지만 PMS remark에 night audit 흔적이 남아 있습니다."
    ],
    opsLines: [
      "Reservation retention: reservation_no, ota, date, nights, room, guest, phone tail, token hash",
      "Support level: dry-run-only",
      "Manual review candidates: 1"
    ],
    validationLines: [
      "Validation gate: audit anomalies remain, apply-review stays blocked",
      "Validation gate: reservation audit fixture loaded"
    ],
    logs: [
      "Reservation audit loaded for Dry-run audit fixture.",
      "Audit rows prepared: 3",
      "Audit anomaly summary built: 1"
    ]
  }
};
