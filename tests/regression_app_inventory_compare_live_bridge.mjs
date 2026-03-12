import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { pathToFileURL } from "node:url";

async function loadBuiltModule(filePath) {
  if (typeof vm.SourceTextModule !== "function") {
    return import(`${pathToFileURL(filePath).href}?t=${Date.now()}`);
  }

  const code = await fs.promises.readFile(filePath, "utf8");
  const context = vm.createContext({
    console,
    Date
  });
  const mod = new vm.SourceTextModule(code, {
    context,
    identifier: filePath
  });
  await mod.link(() => {
    throw new Error("inventoryCompare build output should not import runtime dependencies");
  });
  await mod.evaluate();
  return mod.namespace;
}

async function main() {
  const root = process.cwd();
  const modulePath = path.join(root, "dist-app/services/inventoryCompare.js");
  const inventoryCompare = await loadBuiltModule(modulePath);

  assert.equal(typeof inventoryCompare.buildInventoryCompareSnapshot, "function");

  const snapshot = inventoryCompare.buildInventoryCompareSnapshot({
    mode: "live",
    sourceLabel: "Bridge live rows",
    liveProvider: "naver-partner",
    liveContextAvailable: true,
    usedDomFallback: false,
    liveRows: [
      {
        branch: "COEX",
        date: "2026-03-12",
        roomType: "Urban",
        channel: "NAVER",
        siteRaw: "4/6",
        sheetRaw: "6/6",
        diff: "-2",
        status: "mismatch",
        reason: "site lagging behind sheet",
        action: "review before apply"
      },
      {
        date: "2026-03-13",
        roomType: "Double Twin",
        channel: "NAVER",
        siteRaw: "2/3",
        sheetRaw: "2/3"
      }
    ]
  });

  assert.equal(snapshot.sourceLabel, "Bridge live rows");
  assert.equal(snapshot.supportLevel, "read-live");
  assert.equal(snapshot.mismatchCount, 1);
  assert.equal(snapshot.matchedCount, 1);
  assert.equal(snapshot.warningCount, 0);
  assert.equal(snapshot.rows.length, 2);
  assert.match(snapshot.validationLines[1], /live bridge rows loaded/i);
  assert.equal(snapshot.rows[0].branch, "COEX");
  assert.equal(snapshot.rows[1].status, "match");
  assert.equal(snapshot.rows[1].diff, "0");

  const partial = inventoryCompare.buildInventoryCompareSnapshot({
    mode: "live",
    sourceLabel: "Bridge live rows pending payload",
    liveProvider: "naver-partner",
    liveContextAvailable: true,
    usedDomFallback: false,
    liveRows: []
  });
  assert.equal(partial.supportLevel, "partial-live");

  const fallback = inventoryCompare.buildInventoryCompareSnapshot({
    mode: "live",
    sourceLabel: "Bridge pending, fixture fallback",
    liveProvider: "naver-partner",
    liveContextAvailable: false,
    usedDomFallback: false,
    liveRows: []
  });
  assert.equal(fallback.supportLevel, "fixture-fallback");

  console.log("regression_app_inventory_compare_live_bridge: OK");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
