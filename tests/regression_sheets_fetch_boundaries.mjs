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
  assert.ok(sheetsFetch, "App.io.sheetsFetch is required");
  assert.ok(sheetsFetch.validationSupport, "validationSupport boundary export is required");
  assert.ok(sheetsFetch.inventorySelection, "inventorySelection boundary export is required");
  assert.ok(sheetsFetch.sheetReadRuntime, "sheetReadRuntime boundary export is required");
  assert.equal(typeof sheetsFetch.sheetReadRuntime.buildSheetReadPlan, "function");
  assert.equal(typeof sheetsFetch.sheetReadRuntime.executeSheetRead, "function");
  assert.equal(typeof sheetsFetch.sheetReadRuntime.assembleSnapshotFromSheetRead, "function");

  const validationIssues = sheetsFetch.validationSupport.buildScanValidationIssues(
    { urban: 2, doubleTwin: 1, grand: 1 },
    4,
    false,
    false,
    [{ code: "CUSTOM_WARN", severity: "warn", value: 7, message: "custom" }]
  );
  assert.equal(validationIssues.some((issue) => issue.code === "CUSTOM_WARN"), true);

  const normalizedRange = sheetsFetch.inventorySelection.normalizeOneBasedRange(12, 10);
  assert.deepEqual(normalizedRange, { start: 9, end: 11 });

  const readonlyCheck = sheetsFetch.sheetReadRuntime.assertReadonlySheetsRequest;
  assert.throws(() => readonlyCheck("POST", "https://sheets.googleapis.com/test"), /read-only constraint/i);

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
    status: 400,
    text: async () => "invalid field in fields parameter"
  });
  const retryResult = await sheetsFetch.sheetReadRuntime.executeSheetRead({
    request: {
      method: "GET",
      url: "https://sheets.googleapis.com/v4/spreadsheets/spreadsheet-123",
      headers: {}
    },
    opts: {},
    effectiveUseFullRange: false,
    effectiveScanCfg: { mode: "auto" }
  });
  assert.equal(retryResult.retry.options.legacyFieldMask, true);

  console.log("regression_sheets_fetch_boundaries: OK");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
