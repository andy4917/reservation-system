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
    mappingArtifacts: [
      {
        runId: null,
        section: {
          spreadsheetId: "sheet-1",
          sheetName: "운영시트",
          sheetId: null,
          sectionKey: "GANGNAM",
          state: "active",
          titleRow: 1,
          headerRow: 4,
          roomStartRow: 6,
          inventoryStartRow: 21
        },
        anchors: [
          {
            anchorId: "sheet-1:운영시트:dateRow",
            kind: "dateRow",
            source: "manual",
            row: 4,
            confidence: 1,
            evidence: {
              why: "manual-anchor-field-present",
              competingCandidates: [],
              signals: ["dateRow:4"]
            }
          }
        ],
        bindings: [],
        unresolved: [
          {
            anchorId: "sheet-1:운영시트:grid-hash:NAVER:value-row",
            rawHeader: "PROVIDER_VALUE_ROW_MISSING",
            sampleValues: [],
            candidateTerms: ["inventory.provider-value-row"],
            reason: "provider-value-row-missing",
            status: "open"
          }
        ],
        providerValueSource: {
          providerKey: "gangnam",
          providerRow: 11,
          providerValueRow: 12,
          providerRowRole: "aggregate+typed-slot",
          sourceKind: "typed-row",
          sourceReason: "fallback_to_better_data_row",
          typedSlotRows: {
            urban: 12,
            doubleTwin: 13,
            grand: 11
          },
          typedSlotComplete: true,
          typedSlotDuplicate: false
        },
        structuralSummary: [
          {
            kind: "physicalOrderVariant",
            value: true,
            detail: "typed slot completeness와 별도로 physical row order variance를 구조 메타데이터로 유지"
          }
        ],
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
          providerValueParsedCount: 4,
          providerRow: 11,
          providerValueRow: 12,
          providerRowRole: "aggregate+typed-slot",
          providerValueSourceKind: "typed-row",
          providerValueSourceReason: "fallback_to_better_data_row",
          typedSlotRows: {
            urban: 12,
            doubleTwin: 13,
            grand: 11
          },
          typedSlotComplete: true,
          typedSlotDuplicate: false,
          physicalOrderVariant: true
        }
      }
    ],
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
        hasMetadataScanConfig: true,
        manualAnchorUsed: true,
        manualAnchorFields: ["dateRow", "roomStartRow"]
      },
      hintSummary: {
        fingerprint: "abc",
        roomMapCount: 3,
        scanMode: "auto",
        manualMode: false,
        hasRoomTypeMap: true,
        branch: "GANGNAM",
        branchSectionEvidence: ["branch:GANGNAM", "sheet:운영시트"]
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
        providerValueParsedCount: 4,
        providerRow: 11,
        providerValueRow: 12,
        providerRowRole: "aggregate+typed-slot",
        providerValueSourceKind: "typed-row",
        providerValueSourceReason: "fallback_to_better_data_row",
        typedSlotRows: {
          urban: 12,
          doubleTwin: 13,
          grand: 11
        },
        typedSlotComplete: true,
        typedSlotDuplicate: false,
        physicalOrderVariant: true
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
  assert.equal(artifact.lines.some((line) => /manual=yes/.test(line)), true);
  assert.equal(artifact.lines.some((line) => /typed-slots=complete/.test(line)), true);
  assert.equal(artifact.mappingArtifacts.length, 1);
  assert.equal(artifact.mappingArtifacts[0].runId, artifact.runId);
  assert.equal(artifact.lines.some((line) => /mapping-sections=1/.test(line)), true);
  assert.equal(artifact.lines.some((line) => /state=active/.test(line)), true);

  console.log("regression_app_run_artifact_store: OK");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
