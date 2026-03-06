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
  assert.ok(normalize, "App.scan.normalize is required");

  const cfg = normalize.sanitizeSyncConfig({
    pmsPreset: {
      presetKey: "wings-global-guest-list",
      propertyNo: "91",
      bsnsCode: "91",
      pageId: "IR04_0100X_V03",
      pageSize: 300
    }
  });
  assert.equal(cfg.pmsPreset.presetKey, "wings-global-guest-list");
  assert.equal(cfg.pmsPreset.propertyNo, "91");
  assert.equal(cfg.pmsPreset.bsnsCode, "91");
  assert.equal(cfg.pmsPreset.pageId, "IR04_0100X_V03");
  assert.equal(cfg.pmsPreset.pageSize, 300);

  const generated = normalize.buildWingsPmsPresetRequest(
    {
      ...cfg.pmsPreset,
      startDate: "2026-03-01",
      endDate: "2026-03-07"
    },
    "https://pms.sanhait.com/pms/index.do"
  );
  assert.ok(generated, "preset must generate a request");
  assert.equal(
    generated.url,
    "https://pms.sanhait.com/pms/biz/ir04_0100X/searchListGlobalRsvn_v03.do"
  );
  assert.equal(generated.bundle.method, "POST");
  assert.equal(generated.bundle.contentType, "form");
  assert.match(generated.bundle.requestBody, /filter%5BPAGE_ID%5D=IR04_0100X_V03/);
  assert.match(generated.bundle.requestBody, /filter%5Bfilters%5D%5B0%5D%5Bvalue%5D=91/);
  assert.match(generated.bundle.requestBody, /ARRV_DATE_F=2026-03-01/);
  assert.match(generated.bundle.requestBody, /ARRV_DATE_T=2026-03-07/);

  const reservationPreset = normalize.sanitizeWingsPmsPreset({
    presetKey: "wings-reservation-list",
    propertyNo: "91",
    bsnsCode: "91",
    pageId: "IR04_0100X",
    pageSize: 500
  });
  const reservationGenerated = normalize.buildWingsPmsPresetRequest(
    {
      ...reservationPreset,
      startDate: "2026-03-04",
      endDate: "2026-03-10"
    },
    "https://pms.sanhait.com/pms/index.do"
  );
  assert.ok(reservationGenerated, "reservation list preset must generate a request");
  assert.equal(
    reservationGenerated.url,
    "https://pms.sanhait.com/pms/biz/ir04_0100X/searchListRsvn.do"
  );
  assert.match(reservationGenerated.bundle.requestBody, /filter%5BPAGE_ID%5D=IR04_0100X/);
  assert.match(reservationGenerated.bundle.requestBody, /pageSize=500/);
  assert.match(reservationGenerated.bundle.requestBody, /ARRV_DATE_F=2026-03-04/);
  assert.match(reservationGenerated.bundle.requestBody, /ARRV_DATE_T=2026-03-10/);

  console.log("regression_wings_pms_preset: OK");
}

main();
