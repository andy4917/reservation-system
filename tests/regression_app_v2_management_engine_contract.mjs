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
  assert.match(appSource, /실제 OTA 재고 반영은 비활성입니다/);
  assert.match(appSource, /OTA 적용 가능 상태/);
  assert.match(appSource, /적용 가능/);
  assert.match(shellState, /실제 결과만 표시합니다/);

  console.log("regression_app_v2_management_engine_contract: OK");
}

main();
