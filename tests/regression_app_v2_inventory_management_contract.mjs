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
  const liveBridge = read(root, "scripts/app_v2_live_sheet_bridge.py");
  const managementBridge = read(root, "scripts/app_v2_reservation_management_bridge.py");
  const actionRunner = read(root, "app_v2/main/reservationActionRunner.ts");

  assert.match(contracts, /export interface AppReservationActionSnapshot/);
  assert.match(contracts, /applyAllowed\?: boolean;/);
  assert.match(contracts, /requiresApproval\?: boolean;/);
  assert.match(contracts, /planToken\?: string \| null;/);

  assert.match(appSource, /재고표 모드 선택/);
  assert.match(appSource, /inventory|재고표 모드/);
  assert.match(appSource, /OTA 재고표 모드|시트 재고표 모드/);
  assert.match(appSource, /OTA 원본 복사|재고표 복사/);
  assert.match(appSource, /예약 시트 재고 작업대/);
  assert.match(appSource, /동기화|수정 모드|OTA WRITE/);
  assert.match(appSource, /조회 기간이 바뀌어 이전 작업 결과를 정리했습니다/);
  assert.match(appSource, /NAVER|STATION/);
  assert.match(appSource, /표시는 화면 전환용이며, 실제 동기화와 WRITE 범위는 설정된 조회 기간 전체 기준으로 처리합니다/);
  assert.match(appSource, /WRITE 가능|자동 마감|조회한 시점의 예약 시트 스냅샷/);
  assert.match(appSource, /apply/);

  assert.match(actionRunner, /engineStatus: "planned"|engineStatus/);
  assert.match(actionRunner, /buildErrorRows/);
  assert.match(actionRunner, /applyAllowed/);
  assert.match(actionRunner, /requiresApproval/);

  assert.match(liveBridge, /"statusLabel":/);
  assert.match(liveBridge, /\"roomChangeBlocker\":/);
  assert.match(liveBridge, /\"packageMarkers\":/);
  assert.match(liveBridge, /"noteHead"/);

  assert.match(managementBridge, /build_patch_rows/);
  assert.match(managementBridge, /\"DRYRUN\"/);
  assert.match(managementBridge, /반영 dry-run 계획/);

  console.log("regression_app_v2_inventory_management_contract: OK");
}

main();
