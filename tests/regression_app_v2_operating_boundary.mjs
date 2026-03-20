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
  assert.match(contracts, /export type AppRuntimeVerifyFocus/);
  assert.match(contracts, /export type AppReadinessBlockingSource/);
  assert.match(contracts, /export interface AppSheetReadinessSnapshot/);
  assert.match(contracts, /export interface AppRuntimeVerifySnapshot/);
  assert.doesNotMatch(contracts, /authBundle|HAR|bridge fallback|legacy fallback/);

  const ipc = read(root, "app_v2/main/ipc.ts");
  assert.doesNotMatch(ipc, /authBundle|HAR|bridge fallback|legacy fallback/);

  const preload = read(root, "app_v2/main/preload.ts");
  assert.doesNotMatch(preload, /authBundle|HAR|bridge fallback|legacy fallback/);

  const main = read(root, "app_v2/main/main.ts");
  assert.doesNotMatch(main, /UHS_APP_V2_RUNTIME_PROBE/);
  assert.doesNotMatch(main, /UHS_APP_V2_SMOKE_TEST/);
  assert.doesNotMatch(main, /app-v2-smoke:/);
  assert.doesNotMatch(main, /runRuntimeVerify/);
  assert.match(main, /readAppLaunchMode/);

  const manager = read(root, "app_v2/main/providerWorkspaceManager.ts");
  assert.doesNotMatch(manager, /providerWorkspaceReadiness|providerOperatingAdapter/);
  assert.doesNotMatch(manager, /needs-login|attention/);

  const appMode = read(root, "app_v2/main/appMode.ts");
  assert.match(appMode, /export type AppLaunchMode/);
  assert.match(appMode, /UHS_APP_V2_RUNTIME_VERIFY/);
  assert.match(appMode, /UHS_APP_V2_SMOKE_TEST/);

  const runtimeProbe = read(root, "app_v2/main/runtimeVerificationProcess.ts");
  assert.match(runtimeProbe, /runRuntimeVerificationProcess/);
  assert.match(runtimeProbe, /evaluateRuntimeReadiness/);

  const guardrails = read(root, "scripts/check_contract_hygiene.py");
  assert.match(guardrails, /verify-only/);
  assert.match(guardrails, /UHS_APP_V2_RUNTIME_VERIFY/);
  assert.match(guardrails, /app-v2-smoke:/);
  assert.match(guardrails, /providerWorkspaceManager must stay on window lifecycle and raw page signals/i);
  assert.match(guardrails, /preflight\s+summary/i);

  const operatingContract = read(root, "docs/architecture/APP_V2_OPERATING_CONTRACT.md");
  assert.match(operatingContract, /Electron main is the source of truth/i);
  assert.match(operatingContract, /Renderer is a thin control panel/i);
  assert.match(operatingContract, /Verification and smoke paths are not product runtime/i);
  assert.match(operatingContract, /Do not promote probe, smoke, placeholder, or fallback logic into the default runtime path/i);
  assert.match(operatingContract, /provider operating adapter/i);
  assert.match(operatingContract, /heuristic operating verdicts must not live in providerWorkspaceManager/i);
  assert.match(operatingContract, /provider operating evidence|operating evidence/i);

  console.log("regression_app_v2_operating_boundary: OK");
}

main();
