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
  const pkg = JSON.parse(read(root, "package.json"));
  const portableScript = read(root, "scripts/build_app_v2_portable.mjs");
  const windowRuntime = read(root, "app_v2/main/window.ts");
  const providerWorkspaceRuntime = read(root, "app_v2/main/providerWorkspaceManager.ts");
  const releaseDoc = read(root, "docs/runtime/APP_V2_PORTABLE_RELEASE.md");

  assert.equal(pkg.scripts["app:dist:portable"], "node scripts/build_app_v2_portable.mjs");
  assert.match(portableScript, /resources[\\/]+app/);
  assert.match(portableScript, /electron/);
  assert.match(portableScript, /desktop-icon\.ico|icon128\.png/);
  assert.match(
    portableScript,
    /fs\.cp\(path\.join\(root,\s*"icons"\),\s*path\.join\(appDir,\s*"icons"\),\s*\{\s*recursive:\s*true,\s*force:\s*true\s*\}\)/,
  );
  assert.match(portableScript, /runtimeJsAssets/);
  assert.match(portableScript, /runtimePythonAssets/);
  assert.match(portableScript, /reservation_sheet_audit\.py/);
  assert.match(portableScript, /src\/\*\*\/\*\.py|copyRuntimeSupportTree|copyRuntimePythonTree/);
  assert.match(portableScript, /copyRuntimeAsset\(path\.join\(root,\s*asset\),\s*asset\)/);
  assert.match(portableScript, /copyRuntimeAsset\(path\.join\(root,\s*"scripts",\s*script\),\s*path\.join\("scripts",\s*script\)\)/);
  assert.match(windowRuntime, /icon:/);
  assert.match(providerWorkspaceRuntime, /icon:/);
  assert.doesNotMatch(providerWorkspaceRuntime, /process\.cwd\(\)/);
  assert.match(releaseDoc, /portable/i);
  assert.match(releaseDoc, /app:dist:portable/);

  console.log("regression_app_v2_portable_package_contract: OK");
}

main();
