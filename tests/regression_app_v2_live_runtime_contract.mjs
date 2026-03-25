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

  const providerRuntime = read(root, "app_v2/main/providerDataRuntime.ts");
  const wingsRuntime = read(root, "app_v2/main/wingsReservationRuntime.ts");
  const sourceRuntime = read(root, "app_v2/main/sourceReservationRuntime.ts");
  const liveRead = read(root, "app_v2/main/liveReadActions.ts");
  const runner = read(root, "app_v2/main/reservationActionRunner.ts");

  assert.match(providerRuntime, /fetchProviderRowsLive/);
  assert.match(providerRuntime, /naver-partner/);
  assert.match(providerRuntime, /admin-station/);
  assert.doesNotMatch(providerRuntime, /process\.cwd\(\)/);
  assert.match(providerRuntime, /fileURLToPath\(import\.meta\.url\)/);
    assert.match(providerRuntime, /src\/constants\.js/);
    assert.match(providerRuntime, /sessionSignals/);
    assert.match(providerRuntime, /admin-station-token/);
    assert.match(providerRuntime, /runWithRuntimeGlobalsExclusive/);
    assert.doesNotMatch(providerRuntime, /cookieHeader\s*\?\s*\"OWNER\"\s*:\s*\"\"/);

  assert.match(wingsRuntime, /fetchWingsReservations/);
  assert.match(wingsRuntime, /wings-pms/);
  assert.match(wingsRuntime, /pmsAuthBundle|pmsBranchProfiles/);
    assert.doesNotMatch(wingsRuntime, /process\.cwd\(\)/);
    assert.match(wingsRuntime, /fileURLToPath\(import\.meta\.url\)/);
    assert.match(wingsRuntime, /src\/engine\/rules\.js/);
    assert.match(wingsRuntime, /runWithRuntimeGlobalsExclusive/);

  assert.match(sourceRuntime, /buildSourceReservationsFromPmsRecords/);
  assert.match(sourceRuntime, /writeSourceReservationsFixture/);
  assert.match(sourceRuntime, /status_bucket|statusBucket/);

  assert.match(liveRead, /providerDataRuntime/);
  assert.match(liveRead, /wingsReservationRuntime/);
  assert.doesNotMatch(liveRead, /const cwd = process\.cwd\(\)/);
  assert.match(liveRead, /fileURLToPath\(import\.meta\.url\)/);
  assert.match(liveRead, /app_v2_live_sheet_bridge\.py/);
  assert.doesNotMatch(liveRead, /현재 세션 준비 상태만 확인합니다/);

  assert.match(runner, /sourceReservationRuntime/);
  assert.match(runner, /writeSourceReservationsFixture/);
  assert.match(runner, /fetchWingsReservations/);
  assert.doesNotMatch(runner, /const cwd = process\.cwd\(\)/);
  assert.match(runner, /fileURLToPath\(import\.meta\.url\)/);
  assert.match(runner, /app_v2_reservation_management_bridge\.py/);

  console.log("regression_app_v2_live_runtime_contract: OK");
}

main();
