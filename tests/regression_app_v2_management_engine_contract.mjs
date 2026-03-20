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

  assert.doesNotMatch(contracts, /\bmock\b/);
  assert.doesNotMatch(runner, /\bmock\b/);
  assert.match(contracts, /planToken/);
  assert.match(contracts, /requiresApproval/);
  assert.match(contracts, /applyAllowed/);
  assert.match(runner, /app_v2_reservation_management_bridge\.py/);
  assert.match(runner, /engineStatus/);
  assert.match(runner, /planToken/);
  assert.match(appSource, /plan token/);
  assert.match(appSource, /source bundle 필요/);

  console.log("regression_app_v2_management_engine_contract: OK");
}

main();
