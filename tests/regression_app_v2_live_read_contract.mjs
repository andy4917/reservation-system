import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

function read(root, relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

async function main() {
  const root = process.cwd();
  const source = read(root, "app_v2/main/liveReadActions.ts");
  const contractHelper = read(root, "app_v2/main/wingsSessionContract.ts");
  assert.doesNotMatch(source, /라이브 조회는 아직 연결되지 않았습니다/);
  assert.match(source, /runtimeHost:/);
  assert.match(source, /sessionReadiness:/);
  assert.match(source, /sourceLineage:/);
  assert.match(source, /buildWingsSessionReadScript/);
  assert.doesNotMatch(source, /body\.set\("filter\[filters\]\[0\]\[field\]"/);
  assert.doesNotMatch(source, /body\.set\("ARRV_DATE_F"/);
  assert.match(contractHelper, /buildWingsSessionReadScript/);
  assert.match(contractHelper, /buildWingsReadonlyRequestContract/);

  const build = spawnSync("npm", ["run", "app:build:main"], {
    cwd: root,
    encoding: "utf8"
  });
  assert.equal(build.status, 0, `app:build:main should succeed\nstdout:\n${build.stdout}\nstderr:\n${build.stderr}`);

  const modulePath = path.join(root, "dist-app", "app_v2", "main", "branchRuntimeConfig.js");
  const runtimeConfig = await import(modulePath);

  const seolleung = runtimeConfig.getBranchRuntimeProfile("SEOLLEUNG");
  const samsung = runtimeConfig.getBranchRuntimeProfile("SAMSUNG");

  assert.equal(seolleung.availability, "active");
  assert.equal(samsung.availability, "inactive");
  assert.equal(samsung.gate.readAllowed, false);
  assert.equal(samsung.gate.actionAllowed, false);
  assert.deepEqual(seolleung.sheetScope, {
    spreadsheetId: "1q7mC5p0DKIFboiiOS_aQHoQLzdtszFb76-ntEvOvMj8",
    sheetName: "2026"
  });
  assert.deepEqual(samsung.sheetScope, {
    spreadsheetId: "1q7mC5p0DKIFboiiOS_aQHoQLzdtszFb76-ntEvOvMj8",
    sheetName: "2026"
  });
  assert.equal("sheetTabs" in seolleung, false);
  assert.ok(Array.isArray(seolleung.providerBindings), "provider bindings should exist");
  assert.ok(seolleung.providerBindings.some((row) => row.provider === "wings-pms"), "SEOLLEUNG should expose PMS session binding");
  assert.ok(seolleung.providerBindings.some((row) => row.provider === "admin-station"), "SEOLLEUNG should expose Station session binding");
  const seolleungPms = seolleung.providerBindings.find((row) => row.provider === "wings-pms");
  assert.equal(seolleungPms?.metadata?.propertyNo, "14");
  assert.equal(seolleungPms?.metadata?.bsnsCode, "14");

  console.log("regression_app_v2_live_read_contract: OK");
}

await main();
