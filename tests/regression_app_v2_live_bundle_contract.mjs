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
  const ipcSource = read(root, "app_v2/main/ipc.ts");
  const preloadSource = read(root, "app_v2/main/preload.ts");
  const appSource = read(root, "app_v2/renderer/App.tsx");
  const runtimeSource = read(root, "app_v2/main/liveReadRuntime.ts");

  assert.match(contracts, /AppLiveReadBundleSnapshot/);
  assert.match(contracts, /AppLiveReadBundleSupportLevel/);
  assert.match(contracts, /fetchLiveReadBundle:/);
  assert.match(runtimeSource, /runLiveReadBundle/);
  assert.match(runtimeSource, /supportLevel:/);
  assert.match(runtimeSource, /partial-live/);
  assert.doesNotMatch(runtimeSource, /Promise\.all/);
  assert.doesNotMatch(runtimeSource, /Promise\.race/);
  assert.doesNotMatch(runtimeSource, /Promise\.allSettled/);
  assert.match(runtimeSource, /await runPmsRead\(input\)/);
  assert.match(runtimeSource, /await runOtaRead\(input\)/);
  assert.match(runtimeSource, /await runSheetRead\(input\)/);

  const sequentialOrder = [
    "await runPmsRead(input)",
    "await runOtaRead(input)",
    "await runSheetRead(input)",
  ];
  const positions = sequentialOrder.map((needle) => runtimeSource.indexOf(needle));
  for (const [index, position] of positions.entries()) {
    assert.notEqual(position, -1, `${sequentialOrder[index]} should exist in source`);
  }
  assert.equal(positions[1] > positions[0], true, "OTA should be awaited after PMS");
  assert.equal(positions[2] > positions[1], true, "Sheet should be awaited after OTA");

  assert.match(ipcSource, /desktop-app:fetch-live-read-bundle/);
  assert.match(preloadSource, /fetchLiveReadBundle/);
  assert.match(appSource, /fetchLiveReadBundle/);

  console.log("regression_app_v2_live_bundle_contract: OK");
}

main();
