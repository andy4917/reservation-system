import type { WorkspaceMockState } from "../renderer/types";

export interface JobStatusCard {
  id: string;
  title: string;
  status: "idle" | "running" | "blocked" | "ready";
  detail: string;
}

export function buildJobStatusCards(state: WorkspaceMockState): JobStatusCard[] {
  const bridgeReady = state.bridgeStatus.sessionAvailable;
  const hasRows = state.inventoryCompare.rows.length > 0;
  const hasMismatch = state.inventoryCompare.mismatchCount > 0;
  const inventorySupport = state.inventoryCompare.supportLevel;
  const auditSupport = state.reservationAudit.supportLevel;

  return [
    {
      id: "sheet-sync",
      title: "Sheet Snapshot",
      status: "ready",
      detail: "앱 소유 조회/스캔 경로 사용"
    },
    {
      id: "provider-read",
      title: "Provider Read",
      status:
        inventorySupport === "read-live" ? (hasRows ? "running" : "ready") : inventorySupport === "partial-live" ? "blocked" : "blocked",
      detail:
        inventorySupport === "read-live"
          ? "확장 세션 기반 provider rows 사용 가능"
          : inventorySupport === "partial-live"
            ? "live context는 있으나 provider rows가 부족해 부분 live 상태"
            : state.bridgeStatus.recoveryAction || "확장 세션 heartbeat 필요"
    },
    {
      id: "reservation-audit",
      title: "Reservation Audit",
      status: auditSupport === "read-live" || auditSupport === "partial-live" ? "ready" : "blocked",
      detail:
        auditSupport === "read-live"
          ? "reservation rows까지 live 연동됨"
          : auditSupport === "partial-live"
            ? "auth/info summary만 live, reservation rows는 fallback"
            : state.bridgeStatus.code === "UPSTREAM_AUTH_EXPIRED"
              ? "재인증 전까지 read-only 유지"
              : "auth capture 준비 필요"
    },
    {
      id: "apply-review",
      title: "Apply Review",
      status: hasMismatch ? "blocked" : "ready",
      detail: hasMismatch ? "mismatch가 남아 차단됨" : "검토 준비 가능"
    }
  ];
}
