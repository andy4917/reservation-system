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
  const preload = read(root, "app_v2/main/preload.ts");
  const ipc = read(root, "app_v2/main/ipc.ts");
  const providerWorkspaceManager = read(root, "app_v2/main/providerWorkspaceManager.ts");
  const appSource = read(root, "app_v2/renderer/App.tsx");

  assert.match(contracts, /export interface AppWingsLoginInput/);
  assert.match(contracts, /loginWingsSession:\s*\(input:\s*AppWingsLoginInput\)/);

  assert.match(preload, /loginWingsSession:\s*\(input(?::\s*unknown)?\)\s*=>\s*ipcRenderer\.invoke\("desktop-app:login-wings-session",\s*input\)/);
  assert.match(ipc, /ipcMain\.handle\("desktop-app:login-wings-session"/);
  assert.match(providerWorkspaceManager, /export async function loginWingsSession\(/);
  assert.match(appSource, /\.loginWingsSession\(/);

  console.log("regression_app_v2_wings_session_bridge_contract: OK");
}

main();
