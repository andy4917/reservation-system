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
    "src/shared/syncPolicy.js",
    "src/constants.js"
  ]
    .map((p) => path.join(root, p))
    .forEach(loadScript);

  const policy = globalThis.InventorySyncPolicy;
  const constants = globalThis.App?.constants || {};

  assert.equal(policy.sheetDefaults.spreadsheetId, constants.DEFAULT_SPREADSHEET_ID);
  assert.equal(policy.sheetDefaults.sheetName, constants.DEFAULT_SHEET_NAME);
  assert.equal(policy.sheetDefaults.startRow, constants.DEFAULT_START_ROW);
  assert.deepEqual(policy.roomPresets["admin-station"], constants.ROOM_PRESETS["admin-station"]);
  assert.equal(policy.roomTypeByRoomNo["A1201"], constants.ROOM_TYPE_BY_ROOM_NO["A1201"]);

  console.log("regression_sync_policy_shared_defaults: OK");
}

main();
