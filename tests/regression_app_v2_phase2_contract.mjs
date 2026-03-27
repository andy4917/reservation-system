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
  const settingsStore = read(root, "app_v2/main/settingsStore.ts");
  const ipc = read(root, "app_v2/main/ipc.ts");
  const runner = read(root, "app_v2/main/reservationActionRunner.ts");
  const liveRead = read(root, "app_v2/main/liveReadActions.ts");
  const wingsRuntime = read(root, "app_v2/main/wingsReservationRuntime.ts");

  assert.match(contracts, /reportWindowDays/);
  assert.match(contracts, /modelPath/);
  assert.match(contracts, /runtime/);
  assert.match(contracts, /startDate/);
  assert.match(contracts, /endDate/);
  assert.match(contracts, /sheetTabs/);
  assert.match(contracts, /excludeRoomMakeup/);
  assert.match(contracts, /"GANGNAM", "COEX", "SEOLLEUNG", "SAMSEONG"/);
  assert.match(contracts, /seolleung: string;/);
  assert.match(contracts, /samseong: string;/);

  assert.match(settingsStore, /hasAnySettings/);
  assert.match(settingsStore, /sheetTabs/);
  assert.match(settingsStore, /gangnam: normalizeText\(tabs\.gangnam\)/);
  assert.match(settingsStore, /coex: normalizeText\(tabs\.coex\)/);
  assert.match(settingsStore, /seolleung: normalizeText\(tabs\.seolleung\)/);
  assert.match(settingsStore, /samseong: normalizeText\(tabs\.samseong\)/);
  assert.match(settingsStore, /opsView/);
  assert.match(settingsStore, /Xenova\/bge-m3/);
  assert.doesNotMatch(settingsStore, /coexMain/);
  assert.doesNotMatch(settingsStore, /coexAnnex/);
  assert.match(ipc, /parseDateInput/);
  assert.match(ipc, /desktop-app:run-reservation-action/);
  assert.match(ipc, /desktop-app:install-bge-m3-model/);
  assert.match(ipc, /excludeRoomMakeup/);
  assert.match(ipc, /run-reservation-action/);
  assert.doesNotMatch(ipc, /coexMain|coexAnnex/);
  assert.match(runner, /embeddingRuntime/);
  assert.match(runner, /excludeRoomMakeup/);
  assert.match(runner, /branch === "COEX"\s*\?\s*\[tabs\.coex\]/);
  assert.match(runner, /branch === "SEOLLEUNG"\s*\?\s*\[tabs\.seolleung\]/);
  assert.match(runner, /\[tabs\.samseong\]/);
  assert.match(liveRead, /app_v2_live_sheet_bridge.py/);
  assert.match(liveRead, /branch === "GANGNAM"\s*\?\s*\[tabs\.gangnam\]/);
  assert.match(liveRead, /branch === "SEOLLEUNG"\s*\?\s*\[tabs\.seolleung\]/);
  assert.match(liveRead, /\[tabs\.samseong\]/);
  assert.match(wingsRuntime, /SEOLLEUNG/);
  assert.match(wingsRuntime, /SAMSEONG/);
  assert.match(wingsRuntime, /UHS_WINGS_HAR_SEOLLEUNG/);
  assert.match(wingsRuntime, /UHS_WINGS_HAR_SAMSEONG/);
  assert.match(wingsRuntime, /normalizeBranch/);

  console.log("regression_app_v2_phase2_contract: OK");
}

main();
