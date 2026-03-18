import assert from "node:assert/strict";
import path from "node:path";

async function main() {
  const root = process.cwd();
  const sheetRuntime = await import(`${path.join(root, "dist-app/main/sheetRuntime.js")}?t=${Date.now()}`);

  const summary = sheetRuntime.__testSheetRuntimeInternals.buildSheetSnapshotSummary(
    {
      spreadsheetId: "spreadsheet-123",
      sheetName: "운영시트",
      naverValues: {
        "2026-03-12": { raw: "3" }
      },
      stationValues: {},
      trace: {
        retryTrace: ["credential-refresh", "assemble-full-range"]
      },
      readHints: {
        fingerprint: "fingerprint-1",
        roomMapCount: 0,
        anchorSummary: {
          namedRangeCount: 0,
          metadataCount: 0,
          hasScanConfigNamedRange: false,
          hasRoomMapNamedRange: false,
          hasMetadataScanConfig: false
        }
      },
      scan: {
        fetchMode: "full",
        mode: "auto",
        reservationBlockCount: 0,
        dateCount: 1,
        inventoryRows: {
          NAVER: 10,
          STATION: null
        },
        inventoryValueRows: {
          NAVER: 11,
          STATION: null
        },
        inventoryDataRows: {
          NAVER: [12],
          STATION: []
        },
        validation: {
          providerKey: "NAVER",
          hasTypeMismatch: false,
          hasPartitionMismatch: false,
          hasInsufficientRows: false,
          providerRow: 10,
          providerValueRow: 11,
          providerRowRole: "aggregate-only",
          providerValueSourceKind: "typed-row",
          providerValueSourceReason: "fallback_to_better_data_row",
          providerValueRawCount: 0,
          providerValueParsedCount: 0,
          issues: [
            {
              code: "PROVIDER_VALUE_ROW_MISSING",
              severity: "warn",
              message: "provider row missing"
            }
          ]
        },
        validationStructuralSummary: {
          typedSlotRows: {
            urban: 12,
            doubleTwin: null,
            grand: null
          },
          typedSlotComplete: false,
          typedSlotDuplicate: false,
          physicalOrderVariant: false,
          branchSectionEvidence: ["branch:GANGNAM", "dateRow:4"]
        }
      }
    },
    {
      startDate: "2026-03-12",
      endDate: "2026-03-12"
    },
    {
      source: "env-json",
      syncConfig: {
        spreadsheet: "spreadsheet-123",
        sheetName: "운영시트"
      },
      errors: []
    }
  );

  assert.equal(summary.failureCategory, "none");
  assert.equal(summary.retryReason, "assemble-full-range");
  assert.deepEqual(summary.retryTrace, ["credential-refresh", "assemble-full-range"]);
  assert.equal(summary.anchorSummary.metadataCount, 0);
  assert.equal(summary.anchorSummary.namedRangeCount, 0);
  assert.equal(summary.anchorSummary.manualAnchorUsed, false);
  assert.equal(summary.hintSummary.branchSectionEvidence.includes("branch:GANGNAM"), true);
  assert.equal(summary.coverage.dateCount, 1);
  assert.equal(summary.validationSummary.issueCodes.includes("PROVIDER_VALUE_ROW_MISSING"), true);
  assert.equal(summary.validationSummary.warningCount, 1);
  assert.equal(summary.validationSummary.providerRow, 10);
  assert.equal(summary.validationSummary.providerValueRow, 11);
  assert.equal(summary.validationSummary.providerValueSourceKind, "typed-row");
  assert.equal(summary.validationSummary.typedSlotRows.urban, 12);
  assert.equal(summary.failureDetail, "");

  console.log("regression_app_sheet_runtime_summary_builder: OK");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
