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

  assert.match(contracts, /wingsLogin/);
  assert.match(contracts, /loginId: string/);
  assert.match(contracts, /password: string/);
  assert.doesNotMatch(contracts, /operatorName: string/);
  assert.match(contracts, /attemptWingsLogin/);
  assert.match(settingsStore, /wingsLogin/);
  assert.doesNotMatch(settingsStore, /operatorName/);
  assert.match(preload, /attemptWingsLogin/);
  assert.match(ipc, /desktop-app:attempt-wings-login/);
  assert.doesNotMatch(ipc, /operatorName/);
  assert.match(providerWorkspace, /attemptWingsLogin/);
  assert.doesNotMatch(providerWorkspace, /operatorName/);
  assert.match(appSource, /WINGS 로그인 아이디/);
  assert.match(appSource, /WINGS 로그인 비밀번호/);
  assert.doesNotMatch(appSource, /사용자명/);

  console.log("regression_app_v2_wings_login_contract: OK");
}

main();
