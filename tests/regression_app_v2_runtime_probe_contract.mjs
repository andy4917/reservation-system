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
  const appMode = read(root, "app_v2/main/appMode.ts");
  const main = read(root, "app_v2/main/main.ts");
  const runtimeVerify = read(root, "app_v2/main/runtimeVerificationProcess.ts");
  const runtimeProbe = read(root, "app_v2/main/runtimeProbeProcess.ts");

  assert.match(appMode, /AppLaunchMode\s*=\s*\"interactive\"\s*\|\s*\"smoke\"\s*\|\s*\"runtime-verify\"\s*\|\s*\"runtime-probe\"/);
  assert.match(appMode, /UHS_APP_V2_RUNTIME_PROBE/);
  assert.match(appMode, /UHS_APP_V2_PROBE_OUTPUT_FILE/);
  assert.match(main, /runRuntimeProbeProcess/);
  assert.match(runtimeProbe, /runLiveReadBundle/);
  assert.match(runtimeProbe, /context\.probeTasks\.includes\("bundle"\)/);
  assert.doesNotMatch(runtimeProbe, /Promise\.all\(runSequence\)/);
  assert.match(runtimeProbe, /for \(const executeTask of runSequence\)/);
  assert.match(runtimeProbe, /tasks\.push\(await executeTask\(\)\)/);
  assert.match(runtimeVerify, /runRuntimeVerificationProcess/);

  const probeScript = read(root, "scripts/app_v2_runtime_probe.mjs");
  assert.match(probeScript, /app-v2-runtime-probe/);
  assert.match(probeScript, /UHS_APP_V2_RUNTIME_PROBE/);
  assert.match(probeScript, /UHS_APP_V2_PROBE_TASKS/);
  assert.match(probeScript, /UHS_APP_V2_PROBE_BRANCH/);
  assert.match(probeScript, /UHS_APP_V2_PROBE_OUTPUT_FILE/);
  assert.match(probeScript, /JSON/);

  console.log("regression_app_v2_runtime_probe_contract: OK");
}

main();
