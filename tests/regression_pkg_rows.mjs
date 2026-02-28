import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

function loadScript(filePath) {
  const code = fs.readFileSync(filePath, "utf8");
  vm.runInThisContext(code, { filename: filePath });
}

function createMatrix(fixture) {
  const cellMap = new Map();
  (fixture.cells || []).forEach((cell) => {
    const key = `${Number(cell.row)}:${Number(cell.col)}`;
    cellMap.set(key, {
      formattedValue: String(cell.formattedValue || ""),
      note: String(cell.note || ""),
      formula: String(cell.formula || ""),
      backgroundColor: cell.backgroundColor || null
    });
  });

  return {
    maxRow: Number(fixture.maxRow || 0),
    hiddenRows: new Set(),
    get(row, col) {
      return (
        cellMap.get(`${Number(row)}:${Number(col)}`) || {
          formattedValue: "",
          note: "",
          formula: "",
          backgroundColor: null
        }
      );
    }
  };
}

function main() {
  const root = process.cwd();
  globalThis.App = {};

  const scriptFiles = [
    "src/constants.js",
    "src/report/report.format.js",
    "src/scan/normalize.js",
    "src/engine/rules.js",
    "src/scan/aggregator.js"
  ].map((p) => path.join(root, p));
  scriptFiles.forEach(loadScript);

  const fixturePath = path.join(root, "tests/fixtures/pkg_inventory_rows_fixture.json");
  const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  const matrix = createMatrix(fixture);

  const aggregator = globalThis.App?.scan?.aggregator;
  const normalize = globalThis.App?.scan?.normalize;
  assert.ok(aggregator, "App.scan.aggregator is required");
  assert.ok(normalize, "App.scan.normalize is required");

  const defaultRows = aggregator.collectProviderInventoryDataRows(
    matrix,
    Number(fixture.startRow),
    fixture.dateCols,
    3,
    { allowPkgInventoryRows: false }
  );
  assert.deepEqual(defaultRows, fixture.expected.defaultRows, "default mode must exclude PKG rows");

  const allowPkgRows = aggregator.collectProviderInventoryDataRows(
    matrix,
    Number(fixture.startRow),
    fixture.dateCols,
    3,
    { allowPkgInventoryRows: true }
  );
  assert.deepEqual(allowPkgRows, fixture.expected.allowPkgRows, "allowPkg mode must include PKG rows");

  const cfgTrue = normalize.parseScanConfigFromValuesGrid([
    ["allow_pkg_inventory_rows", "true"]
  ]);
  assert.equal(cfgTrue.allowPkgInventoryRows, true, "grid config true parse");

  const cfgFalse = normalize.parseScanConfigFromValuesGrid([
    ["scan_allow_pkg_inventory_rows", "off"]
  ]);
  assert.equal(cfgFalse.allowPkgInventoryRows, false, "grid config false parse");

  console.log("regression_pkg_rows: OK");
}

main();
