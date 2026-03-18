import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

function loadScript(filePath) {
  const code = fs.readFileSync(filePath, "utf8");
  vm.runInThisContext(code, { filename: filePath });
}

async function main() {
  const root = process.cwd();
  globalThis.App = {};
  globalThis.fetch = async () => {
    throw new Error("fetch should not be called in boundary regression");
  };
  globalThis.location = {
    host: "partner.booking.naver.com",
    href: "https://partner.booking.naver.com/",
    pathname: "/",
    hash: ""
  };
  globalThis.InventoryEntryPolicy = {
    detectProviderTypeFromHost(host) {
      if (String(host).includes("partner.booking.naver.com")) return "naver-partner";
      if (String(host).includes("admin.admin-stationbyuhc.com")) return "admin-station";
      return "";
    }
  };

  [
    "src/constants.js",
    "src/scan/normalize.js",
    "src/engine/noteKey.js",
    "src/engine/rules.js",
    "src/scan/blockBuilder.js",
    "src/scan/aggregator.js",
    "src/io/sheets.fetch.js"
  ]
    .map((p) => path.join(root, p))
    .forEach(loadScript);

  const sheetsFetch = globalThis.App?.io?.sheetsFetch;
  const blockBuilder = globalThis.App?.scan?.blockBuilder;
  const normalize = globalThis.App?.scan?.normalize;
  assert.ok(sheetsFetch, "App.io.sheetsFetch is required");
  assert.ok(blockBuilder, "App.scan.blockBuilder is required");
  assert.ok(normalize, "App.scan.normalize is required");
  assert.ok(sheetsFetch.validationSupport, "validationSupport boundary export is required");
  assert.ok(sheetsFetch.inventorySelection, "inventorySelection boundary export is required");
  assert.ok(sheetsFetch.sheetReadRuntime, "sheetReadRuntime boundary export is required");
  assert.equal(typeof sheetsFetch.sheetReadRuntime.buildSheetReadPlan, "function");
  assert.equal(typeof sheetsFetch.sheetReadRuntime.executeSheetRead, "function");
  assert.equal(typeof sheetsFetch.sheetReadRuntime.assembleSnapshotFromSheetRead, "function");
  assert.equal(typeof sheetsFetch.sheetReadRuntime.detectSheetSections, "function");
  assert.equal(normalize.normalizeBranchLabel("더 삼성"), "BRANCH_THE_SAMSEONG");

  const validationIssues = sheetsFetch.validationSupport.buildScanValidationIssues(
    { urban: 2, doubleTwin: 1, grand: 1 },
    4,
    false,
    false,
    [{ code: "CUSTOM_WARN", severity: "warn", value: 7, message: "custom" }]
  );
  assert.equal(validationIssues.some((issue) => issue.code === "CUSTOM_WARN"), true);

  const relaxedSlotIssues = sheetsFetch.validationSupport.buildInventoryDataRowSlotIssues(
    "STATION",
    [21, 22, 20],
    null,
    { mode: "manual", hasCompleteManualTypeRanges: false }
  );
  assert.equal(
    relaxedSlotIssues.some((issue) => issue.code === "INVENTORY_DATA_ROW_PHYSICAL_ORDER_VARIANT" && issue.severity === "warn"),
    true,
    "minimal manual anchors must surface physical order variance as warning instead of a hard slot-order failure"
  );

  const toleratedRelaxedSlotIssues = sheetsFetch.validationSupport.buildInventoryDataRowSlotIssues(
    "NAVER",
    [24, 25, 23],
    null,
    { mode: "manual", hasCompleteManualTypeRanges: false, providerRow: 23, selectedValueRow: 23 }
  );
  assert.equal(
    toleratedRelaxedSlotIssues.some((issue) => issue.code === "INVENTORY_DATA_ROW_PHYSICAL_ORDER_VARIANT"),
    false,
    "when the provider row is itself the selected typed slot source, relaxed mode may tolerate physical order variance"
  );

  const strictSlotIssues = sheetsFetch.validationSupport.buildInventoryDataRowSlotIssues(
    "STATION",
    [21, 22, 20],
    {
      urban: { start: 20, end: 20 },
      doubleTwin: { start: 21, end: 21 },
      grand: { start: 22, end: 22 }
    },
    { mode: "manual", hasCompleteManualTypeRanges: true }
  );
  assert.equal(
    strictSlotIssues.some((issue) => issue.code === "INVENTORY_DATA_ROW_SLOT_ORDER_INVALID" && issue.severity === "error"),
    true,
    "complete manual type ranges must keep strict slot ordering validation"
  );

  const normalizedRange = sheetsFetch.inventorySelection.normalizeOneBasedRange(12, 10);
  assert.deepEqual(normalizedRange, { start: 9, end: 11 });

  const readonlyCheck = sheetsFetch.sheetReadRuntime.assertReadonlySheetsRequest;
  assert.throws(() => readonlyCheck("POST", "https://sheets.googleapis.com/test"), /read-only constraint/i);

  const makeCell = (formattedValue = "") => ({ formattedValue });
  const matrix = blockBuilder.buildSheetMatrix(
    {
      startRow: 0,
      startColumn: 0,
      rowData: Array.from({ length: 16 }, (_, rowIndex) => {
        const rows = {
          0: [makeCell("더 강남")],
          3: [makeCell("TYPE"), makeCell("ROOM")],
          5: [makeCell("Urban Spa Suite 6인"), makeCell("401")],
          8: [makeCell("NAVER")],
          10: [makeCell("더 코엑스")],
          13: [makeCell("TYPE"), makeCell("ROOM")],
          15: [makeCell("Urban Spa Suite 6인"), makeCell("A301")]
        };
        return { values: rows[rowIndex] || [] };
      })
    },
    1
  );
  const sections = sheetsFetch.sheetReadRuntime.detectSheetSections(matrix, {
    branch: "GANGNAM",
    dateRow: 3,
    roomStartRow: 5,
    inventorySearchStartRow: 8
  });
  assert.equal(sections.length, 2);
  assert.equal(sections[0].sectionKey, "GANGNAM");
  assert.equal(sections[0].titleRow, 0);
  assert.equal(sections[0].headerRow, 3);
  assert.equal(sections[0].state, "active");
  assert.equal(sections[0].roomStartRow, 5);
  assert.equal(sections[0].inventoryStartRow, 8);
  assert.equal(sections[1].sectionKey, "COEX");
  assert.equal(sections[1].titleRow, 10);
  assert.equal(sections[1].headerRow, 13);
  assert.equal(sections[1].state, "active");
  assert.equal(sections[1].roomStartRow, 15);

  const preopenMatrix = blockBuilder.buildSheetMatrix(
    {
      startRow: 0,
      startColumn: 0,
      rowData: Array.from({ length: 8 }, (_, rowIndex) => {
        const rows = {
          0: [makeCell("삼성점")],
          2: [makeCell("TYPE"), makeCell("ROOM")]
        };
        return { values: rows[rowIndex] || [] };
      })
    },
    1
  );
  const preopenSections = sheetsFetch.sheetReadRuntime.detectSheetSections(preopenMatrix, {
    branch: "BRANCH_THE_SAMSEONG",
    dateRow: 2,
    roomStartRow: null,
    inventorySearchStartRow: null
  });
  assert.equal(preopenSections.length, 1);
  assert.equal(preopenSections[0].sectionKey, "BRANCH_THE_SAMSEONG");
  assert.equal(preopenSections[0].state, "preopen");
  assert.equal(preopenSections[0].roomStartRow, null);
  assert.equal(preopenSections[0].inventoryStartRow, null);

  let builderFetchCalled = false;
  globalThis.fetch = async () => {
    builderFetchCalled = true;
    throw new Error("buildSheetReadPlan must not fetch");
  };
  const plan = sheetsFetch.sheetReadRuntime.buildSheetReadPlan({
    syncConfig: {
      sheetName: "Inventory Sheet",
      startRow: 5,
      scan: {}
    },
    query: {
      startDate: "2026-03-01",
      endDate: "2026-03-03"
    },
    spreadsheetId: "spreadsheet-123",
    accessToken: "token-123",
    sheetHints: {
      fingerprint: "fingerprint-1",
      roomTypeByRoomNo: { "101": "urban" }
    },
    effectiveScanCfg: {
      mode: "auto"
    },
    useFullRange: false
  });
  assert.equal(builderFetchCalled, false);
  assert.equal(plan.request.method, "GET");
  assert.match(new URL(plan.request.url).searchParams.get("ranges"), /^'Inventory Sheet'!A\d+:[A-Z]+\d+$/);

  globalThis.fetch = async () => ({
    ok: false,
    status: 401,
    text: async () => "NeedToken"
  });
  const credentialRetry = await sheetsFetch.sheetReadRuntime.executeSheetRead({
    request: {
      method: "GET",
      url: "https://sheets.googleapis.com/v4/spreadsheets/spreadsheet-123",
      headers: {}
    },
    opts: {},
    effectiveUseFullRange: false,
    effectiveScanCfg: { mode: "auto" },
    canRefreshCredentials: true,
    forceRefreshToken: false
  });
  assert.equal(credentialRetry.retry.forceRefreshToken, true);
  assert.equal(credentialRetry.retry.reason, "credential-refresh");

  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      sheets: [
        {
          data: []
        }
      ]
    })
  });
  const fullRangeRetry = await sheetsFetch.sheetReadRuntime.executeSheetRead({
    request: {
      method: "GET",
      url: "https://sheets.googleapis.com/v4/spreadsheets/spreadsheet-123",
      headers: {}
    },
    opts: {},
    effectiveUseFullRange: false,
    effectiveScanCfg: { mode: "auto" }
  });
  assert.equal(fullRangeRetry.retry.useFullRange, true);
  assert.equal(fullRangeRetry.retry.reason, "auto-full-range");

  globalThis.fetch = async () => ({
    ok: false,
    status: 400,
    text: async () => "invalid field in fields parameter"
  });
  await assert.rejects(
    () =>
      sheetsFetch.sheetReadRuntime.executeSheetRead({
        request: {
          method: "GET",
          url: "https://sheets.googleapis.com/v4/spreadsheets/spreadsheet-123",
          headers: {}
        },
        opts: {},
        effectiveUseFullRange: false,
        effectiveScanCfg: { mode: "auto" }
      }),
    /Google Sheets request failed \(400\)/i
  );

  console.log("regression_sheets_fetch_boundaries: OK");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
