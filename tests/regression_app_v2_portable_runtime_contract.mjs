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
  const portableScript = read(root, "scripts/build_app_v2_portable.mjs");
  const embeddingRuntime = read(root, "app_v2/main/embeddingRuntime.ts");
  const bgeInstaller = read(root, "app_v2/main/bgeModelInstaller.ts");

  assert.match(portableScript, /reservation_sheet_audit\.py/);
  assert.match(portableScript, /src\/\*\*\/\*\.py|copyRuntimeSupportTree|copyRuntimePythonTree/);
  assert.match(embeddingRuntime, /ERR_MODULE_NOT_FOUND|Cannot find package/);
  assert.match(embeddingRuntime, /Transformers runtime unavailable|BGE-M3 runtime unavailable/);
  assert.match(bgeInstaller, /loadTransformersRuntime/);
  assert.match(bgeInstaller, /status:\s*"error"/);
  assert.match(bgeInstaller, /summary:\s*runtime\.reason/);

  console.log("regression_app_v2_portable_runtime_contract: OK");
}

main();
