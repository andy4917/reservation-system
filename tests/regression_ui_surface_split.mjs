import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function main() {
  const root = process.cwd();
  const filePath = path.join(root, "src/ui/panelTemplate.js");
  const source = fs.readFileSync(filePath, "utf8");

  const settingsIndex = source.indexOf('id="sheetBox"');
  const opsIndex = source.indexOf('id="opsSection"');
  const verifyIndex = source.indexOf('id="verifyIssueWrap"');
  const debugIndex = source.indexOf('id="debugWrap"');
  const blockIndex = source.indexOf('id="syncBlockWrap"');
  const siteTableIndex = source.indexOf('id="siteHead"');
  const userSummaryIndex = source.indexOf('id="userOpsSummary"');

  assert.ok(userSummaryIndex >= 0, "user summary section should exist");
  assert.ok(settingsIndex >= 0, "settings section should exist");
  assert.ok(opsIndex > settingsIndex, "ops section should live inside settings");
  assert.ok(verifyIndex > opsIndex, "verification table should only exist inside ops section");
  assert.ok(debugIndex > opsIndex, "debug panel should only exist inside ops section");
  assert.ok(blockIndex > opsIndex, "sync blocked table should only exist inside ops section");
  assert.ok(siteTableIndex > opsIndex, "site inventory table should only exist inside ops section");
  assert.equal(source.indexOf('id="verifyIssueWrap"', 0), verifyIndex, "verification table should appear once");
  assert.equal(source.indexOf('id="debugWrap"', 0), debugIndex, "debug wrap should appear once");
  assert.equal(source.indexOf('id="syncBlockWrap"', 0), blockIndex, "sync block wrap should appear once");
  assert.match(source, /id="toggleOpsSectionBtn"/);
  assert.match(source, /id="exportGoldenSetBtn"/);

  console.log("regression_ui_surface_split: OK");
}

main();
