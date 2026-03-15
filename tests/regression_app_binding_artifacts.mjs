import assert from "node:assert/strict";
import path from "node:path";

async function main() {
  const root = process.cwd();
  const bindingArtifacts = await import(`${path.join(root, "dist-app/services/bindingArtifacts.js")}?t=${Date.now()}`);

  const sheetRead = {
    supportLevel: "partial-live",
    sourceLabel: "시트 오류 확인 필요",
    lastRunAt: new Date().toISOString(),
    selectedRunId: "sheet-run:test",
    visibleSlice: {
      runId: "sheet-run:test",
      offset: 0,
      limit: 12,
      total: 1,
      lines: ["sample"]
    },
    summary: {
      spreadsheetId: "spreadsheet-123",
      sheetName: "운영시트",
      startDate: "2026-03-12",
      endDate: "2026-03-15",
      readMode: "full",
      retryReason: "assemble-full-range",
      retryTrace: ["credential-refresh", "assemble-full-range"],
      failureCategory: "sheet-structure",
      failureDetail: "PROVIDER_VALUE_ROW_MISSING",
      reservationBlockCount: 0,
      validationIssueCount: 1,
      inventoryRows: {
        NAVER: 10,
        STATION: null
      },
      providerValueDays: {
        NAVER: 0,
        STATION: 0
      },
      anchorSummary: {
        namedRangeCount: 0,
        metadataCount: 0,
        hasScanConfigNamedRange: false,
        hasRoomMapNamedRange: false,
        hasMetadataScanConfig: false
      },
      hintSummary: {
        fingerprint: "fingerprint-1",
        roomMapCount: 0,
        scanMode: "auto",
        manualMode: false,
        hasRoomTypeMap: false
      },
      validationSummary: {
        providerKey: "NAVER",
        issueCount: 1,
        errorCount: 0,
        warningCount: 1,
        issueCodes: ["PROVIDER_VALUE_ROW_MISSING"],
        hasTypeMismatch: false,
        hasPartitionMismatch: false,
        hasInsufficientRows: false,
        providerValueRawCount: 0,
        providerValueParsedCount: 0
      },
      coverage: {
        dateCount: 4,
        inventoryRowsDetected: {
          NAVER: true,
          STATION: false
        },
        inventoryValueRowsDetected: {
          NAVER: false,
          STATION: false
        },
        inventoryDataRowCounts: {
          NAVER: 10,
          STATION: 0
        },
        providerValueDays: {
          NAVER: 0,
          STATION: 0
        },
        reservationBlockCount: 0
      }
    }
  };

  const generated = bindingArtifacts.buildGeneratedBindingDraft(sheetRead, "GANGNAM");
  assert.equal(generated.sheetTerms.length >= 4, true);
  assert.equal(generated.unresolvedBindings.some((item) => item.reason === "room-map-missing"), true);
  assert.equal(generated.unresolvedBindings.some((item) => item.reason === "provider-value-row-missing"), true);

  const merged = bindingArtifacts.mergeBindingDraftWithSavedDecisions(
    generated,
    [
      {
        decisionKey: "gangnam|spreadsheet-123|운영시트|spreadsheet-123:운영시트:grid-hash:naver:value-row|provider_value_row_missing",
        branch: "GANGNAM",
        sheetRef: {
          spreadsheetId: "spreadsheet-123",
          sheetName: "운영시트",
          sheetId: null,
          timezone: "Asia/Seoul"
        },
        anchorId: "spreadsheet-123:운영시트:grid-hash:NAVER:value-row",
        rawHeader: "PROVIDER_VALUE_ROW_MISSING",
        termId: "inventory.provider-value-row",
        method: "manual",
        decidedAt: new Date().toISOString(),
        confidence: 1
      }
    ],
    "GANGNAM"
  );
  assert.equal(merged.termBindings.some((item) => item.termId === "inventory.provider-value-row"), true);
  assert.equal(
    merged.termBindings.some(
      (item) => item.termId === "inventory.provider-value-row" && item.decisionKey && item.rawHeader === "PROVIDER_VALUE_ROW_MISSING"
    ),
    true
  );
  assert.equal(merged.unresolvedBindings.some((item) => item.reason === "provider-value-row-missing"), false);

  const staleMerged = bindingArtifacts.mergeBindingDraftWithSavedDecisions(
    generated,
    [
      {
        decisionKey: "coex|spreadsheet-123|운영시트|spreadsheet-123:운영시트:grid-hash:naver:value-row|provider_value_row_missing",
        branch: "COEX",
        sheetRef: {
          spreadsheetId: "spreadsheet-123",
          sheetName: "운영시트",
          sheetId: null,
          timezone: "Asia/Seoul"
        },
        anchorId: "spreadsheet-123:운영시트:grid-hash:NAVER:value-row",
        rawHeader: "PROVIDER_VALUE_ROW_MISSING",
        termId: "inventory.provider-value-row",
        method: "manual",
        decidedAt: new Date().toISOString(),
        confidence: 1
      }
    ],
    "GANGNAM"
  );
  assert.equal(staleMerged.termBindings.length, 0);
  assert.equal(staleMerged.unresolvedBindings.some((item) => item.reason === "provider-value-row-missing"), true);

  console.log("regression_app_binding_artifacts: OK");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
