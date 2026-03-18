import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

async function main() {
  const root = process.cwd();
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "uhs-recommendation-store-"));
  const recommendationStore = await import(`${path.join(root, "dist-app/main/recommendationStore.js")}?t=${Date.now()}`);
  recommendationStore.__setRecommendationStoreDirForTests(tempDir);

  const saved = await recommendationStore.saveRecommendationTrace({
    branch: "GANGNAM",
    sheetRef: {
      spreadsheetId: "spreadsheet-123",
      sheetName: "운영시트",
      sheetId: null,
      timezone: "Asia/Seoul"
    },
    runId: "sheet-run:test",
    sectionKey: "GANGNAM",
    anchorId: "spreadsheet-123:운영시트:GANGNAM:grid-hash:value-row",
    rawHeader: "PROVIDER_VALUE_ROW_MISSING",
    candidateId: "inventory.provider-value-row",
    candidateBasis: ["candidate:inventory.provider-value-row", "reason:provider-value-row-missing"],
    evidenceLineage: ["run:sheet-run:test", "section:GANGNAM"],
    modelVersion: "bounded-alias-triage-v1",
    outcome: "rejected"
  });

  assert.equal(saved.outcome, "rejected");
  assert.equal(saved.sectionKey, "GANGNAM");
  assert.match(saved.traceKey, /gangnam\|spreadsheet-123\|운영시트\|gangnam\|/i);
  assert.match(saved.referenceKey, /gangnam\|spreadsheet-123\|운영시트\|gangnam\|/i);

  const loaded = await recommendationStore.loadRecommendationTraces({
    branch: "GANGNAM",
    sheetRef: {
      spreadsheetId: "spreadsheet-123",
      sheetName: "운영시트",
      sheetId: null,
      timezone: "Asia/Seoul"
    }
  });
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].candidateId, "inventory.provider-value-row");

  const accepted = await recommendationStore.saveRecommendationTrace({
    branch: "GANGNAM",
    sheetRef: {
      spreadsheetId: "spreadsheet-123",
      sheetName: "운영시트",
      sheetId: null,
      timezone: "Asia/Seoul"
    },
    runId: "sheet-run:test",
    sectionKey: "GANGNAM",
    anchorId: "spreadsheet-123:운영시트:GANGNAM:grid-hash:value-row",
    rawHeader: "PROVIDER_VALUE_ROW_MISSING",
    candidateId: "inventory.provider-value-row",
    candidateBasis: ["candidate:inventory.provider-value-row"],
    evidenceLineage: ["run:sheet-run:test"],
    modelVersion: "bounded-alias-triage-v1",
    outcome: "accepted"
  });
  assert.equal(accepted.outcome, "accepted");

  const reloaded = await recommendationStore.loadRecommendationTraces({
    branch: "GANGNAM",
    sheetRef: {
      spreadsheetId: "spreadsheet-123",
      sheetName: "운영시트",
      sheetId: null,
      timezone: "Asia/Seoul"
    }
  });
  assert.equal(reloaded.length, 2);
  assert.equal(reloaded[0].outcome, "rejected");
  assert.equal(reloaded[1].outcome, "accepted");

  const duplicateAccepted = await recommendationStore.saveRecommendationTrace({
    branch: "GANGNAM",
    sheetRef: {
      spreadsheetId: "spreadsheet-123",
      sheetName: "운영시트",
      sheetId: null,
      timezone: "Asia/Seoul"
    },
    runId: "sheet-run:test",
    sectionKey: "GANGNAM",
    anchorId: "spreadsheet-123:운영시트:GANGNAM:grid-hash:value-row",
    rawHeader: "PROVIDER_VALUE_ROW_MISSING",
    candidateId: "inventory.provider-value-row",
    candidateBasis: ["candidate:inventory.provider-value-row"],
    evidenceLineage: ["run:sheet-run:test"],
    modelVersion: "bounded-alias-triage-v1",
    outcome: "accepted"
  });
  assert.equal(duplicateAccepted.traceKey, accepted.traceKey);

  const deduped = await recommendationStore.loadRecommendationTraces({
    branch: "GANGNAM",
    sheetRef: {
      spreadsheetId: "spreadsheet-123",
      sheetName: "운영시트",
      sheetId: null,
      timezone: "Asia/Seoul"
    }
  });
  assert.equal(deduped.length, 2);

  const storePath = recommendationStore.__getRecommendationStorePathForTests();
  await fs.writeFile(storePath, "{not-json", "utf8");
  const fallback = await recommendationStore.loadRecommendationTraces({
    branch: "GANGNAM",
    sheetRef: {
      spreadsheetId: "spreadsheet-123",
      sheetName: "운영시트",
      sheetId: null,
      timezone: "Asia/Seoul"
    }
  });
  assert.deepEqual(fallback, []);

  recommendationStore.__setRecommendationStoreDirForTests(null);
  await fs.rm(tempDir, { recursive: true, force: true });
  console.log("regression_app_recommendation_store: OK");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
