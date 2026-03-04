(() => {
  "use strict";

  const root = globalThis;
  const App = (root.App = root.App || {});
  App.report = App.report || {};
  const ns = (App.report.opsWorkflowBridge = App.report.opsWorkflowBridge || {});
  const normalizeText =
    App.scan?.normalize?.normalizeText ||
    ((value) => String(value ?? "").replace(/\s+/g, " ").trim());

  const WORKFLOWS = Object.freeze({
    reservationManagement: "reservation-management",
    opsArtifacts: "ops-artifacts",
  });

  const ENTRYPOINTS = Object.freeze({
    reservationManagement: "analyze",
    opsArtifacts: "ops-artifacts",
  });

  function normalizeWorkflowId(value) {
    const text = normalizeText(value).toLowerCase();
    if (!text) return WORKFLOWS.reservationManagement;
    if (
      text === WORKFLOWS.opsArtifacts ||
      text === "ops" ||
      text === "orderlist" ||
      text === "arrival"
    ) {
      return WORKFLOWS.opsArtifacts;
    }
    return WORKFLOWS.reservationManagement;
  }

  function buildReservationManagementSpec(config = {}) {
    return {
      workflowId: WORKFLOWS.reservationManagement,
      entrypoint: ENTRYPOINTS.reservationManagement,
      args: {
        spreadsheet: normalizeText(config.spreadsheet || ""),
        sheetName: normalizeText(config.sheetName || ""),
        gid: Number.isInteger(config.gid) ? config.gid : null,
        startRow: Number.isInteger(config.startRow) ? config.startRow : 1,
        year: Number.isInteger(config.year) ? config.year : null,
        reportDate: normalizeText(config.reportDate || ""),
        reportStartDate: normalizeText(config.reportStartDate || ""),
        reportEndDate: normalizeText(config.reportEndDate || ""),
        outDir: normalizeText(config.outDir || "output"),
        opsSheetSpreadsheet: normalizeText(config.opsSheetSpreadsheet || ""),
      },
      outputs: [
        "reservation_blocks.csv",
        "summary.json",
        "orderlist_report.tsv",
        "arrival_report.tsv",
        "ops_sheet_packets.json",
      ],
    };
  }

  function buildOpsArtifactsSpec(config = {}) {
    return {
      workflowId: WORKFLOWS.opsArtifacts,
      entrypoint: ENTRYPOINTS.opsArtifacts,
      args: {
        blocksCsv: normalizeText(config.blocksCsv || ""),
        spreadsheet: normalizeText(config.spreadsheet || ""),
        sheetName: normalizeText(config.sheetName || ""),
        gid: Number.isInteger(config.gid) ? config.gid : null,
        startRow: Number.isInteger(config.startRow) ? config.startRow : 1,
        year: Number.isInteger(config.year) ? config.year : null,
        reportDate: normalizeText(config.reportDate || ""),
        reportStartDate: normalizeText(config.reportStartDate || ""),
        reportEndDate: normalizeText(config.reportEndDate || ""),
        outDir: normalizeText(config.outDir || "output_ops"),
        opsSheetSpreadsheet: normalizeText(config.opsSheetSpreadsheet || ""),
      },
      outputs: [
        "ops_summary.json",
        "orderlist_report.tsv",
        "arrival_report.tsv",
        "orderlist_ops_*.tsv",
        "arrival_ops_*.json",
        "ops_sheet_packets.json",
      ],
    };
  }

  function resolveWorkflowSpec(workflowId, config = {}) {
    const normalized = normalizeWorkflowId(workflowId);
    if (normalized === WORKFLOWS.opsArtifacts) {
      return buildOpsArtifactsSpec(config);
    }
    return buildReservationManagementSpec(config);
  }

  ns.WORKFLOWS = WORKFLOWS;
  ns.ENTRYPOINTS = ENTRYPOINTS;
  ns.normalizeWorkflowId = normalizeWorkflowId;
  ns.buildReservationManagementSpec = buildReservationManagementSpec;
  ns.buildOpsArtifactsSpec = buildOpsArtifactsSpec;
  ns.resolveWorkflowSpec = resolveWorkflowSpec;
})();
