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
  const appSource = read(root, "app_v2/renderer/App.tsx");
  const styles = read(root, "app_v2/renderer/styles/app.css");

  assert.match(appSource, /const isSingleArrivalBoard =/);
  assert.match(appSource, /single-arrival-board/);
  assert.match(appSource, /arrival-summary-strip/);
  assert.match(appSource, /특이사항 \(C\.O\)/);
  assert.match(appSource, /특이사항 \(C\.I\)/);

  assert.match(styles, /\.single-arrival-board/);
  assert.match(styles, /\.single-arrival-grid/);
  assert.match(styles, /\.arrival-summary-strip/);
  assert.match(styles, /\.arrival-notes-grid/);

  console.log("regression_app_v2_arrival_single_board_contract: OK");
}

main();
