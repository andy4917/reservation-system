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
      lines: ["line-1"]
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
        hasMetadataScanConfig: false,
        manualAnchorUsed: true,
        manualAnchorFields: ["dateRow", "inventorySearchStartRow"]
      },
      hintSummary: {
        fingerprint: "fingerprint-1",
        roomMapCount: 0,
        scanMode: "auto",
        manualMode: false,
        hasRoomTypeMap: false,
        branch: "GANGNAM",
        branchSectionEvidence: ["branch:GANGNAM", "sheet:운영시트"]
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
        providerValueParsedCount: 0,
        providerRow: 10,
        providerValueRow: null,
        providerRowRole: "aggregate-only",
        providerValueSourceKind: "none",
        providerValueSourceReason: "",
        typedSlotRows: {
          urban: null,
          doubleTwin: null,
          grand: null
        },
        typedSlotComplete: false,
        typedSlotDuplicate: false,
        physicalOrderVariant: false
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
  assert.equal(generated.mappingArtifacts.length, 1);
  assert.equal(generated.mappingArtifacts[0].section.sectionKey, "GANGNAM");
  assert.equal(generated.mappingArtifacts[0].section.state, "preopen");
  assert.equal(generated.mappingArtifacts[0].providerValueSource.providerRowRole, "aggregate-only");
  assert.equal(generated.mappingArtifacts[0].metrics?.exactAutoBindingCount, 0);
  assert.equal(generated.mappingArtifacts[0].metrics?.softTriageCount, 0);
  assert.equal(generated.mappingArtifacts[0].metrics?.precisionGate, "not-applicable");
  assert.equal(generated.unresolvedBindings.some((item) => item.reason === "room-map-missing"), true);
  assert.equal(generated.unresolvedBindings.some((item) => item.reason === "provider-value-row-missing"), true);
  const roomMapUnresolved = generated.unresolvedBindings.find((item) => item.reason === "room-map-missing");
  assert.equal(roomMapUnresolved ? roomMapUnresolved.status === "open" : false, true);
  assert.equal(roomMapUnresolved?.candidateTerms.includes("inventory.room-map"), true);
  assert.equal(Array.isArray(roomMapUnresolved?.sampleValues), true);
  assert.equal(typeof roomMapUnresolved?.mappingDomain, "string");
  assert.equal(typeof roomMapUnresolved?.severity, "string");
  assert.equal(typeof roomMapUnresolved?.confidence, "number");
  assert.equal(Array.isArray(roomMapUnresolved?.evidenceSignals), true);
  assert.equal(roomMapUnresolved?.evidenceSignals?.some((entry) => typeof entry === "string"), true);

  const aliasAware = bindingArtifacts.buildGeneratedBindingDraft(
    {
      ...sheetRead,
      summary: {
        ...sheetRead.summary,
        validationSummary: {
          ...sheetRead.summary.validationSummary,
          issueCodes: [
            ...sheetRead.summary.validationSummary.issueCodes,
            "RESERVATION_ALIAS_AMBIGUOUS",
            "RESERVATION_IDENTITY_MATCH_REQUIRED"
          ]
        }
      }
    },
    "GANGNAM"
  );
  const mappingUnresolved = aliasAware.unresolvedBindings.find((item) => item.reason === "mapping-unresolved");
  assert.equal(Array.isArray(mappingUnresolved?.candidateTerms), true);
  assert.equal(mappingUnresolved?.candidateTerms.includes("inventory.room-alias"), true);
  assert.equal(mappingUnresolved?.rawHeader.includes("RESERVATION"), true);
  const identityUnresolved = aliasAware.unresolvedBindings.find((item) =>
    item.candidateTerms.includes("reservation.identity")
  );
  assert.equal(identityUnresolved ? identityUnresolved.reason === "mapping-unresolved" : false, true);

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
  assert.equal(merged.mappingArtifacts[0].bindings.some((item) => item.termId === "inventory.provider-value-row"), true);
  assert.equal(
    merged.termBindings.some(
      (item) => item.termId === "inventory.provider-value-row" && item.decisionKey && item.rawHeader === "PROVIDER_VALUE_ROW_MISSING"
    ),
    true
  );
  assert.equal(merged.unresolvedBindings.some((item) => item.reason === "provider-value-row-missing"), false);
  assert.equal(merged.mappingArtifacts[0].unresolved.some((item) => item.reason === "provider-value-row-missing"), false);
  assert.equal(merged.mappingArtifacts[0].metrics?.manualBindingCount, 1);
  assert.equal(merged.mappingArtifacts[0].metrics?.exactAutoBindingCount, 0);

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
  assert.equal(staleMerged.mappingArtifacts[0].bindings.length, 0);

  const generatedFromSnapshot = bindingArtifacts.buildGeneratedBindingDraftFromSnapshot(
    {
      scan: {
        sections: [
          {
            sectionKey: "GANGNAM",
            state: "active",
            titleRow: 1,
            headerRow: 4,
            roomStartRow: 6,
            inventoryStartRow: 21,
            evidence: ["sectionKey:GANGNAM", "titleRow:1", "headerRow:4"]
          },
          {
            sectionKey: "COEX",
            state: "preopen",
            titleRow: 62,
            headerRow: 65,
            roomStartRow: null,
            inventoryStartRow: null,
            evidence: ["sectionKey:COEX", "titleRow:62", "headerRow:65"]
          },
          {
            sectionKey: "BRANCH_THE_SAMSEONG",
            state: "preopen",
            titleRow: 248,
            headerRow: 251,
            roomStartRow: null,
            inventoryStartRow: 282,
            evidence: ["sectionKey:BRANCH_THE_SAMSEONG", "titleRow:248", "headerRow:251"]
          }
        ]
      }
    },
    sheetRead.summary,
    "GANGNAM",
    "sheet-run:test"
  );
  assert.equal(generatedFromSnapshot.mappingArtifacts.length, 3);
  assert.equal(generatedFromSnapshot.mappingArtifacts[0].section.titleRow, 1);
  assert.equal(generatedFromSnapshot.mappingArtifacts[0].section.state, "active");
  assert.equal(generatedFromSnapshot.mappingArtifacts[0].section.headerRow, 4);
  assert.equal(generatedFromSnapshot.mappingArtifacts[0].unresolved.length > 0, true);
  assert.equal(generatedFromSnapshot.mappingArtifacts[1].section.sectionKey, "COEX");
  assert.equal(generatedFromSnapshot.mappingArtifacts[1].section.state, "preopen");
  assert.equal(generatedFromSnapshot.mappingArtifacts[1].unresolved.length, 0);
  const samsungSection = generatedFromSnapshot.mappingArtifacts.find(
    (artifact) => artifact.section.sectionKey === "BRANCH_THE_SAMSEONG"
  );
  assert.equal(Boolean(samsungSection), true);
  assert.equal(samsungSection?.section.state, "preopen");
  assert.equal(samsungSection?.unresolved.length, 0);

  const scopedMerged = bindingArtifacts.mergeBindingDraftWithSavedDecisions(
    generatedFromSnapshot,
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
        sectionKey: "GANGNAM",
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
  assert.equal(scopedMerged.mappingArtifacts[0].bindings.some((item) => item.termId === "inventory.provider-value-row"), true);
  assert.equal(scopedMerged.mappingArtifacts[0].unresolved.some((item) => item.reason === "provider-value-row-missing"), false);

  const wrongSectionMerged = bindingArtifacts.mergeBindingDraftWithSavedDecisions(
    generatedFromSnapshot,
    [
      {
        decisionKey: "gangnam|spreadsheet-123|운영시트|coex|spreadsheet-123:운영시트:grid-hash:naver:value-row|provider_value_row_missing",
        branch: "GANGNAM",
        sheetRef: {
          spreadsheetId: "spreadsheet-123",
          sheetName: "운영시트",
          sheetId: null,
          timezone: "Asia/Seoul"
        },
        sectionKey: "COEX",
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
  assert.equal(wrongSectionMerged.mappingArtifacts[0].bindings.length, 0);
  assert.equal(wrongSectionMerged.mappingArtifacts[0].unresolved.some((item) => item.reason === "provider-value-row-missing"), true);

  console.log("regression_app_binding_artifacts: OK");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
