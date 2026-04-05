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
  const agents = read(root, "AGENTS.md");
  const hygiene = read(root, "scripts/check_contract_hygiene.py");
  const contracts = read(root, "src/desktop/app-v2-contracts.ts");
  const runtimePolicy = read(root, "src/desktop/app-v2-runtime-policy.ts");
  const workspaceManager = read(root, "app_v2/main/providerWorkspaceManager.ts");
  const providerOperating = read(root, "app_v2/main/providerOperatingAdapter.ts");
  const wingsSession = read(root, "app_v2/main/wingsSessionContract.ts");
  const appSource = read(root, "app_v2/renderer/App.tsx");

  assert.match(agents, /Do not hardcode operational values in product runtime files/i);
  assert.match(agents, /Only login ID\/password literals are allowed/i);
  assert.match(agents, /shared constants registry, settings store, branch runtime mapping, endpoint registry, or truth dataset/i);

  assert.match(hygiene, /hardcoded operational values/i);
  assert.match(hygiene, /operational_literal/);
  assert.match(hygiene, /Only login ID\/password literals may remain inline/i);
  assert.match(hygiene, /pms\\\.sanhait\\\.com/);
  assert.match(hygiene, /persist:app-v2-\(wings\|naver\|station\)/);
  assert.match(hygiene, /app-v2-runtime-policy\.ts/);
  assert.match(hygiene, /runtime_surface_files/);
  assert.match(contracts, /APP_PROVIDER_OPTION_RECORDS/);
  assert.doesNotMatch(contracts, /https:\/\/pms\.sanhait\.com|https:\/\/partner\.booking\.naver\.com|https:\/\/admin\.admin-stationbyuhc\.com|persist:app-v2-(wings|naver|station)|Xenova\/bge-m3/);
  assert.match(runtimePolicy, /export const APP_PROVIDER_OPTION_RECORDS/);
  assert.match(runtimePolicy, /export const APP_BRANCH_OPTION_RECORDS/);
  assert.match(runtimePolicy, /https:\/\/pms\.sanhait\.com/);
  assert.match(runtimePolicy, /persist:app-v2-wings/);
  assert.match(runtimePolicy, /강남/);
  assert.doesNotMatch(contracts, /APP_SHEET_TAB_FIELDS/);
  assert.doesNotMatch(workspaceManager, /https:\/\/pms\.sanhait\.com|https:\/\/partner\.booking\.naver\.com|https:\/\/new\.smartplace\.naver\.com|https:\/\/admin\.admin-stationbyuhc\.com|persist:app-v2-(wings|naver|station)/);
  assert.doesNotMatch(providerOperating, /sanhait\.com|naver\.com|admin-stationbyuhc\.com|identity\/samlsso/);
  assert.doesNotMatch(wingsSession, /https:\/\/pms\.sanhait\.com/);
  assert.doesNotMatch(appSource, /코엑스\(B동\)|코엑스2\(A동\)|강남|선릉|삼성/);
  assert.match(runtimePolicy, /Xenova\/bge-m3/);

  console.log("regression_app_v2_operational_hardcoding_guard: OK");
}

main();
