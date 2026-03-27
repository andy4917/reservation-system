import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function main() {
  const filePath = path.join(process.cwd(), "app_v2/main/settingsStore.ts");
  const source = fs.readFileSync(filePath, "utf8");

  assert.match(source, /function normalizeSheetTabs\(input: unknown\): AppSheetTabSettings \| null/);
  assert.match(source, /if \(!input \|\| typeof input !== "object"\)\s*\{\s*return null;\s*\}/);
  assert.match(source, /sheetTabs: normalizeSheetTabs\(input\.sheetTabs\),/);
  assert.match(source, /gangnam: normalizeText\(tabs\.gangnam\)/);
  assert.match(source, /coex: normalizeText\(tabs\.coex\)/);
  assert.match(source, /seolleung: normalizeText\(tabs\.seolleung\)/);
  assert.match(source, /samseong: normalizeText\(tabs\.samseong\)/);
  assert.doesNotMatch(source, /coexMain/);
  assert.doesNotMatch(source, /coexAnnex/);
  assert.doesNotMatch(source, /코엑스|코엑스2|강남/);
  assert.doesNotMatch(source, /reportWindowDays:[\s\S]*:\s*5,/);
  assert.doesNotMatch(source, /\?\?\s*5/);

  console.log("regression_app_v2_settings_legacy_sheet_tabs_contract: OK");
}

main();
