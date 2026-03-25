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
  const liveRead = read(root, "app_v2/main/liveReadActions.ts");
  const runner = read(root, "app_v2/main/reservationActionRunner.ts");
  const wingsRuntime = read(root, "app_v2/main/wingsReservationRuntime.ts");
  const runtimeSafety = read(root, "app_v2/main/runtimeSafety.ts");

  assert.match(runtimeSafety, /buildLiveReadRuntimeErrorSnapshot/);
  assert.match(runtimeSafety, /buildPendingSourceActionSnapshot/);
  assert.match(runtimeSafety, /buildStableWingsRuntimeCacheKey/);

  assert.match(liveRead, /runtimeSafety/);
  assert.match(liveRead, /buildLiveReadRuntimeErrorSnapshot/);

  assert.match(runner, /runtimeSafety/);
  assert.match(runner, /buildPendingSourceActionSnapshot/);

  assert.match(wingsRuntime, /buildStableWingsRuntimeCacheKey/);
  assert.doesNotMatch(wingsRuntime, /bundle:\s*runtimeAuthBundle\?\.capturedAt/);

  console.log("regression_app_v2_runtime_safety_contract: OK");
}

main();
