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

  const coexHar = {
    log: {
      entries: [
        {
          startedDateTime: "2026-03-06T02:00:00.000Z",
          request: {
            method: "POST",
            url: "https://pms.sanhait.com/pms/biz/ir04_0100X/updateReservation.do",
            headers: [
              { name: "Content-Type", value: "application/x-www-form-urlencoded; charset=UTF-8" }
            ],
            postData: {
              mimeType: "application/x-www-form-urlencoded; charset=UTF-8",
              text: "PROPERTY_NO=13"
            }
          }
        },
        {
          startedDateTime: "2026-03-06T02:00:10.684Z",
          request: {
            method: "POST",
            url: "https://pms.sanhait.com/pms/biz/ir04_0100X/searchListGlobalRsvn_v03.do",
            headers: [
              { name: "Content-Type", value: "application/x-www-form-urlencoded; charset=UTF-8" },
              { name: "Cookie", value: "JSESSIONID=abc123; Path=/" },
              { name: "X-Requested-With", value: "XMLHttpRequest" }
            ],
            postData: {
              mimeType: "application/x-www-form-urlencoded; charset=UTF-8",
              text: [
                "take=300",
                "skip=0",
                "page=1",
                "pageSize=300",
                "filter[PAGE_ID]=IR04_0100X_V03",
                "filter[AUTH_PASS_YN]=N",
                "filter[filters][0][field]=BSNS_CODE",
                "filter[filters][0][value]=13",
                "filter[filters][1][field]=PROPERTY_NO",
                "filter[filters][1][value]=13",
                "filter[filters][6][field]=ARRV_DATE_F",
                "filter[filters][6][value]=20260306",
                "filter[filters][7][field]=ARRV_DATE_T",
                "filter[filters][7][value]=20260313",
                "BSNS_CODE=13",
                "PROPERTY_NO=13",
                "ARRV_DATE_F=20260306",
                "ARRV_DATE_T=20260313"
              ].join("&")
            }
          }
        }
      ]
    }
  };

  const converted = normalize.convertHarToWingsPmsConfig(coexHar);
  assert.ok(converted, "COEX HAR conversion must succeed");
  assert.equal(converted.preset.presetKey, "wings-global-guest-list");
  assert.equal(converted.preset.propertyNo, "13");
  assert.equal(converted.preset.bsnsCode, "13");
  assert.equal(converted.preset.pageId, "IR04_0100X_V03");
  assert.equal(converted.preset.pageSize, 300);
  assert.equal(
    converted.url,
    "https://pms.sanhait.com/pms/biz/ir04_0100X/searchListGlobalRsvn_v03.do"
  );
  assert.equal(converted.bundle.method, "POST");
  assert.equal(converted.bundle.contentType, "form");
  assert.match(converted.bundle.requestBody, /BSNS_CODE=13/);
  assert.match(converted.bundle.requestBody, /PROPERTY_NO=13/);
  assert.match(converted.bundle.requestBody, /ARRV_DATE_F=20260306/);
  assert.match(converted.bundle.requestBody, /filter\[filters\]\[6\]\[field\]=ARRV_DATE_F/);
  assert.equal(converted.bundle.cookieHeader, "JSESSIONID=abc123; Path=/");
  assert.equal(converted.bundle.headers["X-Requested-With"], "XMLHttpRequest");

  const stationHar = {
    log: {
      entries: [
        {
          request: {
            method: "GET",
            url: "https://api.admin-stationbyuhc.com/admin/branch/18/calendar?startDate=2026-03-06&endDate=2026-04-05",
            headers: []
          }
        }
      ]
    }
  };
  assert.equal(normalize.convertHarToWingsPmsConfig(stationHar), null);

  console.log("regression_wings_pms_har_coex: OK");
}

main();
