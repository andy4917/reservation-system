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
  const appSource = read(root, "app_v2/renderer/App.tsx");
  const viteConfig = read(root, "app_v2/vite.config.ts");
  const artifactCheck = read(root, "scripts/app_v2_artifact_check.mjs");
  const packageJson = JSON.parse(read(root, "package.json"));

  assert.match(contracts, /export const DEFAULT_APP_REPORT_WINDOW_DAYS/);
  assert.match(contracts, /export const DEFAULT_APP_BGE_MODEL_ID/);
  assert.match(contracts, /export const DEFAULT_APP_BGE_TOP_K/);
  assert.match(contracts, /export const DEFAULT_APP_BGE_SCORE_THRESHOLD/);

  assert.doesNotMatch(appSource, /useState\("코엑스"\)/);
  assert.doesNotMatch(appSource, /useState\("코엑스2"\)/);
  assert.doesNotMatch(appSource, /useState\("강남"\)/);
  assert.doesNotMatch(appSource, /useState\("선릉"\)/);
  assert.doesNotMatch(appSource, /useState\("삼성"\)/);
  assert.doesNotMatch(appSource, /sheetTabs\?\.coexMain \?\? "코엑스"/);
  assert.doesNotMatch(appSource, /sheetTabs\?\.coexAnnex \?\? "코엑스2"/);
  assert.doesNotMatch(appSource, /sheetTabs\?\.gangnam \?\? "강남"/);
  assert.doesNotMatch(appSource, /sheetTabs\?\.seolleung \?\? "선릉"/);
  assert.doesNotMatch(appSource, /sheetTabs\?\.samsung \?\? "삼성"/);
  assert.doesNotMatch(contracts, /APP_SHEET_TAB_FIELDS/);
  assert.match(contracts, /APP_PROVIDER_OPTIONS/);
  assert.doesNotMatch(appSource, /코엑스\(B동\)|코엑스2\(A동\)|강남|선릉|삼성/);

  assert.match(viteConfig, /emptyOutDir: true/);
  assert.match(artifactCheck, /orphanedAssetFiles/);
  assert.match(artifactCheck, /referencedAssetFiles/);
  assert.equal(packageJson.scripts["app:verify:artifacts"], "npm run app:build && node scripts/app_v2_artifact_check.mjs");

  console.log("regression_app_v2_cleanup_contract: OK");
}

main();
