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
  const main = read(root, "app_v2/main/main.ts");
  const window = read(root, "app_v2/main/window.ts");

  assert.match(providerWorkspaceManager, /export async function primeProviderBrowsers/);
  assert.match(providerWorkspaceManager, /Promise\.all\(APP_PROVIDERS\.map\(\(provider\) => ensureProviderBrowser\(provider\)\)\)/);
  assert.match(providerWorkspaceManager, /export async function openProviderBrowser/);

  assert.match(main, /primeProviderBrowsers/);
  assert.match(main, /launchContext\.mode !== "interactive"/);
  assert.match(main, /void primeProviderBrowsers\(\)\.catch/);
  assert.match(main, /runPreflight/);
  assert.match(main, /openProviderBrowser/);
  assert.doesNotMatch(main, /BrowserWindow\.getAllWindows\(\)\.length === 0/);
  assert.match(main, /hasMainWindow/);

  assert.match(window, /export function hasMainWindow\(\)/);

  console.log("regression_app_v2_provider_session_bootstrap: OK");
}

main();
