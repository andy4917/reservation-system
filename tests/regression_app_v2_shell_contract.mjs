import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function read(root, relativePath) {
  const filePath = path.join(root, relativePath);
  assert.equal(fs.existsSync(filePath), true, `${relativePath} should exist`);
  return fs.readFileSync(filePath, "utf8");
}

function readJson(root, relativePath) {
  return JSON.parse(read(root, relativePath));
}

function main() {
  const root = process.cwd();
  assert.equal(fs.existsSync(path.join(root, "app")), false, "legacy app/ should be deleted");

  const pkg = readJson(root, "package.json");
  assert.equal(pkg.main, "dist-app/app_v2/main/main.js");
  assert.equal(pkg.scripts["app:dev:renderer"], "vite --config app_v2/vite.config.ts");
  assert.equal(pkg.scripts["app:build:renderer"], "vite build --config app_v2/vite.config.ts");
  assert.equal(pkg.scripts["app:preview"], "vite preview --config app_v2/vite.config.ts");
  assert.equal(pkg.scripts["app:verify:artifacts"], "npm run app:build:main && node scripts/app_v2_artifact_check.mjs");
  assert.equal(pkg.scripts["app:verify:sheet-live"], "node scripts/app_v2_runtime_verify.mjs --focus sheet-live");
  assert.equal(pkg.scripts["app:verify:live-read"], "node scripts/app_v2_runtime_verify.mjs --focus live-read");

  const tsconfig = readJson(root, "tsconfig.json");
  assert.deepEqual(tsconfig.include, ["app_v2/**/*", "src/desktop/**/*.ts"]);

  const runnerPackage = readJson(root, "app_v2/package.json");
  assert.equal(runnerPackage.main, "../dist-app/app_v2/main/main.js");
  assert.equal(fs.existsSync(path.join(root, "app/package.json")), false, "legacy app/package.json should be deleted");

  const requiredFiles = [
    "app_v2/vite.config.ts",
    "app_v2/main/main.ts",
    "app_v2/main/window.ts",
    "app_v2/main/appMode.ts",
    "app_v2/main/mainRuntimeStartup.ts",
    "app_v2/main/preload.ts",
    "app_v2/main/ipc.ts",
    "app_v2/main/providerWorkspaceManager.ts",
    "app_v2/main/providerOperatingAdapter.ts",
    "app_v2/main/settingsStore.ts",
    "app_v2/main/preflight.ts",
    "app_v2/main/runtimeVerificationProcess.ts",
    "app_v2/main/runtimeReadiness.ts",
    "app_v2/main/sheetReadiness.ts",
    "app_v2/main/smokeHarness.ts",
    "app_v2/renderer/index.html",
    "app_v2/renderer/main.tsx",
    "app_v2/renderer/App.tsx",
    "app_v2/renderer/env.d.ts",
    "app_v2/renderer/styles/app.css",
    "src/desktop/app-v2-contracts.ts",
    "scripts/app_v2_artifact_check.mjs",
    "scripts/app_v2_runtime_verify.mjs",
    "scripts/app_v2_runtime_verify_support.mjs",
    "scripts/lib/atomicWriteJsonFile.mjs"
  ];
  requiredFiles.forEach((relativePath) => {
    read(root, relativePath);
  });

  const sharedContracts = read(root, "src/desktop/app-v2-contracts.ts");
  assert.match(sharedContracts, /export type AppProvider/);
  assert.match(sharedContracts, /export type AppProviderOperatingStatus/);
  assert.match(sharedContracts, /export interface AppSettings/);
  assert.match(sharedContracts, /export interface AppPreflightSnapshot/);
  assert.match(sharedContracts, /export interface AppProviderOperatingSnapshot/);
  assert.match(sharedContracts, /export interface AppRuntimeVerifySnapshot/);
  assert.match(sharedContracts, /export interface AppSheetReadinessSnapshot/);
  assert.match(sharedContracts, /export interface AppProviderRawRuntimeSignals/);
  assert.match(sharedContracts, /export interface AppProviderOperatingEvidence/);
  assert.match(sharedContracts, /rawSignals|operatingEvidence/);
  assert.match(sharedContracts, /providerCookieCount/);

  const preload = read(root, "app_v2/main/preload.ts");
  assert.match(preload, /desktopApp/);
  assert.match(preload, /loadSettings/);
  assert.match(preload, /saveSettings/);
  assert.match(preload, /listProviderBrowsers/);
  assert.match(preload, /runPreflight/);

  const ipc = read(root, "app_v2/main/ipc.ts");
  assert.match(ipc, /desktop-app:load-settings/);
  assert.match(ipc, /desktop-app:save-settings/);
  assert.match(ipc, /desktop-app:list-provider-browsers/);
  assert.match(ipc, /desktop-app:run-preflight/);

  const providerAdapter = read(root, "app_v2/main/providerOperatingAdapter.ts");
  assert.match(providerAdapter, /rawSignals/);
  assert.match(providerAdapter, /operatingEvidence/);

  const hygiene = read(root, "scripts/check_contract_hygiene.py");
  assert.match(hygiene, /app_v2\/main\//);
  assert.match(hygiene, /app_v2\/renderer\//);
  assert.match(hygiene, /dist-app package\.json must be written atomically/);

  const packageJsonWriter = read(root, "scripts/write-dist-app-package-json.mjs");
  assert.match(packageJsonWriter, /atomicWriteJsonFile/);
  assert.doesNotMatch(packageJsonWriter, /writeFile\s*\(\s*packageJsonPath/);

  requiredFiles
    .filter((relativePath) => relativePath.startsWith("app_v2/"))
    .forEach((relativePath) => {
      const content = read(root, relativePath);
      assert.doesNotMatch(content, /app\/contracts/);
    });

  console.log("regression_app_v2_shell_contract: OK");
}

main();
