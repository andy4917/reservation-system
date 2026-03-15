import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

async function main() {
  const root = process.cwd();
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "uhs-scan-anchor-store-"));
  const scanAnchorStore = await import(`${path.join(root, "dist-app/main/scanAnchorStore.js")}?t=${Date.now()}`);
  scanAnchorStore.__setScanAnchorStoreDirForTests(tempDir);

  const saved = await scanAnchorStore.saveManualScanAnchor({
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
      inventorySearchStartRow: 80,
      naverInventoryRow: 96
    }
  });

  assert.equal(saved.scan.dateRow, 65);
  assert.equal(saved.scan.naverInventoryRow, 96);

  const loaded = await scanAnchorStore.loadManualScanAnchor({
    branch: "GANGNAM",
    sheetRef: {
      spreadsheetId: "spreadsheet-123",
      sheetName: "운영시트",
      sheetId: null,
      timezone: "Asia/Seoul"
    }
  });
  assert.equal(loaded?.scan.roomStartRow, 67);

  const merged = scanAnchorStore.applyManualScanAnchorToSyncConfig(
    {
      spreadsheet: "spreadsheet-123",
      sheetName: "운영시트",
      scan: { mode: "auto" }
    },
    loaded
  );
  assert.equal(merged.scan.mode, "manual");
  assert.equal(merged.scan.dateRow, 65);

  const deleted = await scanAnchorStore.deleteManualScanAnchor({
    branch: "GANGNAM",
    sheetRef: {
      spreadsheetId: "spreadsheet-123",
      sheetName: "운영시트",
      sheetId: null,
      timezone: "Asia/Seoul"
    }
  });
  assert.equal(deleted, true);

  const storePath = scanAnchorStore.__getScanAnchorStorePathForTests();
  await fs.writeFile(storePath, "{not-json", "utf8");
  const corruptFallback = await scanAnchorStore.loadManualScanAnchor({
    branch: "GANGNAM",
    sheetRef: {
      spreadsheetId: "spreadsheet-123",
      sheetName: "운영시트",
      sheetId: null,
      timezone: "Asia/Seoul"
    }
  });
  assert.equal(corruptFallback, null);

  scanAnchorStore.__setScanAnchorStoreDirForTests(null);
  await fs.rm(tempDir, { recursive: true, force: true });
  console.log("regression_app_scan_anchor_store: OK");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
