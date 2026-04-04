import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function read(root, relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function main() {
  const root = process.cwd();
  const appSource = read(root, "app_v2/renderer/App.tsx");
  const cssSource = read(root, "app_v2/renderer/styles/app.css");

  assert.match(appSource, /검토 작업/);
  assert.match(appSource, /수정 정리/);
  assert.match(appSource, /적용 전 확인/);
  assert.match(appSource, /읽은 데이터를 비교하고 확인합니다/);
  assert.match(appSource, /실제 쓰기 없이 적용 가능 상태만 확인합니다/);
  assert.match(cssSource, /\.ia-group-stack/);
  assert.match(cssSource, /\.ia-group-card/);
  assert.match(cssSource, /\.ia-action-button/);

  console.log("regression_app_v2_ui_ia_contract: OK");
}

main();
