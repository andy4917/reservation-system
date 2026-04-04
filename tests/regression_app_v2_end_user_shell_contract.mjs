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
  const appHtml = read(root, "app_v2/renderer/index.html");
  const appCss = read(root, "app_v2/renderer/styles/app.css");
  const contracts = read(root, "src/desktop/app-v2-contracts.ts");
  const preload = read(root, "app_v2/main/preload.ts");
  const ipc = read(root, "app_v2/main/ipc.ts");

  assert.match(contracts, /export type AppShellModule/);
  assert.match(contracts, /export type AppReservationAction/);
  assert.match(contracts, /export type AppBranch/);

  assert.match(appSource, /설정/);
  assert.match(appSource, /직접 입력 필요/);
  assert.match(appSource, /운영 선택값/);
  assert.match(appSource, /창 열기/);
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
  assert.match(appSource, /BGE-M3/);
  assert.match(appSource, /COEX|GANGNAM/);
  assert.doesNotMatch(appSource, /mockShellData/);
  assert.doesNotMatch(appSource, /setTimeout\(/);
  assert.match(appSource, /WINGS 공용 계정 가져오기/);
  assert.match(appSource, /가져온 지점 공용 계정을 사용합니다/);
  assert.match(appSource, /객실 상세/);
  assert.match(appSource, /전역 설정/);
  assert.match(appSource, /윙스 PMS/);
  assert.match(appSource, /스테이션 OTA/);
  assert.doesNotMatch(appSource, /\bBranch\b|\bStart\b|\bRoom Detail\b|\bGlobal Configuration\b|\bSettings\b/);
  assert.doesNotMatch(appSource, /WINGS 로그인 아이디/);
  assert.doesNotMatch(appSource, /WINGS 로그인 비밀번호/);
  assert.doesNotMatch(appSource, /로그인 화면으로/);
  assert.doesNotMatch(appSource, /로그인에 성공했습니다\. PMS 조회에 같은 자격을 사용합니다\./);
  assert.match(appHtml, /UH 예약 운영 패널/);
  assert.doesNotMatch(appHtml, /AppV2 Control Panel/);
  assert.match(appCss, /Malgun Gothic/);

  assert.match(preload, /runPmsRead/);
  assert.match(preload, /runOtaRead/);
  assert.match(preload, /runSheetRead/);
  assert.match(preload, /installBgeM3Model/);
  assert.match(preload, /importWingsSharedCredentials/);
  assert.match(ipc, /desktop-app:run-pms-read/);
  assert.match(ipc, /desktop-app:run-ota-read/);
  assert.match(ipc, /desktop-app:run-sheet-read/);
  assert.match(ipc, /desktop-app:install-bge-m3-model/);
  assert.match(ipc, /desktop-app:import-wings-shared-credentials/);

  console.log("regression_app_v2_end_user_shell_contract: OK");
}

main();
