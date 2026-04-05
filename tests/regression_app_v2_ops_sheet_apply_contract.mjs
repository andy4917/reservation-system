import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function read(root, relativePath) {
  const filePath = path.join(root, relativePath);
  assert.equal(fs.existsSync(filePath), true, `${relativePath} should exist`);
  return fs.readFileSync(filePath, "utf8");
}

function main() {
  const root = process.cwd();
  const contracts = read(root, "src/desktop/app-v2-contracts.ts");
  const preload = read(root, "app_v2/main/preload.ts");
  const ipc = read(root, "app_v2/main/ipc.ts");
  const runner = read(root, "app_v2/main/opsSheetApplyRunner.ts");
  const appSource = read(root, "app_v2/renderer/App.tsx");

  assert.match(contracts, /AppOpsSheetApplyInput/);
  assert.match(contracts, /AppOpsSheetApplySnapshot/);
  assert.match(contracts, /applyOpsSheetOutput/);
  assert.match(preload, /applyOpsSheetOutput/);
  assert.match(ipc, /desktop-app:apply-ops-sheet-output/);
  assert.match(runner, /applyOpsSheetOutput/);
  assert.match(appSource, /시트 적용/);
  assert.doesNotMatch(appSource, /reportDate:\s*activeOpsDate/);

  const applyScript = read(root, "scripts/app_v2_apply_ops_sheet.py");
  assert.match(applyScript, /기간 전체/);
  assert.match(applyScript, /applied_packets = \[apply_arrival_packet/);

  console.log("regression_app_v2_ops_sheet_apply_contract: OK");
}

main();
