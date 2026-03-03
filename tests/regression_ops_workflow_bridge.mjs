import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

function loadScript(filePath) {
  const code = fs.readFileSync(filePath, "utf8");
  vm.runInThisContext(code, { filename: filePath });
}

function main() {
  const root = process.cwd();
  globalThis.App = {};
  [
    "src/constants.js",
    "src/scan/normalize.js",
    "src/report/opsWorkflowBridge.js",
  ].map((p) => path.join(root, p)).forEach(loadScript);

  const bridge = globalThis.App?.report?.opsWorkflowBridge;
  assert.ok(bridge, "App.report.opsWorkflowBridge is required");

  assert.equal(bridge.normalizeWorkflowId("orderlist"), bridge.WORKFLOWS.opsArtifacts);
  assert.equal(bridge.normalizeWorkflowId("arrival"), bridge.WORKFLOWS.opsArtifacts);
  assert.equal(
    bridge.normalizeWorkflowId("reservation-management"),
    bridge.WORKFLOWS.reservationManagement
  );

  const analyzeSpec = bridge.resolveWorkflowSpec("reservation-management", {
    spreadsheet: "sheet-id",
    sheetName: "2026",
    reportDate: "2026-03-05",
  });
  assert.equal(analyzeSpec.entrypoint, "analyze");
  assert.equal(analyzeSpec.args.reportDate, "2026-03-05");

  const opsSpec = bridge.resolveWorkflowSpec("ops", {
    blocksCsv: "output/reservation_blocks.csv",
    outDir: "output_ops",
  });
  assert.equal(opsSpec.entrypoint, "ops-artifacts");
  assert.equal(opsSpec.args.blocksCsv, "output/reservation_blocks.csv");
  assert.match(opsSpec.outputs.join(","), /ops_sheet_packets\.json/);

  console.log("regression_ops_workflow_bridge: OK");
}

main();
