import type {
  AppBranch,
  AppBranchOption,
  AppLiveReadPreviewItem,
  AppLiveReadSnapshot,
  AppReadSource,
  AppReservationAction,
  AppReservationActionRow,
  AppReservationActionSnapshot,
} from "../../src/desktop/app-v2-contracts.js";
import { APP_BRANCH_OPTIONS, getAppBranchOption } from "../../src/desktop/app-v2-contracts.js";

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
  detail?: string;
}

export interface ReservationActionState {
  enabled: boolean;
  reason: string;
}

export type ReservationActionAvailability = Record<AppReservationAction, ReservationActionState>;

export const BRANCH_OPTIONS: readonly AppBranchOption[] = APP_BRANCH_OPTIONS;

export const RESERVATION_ACTION_LABELS: Record<AppReservationAction, string> = {
  compare: "비교",
  validate: "검증",
  reconcile: "대조",
  edit: "수정",
  apply: "적용 가능 확인",
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

function toReviewStatus(statusLabel: string) {
  const normalized = String(statusLabel || "").toLowerCase();
  if (normalized.includes("error") || normalized.includes("warn") || normalized.includes("주의")) return "warning" as const;
  if (normalized.includes("ready") || normalized.includes("ok") || normalized.includes("정상")) return "ready" as const;
  return "info" as const;
}

function toGenericReviewItem(
  branch: AppBranch,
  action: AppReservationAction,
  startDate: string,
  endDate: string,
): ShellReviewItem {
  const prefix = getAppBranchOption(branch).label;
  return {
    id: `${action}-waiting`,
    title: `${prefix} / ${RESERVATION_ACTION_LABELS[action]} 대기`,
    subtitle: `${startDate} ~ ${endDate} 실제 실행 결과가 아직 없습니다.`,
    status: "info",
  };
}

export function deriveReservationActionAvailability(
  reads: Record<AppReadSource, AppLiveReadSnapshot>,
  branch: AppBranch,
): ReservationActionAvailability {
  const branchOption = getAppBranchOption(branch);
  if (branchOption.availability !== "active") {
    const reason = `${branchOption.label} 지점은 아직 운영 경로가 열리지 않았습니다.`;
    return {
      compare: { enabled: false, reason },
      validate: { enabled: false, reason },
      reconcile: { enabled: false, reason },
      edit: { enabled: false, reason },
      apply: { enabled: false, reason },
      "order-list": { enabled: false, reason },
      arrival: { enabled: false, reason },
    };
  }
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
  result: AppReservationActionSnapshot | null,
  startDate: string,
  endDate: string,
): ShellReviewItem[] {
  const doneSources = Object.values(reads).filter((row) => row.status === "done").length;
  if (result?.action === action && result.rows.length > 0) {
    return result.rows.slice(0, 8).map((row) => ({
      id: row.id,
      title: row.primary,
      subtitle: row.secondary || row.detail || "세부 정보 없음",
      status: toReviewStatus(row.statusLabel),
    }));
  }
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
  return [toGenericReviewItem(branch, action, startDate, endDate)];
}

export function buildActionSteps(action: AppReservationAction, branch: AppBranch): string[] {
  const prefix = getAppBranchOption(branch).label;
  if (action === "compare") return [`${prefix} 기준 선택`, "조회 결과 정렬", "차이 항목 추출"];
  if (action === "validate") return ["기준 소스 확인", "예약 묶음 검증", "이상 후보 정리"];
  if (action === "reconcile") return ["대조 소스 선택", "불일치 검토", "대조 결과 저장"];
  if (action === "edit") return ["수정 대상 선택", "권장값 확인", "수정 내용 정리"];
  if (action === "apply") return ["적용 대상 확정", "최종 확인", "승인 경계 확인"];
  if (action === "order-list") return ["오늘 대상 추출", "배정/메모 반영", "오더리스트 정리"];
  return ["도착 대상 추출", "입실 준비 확인", "어라이벌 결과 정리"];
}

export function buildResultSummary(action: AppReservationAction, result: AppReservationActionSnapshot | null): string {
  if (result?.action === action) return result.summary;
  return `${RESERVATION_ACTION_LABELS[action]} 실행 전입니다. 실제 결과만 표시합니다.`;
}

export function buildPreviewItems(read: AppLiveReadSnapshot | null, branch: AppBranch): AppLiveReadPreviewItem[] {
  if (read && read.items.length > 0) return read.items;
  const prefix = getAppBranchOption(branch).label;
  return [
    { id: "preview-wait-1", title: `${prefix} 미리보기`, subtitle: "조회 후 실제 항목이 표시됩니다.", statusLabel: "WAIT" },
  ];
}

export function buildActionOutputRows(
  action: AppReservationAction,
  branch: AppBranch,
  startDate: string,
  endDate: string,
  result: AppReservationActionSnapshot | null,
): ActionOutputRow[] {
  if (result?.action === action && result.rows.length > 0) return result.rows;
  const prefix = getAppBranchOption(branch).label;
  return [
    {
      id: `${action}-waiting`,
      primary: `${prefix} ${RESERVATION_ACTION_LABELS[action]} 실행 대기`,
      secondary: `${startDate} ~ ${endDate}`,
      statusLabel: "WAIT",
      detail: "가공된 예시 행 대신 실제 실행 결과만 표시합니다.",
    },
  ];
}
