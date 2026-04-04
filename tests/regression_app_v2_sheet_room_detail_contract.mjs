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
  const liveBridge = read(root, "scripts/app_v2_live_sheet_bridge.py");
  const appSource = read(root, "app_v2/renderer/App.tsx");

  assert.match(contracts, /roomType\?: string/);
  assert.match(contracts, /roomNo\?: string/);
  assert.match(contracts, /guestName\?: string/);
  assert.match(contracts, /reservationNo\?: string/);
  assert.match(contracts, /checkin\?: string/);
  assert.match(contracts, /checkout\?: string/);
  assert.match(contracts, /nightCount\?: number/);

  assert.match(liveBridge, /"roomType":/);
  assert.match(liveBridge, /"roomNo":/);
  assert.match(liveBridge, /"guestName":/);
  assert.match(liveBridge, /"reservationNo":/);
  assert.match(liveBridge, /"checkin":/);
  assert.match(liveBridge, /"checkout":/);

  assert.match(appSource, /room-detail/i);
  assert.match(appSource, /시트 기준/);
  assert.match(appSource, /roomType|roomNo|guestName/);

  console.log("regression_app_v2_sheet_room_detail_contract: OK");
}

main();
