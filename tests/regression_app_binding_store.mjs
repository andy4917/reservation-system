import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

async function main() {
  const root = process.cwd();
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "uhs-binding-store-"));
  const bindingStore = await import(`${path.join(root, "dist-app/main/bindingStore.js")}?t=${Date.now()}`);
  bindingStore.__setBindingStoreDirForTests(tempDir);

  const saved = await bindingStore.saveBindingDecision({
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
    confidence: 1
  });

  assert.equal(saved.termId, "inventory.provider-value-row");
  assert.equal(saved.method, "manual");

  const loaded = await bindingStore.loadBindingDecisions({
    branch: "GANGNAM",
    sheetRef: {
      spreadsheetId: "spreadsheet-123",
      sheetName: "운영시트",
      sheetId: null,
      timezone: "Asia/Seoul"
    }
  });
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].decisionKey, saved.decisionKey);

  const deleted = await bindingStore.deleteBindingDecision(saved.decisionKey);
  assert.equal(deleted, true);
  const afterDelete = await bindingStore.loadBindingDecisions({
    branch: "GANGNAM",
    sheetRef: {
      spreadsheetId: "spreadsheet-123",
      sheetName: "운영시트",
      sheetId: null,
      timezone: "Asia/Seoul"
    }
  });
  assert.equal(afterDelete.length, 0);

  const storePath = bindingStore.__getBindingStorePathForTests();
  await fs.writeFile(storePath, "", "utf8");
  const emptyFallback = await bindingStore.loadBindingDecisions({
    branch: "GANGNAM",
    sheetRef: {
      spreadsheetId: "spreadsheet-123",
      sheetName: "운영시트",
      sheetId: null,
      timezone: "Asia/Seoul"
    }
  });
  assert.deepEqual(emptyFallback, []);

  await fs.writeFile(storePath, "{not-json", "utf8");
  const corruptFallback = await bindingStore.loadBindingDecisions({
    branch: "GANGNAM",
    sheetRef: {
      spreadsheetId: "spreadsheet-123",
      sheetName: "운영시트",
      sheetId: null,
      timezone: "Asia/Seoul"
    }
  });
  assert.deepEqual(corruptFallback, []);
  const siblingFiles = await fs.readdir(tempDir);
  assert.equal(siblingFiles.some((item) => item.includes(".corrupt-")), true);

  bindingStore.__setBindingStoreDirForTests(null);
  await fs.rm(tempDir, { recursive: true, force: true });
  console.log("regression_app_binding_store: OK");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
