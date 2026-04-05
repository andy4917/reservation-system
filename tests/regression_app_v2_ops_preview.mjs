import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

function main() {
  const root = process.cwd();
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "uhs-app-v2-ops-test-"));
  const result = spawnSync(
    "python3",
    [
      path.join(root, "scripts", "app_v2_ops_preview.py"),
      "--branch",
      "COEX",
      "--start-date",
      "2026-03-20",
      "--end-date",
      "2026-03-24",
      "--out-dir",
      outDir,
    ],
    { cwd: root, encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(fs.existsSync(path.join(outDir, "ops_summary.json")), true);
  assert.equal(fs.existsSync(path.join(outDir, "orderlist_report.tsv")), true);
  assert.equal(fs.existsSync(path.join(outDir, "arrival_report.tsv")), true);

  const summary = JSON.parse(fs.readFileSync(path.join(outDir, "ops_summary.json"), "utf8"));
  assert.equal(summary.input.branch, "COEX");
  assert.equal(summary.input.start_date, "2026-03-20");
  assert.equal(summary.input.end_date, "2026-03-24");

  console.log("regression_app_v2_ops_preview: OK");
}

main();
