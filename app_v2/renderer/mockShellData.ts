import type {
  AppBranch,
  AppLiveReadPreviewItem,
  AppLiveReadSnapshot,
  AppReadSource,
  AppReservationAction,
} from "../../src/desktop/app-v2-contracts.js";

export interface ShellReviewItem {
  id: string;
  title: string;
  subtitle: string;
  status: "ready" | "warning" | "info";
}

export interface ActionOutputRow {
  id: string;
  primary: string;
  secondary: string;
  statusLabel: string;
}

export interface ReservationActionState {
  enabled: boolean;
  reason: string;
}

export type ReservationActionAvailability = Record<AppReservationAction, ReservationActionState>;

export const BRANCH_OPTIONS: AppBranch[] = ["COEX", "GANGNAM"];

export const RESERVATION_ACTION_LABELS: Record<AppReservationAction, string> = {
  compare: "비교",
  validate: "검증",
  reconcile: "대조",
  edit: "수정",
  apply: "반영",
  "order-list": "오더리스트",
  arrival: "어라이벌",
};

export function createIdleRead(source: AppReadSource, branch: AppBranch): AppLiveReadSnapshot {
  return {
    source,
    branch,
    checkedAt: "",
    status: "idle",
    summary: "아직 조회하지 않았습니다.",
    recordsImported: 0,
    blockedReason: null,
    items: [],
    evidence: [],
  };
}

function hasDone(reads: Record<AppReadSource, AppLiveReadSnapshot>, source: AppReadSource) {
  return reads[source].status === "done";
}

export function deriveReservationActionAvailability(
  reads: Record<AppReadSource, AppLiveReadSnapshot>,
): ReservationActionAvailability {
  const pms = hasDone(reads, "pms");
  const ota = hasDone(reads, "ota");
  const sheet = hasDone(reads, "sheet");
  const any = pms || ota || sheet;
  const anyPair = (pms && ota) || (pms && sheet) || (ota && sheet);
  const all = pms && ota && sheet;

  return {
    compare: {
      enabled: anyPair,
      reason: anyPair ? "준비됨" : "조회 2개 완료 후 사용할 수 있습니다.",
    },
    validate: {
      enabled: any,
      reason: any ? "준비됨" : "PMS/OTA/시트 조회 중 하나가 필요합니다.",
    },
    reconcile: {
      enabled: anyPair,
      reason: anyPair ? "준비됨" : "관련 조회 2개 완료 후 사용할 수 있습니다.",
    },
    edit: {
      enabled: all,
      reason: all ? "준비됨" : "PMS, OTA, 시트 조회가 모두 완료되어야 합니다.",
    },
    apply: {
      enabled: all,
      reason: all ? "준비됨" : "PMS, OTA, 시트 조회가 모두 완료되어야 합니다.",
    },
    "order-list": {
      enabled: pms || sheet,
      reason: pms || sheet ? "준비됨" : "PMS 또는 예약 시트 조회 후 사용할 수 있습니다.",
    },
    arrival: {
      enabled: pms,
      reason: pms ? "준비됨" : "PMS 조회 후 사용할 수 있습니다.",
    },
  };
}

export function buildReviewQueue(
  branch: AppBranch,
  action: AppReservationAction,
  reads: Record<AppReadSource, AppLiveReadSnapshot>,
  startDate: string,
  endDate: string,
): ShellReviewItem[] {
  const prefix = branch === "COEX" ? "코엑스" : "강남";
  const base: Record<AppReservationAction, ShellReviewItem[]> = {
    compare: [
      { id: "cmp-1", title: `${prefix} / PMS ↔ OTA 차이`, subtitle: `${startDate} ~ ${endDate} 판매 재고 2건 차이`, status: "warning" },
      { id: "cmp-2", title: `${prefix} / OTA ↔ 시트 차이`, subtitle: "판매중지 상태 검토", status: "info" },
    ],
    validate: [
      { id: "val-1", title: `${prefix} / 기준 검증`, subtitle: `${startDate} ~ ${endDate} 동일 지점 예약번호 검토`, status: "ready" },
      { id: "val-2", title: `${prefix} / soft-match`, subtitle: "후보 2건 확인 필요", status: "warning" },
    ],
    reconcile: [
      { id: "rec-1", title: `${prefix} / PMS ↔ 시트 대조`, subtitle: "체크인 날짜 차이 1건", status: "warning" },
      { id: "rec-2", title: `${prefix} / PMS ↔ OTA 대조`, subtitle: "예약 상태 동기화 필요", status: "info" },
    ],
    edit: [
      { id: "edit-1", title: `${prefix} / 수정 대기`, subtitle: "수정 가능 항목 4건", status: "ready" },
      { id: "edit-2", title: `${prefix} / 추천 보조`, subtitle: "BGE-M3 후보 2건", status: "info" },
    ],
    apply: [
      { id: "apply-1", title: `${prefix} / 반영 대기`, subtitle: "확정 가능한 항목 3건", status: "ready" },
      { id: "apply-2", title: `${prefix} / 반영 전 점검`, subtitle: "지점/기간 확인 필요", status: "warning" },
    ],
    "order-list": [
      { id: "order-1", title: `${prefix} / 오더리스트`, subtitle: `${startDate} ~ ${endDate} 입실 준비`, status: "ready" },
      { id: "order-2", title: `${prefix} / 배정 필요`, subtitle: "객실 배정 확인 2건", status: "info" },
    ],
    arrival: [
      { id: "arrival-1", title: `${prefix} / 어라이벌`, subtitle: `${startDate} ~ ${endDate} 도착 예정`, status: "ready" },
      { id: "arrival-2", title: `${prefix} / 빠른 체크인`, subtitle: "선행 확인 필요 1건", status: "warning" },
    ],
  };

  const doneSources = Object.values(reads).filter((row) => row.status === "done").length;
  if (doneSources === 0) {
    return [
      {
        id: `${action}-locked`,
        title: "조회가 아직 없습니다.",
        subtitle: "먼저 PMS, OTA, 예약 시트 중 하나를 읽어와 주세요.",
        status: "info",
      },
    ];
  }
  return base[action];
}

