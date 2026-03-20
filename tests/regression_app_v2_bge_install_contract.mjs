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
  const installer = read(root, "app_v2/main/bgeModelInstaller.ts");
  const appSource = read(root, "app_v2/renderer/App.tsx");

  assert.match(contracts, /AppBgeInstallSnapshot/);
  assert.match(installer, /Xenova\/bge-m3/);
  assert.match(installer, /installBgeM3Model/);
  assert.match(installer, /cacheDir/);
  assert.match(installer, /sentence_transformers/);
  assert.match(installer, /dtype: "q8"/);
  assert.match(appSource, /installBgeM3Model/);
  assert.match(appSource, /BGE-M3 설치/);

  console.log("regression_app_v2_bge_install_contract: OK");
}

main();
