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
  const providerWorkspaceManager = read(root, "app_v2/main/providerWorkspaceManager.ts");
  const liveReadActions = read(root, "app_v2/main/liveReadActions.ts");

  assert.match(appSource, /비밀번호를 저장하지 않습니다/);
  assert.match(appSource, /WINGS 창 열기/);
  assert.match(appSource, /세션 확인/);
  assert.doesNotMatch(appSource, /<span>WINGS 아이디<\/span>/);
  assert.doesNotMatch(appSource, /<span>비밀번호<\/span>/);

  assert.doesNotMatch(providerWorkspaceManager, /await maybeBootstrapWingsSession\(provider/);
  assert.doesNotMatch(providerWorkspaceManager, /submitWingsLoginForm/);
  assert.doesNotMatch(providerWorkspaceManager, /loadWingsCredentials/);
  assert.match(liveReadActions, /authMode:provider-session-only/);

  console.log("regression_app_v2_wings_manual_session_contract: OK");
}

main();
