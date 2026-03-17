import type { WorkspaceSearchIndexInput } from "../contracts/index.js";
import type { WorkspaceMockState } from "../renderer/types";

const MAX_LINE_DOCS = 80;
const MAX_ARTIFACT_LINE_DOCS = 120;

function sliceBoundedLines(lines: string[], limit: number) {
  return Array.isArray(lines) ? lines.slice(0, limit) : [];
}

export function buildWorkspaceSearchIndexInput(state: WorkspaceMockState): WorkspaceSearchIndexInput | null {
  const runId = String(state.sheetRead?.selectedRunId || "").trim();
  if (!runId) return null;

  return {
    runId,
    branch: state.selectedBranch,
    inventoryRows: (state.inventoryCompare?.rows || []).map((row) => ({
      id: row.id,
      date: row.date,
      roomType: row.roomType,
      channel: row.channel,
      siteRaw: row.siteRaw,
      sheetRaw: row.sheetRaw,
      reason: row.reason,
      action: row.action
    })),
    reservationRows: (state.reservationAudit?.rows || []).map((row) => ({
      id: row.id,
      reservationNo: row.reservationNo,
      guestName: row.guestName,
      channel: row.channel,
      checkin: row.checkin,
      checkout: row.checkout,
      status: row.status,
      auditStatus: row.auditStatus,
      reason: row.reason,
      action: row.action
    })),
    evidenceLines: sliceBoundedLines(state.evidenceLines || [], MAX_LINE_DOCS),
    opsLines: sliceBoundedLines(state.opsLines || [], MAX_LINE_DOCS),
    validationLines: sliceBoundedLines(state.validationLines || [], MAX_LINE_DOCS),
    logs: sliceBoundedLines(state.logs || [], MAX_LINE_DOCS),
    mappingArtifacts: Array.isArray(state.sheetRead?.mappingArtifacts) ? state.sheetRead.mappingArtifacts : [],
    artifactLines: sliceBoundedLines(state.sheetRead?.visibleSlice?.lines || [], MAX_ARTIFACT_LINE_DOCS)
  };
}
