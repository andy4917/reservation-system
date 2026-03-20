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
  const appSource = read(root, "app_v2/renderer/App.tsx");

  assert.match(bridgeScript, /reviewCandidates/);
  assert.match(liveRead, /scoreSheetReviewCandidates/);
  assert.match(liveRead, /embedding:/);
  assert.match(liveRead, /review candidate|검토 후보|추천 후보/i);

  assert.match(runner, /buildOpsAiReviewRows/);
  assert.match(runner, /order-list/);
  assert.match(runner, /arrival/);
  assert.match(runner, /embedding:/);

  assert.match(appSource, /추천 후보|검토 후보/);
  assert.match(appSource, /BGE-M3 보조/);

  console.log("regression_app_v2_bge_readonly_expansion: OK");
}

main();
