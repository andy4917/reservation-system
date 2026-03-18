import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

function loadScript(filePath) {
  const code = fs.readFileSync(filePath, "utf8");
  vm.runInThisContext(code, { filename: filePath });
}

function main() {
  const root = process.cwd();
  globalThis.App = {};
  [
    "src/constants.js",
    "src/scan/normalize.js"
  ].map((p) => path.join(root, p)).forEach(loadScript);

  const normalize = globalThis.App?.scan?.normalize;
  const constants = globalThis.App?.constants || {};
  assert.ok(normalize, "App.scan.normalize is required");
  delete globalThis.App.constants.configuredProviderIds;

  const cfg = normalize.sanitizeSyncConfig({});
  const readOnly = constants.READ_ONLY_TOOL_MODE === true;
  assert.equal(cfg.providerApply["admin-station"], readOnly ? false : true);
  assert.equal(cfg.providerApply["naver-partner"], false);
  assert.equal(cfg.opsUiCollapsed, true);
  assert.equal(cfg.goldenExportRedaction, "default");
  assert.equal(cfg.reservationPolicyVersion, 1);
  assert.equal(cfg.stationBranchId, "");
  assert.equal(cfg.naverBusinessId, "");

  const override = normalize.sanitizeSyncConfig({
    providerApply: {
      "admin-station": false,
      "naver-partner": true
    }
  });
  assert.equal(override.providerApply["admin-station"], false);
  assert.equal(override.providerApply["naver-partner"], readOnly ? false : true);

  console.log("regression_sync_config_defaults: OK");
}

main();
