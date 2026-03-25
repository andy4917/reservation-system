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

  assert.equal(fs.existsSync(path.join(root, "app_v2/renderer/mockShellData.ts")), false, "mock shell data should be removed");

  assert.match(contracts, /export type AppShellModule/);
  assert.match(contracts, /export type AppReservationAction/);
  assert.match(contracts, /export type AppBranch/);

  assert.match(appSource, /Frontend Skeleton/);
  assert.match(appSource, /Runtime readiness/);
  assert.match(appSource, /Provider sessions/);
  assert.match(appSource, /Config JSON/);
  assert.match(appSource, /Settings snapshot/);
  assert.match(appSource, /Live read input/);
  assert.match(appSource, /Reservation input/);
  assert.match(appSource, /window\.desktopApp/);
  assert.match(appSource, /JSON\.parse/);

  assert.doesNotMatch(appSource, /결과 내보내기/);
  assert.doesNotMatch(appSource, /앱 보기/);
  assert.doesNotMatch(appSource, /원본형 보기/);
  assert.doesNotMatch(appSource, /상세 보기/);
  assert.doesNotMatch(appSource, /0000/);
  assert.doesNotMatch(appSource, /const PROVIDER_LABELS/);
  assert.doesNotMatch(appSource, /coexMain:\s*"코엑스"/);
  assert.doesNotMatch(appSource, /coexAnnex:\s*"코엑스2"/);
  assert.doesNotMatch(appSource, /gangnam:\s*"강남"/);
  assert.doesNotMatch(appSource, /reportWindowDays:\s*"5"/);
  assert.doesNotMatch(appSource, /긴급클리닝|판매가|채널상태|프로모션|검토필요/);
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
