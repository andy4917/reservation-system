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
  [
    "src/constants.js",
    "src/scan/normalize.js",
    "src/pms/wings.adapter.js",
    "src/engine/rules.js",
    "src/io/pms.fetch.js"
  ].map((p) => path.join(root, p)).forEach(loadScript);

  const normalize = globalThis.App?.scan?.normalize;
  const pmsFetch = globalThis.App?.io?.pmsFetch;
  assert.ok(normalize?.sanitizeSyncConfig, "sanitizeSyncConfig is required");
  assert.ok(pmsFetch?.fetchProviderReservations, "fetchProviderReservations is required");

  const syncConfig = normalize.sanitizeSyncConfig({
    pmsBranchProfiles: [
      {
        branch: "강남",
        pmsReservationUrl: "https://pms.sanhait.com/pms/biz/ir04_0100X/searchListGlobalRsvn_v03.do",
        pmsAuthBundle: {
          method: "POST",
          contentType: "form",
          requestBody: "PROPERTY_NO=91&BSNS_CODE=91&ARRV_DATE_F=20260320&ARRV_DATE_T=20260323"
        }
      }
    ]
  });

  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    const href = String(url);
    const pathname = new URL(href).pathname;
    calls.push({
      href,
      pathname,
      method: String(options.method || "GET").toUpperCase(),
      body: String(options.body || "")
    });

    if (pathname.endsWith("/searchListGlobalRsvn_v03.do") && calls.filter((row) => row.pathname === pathname).length === 1) {
      return {
        ok: true,
        status: 200,
        url: href,
        headers: { get: (name) => (String(name).toLowerCase() === "content-type" ? "text/html; charset=UTF-8" : "") },
        async text() {
          return [
            "<html><body>",
            "<div class='loading-content'>",
            "<form method='post' action='/identity/samlsso'>",
            "<input type='hidden' name='SAMLRequest' value='token-123' />",
            "<input type='hidden' name='RelayState' value='relay-456' />",
            "</form>",
            "</div>",
            "</body></html>"
          ].join("");
        }
      };
    }

    if (pathname.endsWith("/identity/samlsso")) {
      return {
        ok: true,
        status: 200,
        url: href,
        headers: { get: (name) => (String(name).toLowerCase() === "content-type" ? "text/html; charset=UTF-8" : "") },
        async text() {
          return "<html><body>relay-ok</body></html>";
        }
      };
    }

    if (pathname.endsWith("/searchListGlobalRsvn_v03.do")) {
      return {
        ok: true,
        status: 200,
        url: href,
        headers: { get: (name) => (String(name).toLowerCase() === "content-type" ? "application/json" : "") },
        async text() {
          return JSON.stringify({
            rows: [
              {
                RSVN_NO: "R-GANGNAM",
                GLOBAL_RSVN_NO: "G-GANGNAM",
                ARRV_DATE: "20260321",
                DEPT_DATE: "20260323",
                ROOM_NO: "0501",
                ACCOUNT: "부킹닷컴",
                SOURCE_CODE: "BOOKING",
                ROOM_AMT: "100000",
                RSVN_STATUS_CODE: "RC",
                PROPERTY_NO: "91"
              }
            ]
          });
        }
      };
    }

    throw new Error(`unexpected fetch: ${href}`);
  };

  const result = await pmsFetch.fetchProviderReservations(
    "wings-pms",
    { branch: "GANGNAM", startDate: "2026-03-20", endDate: "2026-03-23" },
    syncConfig
  );

  assert.equal(result.source, "pms-api");
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].reservationNo, "R-GANGNAM");
  assert.deepEqual(
    calls.map((row) => row.pathname),
    [
      "/pms/biz/ir04_0100X/searchListGlobalRsvn_v03.do",
      "/identity/samlsso",
      "/pms/biz/ir04_0100X/searchListGlobalRsvn_v03.do"
    ]
  );
  assert.match(calls[1].body, /SAMLRequest=token-123/);
  assert.match(calls[1].body, /RelayState=relay-456/);

  console.log("regression_wings_html_relay_fallback: OK");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
