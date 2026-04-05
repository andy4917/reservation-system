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
  const preload = read(root, "app_v2/main/preload.ts");
  const ipc = read(root, "app_v2/main/ipc.ts");
  const appSource = read(root, "app_v2/renderer/App.tsx");
  const providerWorkspace = read(root, "app_v2/main/providerWorkspaceManager.ts");
  const wingsImport = read(root, "app_v2/main/wingsSharedCredentials.ts");

  assert.match(contracts, /wingsSharedCredentials/);
  assert.match(contracts, /companyId: string/);
  assert.match(contracts, /branches: Record<AppBranch, AppWingsBranchCredential \| null>/);
  assert.match(contracts, /loginId: string/);
  assert.match(contracts, /password: string/);
  assert.doesNotMatch(contracts, /operatorName: string/);
  assert.match(contracts, /attemptWingsLogin/);
  assert.match(settingsStore, /wingsSharedCredentials/);
  assert.doesNotMatch(settingsStore, /operatorName/);
  assert.match(wingsImport, /UHSUITE/);
  assert.match(wingsImport, /WINGS 지점 공용\.txt/);
  assert.match(wingsImport, /COEX/);
  assert.match(wingsImport, /GANGNAM/);
  assert.match(wingsImport, /SEOLLEUNG/);
  assert.match(preload, /attemptWingsLogin/);
  assert.match(preload, /importWingsSharedCredentials/);
  assert.match(ipc, /desktop-app:attempt-wings-login/);
  assert.match(ipc, /desktop-app:import-wings-shared-credentials/);
  assert.doesNotMatch(ipc, /operatorName/);
  assert.match(providerWorkspace, /attemptWingsLogin/);
  assert.match(providerWorkspace, /companyId.*UHSUITE/);
  assert.match(providerWorkspace, /branch: AppBranch/);
  assert.match(providerWorkspace, /companyInput/);
  assert.doesNotMatch(providerWorkspace, /operatorName/);
  assert.match(appSource, /WINGS 공용 계정 가져오기/);
  assert.match(appSource, /가져온 지점 공용 계정을 사용합니다/);
  assert.doesNotMatch(appSource, /WINGS 로그인 아이디/);
  assert.doesNotMatch(appSource, /WINGS 로그인 비밀번호/);
  assert.doesNotMatch(appSource, /사용자명/);

  console.log("regression_app_v2_wings_login_contract: OK");
}

main();
