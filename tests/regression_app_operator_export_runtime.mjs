import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

async function main() {
  const root = process.cwd();
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "uhs-operator-export-"));
  const runArtifactStore = await import(path.join(root, "dist-app/main/runArtifactStore.js"));
  const recommendationStore = await import(path.join(root, "dist-app/main/recommendationStore.js"));
  const operatorHandoffStore = await import(path.join(root, "dist-app/main/operatorHandoffStore.js"));
  const operatorExportRuntime = await import(path.join(root, "dist-app/main/operatorExportRuntime.js"));

  recommendationStore.__setRecommendationStoreDirForTests(tempDir);
  operatorHandoffStore.__setOperatorHandoffStoreDirForTests(tempDir);

  const artifact = runArtifactStore.storeSheetRunArtifact({
    source: "sheet-api",
    error: "",
    summary: {
      spreadsheetId: "spreadsheet-123",
      sheetName: "운영시트",
      startDate: "2026-03-12",
      endDate: "2026-03-12",
      readMode: "full",
      retryReason: null,
      retryTrace: [],
      failureCategory: "none",
      failureDetail: "",
      reservationBlockCount: 0,
      validationIssueCount: 1,
      inventoryRows: {
        NAVER: 10,
        STATION: 8
      },
      providerValueDays: {
        NAVER: 1,
        STATION: 1
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
        fingerprint: "fp-1",
        roomMapCount: 0,
        scanMode: "auto",
        manualMode: false,
        hasRoomTypeMap: false,
        branch: "GANGNAM",
        branchSectionEvidence: ["branch:GANGNAM"]
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
        dateCount: 1,
        inventoryRowsDetected: { NAVER: true, STATION: true },
        inventoryValueRowsDetected: { NAVER: false, STATION: false },
        inventoryDataRowCounts: { NAVER: 10, STATION: 8 },
        providerValueDays: { NAVER: 1, STATION: 1 },
        reservationBlockCount: 0
      }
    },
    snapshot: {},
    mappingArtifacts: [
      {
        runId: null,
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
        bindings: [
          {
            anchorId: "anchor-1",
            termId: "inventory.provider-value-row",
            confidence: 1,
            method: "manual",
            decidedAt: "2026-03-17T09:00:00.000Z",
            decisionKey: "decision-1",
            rawHeader: "PROVIDER_VALUE_ROW_MISSING"
          },
          {
            anchorId: "anchor-identity-1",
            termId: "reservation.identity",
            confidence: 0.94,
            method: "rule",
            decidedAt: "2026-03-17T09:05:00.000Z",
            rawHeader: "RESERVATION_IDENTITY_MATCH_REQUIRED",
            resolvedCanonicalId: "reservation:R-100",
            ruleId: "rule:auto-reservation-identity:v1",
            evidenceSignals: ["reservationNo:R-100"]
          }
        ],
        unresolved: [
          {
            anchorId: "anchor-2",
            rawHeader: "ROOM_MAP_MISSING",
            sampleValues: ["Urban", "Double"],
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
            urban: null,
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
            urban: null,
            doubleTwin: null,
            grand: null
          },
          typedSlotComplete: false,
          typedSlotDuplicate: false,
          physicalOrderVariant: false
        },
        metrics: {
          autoBindingCount: 1,
          manualBindingCount: 1,
          unresolvedByDomain: {
            reservation: 1
          },
          exactAutoBindingCount: 1,
          roomAliasBindingCount: 0,
          reservationIdentityBindingCount: 1,
          softTriageCount: 1,
          targetedUnresolvedCount: 1,
          precisionScore: 0.5,
          precisionGate: "needs-review",
          confidenceBands: {
            high: 2,
            medium: 1,
            low: 0
          }
        }
      }
    ]
  });

  await recommendationStore.saveRecommendationTrace({
    branch: "GANGNAM",
    sheetRef: {
      spreadsheetId: "spreadsheet-123",
      sheetName: "운영시트",
      sheetId: null,
      timezone: "Asia/Seoul"
    },
    runId: artifact.runId,
    sectionKey: "GANGNAM",
    anchorId: "anchor-2",
    rawHeader: "ROOM_MAP_MISSING",
    candidateId: "inventory.room-map",
    candidateBasis: ["candidate:inventory.room-map"],
    evidenceLineage: [`run:${artifact.runId}`],
    modelVersion: "bounded-alias-triage-v1",
    outcome: "accepted"
  });

  const exported = await operatorExportRuntime.buildOperatorExport({
    runId: artifact.runId,
    branch: "GANGNAM"
  });

  assert.ok(exported);
  assert.equal(exported.verifyEvidence.classification, "live-success");
  assert.equal(exported.metrics.manualDecisionCount, 1);
  assert.equal(exported.metrics.unresolvedCount, 1);
  assert.equal(exported.metrics.exactAutoBindingCount, 1);
  assert.equal(exported.metrics.softTriageCount, 1);
  assert.equal(exported.metrics.precisionScore, 0.5);
  assert.equal(exported.metrics.precisionGate, "needs-review");
  assert.equal(exported.metrics.latestAcceptedCount, 1);
  assert.equal(exported.metrics.latestRejectedCount, 0);
  assert.equal(exported.metrics.triagedCandidateCount, 1);
  assert.equal(exported.metrics.triageCoverage, 0.5);
  assert.equal(exported.metrics.supersededTraceCount, 0);
  assert.equal(exported.sections.length, 1);
  assert.equal(exported.manifest.branch, "GANGNAM");
  assert.equal(exported.handoff.files.length, 2);
  assert.ok(exported.handoff.copyText.includes("[운영 전달물]"));
  assert.ok(exported.handoff.copyText.includes("triageCoverage=0.5"));
  assert.ok(exported.handoff.copyText.includes("exactAutoBindingCount=1"));
  assert.ok(exported.handoff.copyText.includes("softTriageCount=1"));
  assert.ok(exported.handoff.copyText.includes("precisionScore=0.5"));
  assert.ok(exported.handoff.copyText.includes("gate=needs-review"));
  assert.ok(exported.operatorLoopLines.length >= 4);
  assert.equal(exported.handoffHistory.length, 0);
  assert.match(exported.operatorLoopLines.join("\n"), /unresolved=1/);
  assert.match(exported.operatorLoopLines.join("\n"), /precision=0.5/);
  assert.match(
    exported.handoff.files.find((item) => item.format === "json")?.content || "",
    /"verifyClassification": "live-success"/
  );
  assert.match(
    exported.handoff.files.find((item) => item.format === "json")?.content || "",
    /"precisionGate": "needs-review"/
  );
  assert.match(
    exported.handoff.files.find((item) => item.format === "csv")?.content || "",
    /"GANGNAM","active","2","1","1","1","0.5","needs-review","1","0","live-success","0.5"/
  );
  assert.match(exported.previewLines.join("\n"), /verify=live-success/);
  assert.match(exported.previewLines.join("\n"), /accepted 1 rejected 0/);
  assert.match(exported.previewLines.join("\n"), /triageCoverage=0.5/);
  assert.match(exported.previewLines.join("\n"), /exactAuto=1 softTriage=1 precision=0.5/);
  assert.match(exported.previewLines.join("\n"), /gate=needs-review/);
  assert.match(exported.previewLines.join("\n"), /loop=1\./);

  const copyPayload = operatorExportRuntime.resolveOperatorExportHandoffPayload(exported, "copy-text");
  assert.equal(copyPayload?.mimeType, "text/plain");
  assert.match(copyPayload?.content || "", /\[Operator Loop\]/);

  await operatorHandoffStore.saveOperatorHandoffHistory({
    runId: artifact.runId,
    branch: "GANGNAM",
    sheetRef: {
      spreadsheetId: "spreadsheet-123",
      sheetName: "운영시트",
      sheetId: null,
      timezone: "Asia/Seoul"
    },
    target: "clipboard",
    format: "copy-text",
    fileName: "operator-export.txt",
    filePath: null,
    bytes: copyPayload?.content.length || 0,
    verifyClassification: "live-success",
    source: "sheet-api",
    startDate: "2026-03-12",
    endDate: "2026-03-12",
    evidenceLineage: [`run:${artifact.runId}`],
    impactScope: "mixed",
    impactReasons: ["live-verified-delivery", "unresolved-bindings-present", "triage-incomplete"],
    payload: copyPayload
  });

  const exportedWithHistory = await operatorExportRuntime.buildOperatorExport({
    runId: artifact.runId,
    branch: "GANGNAM"
  });
  assert.equal(exportedWithHistory?.handoffHistory.length, 1);
  assert.equal(exportedWithHistory?.handoffHistory[0]?.target, "clipboard");
  assert.equal(exportedWithHistory?.handoffHistory[0]?.format, "copy-text");
  assert.equal(exportedWithHistory?.handoffHistory[0]?.status, "sent");
  assert.equal(exportedWithHistory?.handoffHistory[0]?.impactScope, "mixed");
  assert.deepEqual(exportedWithHistory?.handoffHistory[0]?.impactReasons, [
    "live-verified-delivery",
    "unresolved-bindings-present",
    "triage-incomplete"
  ]);
  assert.match(exportedWithHistory?.previewLines.join("\n") || "", /status=sent/);
  const initialHandoffId = exportedWithHistory?.handoffHistory[0]?.handoffId || "";

  const updated = await operatorHandoffStore.updateOperatorHandoffStatus({
    handoffId: initialHandoffId,
    status: "needs-follow-up"
  });
  assert.equal(updated?.status, "needs-follow-up");

  for (let index = 0; index < 5; index += 1) {
    await operatorHandoffStore.saveOperatorHandoffHistory({
      runId: artifact.runId,
      branch: "GANGNAM",
      sheetRef: {
        spreadsheetId: "spreadsheet-123",
        sheetName: "운영시트",
        sheetId: null,
        timezone: "Asia/Seoul"
      },
      target: "clipboard",
      format: "copy-text",
      fileName: `operator-export-${index}.txt`,
      filePath: null,
      bytes: copyPayload?.content.length || 0,
      verifyClassification: "live-success",
      source: "sheet-api",
      startDate: "2026-03-12",
      endDate: "2026-03-12",
      evidenceLineage: [`run:${artifact.runId}`],
      impactScope: "mixed",
      impactReasons: ["live-verified-delivery", "unresolved-bindings-present", "triage-incomplete"],
      payload: {
        ...copyPayload,
        fileName: `operator-export-${index}.txt`
      }
    });
  }

  const exportedWithQueue = await operatorExportRuntime.buildOperatorExport({
    runId: artifact.runId,
    branch: "GANGNAM"
  });
  assert.equal(exportedWithQueue?.handoffHistory.length, 5);
  assert.equal(exportedWithQueue?.followUpQueue.length, 1);
  assert.equal(exportedWithQueue?.followUpQueue[0]?.handoffId, initialHandoffId);
  assert.equal(exportedWithQueue?.handoffSummary.totalCount, 6);
  assert.equal(exportedWithQueue?.handoffSummary.pendingCount, 6);
  assert.equal(exportedWithQueue?.handoffSummary.needsFollowUpCount, 1);
  assert.equal(exportedWithQueue?.handoffSummary.hiddenNeedsFollowUpCount, 1);
  assert.match(exportedWithQueue?.previewLines.join("\n") || "", /hidden-follow-up 1/);
  assert.match(exportedWithQueue?.previewLines.join("\n") || "", /follow-up-queue=/);

  const stored = await operatorHandoffStore.loadOperatorHandoffById(initialHandoffId);
  assert.equal(stored?.payload.format, "copy-text");
  assert.equal(stored?.status, "needs-follow-up");
  assert.equal(stored?.impactScope, "mixed");

  recommendationStore.__setRecommendationStoreDirForTests(null);
  operatorHandoffStore.__setOperatorHandoffStoreDirForTests(null);
  await fs.rm(tempDir, { recursive: true, force: true });
  console.log("regression_app_operator_export_runtime: OK");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
