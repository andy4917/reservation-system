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
  const bridgeScript = read(root, "scripts/app_v2_live_sheet_bridge.py");
  const liveRead = read(root, "app_v2/main/liveReadActions.ts");
  const runner = read(root, "app_v2/main/reservationActionRunner.ts");

  assert.match(bridgeScript, /sheet-read/);
  assert.match(bridgeScript, /ops-preview/);
  assert.match(bridgeScript, /exclude-room-makeup/);
  assert.match(bridgeScript, /continuationCandidates|continuation_candidate/);
  assert.match(bridgeScript, /searchBundles/);
  assert.match(bridgeScript, /candidateFeatures|contradictionFlags/);
  assert.match(bridgeScript, /window_blocks = \[block for block in payload\["blocks"\] if overlaps_window\(block, start_date, end_date\)\]/);
  assert.match(bridgeScript, /"searchBundles": build_search_bundles\(window_blocks\)/);

  assert.match(liveRead, /sheetTabs/);
  assert.match(liveRead, /runLiveSheetBridge/);
  assert.match(runner, /runLiveOpsPreview/);

  console.log("regression_app_v2_live_bridge_contract: OK");
}

main();
