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

  assert.match(appSource, /Global Configuration/);
  assert.match(appSource, /직접 입력 필요/);
  assert.match(appSource, /운영 선택값/);
  assert.match(appSource, /BGE-M3 로컬 모델 폴더 경로/);
  assert.match(appSource, /BGE-M3 사용 여부/);
  assert.match(appSource, /변경 취소/);
  assert.match(appSource, /설정 적용/);
  assert.doesNotMatch(appSource, /운영 구조값/);
  assert.doesNotMatch(appSource, /지점 탭 매핑/);
  assert.doesNotMatch(appSource, /Operator Name/);
  assert.doesNotMatch(appSource, /BGE-M3 Model ID/);
  assert.doesNotMatch(appSource, /Use BGE-M3/);
  assert.doesNotMatch(appSource, /preopen 상태로 유지/);

  assert.match(styles, /\.settings-shell/);
  assert.match(styles, /\.settings-side-nav/);
  assert.match(styles, /\.settings-floating-bar/);

  console.log("regression_app_v2_settings_reference_contract: OK");
}

main();
