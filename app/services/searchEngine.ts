import type { WorkspaceSearchIndexInput } from "../contracts/index.js";
import type { WorkspaceMockState } from "../renderer/types";

const MAX_LINE_DOCS = 80;
const MAX_ARTIFACT_LINE_DOCS = 120;

function sliceBoundedLines(lines: string[], limit: number) {
  return Array.isArray(lines) ? lines.slice(0, limit) : [];
}

function normalizeSearchTask(task: WorkspaceMockState["activeTask"]) {
  if (task === "reservation-audit" || task === "settings") return task;
  return "inventory-compare";
}

export function buildWorkspaceSearchIndexInput(state: WorkspaceMockState): WorkspaceSearchIndexInput | null {
  const runId = String(state.sheetRead?.selectedRunId || "").trim();
  if (!runId) return null;

  return {
    runId,
    branch: state.selectedBranch,
    activeTask: normalizeSearchTask(state.activeTask),
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
    artifactLines: sliceBoundedLines(state.sheetRead?.visibleSlice?.lines || [], MAX_ARTIFACT_LINE_DOCS),
    sheetSource: String(state.sheetRead?.sourceLabel || "").trim(),
    sheetError: String(state.sheetRead?.summary?.failureDetail || "").trim(),
    sheetSummary: state.sheetRead?.summary || null,
    savedDecisions: Array.isArray(state.termBindings)
      ? state.termBindings
          .filter((binding) => binding.method === "manual" && binding.decisionKey)
          .map((binding) => ({
            decisionKey: String(binding.decisionKey || ""),
            branch: state.selectedBranch,
            sheetRef: {
              spreadsheetId: String(state.sheetRead?.summary?.spreadsheetId || ""),
              sheetName: String(state.sheetRead?.summary?.sheetName || ""),
              sheetId: null,
              timezone: "Asia/Seoul"
            },
            sectionKey:
              Array.isArray(state.sheetRead?.mappingArtifacts)
                ? state.sheetRead.mappingArtifacts.find((artifact) =>
                    artifact.bindings.some((item) => item.decisionKey === binding.decisionKey)
                  )?.section.sectionKey || null
                : null,
            anchorId: binding.anchorId,
            rawHeader: String(binding.rawHeader || ""),
            termId: binding.termId,
            method: "manual" as const,
            decidedAt: binding.decidedAt,
            confidence: binding.confidence
          }))
      : [],
    recommendationTraces: Array.isArray(state.recommendationTraces) ? state.recommendationTraces : []
  };
}
