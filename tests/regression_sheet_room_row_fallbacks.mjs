import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

function loadScript(filePath) {
  const code = fs.readFileSync(filePath, "utf8");
  vm.runInThisContext(code, { filename: filePath });
}

function createMatrix({ maxRow, cells }) {
  const cellMap = new Map();
  (cells || []).forEach((cell) => {
    cellMap.set(`${Number(cell.row)}:${Number(cell.col)}`, {
      formattedValue: String(cell.formattedValue || ""),
      note: String(cell.note || ""),
      formula: String(cell.formula || ""),
      backgroundColor: cell.backgroundColor || null
    });
  });
  return {
    maxRow: Number(maxRow || 0),
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

  [
    "src/constants.js",
    "src/scan/normalize.js",
    "src/report/report.format.js",
    "src/engine/rules.js",
    "src/scan/blockBuilder.js"
  ]
    .map((p) => path.join(root, p))
    .forEach(loadScript);

  const normalize = globalThis.App?.scan?.normalize;
  const blockBuilder = globalThis.App?.scan?.blockBuilder;
  assert.ok(normalize, "App.scan.normalize is required");
  assert.ok(blockBuilder, "App.scan.blockBuilder is required");

  const headerlessRoomMap = normalize.parseRoomTypeMapFromValuesGrid([
    ["TYPE", "ROOM", "01월 01일"],
    ["Urban Spa Suite 6인", "201", "닫음"],
    ["", "301", "닫음"],
    ["Double Twin Spa Room 4인", "202", "닫음"]
  ]);
  assert.deepEqual(headerlessRoomMap, {}, "headerless body rows must not be parsed as ROOM_MAP");

  const matrix = createMatrix({
    maxRow: 8,
    cells: [
      { row: 1, col: 0, formattedValue: "Urban Spa Suite 6인" },
      { row: 1, col: 1, formattedValue: "201" },
      { row: 1, col: 2, formattedValue: "닫음" },
      { row: 2, col: 1, formattedValue: "301" },
      { row: 2, col: 2, formattedValue: "닫음" },
      { row: 3, col: 0, formattedValue: "Double Twin Spa Room 4인" },
      { row: 3, col: 1, formattedValue: "202" },
      { row: 3, col: 2, formattedValue: "VIP" },
      { row: 4, col: 0, formattedValue: "Grand Spa Suite 8인" },
      { row: 4, col: 1, formattedValue: "A1201" },
      { row: 4, col: 2, formattedValue: "OOO" },
      { row: 5, col: 0, formattedValue: "취소/변경/결제" },
      { row: 5, col: 2, formattedValue: "20000" }
    ]
  });

  const roomRows = blockBuilder.mapSheetRoomRows(
    matrix,
    [{ col: 2, dateKey: "2026-03-15" }],
    1,
    {},
    null,
    5
  );

  assert.equal(roomRows.length, 4, "inferred room rows must survive without fixed ROOM_MAP");
  assert.deepEqual(
    roomRows.map((row) => ({ roomNo: row.roomNo, roomType: row.roomType })),
    [
      { roomNo: "201", roomType: "Urban Spa Suite 6인" },
      { roomNo: "301", roomType: "Urban Spa Suite 6인" },
      { roomNo: "202", roomType: "Double Twin Spa Room 4인" },
      { roomNo: "A1201", roomType: "Grand Spa Suite 8인" }
    ]
  );

  const conflictingMatrix = createMatrix({
    maxRow: 5,
    cells: [
      { row: 1, col: 0, formattedValue: "Grand City Spa Suite 스파 8인" },
      { row: 1, col: 1, formattedValue: "401" },
      { row: 1, col: 2, formattedValue: "닫음" },
      { row: 2, col: 1, formattedValue: "501" },
      { row: 2, col: 2, formattedValue: "닫음" },
      { row: 3, col: 0, formattedValue: "Family City Suite 6인" },
      { row: 3, col: 1, formattedValue: "1102" },
      { row: 3, col: 2, formattedValue: "닫음" },
      { row: 4, col: 0, formattedValue: "Private City Suite 4인" },
      { row: 4, col: 1, formattedValue: "1101" },
      { row: 4, col: 2, formattedValue: "닫음" }
    ]
  });

  const conflictingRoomRows = blockBuilder.mapSheetRoomRows(
    conflictingMatrix,
    [{ col: 2, dateKey: "2026-03-15" }],
    1,
    {
      "401": "Urban Spa Suite 6인",
      "501": "Urban Spa Suite 6인",
      "1101": "Urban Spa Suite 6인",
      "1102": "Double Twin Spa Room 4인"
    },
    null,
    4
  );

  assert.deepEqual(
    conflictingRoomRows.map((row) => ({ roomNo: row.roomNo, roomType: row.roomType })),
    [
      { roomNo: "401", roomType: "Grand Spa Suite 8인" },
      { roomNo: "501", roomType: "Grand Spa Suite 8인" },
      { roomNo: "1102", roomType: "Urban Spa Suite 6인" },
      { roomNo: "1101", roomType: "Double Twin Spa Room 4인" }
    ],
    "local sheet headers must override shared ROOM_MAP when the branch reuses room numbers"
  );

  console.log("regression_sheet_room_row_fallbacks: OK");
}

main();
