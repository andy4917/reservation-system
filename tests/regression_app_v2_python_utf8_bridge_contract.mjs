import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function read(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

function main() {
  const liveRead = read("app_v2/main/liveReadActions.ts");
  const actionRunner = read("app_v2/main/reservationActionRunner.ts");
  const sheetBridge = read("scripts/app_v2_live_sheet_bridge.py");
  const managementBridge = read("scripts/app_v2_reservation_management_bridge.py");

  assert.match(liveRead, /PYTHONUTF8:\s*"1"/);
  assert.match(liveRead, /PYTHONIOENCODING:\s*"utf-8"/);
  assert.match(actionRunner, /PYTHONUTF8:\s*"1"/);
  assert.match(actionRunner, /PYTHONIOENCODING:\s*"utf-8"/);
  assert.match(sheetBridge, /sys\.stdout\.reconfigure\(encoding="utf-8", errors="replace"\)/);
  assert.match(sheetBridge, /sys\.stderr\.reconfigure\(encoding="utf-8", errors="replace"\)/);
  assert.match(managementBridge, /sys\.stdout\.reconfigure\(encoding="utf-8", errors="replace"\)/);
  assert.match(managementBridge, /sys\.stderr\.reconfigure\(encoding="utf-8", errors="replace"\)/);

  console.log("regression_app_v2_python_utf8_bridge_contract: OK");
}

main();
