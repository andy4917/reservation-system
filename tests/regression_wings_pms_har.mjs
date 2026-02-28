import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

function loadScript(filePath) {
  const code = fs.readFileSync(filePath, "utf8");
  vm.runInThisContext(code, { filename: filePath });
}

function main() {
  const root = process.cwd();
  globalThis.App = {};
  [
    "src/constants.js",
    "src/scan/normalize.js"
  ].map((p) => path.join(root, p)).forEach(loadScript);

  const normalize = globalThis.App?.scan?.normalize;
  assert.ok(normalize, "App.scan.normalize is required");

  const converted = normalize.convertHarToWingsPmsConfig({
    log: {
      entries: [
        {
          startedDateTime: "2026-03-01T00:00:00.000Z",
          request: {
            method: "POST",
            url: "https://pms.sanhait.com/pms/biz/ir04_0100X/updateReservation.do",
            headers: [
              { name: "Content-Type", value: "application/x-www-form-urlencoded; charset=UTF-8" }
            ],
            postData: {
              mimeType: "application/x-www-form-urlencoded; charset=UTF-8",
              text: "PROPERTY_NO=99"
            }
          }
        },
        {
          startedDateTime: "2026-03-01T01:00:00.000Z",
          request: {
            method: "POST",
            url: "https://pms.sanhait.com/pms/biz/ir04_0100X/searchListRsvn.do",
            headers: [
              { name: "Content-Type", value: "application/x-www-form-urlencoded; charset=UTF-8" },
              { name: "Cookie", value: "SESSION=abc123; Path=/" },
              { name: "X-Requested-With", value: "XMLHttpRequest" }
            ],
            postData: {
              mimeType: "application/x-www-form-urlencoded; charset=UTF-8",
              text: [
                "take=500",
                "skip=0",
                "page=1",
                "pageSize=500",
                "filter[PAGE_ID]=IR04_0100X",
                "filter[filters][0][field]=BSNS_CODE",
                "filter[filters][0][value]=91",
                "filter[filters][1][field]=PROPERTY_NO",
                "filter[filters][1][value]=91",
                "ARRV_DATE_F=2026-03-01",
                "ARRV_DATE_T=2026-03-07"
              ].join("&")
            }
          }
        }
      ]
    }
  });

  assert.ok(converted, "HAR conversion must succeed");
  assert.equal(converted.preset.presetKey, "wings-reservation-list");
  assert.equal(converted.preset.propertyNo, "91");
  assert.equal(converted.preset.bsnsCode, "91");
  assert.equal(converted.preset.pageId, "IR04_0100X");
  assert.equal(converted.preset.pageSize, 500);
  assert.equal(
    converted.url,
    "https://pms.sanhait.com/pms/biz/ir04_0100X/searchListRsvn.do"
  );
  assert.equal(converted.bundle.method, "POST");
  assert.equal(converted.bundle.contentType, "form");
  assert.match(converted.bundle.requestBody, /ARRV_DATE_F=2026-03-01/);
  assert.equal(converted.bundle.cookieHeader, "SESSION=abc123; Path=/");
  assert.equal(converted.bundle.headers["X-Requested-With"], "XMLHttpRequest");

  console.log("regression_wings_pms_har: OK");
}

main();
