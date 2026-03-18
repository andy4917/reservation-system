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
      sheetSource: "sheet-api",
      sheetError: "",
      activeTask: "inventory-compare",
      sheetSummary: {
        spreadsheetId: "spreadsheet-1",
        sheetName: "2026",
        startDate: "2026-03-13",
        endDate: "2026-03-13",
        readMode: "live",
        retryReason: null,
        retryTrace: [],
        failureCategory: "none",
        failureDetail: "",
        reservationBlockCount: 0,
        validationIssueCount: 1,
        inventoryRows: {
          NAVER: 1,
          STATION: 0
        },
        providerValueDays: {
          NAVER: 1,
          STATION: 0
        },
        anchorSummary: {
          namedRangeCount: 0,
          metadataCount: 0,
          hasScanConfigNamedRange: false,
          hasRoomMapNamedRange: false,
          hasMetadataScanConfig: false,
          manualAnchorUsed: false,
          manualAnchorFields: []
        },
        hintSummary: {
          fingerprint: "fp",
          roomMapCount: 0,
          scanMode: "auto",
          manualMode: false,
          hasRoomTypeMap: false,
          branch: "GANGNAM",
          branchSectionEvidence: ["titleRow:1", "headerRow:4"]
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
            urban: 12,
            doubleTwin: null,
            grand: null
          },
          typedSlotComplete: false,
          typedSlotDuplicate: false,
          physicalOrderVariant: true
        },
        coverage: {
          dateCount: 1,
          inventoryRowsDetected: { NAVER: true, STATION: false },
          inventoryValueRowsDetected: { NAVER: false, STATION: false },
          inventoryDataRowCounts: { NAVER: 1, STATION: 0 },
          providerValueDays: { NAVER: 1, STATION: 0 },
          reservationBlockCount: 0
        }
      },
      savedDecisions: [
        {
          decisionKey: "decision-1",
          branch: "GANGNAM",
          sheetRef: {
            spreadsheetId: "spreadsheet-1",
            sheetName: "2026",
            sheetId: null,
            timezone: "Asia/Seoul"
          },
          sectionKey: "GANGNAM",
          anchorId: "spreadsheet-1:2026:GANGNAM:grid-hash:value-row",
          rawHeader: "PROVIDER_VALUE_ROW_MISSING",
          termId: "inventory.provider-value-row",
          method: "manual",
          decidedAt: "2026-03-17T06:00:00.000Z",
          confidence: 1
        }
      ],
      recommendationTraces: [
        {
          traceKey: "trace-1",
          referenceKey: "ref-1",
          branch: "GANGNAM",
          sheetRef: {
            spreadsheetId: "spreadsheet-1",
            sheetName: "2026",
            sheetId: null,
            timezone: "Asia/Seoul"
          },
          runId: "sheet-run:test",
          sectionKey: "GANGNAM",
          anchorId: "spreadsheet-1:2026:GANGNAM:grid-hash:value-row",
          rawHeader: "PROVIDER_VALUE_ROW_MISSING",
          candidateId: "inventory.provider-value-row",
          candidateBasis: ["candidate:inventory.provider-value-row"],
          evidenceLineage: ["run:sheet-run:test", "section:GANGNAM"],
          modelVersion: "bounded-alias-triage-v1",
          outcome: "accepted",
          decidedAt: "2026-03-17T06:01:00.000Z"
        }
      ],
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
          bindings: [
            {
              anchorId: "spreadsheet-1:2026:GANGNAM:grid-hash:reservation-row",
              termId: "reservation.identity",
              confidence: 0.94,
              method: "rule",
              decidedAt: "2026-03-17T06:02:00.000Z",
              resolvedCanonicalId: "reservation:R-100",
              rawHeader: "RESERVATION_IDENTITY_MATCH_REQUIRED",
              evidenceSignals: ["reservationNo:R-100"],
              ruleId: "rule:auto-reservation-identity:v1"
            }
          ],
          unresolved: [
            {
              anchorId: "spreadsheet-1:2026:GANGNAM:grid-hash:value-row",
              rawHeader: "PROVIDER_VALUE_ROW_MISSING",
              sampleValues: ["Urban", "NAVER"],
              candidateTerms: ["reservation.identity"],
              reason: "reservation-identity-soft-match",
              status: "open",
              mappingDomain: "reservation",
              severity: "high",
              confidence: 0.62,
              evidenceSignals: ["reason:soft-match", "guest:Kim"],
              ruleId: "rule:auto-reservation-identity-soft-match:v1"
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
            physicalOrderVariant: true
          },
          metrics: {
            autoBindingCount: 1,
            manualBindingCount: 0,
            unresolvedByDomain: { reservation: 1 },
            exactAutoBindingCount: 1,
            roomAliasBindingCount: 0,
            reservationIdentityBindingCount: 1,
            softTriageCount: 1,
            targetedUnresolvedCount: 1,
            precisionScore: 0.5,
            precisionGate: "needs-review",
            confidenceBands: {
              high: 1,
              medium: 1,
              low: 0
            }
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
  assert.equal(inventoryHits.hits.some((hit) => hit.kind === "inventory-explanation"), true);

  const unresolvedHits = searchRuntime.queryWorkspaceSearch({
    type: "search.queryWorkspace",
    runId: "sheet-run:test",
    query: "reservation-identity-soft-match",
    limit: 10
  });
  assert.equal(unresolvedHits.hits.some((hit) => hit.kind === "unresolved-binding"), true);
  assert.equal(
    unresolvedHits.hits.find((hit) => hit.kind === "unresolved-binding")?.jumpTarget.anchorId,
    "spreadsheet-1:2026:GANGNAM:grid-hash:value-row"
  );
  assert.equal(
    unresolvedHits.hits.find((hit) => hit.kind === "unresolved-binding")?.candidateBasis.includes("reservation.identity"),
    true
  );

  const bindingSummaryHits = searchRuntime.queryWorkspaceSearch({
    type: "search.queryWorkspace",
    runId: "sheet-run:test",
    query: "needs-review",
    limit: 10
  });
  assert.equal(bindingSummaryHits.hits.some((hit) => hit.kind === "binding-summary"), true);
  assert.equal(bindingSummaryHits.hits.find((hit) => hit.kind === "binding-summary")?.jumpTarget.sectionKey, "GANGNAM");

  const canonicalHits = searchRuntime.queryWorkspaceSearch({
    type: "search.queryWorkspace",
    runId: "sheet-run:test",
    query: "exactauto=1",
    limit: 10
  });
  assert.equal(canonicalHits.hits.some((hit) => hit.kind === "binding-summary"), true);

  const softRuleHits = searchRuntime.queryWorkspaceSearch({
    type: "search.queryWorkspace",
    runId: "sheet-run:test",
    query: "rule:auto-reservation-identity-soft-match:v1",
    limit: 10
  });
  assert.equal(softRuleHits.hits.some((hit) => hit.kind === "unresolved-binding"), true);
  assert.equal(
    (softRuleHits.hits.find((hit) => hit.kind === "unresolved-binding")?.excerpt || "").includes("confidence=0.62"),
    true
  );

  const verifyHits = searchRuntime.queryWorkspaceSearch({
    type: "search.queryWorkspace",
    runId: "sheet-run:test",
    query: "physicalordervariant",
    limit: 10
  });
  assert.equal(verifyHits.hits.some((hit) => hit.kind === "structural-summary"), true);

  const acceptanceHits = searchRuntime.queryWorkspaceSearch({
    type: "search.queryWorkspace",
    runId: "sheet-run:test",
    query: "bounded-alias-triage-v1",
    limit: 10
  });
  assert.equal(acceptanceHits.hits.some((hit) => hit.kind === "acceptance-trace"), true);
  assert.equal(
    acceptanceHits.hits.find((hit) => hit.kind === "acceptance-trace")?.jumpTarget.anchorId,
    "spreadsheet-1:2026:GANGNAM:grid-hash:value-row"
  );

  const settingsIndexed = searchRuntime.indexWorkspaceSearch({
    type: "search.indexWorkspace",
    payload: {
      runId: "sheet-run:settings",
      branch: "GANGNAM",
      activeTask: "settings",
      inventoryRows: [],
      reservationRows: [],
      evidenceLines: ["settings evidence: unresolved binding triage"],
      opsLines: ["settings ops: operator recommendation review"],
      validationLines: [],
      logs: ["settings log: recommendation trace loaded"],
      artifactLines: [],
      sheetSource: "sheet-api",
      sheetError: "",
      sheetSummary: null,
      savedDecisions: [],
      recommendationTraces: [],
      mappingArtifacts: []
    }
  });
  assert.equal(settingsIndexed.documentCount > 0, true);
  const settingsHits = searchRuntime.queryWorkspaceSearch({
    type: "search.queryWorkspace",
    runId: "sheet-run:settings",
    query: "operator recommendation review",
    limit: 10
  });
  assert.equal(settingsHits.hits.some((hit) => hit.kind === "settings-explanation"), true);

  console.log("regression_app_search_runtime: OK");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
