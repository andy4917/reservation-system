import assert from "node:assert/strict";
import path from "node:path";

async function main() {
  const root = process.cwd();
  const runtime = await import(`${path.join(root, "dist-app/main/mappingTruthRuntime.js")}?t=${Date.now()}`);
  const [artifact] = runtime.enrichMappingArtifactsWithTruthData([
    {
      runId: "sheet-run:test",
      section: {
        spreadsheetId: "spreadsheet-123",
        sheetName: "운영시트",
        sheetId: null,
        sectionKey: "GANGNAM",
        state: "active",
        titleRow: 1,
        headerRow: 4,
        roomStartRow: 6,
        inventoryStartRow: 21
      },
      anchors: [],
      bindings: [],
      unresolved: [
        {
          anchorId: "spreadsheet-123:운영시트:grid-hash:room-alias",
          rawHeader: "ROOM_ALIAS_AMBIGUOUS",
          sampleValues: [],
          candidateTerms: ["inventory.room-alias"],
          reason: "mapping-unresolved",
          status: "open",
          evidenceSignals: ["existing:signal"]
        },
        {
          anchorId: "spreadsheet-123:운영시트:grid-hash:reservation-identity",
          rawHeader: "RESERVATION_IDENTITY_MATCH_REQUIRED",
          sampleValues: [],
          candidateTerms: ["reservation.identity"],
          reason: "mapping-unresolved",
          status: "open",
          evidenceSignals: []
        }
      ],
      providerValueSource: {
        providerKey: "NAVER",
        providerRow: 10,
        providerValueRow: 11,
        providerRowRole: "aggregate-only",
        sourceKind: "typed-row",
        sourceReason: "fallback_to_better_data_row",
        typedSlotRows: {
          urban: 12,
          doubleTwin: null,
          grand: null
        },
        typedSlotComplete: false,
        typedSlotDuplicate: false
      },
      structuralSummary: [],
      validationSummary: {
        providerKey: "NAVER",
        issueCount: 1,
        errorCount: 0,
        warningCount: 1,
        issueCodes: ["ROOM_ALIAS_AMBIGUOUS"],
        hasTypeMismatch: false,
        hasPartitionMismatch: false,
        hasInsufficientRows: false,
        providerValueRawCount: 0,
        providerValueParsedCount: 0,
        providerRow: 10,
        providerValueRow: 11,
        providerRowRole: "aggregate-only",
        providerValueSourceKind: "typed-row",
        providerValueSourceReason: "fallback_to_better_data_row",
        typedSlotRows: {
          urban: 12,
          doubleTwin: null,
          grand: null
        },
        typedSlotComplete: false,
        typedSlotDuplicate: false,
        physicalOrderVariant: false
      }
    }
  ]);

  assert.equal(Array.isArray(artifact.truthSignals), true);
  assert.equal(artifact.truthSignals.length, 4);
  assert.equal(artifact.truthSignals.some((signal) => signal.kind === "room-alias-graph" && signal.available), true);
  assert.equal(
    artifact.unresolved[0].evidenceSignals.some((signal) => signal.startsWith("truth:room-alias-graph-v1")),
    true
  );
  assert.equal(
    artifact.unresolved[1].evidenceSignals.some((signal) => signal.startsWith("truth:reservation-identity-graph-v1")),
    true
  );

  console.log("regression_app_mapping_truth_runtime: OK");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
