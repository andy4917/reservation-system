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
  const liveReadActions = read(root, "app_v2/main/liveReadActions.ts");
  const reservationRunner = read(root, "app_v2/main/reservationActionRunner.ts");
  const helper = read(root, "app_v2/main/pythonRuntime.ts");

  assert.match(helper, /process\.platform === "win32"/);
  assert.match(helper, /py\.exe|py"/);
  assert.match(helper, /python\.exe|python"/);
  assert.match(helper, /python3/);
  assert.match(liveReadActions, /resolvePythonSpawnCommand/);
  assert.match(reservationRunner, /resolvePythonSpawnCommand/);

  console.log("regression_app_v2_python_runtime_contract: OK");
}

main();
