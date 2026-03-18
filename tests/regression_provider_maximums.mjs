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
    "src/scan/normalize.js",
    "src/engine/rules.js"
  ].map((p) => path.join(root, p)).forEach(loadScript);

  const rules = globalThis.App?.engine?.rules;
  assert.ok(rules, "App.engine.rules is required");

  // 2026-02-26 is Thursday, NAVER base max must be 4.
  assert.equal(rules.resolveProviderFixedMaximum("NAVER", "2026-02-26"), 4);
  // 2026-02-27 is Friday, NAVER max must be 3.
  assert.equal(rules.resolveProviderFixedMaximum("NAVER", "2026-02-27"), 3);
  // STATION is fixed to 1.
  assert.equal(rules.resolveProviderFixedMaximum("STATION", "2026-02-26"), 1);

  // Keep lower parsed maximum (VAC-capped max) instead of forcing weekday max.
  const capped = rules.applyProviderMaximumRule(rules.parseStockValue("0/3"), "NAVER", "2026-02-26");
  assert.equal(capped.maximum, 3);
  // Clamp higher parsed maximum to provider base max.
  const clamped = rules.applyProviderMaximumRule(rules.parseStockValue("0/5"), "NAVER", "2026-02-26");
  assert.equal(clamped.maximum, 4);
  // Derived closed rows must stay aligned with NAVER fixed maximum even when local vacancy is zero.
  assert.deepEqual(
    rules.resolveExpectedCountsFromStat(
      { expectedTotal: 7, total: 7, sold: 7, vacancy: 0 },
      "NAVER",
      "2026-02-26",
      { raw: "닫음", current: 4, maximum: 4 }
    ),
    { total: 4, sold: 4, available: 0, sourceTotal: 7, stationVacQualified: false }
  );
  assert.equal(
    rules.formatExpectedInventoryRaw(
      "fraction",
      { expectedTotal: 7, total: 7, sold: 7, vacancy: 0 },
      "NAVER",
      "2026-02-26",
      { raw: "닫음", current: 4, maximum: 4 }
    ),
    "4/4"
  );

  // STATION: raw max >1 alone is not applied.
  assert.equal(
    rules.resolveInventoryMaximum({ raw: "0/2", current: 0, maximum: 2 }, "STATION", "2026-02-26"),
    1
  );
  // STATION: only VAC-qualified derived values can expose >1 maximum.
  assert.equal(
    rules.resolveInventoryMaximum(
      { raw: "1/2", current: 1, maximum: 2, stationVacQualified: true },
      "STATION",
      "2026-02-26"
    ),
    2
  );
  // current mode must also respect resolved maximum cap.
  assert.equal(
    rules.inventoryValueToTargetUnits(
      { raw: "2/2", current: 2, maximum: 2 },
      "current",
      "STATION",
      "2026-02-26"
    ),
    1
  );
  assert.equal(
    rules.inventoryValueToTargetUnits(
      { raw: "2/2", current: 2, maximum: 2, stationVacQualified: true },
      "current",
      "STATION",
      "2026-02-26"
    ),
    2
  );

  console.log("regression_provider_maximums: OK");
}

main();
