import assert from "node:assert/strict";
import path from "node:path";

async function main() {
  const root = process.cwd();
  const modulePath = path.join(root, "dist-app/main/runArtifactStore.js");
  const runArtifactStore = await import(`${modulePath}?t=${Date.now()}`);
  runArtifactStore.__resetRunArtifactStoreForTests();

  const artifact = runArtifactStore.storeSheetRunArtifact({
    source: "sheet-api",
    error: "",
    snapshot: { raw: true },
    summary: {
      spreadsheetId: "sheet-1",
      sheetName: "운영시트",
      startDate: "2026-03-12",
      endDate: "2026-03-15",
      readMode: "auto",
      retryReason: "auto-full-range",
      retryTrace: ["credential-refresh", "auto-full-range"],
      failureCategory: "sheet-structure",
      failureDetail: "PROVIDER_VALUE_ROW_MISSING",
      reservationBlockCount: 2,
      validationIssueCount: 1,
      inventoryRows: {
        NAVER: 10,
        STATION: 11
      },
      providerValueDays: {
        NAVER: 4,
        STATION: 4
      },
      anchorSummary: {
        namedRangeCount: 1,
        metadataCount: 2,
        hasScanConfigNamedRange: true,
        hasRoomMapNamedRange: false,
        hasMetadataScanConfig: true
      },
      hintSummary: {
        fingerprint: "abc",
        roomMapCount: 3,
        scanMode: "auto",
        manualMode: false,
        hasRoomTypeMap: true
      },
      validationSummary: {
        providerKey: "gangnam",
        issueCount: 1,
        errorCount: 1,
        warningCount: 0,
        issueCodes: ["PROVIDER_VALUE_ROW_MISSING"],
        hasTypeMismatch: false,
        hasPartitionMismatch: false,
        hasInsufficientRows: false,
        providerValueRawCount: 4,
        providerValueParsedCount: 4
      },
      coverage: {
        dateCount: 4,
        inventoryRowsDetected: {
          NAVER: true,
          STATION: true
        },
        inventoryValueRowsDetected: {
          NAVER: true,
          STATION: false
        },
        inventoryDataRowCounts: {
          NAVER: 12,
          STATION: 10
        },
        providerValueDays: {
          NAVER: 4,
          STATION: 4
        },
        reservationBlockCount: 2
      }
    }
  });

  const visibleSlice = runArtifactStore.getSheetArtifactVisibleSlice(artifact.runId, 0, 3);
  assert.equal(typeof artifact.runId, "string");
  assert.equal(visibleSlice.runId, artifact.runId);
  assert.equal(visibleSlice.offset, 0);
  assert.equal(visibleSlice.limit, 3);
  assert.equal(visibleSlice.lines.length, 3);
  assert.ok(visibleSlice.total >= visibleSlice.lines.length);
  assert.match(visibleSlice.lines[0], /운영시트/);

  console.log("regression_app_run_artifact_store: OK");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
