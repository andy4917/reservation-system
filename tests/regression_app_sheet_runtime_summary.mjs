import assert from "node:assert/strict";
import path from "node:path";

async function main() {
  const root = process.cwd();
  delete process.env.UHS_SYNC_CONFIG_JSON;
  const sheetRuntime = await import(`${path.join(root, "dist-app/main/sheetRuntime.js")}?t=${Date.now()}`);
  sheetRuntime.__resetSheetRuntimeForTests();

  const result = await sheetRuntime.fetchSheetSnapshot({
    startDate: "2026-03-12",
    endDate: "2026-03-15"
  });

  assert.equal(result.source, "sheet-unconfigured");
  assert.ok(result.summary);
  assert.equal(result.summary.readMode, "unconfigured");
  assert.equal(result.summary.failureCategory, "access");
  assert.equal(result.summary.retryReason, null);
  assert.equal(result.summary.coverage.dateCount, 0);

  console.log("regression_app_sheet_runtime_summary: OK");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
