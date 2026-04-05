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
  const providerWorkspaceManager = read(root, "app_v2/main/providerWorkspaceManager.ts");
  const preflight = read(root, "app_v2/main/preflight.ts");

  assert.match(providerWorkspaceManager, /export async function waitForProviderBrowserSettle/);
  assert.match(providerWorkspaceManager, /UHS_APP_V2_PROVIDER_SETTLE_TIMEOUT_MS/);
  assert.match(preflight, /waitForProviderBrowserSettle/);
  assert.doesNotMatch(preflight, /Promise\.all\(APP_PROVIDERS\.map\(\(provider\) => ensureProviderBrowser\(provider\)\)\)/);

  console.log("regression_app_v2_preflight_settle_contract: OK");
}

main();