export function buildActionSteps(action: AppReservationAction, branch: AppBranch): string[] {
  const prefix = branch === "COEX" ? "코엑스" : "강남";
  if (action === "compare") return [`${prefix} 기준 선택`, "조회 결과 정렬", "차이 항목 추출"];
  if (action === "validate") return ["기준 소스 확인", "예약 묶음 검증", "이상 후보 정리"];
  if (action === "reconcile") return ["대조 소스 선택", "불일치 검토", "대조 결과 저장"];
  if (action === "edit") return ["수정 대상 선택", "권장값 확인", "수정 내용 반영"];
  if (action === "apply") return ["반영 대상 확정", "최종 확인", "반영 실행"];
  if (action === "order-list") return ["오늘 대상 추출", "배정/메모 반영", "오더리스트 정리"];
  return ["도착 대상 추출", "입실 준비 확인", "어라이벌 결과 저장"];
}

export function buildResultSummary(action: AppReservationAction, read: AppLiveReadSnapshot | null): string {
  if (read) return read.summary;
  if (action === "edit") return "수정할 항목을 선택하면 우측 패널에서 바로 조정할 수 있습니다.";
  if (action === "apply") return "반영 전 최종 점검을 마치면 실행 버튼이 열립니다.";
  if (action === "order-list") return "오늘 작업 오더리스트를 정리하고 다음 인계에 넘길 수 있습니다.";
  if (action === "arrival") return "오늘 도착 예정 예약을 빠르게 검토할 수 있습니다.";
  return "선택한 작업에 맞는 결과가 여기에 표시됩니다.";
}

export function buildPreviewItems(read: AppLiveReadSnapshot | null, branch: AppBranch): AppLiveReadPreviewItem[] {
  if (read && read.items.length > 0) return read.items;
  const prefix = branch === "COEX" ? "코엑스" : "강남";
  return [
    { id: "preview-wait-1", title: `${prefix} 디럭스`, subtitle: "미리보기 대기", statusLabel: "WAIT" },
    { id: "preview-wait-2", title: `${prefix} 스위트`, subtitle: "조회 후 채워집니다", statusLabel: "WAIT" },
  ];
}

export function buildActionOutputRows(
  action: AppReservationAction,
  branch: AppBranch,
  startDate: string,
  endDate: string,
): ActionOutputRow[] {
  const prefix = branch === "COEX" ? "코엑스" : "강남";
  if (action === "order-list") {
    return [
      { id: "order-row-1", primary: `${prefix} 401 / 룸메이크업`, secondary: `${startDate} 체크인 · NAVER`, statusLabel: "OPS" },
      { id: "order-row-2", primary: `${prefix} 508 / 배정 확인`, secondary: `${endDate} 전 정리`, statusLabel: "CHECK" },
    ];
  }
  if (action === "arrival") {
    return [
      { id: "arrival-row-1", primary: `${prefix} 401 / ARRIVAL`, secondary: `${startDate} 도착`, statusLabel: "ARRIVAL" },
      { id: "arrival-row-2", primary: `${prefix} A701 / TURNOVER`, secondary: `${endDate} 빠른 정비`, statusLabel: "TURNOVER" },
    ];
  }
  if (action === "edit") {
    return [
      { id: "edit-row-1", primary: "추천 수정 1", secondary: "체크인 날짜 보정", statusLabel: "AI" },
      { id: "edit-row-2", primary: "추천 수정 2", secondary: "채널 정규화", statusLabel: "RULE" },
    ];
  }
  return [
    { id: `${action}-row-1`, primary: `${prefix} ${RESERVATION_ACTION_LABELS[action]}`, secondary: `${startDate} ~ ${endDate}`, statusLabel: "READY" },
    { id: `${action}-row-2`, primary: "검토 흐름", secondary: "우측 결과 패널에서 이어집니다", statusLabel: "FLOW" },
  ];
}
