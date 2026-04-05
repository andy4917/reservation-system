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
  const appCss = read(root, "app_v2/renderer/styles/app.css");
  const contracts = read(root, "src/desktop/app-v2-contracts.ts");
  const liveRead = read(root, "app_v2/main/liveReadActions.ts");
  const reservationRunner = read(root, "app_v2/main/reservationActionRunner.ts");
  const runtimeVerification = read(root, "app_v2/main/runtimeVerificationProcess.ts");

  assert.match(contracts, /export type AppReadinessBlockingSource/);
  assert.match(contracts, /\"runtime-error\"/);
  assert.match(contracts, /export type AppLiveReadStatus/);
  assert.match(contracts, /export type AppPreflightStatus/);
  assert.match(contracts, /blockingSources/);

  assert.match(appSource, /실패|실패했습니다|오류|오류/);
  assert.match(appSource, /설정 오류|연결 새로고침|연결 상태/);
  assert.match(appSource, /buildErrorWorkbenchIssues\(sheetReservationBlocks/);
  assert.match(appCss, /read-badges span\[data-status="error"\]/);

  assert.match(liveRead, /buildError\("pms"/);
  assert.match(liveRead, /buildError\("ota"/);
  assert.match(liveRead, /buildError\("sheet"/);
  assert.match(liveRead, /PMS 라이브 조회에 실패했습니다\./);
  assert.match(liveRead, /OTA 라이브 조회에 실패했습니다\./);
  assert.match(liveRead, /예약 시트 라이브 조회에 실패했습니다\./);

  assert.match(reservationRunner, /-error/);
  assert.match(reservationRunner, /\"ERROR\"/);
  assert.match(reservationRunner, /runtime-error/);
  assert.match(reservationRunner, /buildErrorRows/);
  assert.match(reservationRunner, /engineStatus: \"pending-source\"|engineStatus/);

  assert.match(runtimeVerification, /blockingSources: \["runtime-error"\]/);
  assert.match(runtimeVerification, /supportLevel: \"offline-preview\"/);
  assert.match(runtimeVerification, /Runtime verification failed with an unexpected exception\./);

  console.log("regression_app_v2_error_management_contract: OK");
}

main();
