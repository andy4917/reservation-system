import assert from "node:assert/strict";
import path from "node:path";

async function main() {
  const root = process.cwd();
  const searchRuntime = await import(`${path.join(root, "dist-app/main/searchRuntime.js")}?t=${Date.now()}`);
  searchRuntime.__resetSearchRuntimeForTests();

  const indexed = searchRuntime.indexWorkspaceSearch({
    type: "search.indexWorkspace",
    payload: {
      runId: "sheet-run:test",
      branch: "GANGNAM",
      inventoryRows: [
        {
          id: "inv-1",
          date: "2026-03-13",
          roomType: "Urban",
          channel: "NAVER",
          siteRaw: "4/6",
          sheetRaw: "6/6",
          reason: "site lagging",
          action: "review"
        }
      ],
      reservationRows: [
        {
          id: "audit-1",
          reservationNo: "R-100",
          guestName: "Kim",
          channel: "BOOKING",
          checkin: "2026-03-13",
          checkout: "2026-03-14",
          status: "ACTIVE",
          auditStatus: "review",
          reason: "missing PMS pair",
          action: "confirm"
        }
      ],
      evidenceLines: ["Mismatch evidence: Urban 03-13 site=4 / sheet=6"],
      opsLines: ["Bridge contract path: bridge.getContext -> provider.fetchRows"],
      validationLines: ["Validation gate: mismatch rows remain"],
      logs: ["sheet-run:test ready"],
      artifactLines: ["section=GANGNAM | state=active | unresolved=1"],
      mappingArtifacts: [
        {
          runId: "sheet-run:test",
          section: {
            spreadsheetId: "spreadsheet-1",
            sheetName: "2026",
            sheetId: null,
            sectionKey: "GANGNAM",
            state: "active",
            titleRow: 1,
            headerRow: 4,
            roomStartRow: 5,
            inventoryStartRow: 10
          },
          anchors: [],
          bindings: [],
          unresolved: [
            {
              anchorId: "spreadsheet-1:2026:GANGNAM:grid-hash:value-row",
              rawHeader: "PROVIDER_VALUE_ROW_MISSING",
              sampleValues: ["Urban", "NAVER"],
              candidateTerms: ["inventory.provider-value-row"],
              reason: "provider-value-row-missing",
              status: "open"
            }
          ],
          providerValueSource: {
            providerKey: "NAVER",
            providerRow: 10,
            providerValueRow: null,
            providerRowRole: "aggregate-only",
            sourceKind: "none",
            sourceReason: "",
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
              urban: 12,
              doubleTwin: null,
              grand: null
            },
            typedSlotComplete: false,
            typedSlotDuplicate: false,
            physicalOrderVariant: false
          }
        }
      ]
    }
  });

  assert.equal(indexed.documentCount > 0, true);

  const inventoryHits = searchRuntime.queryWorkspaceSearch({
    type: "search.queryWorkspace",
    runId: "sheet-run:test",
    query: "urban",
    limit: 10
  });
  assert.equal(inventoryHits.hits.length > 0, true);
  assert.equal(inventoryHits.hits.some((hit) => hit.kind === "inventory-row"), true);

  const unresolvedHits = searchRuntime.queryWorkspaceSearch({
    type: "search.queryWorkspace",
    runId: "sheet-run:test",
    query: "provider-value-row-missing",
    limit: 10
  });
  assert.equal(unresolvedHits.hits.some((hit) => hit.kind === "unresolved"), true);

  console.log("regression_app_search_runtime: OK");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
