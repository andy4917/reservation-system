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
  const contracts = read(root, "src/desktop/app-v2-contracts.ts");
  const runner = read(root, "app_v2/main/reservationActionRunner.ts");
  const appSource = read(root, "app_v2/renderer/App.tsx");
  const shellState = read(root, "app_v2/renderer/shellState.ts");

  assert.doesNotMatch(contracts, /\bmock\b/);
  assert.doesNotMatch(runner, /\bmock\b/);
  assert.doesNotMatch(runner, /buildMockRows/);
  assert.match(contracts, /planToken/);
  assert.match(contracts, /requiresApproval/);
  assert.match(contracts, /applyAllowed/);
  assert.match(runner, /app_v2_reservation_management_bridge\.py/);
  assert.match(runner, /app_v2_ota_apply_bridge\.py/);
  assert.match(runner, /engineStatus/);
  assert.match(runner, /planToken/);
  assert.doesNotMatch(appSource, /plan token/i);
  assert.match(appSource, /예약 시트 재고 작업대/);
  assert.match(appSource, /OTA WRITE/);
  assert.match(appSource, /WRITE 가능|동기화/);
  assert.match(shellState, /실제 결과만 표시합니다/);

  console.log("regression_app_v2_management_engine_contract: OK");
}

main();
