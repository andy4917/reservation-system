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
  const css = read(root, "app_v2/renderer/styles/app.css");
  const logo = read(root, "app_v2/renderer/assets/uh-suite-logo.svg");

  assert.match(appSource, /UH 작업관리자/);
  assert.match(appSource, /보조 작업/);
  assert.match(appSource, /재고 관리/);
  assert.match(appSource, /오류 관리/);
  assert.match(appSource, /오더리스트/);
  assert.match(appSource, /어라이벌/);
  assert.doesNotMatch(appSource, /Dashboard/);
  assert.match(appSource, /platformColorMap|channelColorMap/);
  assert.match(appSource, /아고다|부킹닷컴|트립닷컴|익스피디아|에어비앤비|네이버|야놀자|여기어때|쿠팡트래블|스테이션|디다트레블/);

  assert.match(css, /\.sidebar-brand/);
  assert.match(css, /\.room-block\[data-channel=/);
  assert.match(logo, /UH SUITE/);

  console.log("regression_app_v2_sidebar_branding_contract: OK");
}

main();
