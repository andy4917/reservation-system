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
  const settingsStore = read(root, "app_v2/main/settingsStore.ts");
  const ipc = read(root, "app_v2/main/ipc.ts");
  const runner = read(root, "app_v2/main/reservationActionRunner.ts");
  const liveRead = read(root, "app_v2/main/liveReadActions.ts");

  assert.match(contracts, /reportWindowDays/);
  assert.match(contracts, /modelPath/);
  assert.match(contracts, /runtime/);
  assert.match(contracts, /startDate/);
  assert.match(contracts, /endDate/);
  assert.match(contracts, /sheetTabs/);
  assert.match(contracts, /excludeRoomMakeup/);
  assert.match(appSource, /branchSelectionOpen/);

  assert.match(appSource, /오늘부터 5일/);
  assert.match(appSource, /조회 기간/);
  assert.match(appSource, /모델 경로/);
  assert.match(appSource, /로컬 모델 준비/);
  assert.match(appSource, /BGE-M3 설치/);
  assert.match(appSource, /오더리스트/);
  assert.match(appSource, /어라이벌/);
  assert.match(appSource, /로그인 화면으로/);
  assert.match(appSource, /지점 선택으로 돌아가기/);
  assert.match(appSource, /룸메이크업 제외/);
  assert.match(appSource, /코엑스2/);

  assert.match(settingsStore, /hasAnySettings/);
  assert.match(settingsStore, /sheetTabs/);
  assert.match(settingsStore, /opsView/);
  assert.match(settingsStore, /Xenova\/bge-m3/);
  assert.match(ipc, /parseDateInput/);
  assert.match(ipc, /desktop-app:run-reservation-action/);
  assert.match(ipc, /desktop-app:install-bge-m3-model/);
  assert.match(ipc, /excludeRoomMakeup/);
  assert.match(runner, /embeddingRuntime/);
  assert.match(runner, /excludeRoomMakeup/);
  assert.match(liveRead, /app_v2_live_sheet_bridge.py/);

  console.log("regression_app_v2_phase2_contract: OK");
}

main();
