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
  assert.doesNotMatch(contracts, /export interface AppBgeM3Settings \{[^}]*modelId: string/);
  assert.match(contracts, /startDate/);
  assert.match(contracts, /endDate/);
  assert.doesNotMatch(contracts, /sheetTabs/);
  assert.match(contracts, /excludeRoomMakeup/);
  assert.match(appSource, /오늘부터 \{DEFAULT_APP_REPORT_WINDOW_DAYS\}일|DEFAULT_APP_REPORT_WINDOW_DAYS/);
  assert.match(appSource, /조회 기간/);
  assert.match(appSource, /BGE-M3 로컬 모델 폴더 경로/);
  assert.match(appSource, /BGE-M3 설치에 실패했습니다.|BGE-M3/);
  assert.match(appSource, /하이브리드 검색이/);
  assert.match(appSource, /오더리스트/);
  assert.match(appSource, /어라이벌/);
  assert.match(appSource, /룸메이크업 제외/);
  assert.match(appSource, /창 열기/);
  assert.match(appSource, /연결 새로고침/);
  assert.match(appSource, /직접 입력 필요/);
  assert.match(appSource, /운영 선택값/);
  assert.match(appSource, /예약 시트 주소/);
  assert.match(appSource, /예약 시트 탭 이름/);
  assert.doesNotMatch(appSource, /지점별 예약 시트 탭 이름/);
  assert.match(appSource, /BGE-M3 로컬 모델 폴더 경로/);
  assert.match(appSource, /WINGS 로그인 아이디/);
  assert.match(appSource, /WINGS 로그인 비밀번호/);
  assert.doesNotMatch(appSource, /사용자명/);
  assert.doesNotMatch(appSource, /운영 세션 준비/);
  assert.doesNotMatch(appSource, /셸로 이동/);
  assert.doesNotMatch(appSource, /WINGS 계정으로 시작/);
  assert.doesNotMatch(appSource, /로그인 화면으로/);
  assert.doesNotMatch(appSource, /직접 로그인 폼은 실제 인증과 연결되어 있지 않습니다/);

  assert.match(settingsStore, /hasAnySettings/);
  assert.doesNotMatch(settingsStore, /sheetTabs/);
  assert.match(settingsStore, /opsView/);
  assert.doesNotMatch(settingsStore, /DEFAULT_APP_BGE_MODEL_ID/);
  assert.doesNotMatch(settingsStore, /operatorName/);
  assert.doesNotMatch(settingsStore, /normalizeText\(bge\.modelId\)|modelId:/);
  assert.match(ipc, /parseDateInput/);
  assert.match(ipc, /desktop-app:run-reservation-action/);
  assert.match(ipc, /desktop-app:install-bge-m3-model/);
  assert.match(ipc, /excludeRoomMakeup/);
  assert.doesNotMatch(ipc, /sheetTabs/);
  assert.doesNotMatch(ipc, /payload\.bgeM3[\s\S]*modelId:/);
  assert.match(runner, /embeddingRuntime/);
  assert.match(runner, /excludeRoomMakeup/);
  assert.match(runner, /recommend-edit|abstain|confirm|review/);
  assert.match(liveRead, /app_v2_live_sheet_bridge.py/);
  assert.doesNotMatch(liveRead, /sheetTabs/);
  assert.doesNotMatch(runner, /sheetTabs/);

  console.log("regression_app_v2_phase2_contract: OK");
}

main();
