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

  const activeFiles = [
    "README.md",
    "run-app.ps1",
    "docs/runtime/HANDOFF.md",
    "docs/runtime/TASK_STATE.md",
    "docs/runtime/PLAN.md",
    "docs/runtime/STAGE_V1_CHECKLIST.md",
    "tests/regression_app_v2_shell_contract.mjs",
    "tests/regression_app_v2_operating_boundary.mjs",
    "scripts/app_v2_runtime_verify.mjs"
  ];

  activeFiles.forEach((relativePath) => {
    const content = read(root, relativePath);
    assert.doesNotMatch(content, /dist-app\/(?!app_v2\/|truth_dataset\/)(main|renderer|services|contracts|fixtures|src)\b/);
    assert.doesNotMatch(content, /dist-app\/vite\.config(?:\.js)?\b/);
    assert.doesNotMatch(content, /scripts\/live_read_verify\.mjs/);
    assert.doesNotMatch(content, /scripts\/live_sheet_verify\.mjs/);
  });

  const removedLegacyFiles = [
    "app_v2/renderer/mockShellData.ts",
    "scripts/live_read_verify.mjs",
    "scripts/live_sheet_verify.mjs",
    "scripts/dryrun_wings_live_flow.mjs",
    "tests/regression_ui_surface_split.mjs",
    "tests/regression_ui_settings_surface_runtime_scope.mjs",
    "dist-app/contracts",
    "dist-app/fixtures",
    "dist-app/main",
    "dist-app/renderer",
    "dist-app/services",
    "dist-app/src",
    "dist-app/vite.config",
    "dist-app/vite.config.js"
  ];

  removedLegacyFiles.forEach((relativePath) => {
    assert.equal(fs.existsSync(path.join(root, relativePath)), false, `${relativePath} should be removed`);
  });

  const legacyAppTests = fs
    .readdirSync(path.join(root, "tests"))
    .filter((name) => /^regression_app_(?!v2_).+\.mjs$/.test(name));
  assert.deepEqual(legacyAppTests, [], `legacy app regression tests should be removed: ${legacyAppTests.join(", ")}`);

  console.log("regression_app_v2_no_legacy_refs: OK");
}

main();
