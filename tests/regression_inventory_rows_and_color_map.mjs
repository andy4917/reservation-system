import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

function loadScript(filePath) {
  const code = fs.readFileSync(filePath, "utf8");
  vm.runInThisContext(code, { filename: filePath });
}

function buildMatrix() {
  const cells = new Map();
  const setCell = (row, col, formattedValue = "", backgroundColor = null) => {
    cells.set(`${row}:${col}`, {
      formattedValue,
      note: "",
      formula: "",
      backgroundColor
    });
  };

  // date cols: 5, 6, 7
  // provider row
  setCell(10, 0, "station");
  setCell(10, 1, "urban spa suite");
  setCell(10, 5, "closed");
  setCell(10, 6, "1/2");
  setCell(10, 7, "1/2");

  // same provider typed rows must not terminate scan
  setCell(11, 0, "station");
  setCell(11, 1, "double twin spa");
  setCell(11, 5, "closed");
  setCell(11, 6, "0/1");
  setCell(11, 7, "0/1");

  setCell(12, 0, "station");
  setCell(12, 1, "grand spa suite");
  setCell(12, 5, "closed");
  setCell(12, 6, "closed");
  setCell(12, 7, "closed");

  // next provider boundary
  setCell(13, 0, "naver");
  setCell(13, 1, "urban spa suite");
  setCell(13, 5, "0/1");
  setCell(13, 6, "0/1");
  setCell(13, 7, "0/1");

  return {
    maxRow: 20,
    hiddenRows: new Set(),
    get(row, col) {
      return (
        cells.get(`${Number(row)}:${Number(col)}`) || {
          formattedValue: "",
          note: "",
          formula: "",
          backgroundColor: null
        }
      );
    }
  };
}

function buildShorthandMatrix() {
  const cells = new Map();
  const setCell = (row, col, formattedValue = "", backgroundColor = null) => {
    cells.set(`${row}:${col}`, {
      formattedValue,
      note: "",
      formula: "",
      backgroundColor
    });
  };

  setCell(20, 0, "네이버");
  setCell(20, 1, "Spa Suite 8인");
  setCell(20, 5, "닫음");
  setCell(20, 6, "0/2");
  setCell(20, 7, "닫음");

  setCell(21, 1, "Suite 6인");
  setCell(21, 5, "닫음");
  setCell(21, 6, "0/1");
  setCell(21, 7, "닫음");

  setCell(22, 1, "Suite 4인");
  setCell(22, 5, "닫음");
  setCell(22, 6, "0/1");
  setCell(22, 7, "닫음");

  return {
    maxRow: 30,
    hiddenRows: new Set(),
    get(row, col) {
      return (
        cells.get(`${Number(row)}:${Number(col)}`) || {
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

  [
    "src/constants.js",
    "src/scan/normalize.js",
    "src/engine/rules.js",
    "src/scan/aggregator.js"
  ]
    .map((p) => path.join(root, p))
    .forEach(loadScript);

  const aggregator = globalThis.App?.scan?.aggregator;
  const rules = globalThis.App?.engine?.rules;
  assert.ok(aggregator, "App.scan.aggregator is required");
  assert.ok(rules, "App.engine.rules is required");

  const matrix = buildMatrix();
  const dateCols = [
    { col: 5, dateKey: "2026-02-23" },
    { col: 6, dateKey: "2026-02-24" },
    { col: 7, dateKey: "2026-02-25" }
  ];

  const rows = aggregator.collectProviderInventoryDataRows(matrix, 10, dateCols, 3, {
    allowPkgInventoryRows: false,
    providerKey: "STATION"
  });
  assert.deepEqual(rows, [10, 11, 12], "must keep scanning same-provider typed rows");

  const shorthandRows = aggregator.collectProviderInventoryDataRows(buildShorthandMatrix(), 20, dateCols, 3, {
    allowPkgInventoryRows: false,
    providerKey: "NAVER"
  });
  assert.deepEqual(
    shorthandRows,
    [21, 22, 20],
    "must classify 6인/4인/8인 shorthand rows into typed slots without dropping the provider grand row"
  );

  const colorStatus = rules.classifySheetCellColorStatus({
    formattedValue: "",
    note: "",
    backgroundColor: {
      red: 0.9647058824,
      green: 0.6980392157,
      blue: 0.4196078431
    }
  });
  assert.equal(colorStatus.status, "OCCUPIED");
  assert.equal(colorStatus.channel, "UNKNOWN");
  assert.equal(colorStatus.errorCode, "");

  const oooWithNote = rules.classifySheetCellColorStatus({
    formattedValue: "O.O.O",
    note: "blocked room",
    backgroundColor: {
      red: 0.05,
      green: 0.05,
      blue: 0.05
    }
  });
  assert.equal(oooWithNote.status, "BLOCKED");
  assert.equal(oooWithNote.channel, "OOO");

  const oooByNoteOnly = rules.classifySheetCellStatus({
    formattedValue: "",
    note: "O.O.O 이용불가",
    backgroundColor: null
  });
  assert.equal(oooByNoteOnly, "OOO");

  console.log("regression_inventory_rows_and_color_map: OK");
}

main();
