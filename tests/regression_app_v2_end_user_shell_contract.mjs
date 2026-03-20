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
  const contracts = read(root, "src/desktop/app-v2-contracts.ts");
  const preload = read(root, "app_v2/main/preload.ts");
  const ipc = read(root, "app_v2/main/ipc.ts");

  assert.match(contracts, /export type AppShellModule/);
  assert.match(contracts, /export type AppReservationAction/);
  assert.match(contracts, /export type AppBranch/);

  assert.match(appSource, /WINGS 계정으로 시작|WINGS 로그인/);
  assert.match(appSource, /PMS 조회/);
  assert.match(appSource, /OTA 조회/);
  assert.match(appSource, /예약 시트 조회/);
  assert.match(appSource, /예약 관리/);
  assert.match(appSource, /비교/);
  assert.match(appSource, /검증/);
  assert.match(appSource, /대조/);
  assert.match(appSource, /수정/);
  assert.match(appSource, /반영/);
  assert.match(appSource, /오더리스트/);
  assert.match(appSource, /어라이벌/);
  assert.match(appSource, /0000/);
  assert.match(appSource, /BGE-M3/);
  assert.match(appSource, /COEX|GANGNAM/);

  assert.match(preload, /runPmsRead/);
  assert.match(preload, /runOtaRead/);
  assert.match(preload, /runSheetRead/);
  assert.match(ipc, /desktop-app:run-pms-read/);
  assert.match(ipc, /desktop-app:run-ota-read/);
  assert.match(ipc, /desktop-app:run-sheet-read/);

  console.log("regression_app_v2_end_user_shell_contract: OK");
}

main();
