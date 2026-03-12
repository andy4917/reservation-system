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
  const sheetSupport = state.sheetRead.supportLevel;

  return [
    {
      id: "sheet-sync",
      title: "Sheet Snapshot",
      status: sheetSupport === "read-live" ? "running" : sheetSupport === "partial-live" ? "ready" : "blocked",
      detail:
        sheetSupport === "read-live"
          ? "sheet snapshot available"
          : sheetSupport === "partial-live"
            ? "sheet runtime configured"
            : "sheet snapshot unavailable"
    },
    {
      id: "provider-read",
      title: "Provider Read",
      status:
        inventorySupport === "read-live" ? (hasRows ? "running" : "ready") : inventorySupport === "partial-live" ? "blocked" : "blocked",
      detail:
        inventorySupport === "read-live"
          ? "provider rows available"
          : inventorySupport === "partial-live"
            ? "provider rows partially available"
            : "provider rows unavailable"
    },
    {
      id: "reservation-audit",
      title: "Reservation Audit",
      status: auditSupport === "read-live" || auditSupport === "partial-live" ? "ready" : "blocked",
      detail:
        auditSupport === "read-live"
          ? "reservation rows available"
          : auditSupport === "partial-live"
            ? "reservation rows partially available"
            : "reservation rows unavailable"
    },
    {
      id: "apply-review",
      title: "Apply Review",
      status: hasMismatch ? "blocked" : "ready",
      detail: hasMismatch ? "mismatch가 남아 차단됨" : "검토 준비 가능"
    }
  ];
}
