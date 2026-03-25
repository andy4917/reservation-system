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

  assert.doesNotMatch(contracts, /\bmock\b/);
  assert.doesNotMatch(runner, /\bmock\b/);
  assert.doesNotMatch(runner, /buildMockRows/);
  assert.match(contracts, /planToken/);
  assert.match(contracts, /requiresApproval/);
  assert.match(contracts, /applyAllowed/);
  assert.match(runner, /app_v2_reservation_management_bridge\.py/);
  assert.match(runner, /engineStatus/);
  assert.match(runner, /planToken/);
  assert.match(runner, /rows:\s*\[\]/);
  assert.doesNotMatch(runner, /APP_V2_SOURCE_FIXTURE_JSON/);
  assert.doesNotMatch(runner, /APP_V2_FIXTURE_MODE/);

  console.log("regression_app_v2_management_engine_contract: OK");
}

main();
