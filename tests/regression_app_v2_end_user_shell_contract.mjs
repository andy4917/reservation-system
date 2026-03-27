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

  const appSource = read(root, "app_v2/renderer/App.tsx");
  const contracts = read(root, "src/desktop/app-v2-contracts.ts");
  const preload = read(root, "app_v2/main/preload.ts");
  const ipc = read(root, "app_v2/main/ipc.ts");
  const api = read(root, "app_v2/renderer/api.ts");
  const model = read(root, "app_v2/renderer/model.ts");
  const state = read(root, "app_v2/renderer/state.ts");

  assert.equal(fs.existsSync(path.join(root, "app_v2/renderer/mockShellData.ts")), false, "mock shell data should be removed");

  assert.match(contracts, /export type AppShellModule/);
  assert.match(contracts, /export type AppReservationAction/);
  assert.match(contracts, /export type AppBranch/);
  assert.match(contracts, /"GANGNAM", "COEX", "SEOLLEUNG", "SAMSEONG"/);

  assert.match(api, /window\.desktopApp/);
  assert.match(model, /SIDEBAR_MENUS/);
  assert.match(model, /BRANCH_OPTIONS/);
  assert.match(model, /세션/);
  assert.match(model, /읽기/);
  assert.match(model, /작업/);
  assert.match(model, /결과/);
  assert.match(model, /WINGS/);
  assert.match(model, /NAVER/);
  assert.match(model, /STATION/);
  assert.match(model, /compare/);
  assert.match(model, /validate/);
  assert.match(model, /reconcile/);
  assert.match(model, /apply/);
  assert.match(model, /order-list/);
  assert.match(model, /arrival/);
  assert.match(model, /강남/);
  assert.match(model, /코엑스/);
  assert.match(model, /선릉/);
  assert.match(model, /삼성/);
  assert.match(state, /useAppWorkbench/);

  assert.doesNotMatch(appSource, /Frontend Skeleton/);
  assert.doesNotMatch(appSource, /Runtime readiness/);
  assert.doesNotMatch(appSource, /Provider sessions/);
  assert.doesNotMatch(appSource, /Config JSON/);
  assert.doesNotMatch(appSource, /Settings snapshot/);
  assert.doesNotMatch(appSource, /Live read input/);
  assert.doesNotMatch(appSource, /Reservation input/);
  assert.doesNotMatch(appSource, /breadcrumb|footer|KPI/i);
  assert.doesNotMatch(appSource, /JSON\.parse/);
  assert.doesNotMatch(appSource, /mockShellData/);

  assert.match(preload, /runPmsRead/);
  assert.match(preload, /runOtaRead/);
  assert.match(preload, /runSheetRead/);
  assert.match(preload, /installBgeM3Model/);
  assert.match(ipc, /desktop-app:run-pms-read/);
  assert.match(ipc, /desktop-app:run-ota-read/);
  assert.match(ipc, /desktop-app:run-sheet-read/);
  assert.match(ipc, /desktop-app:install-bge-m3-model/);

  console.log("regression_app_v2_end_user_shell_contract: OK");
}

main();
