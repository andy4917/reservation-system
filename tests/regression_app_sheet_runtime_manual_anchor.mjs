import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

async function main() {
  const root = process.cwd();
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "uhs-sheet-runtime-anchor-"));
  const scanAnchorStore = await import(path.join(root, "dist-app/main/scanAnchorStore.js"));
  const sheetRuntime = await import(`${path.join(root, "dist-app/main/sheetRuntime.js")}?t=${Date.now()}`);

  scanAnchorStore.__setScanAnchorStoreDirForTests(tempDir);
  await scanAnchorStore.saveManualScanAnchor({
    branch: "GANGNAM",
    sheetRef: {
      spreadsheetId: "spreadsheet-123",
      sheetName: "운영시트",
      sheetId: null,
      timezone: "Asia/Seoul"
    },
    scan: {
      dateRow: 65,
      roomStartRow: 67,
      naverInventoryRow: 95
    }
  });

  const built = await sheetRuntime.__testSheetRuntimeInternals.buildEffectiveSyncConfigForQuery(
    {
      source: "env-json",
      syncConfig: {
        spreadsheet: "spreadsheet-123",
        sheetName: "운영시트",
        startRow: 1,
        year: 2026,
        scan: { mode: "auto" }
      },
      errors: []
    },
    {
      startDate: "2026-03-12",
      endDate: "2026-03-15",
      branch: "GANGNAM"
    }
  );

  assert.equal(built.manualScanAnchor?.scan.dateRow, 65);
  assert.equal(built.syncConfig.scan.mode, "manual");
  assert.equal(built.syncConfig.scan.roomStartRow, 67);
  assert.equal(built.syncConfig.scan.naverInventoryRow, 95);

  const withoutBranch = await sheetRuntime.__testSheetRuntimeInternals.buildEffectiveSyncConfigForQuery(
    {
      source: "env-json",
      syncConfig: {
        spreadsheet: "spreadsheet-123",
        sheetName: "운영시트",
        startRow: 1,
        year: 2026,
        scan: { mode: "auto" }
      },
      errors: []
    },
    {
      startDate: "2026-03-12",
      endDate: "2026-03-15"
    }
  );
  assert.equal(withoutBranch.manualScanAnchor, null);
  assert.equal(withoutBranch.syncConfig.scan.mode, "auto");

  scanAnchorStore.__setScanAnchorStoreDirForTests(null);
  await fs.rm(tempDir, { recursive: true, force: true });
  console.log("regression_app_sheet_runtime_manual_anchor: OK");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
