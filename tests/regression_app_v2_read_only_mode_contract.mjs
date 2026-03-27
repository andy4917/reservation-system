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
  const model = read(root, "app_v2/renderer/model.ts");
  const runner = read(root, "app_v2/main/reservationActionRunner.ts");

  assert.match(contracts, /APP_SOURCE_ACCESS_MODE = "read-only"/);
  assert.match(model, /action === "apply"[\s\S]*return "읽기전용"/);
  assert.match(runner, /read-only 모드에서 차단/);
  assert.match(runner, /sourceAccessMode:\$\{APP_SOURCE_ACCESS_MODE\}|sourceAccessMode:read-only/);

  console.log("regression_app_v2_read_only_mode_contract: OK");
}

main();
