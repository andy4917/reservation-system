import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

function buildHar(url, propertyNo) {
  return {
    log: {
      entries: [
        {
          startedDateTime: "2026-03-01T01:00:00.000Z",
          request: {
            method: "POST",
            url,
            headers: [
              { name: "Content-Type", value: "application/x-www-form-urlencoded; charset=UTF-8" },
              { name: "Cookie", value: `SESSION=${propertyNo}; Path=/` },
              { name: "X-Requested-With", value: "XMLHttpRequest" }
            ],
            postData: {
              mimeType: "application/x-www-form-urlencoded; charset=UTF-8",
              text: [
                "take=500",
                "skip=0",
                "page=1",
                "pageSize=500",
                propertyNo === "91" ? "filter[PAGE_ID]=IR04_0200X_V03" : "filter[PAGE_ID]=IR04_0200X_V03",
                `filter[filters][0][field]=BSNS_CODE`,
                `filter[filters][0][value]=${propertyNo}`,
                "filter[filters][1][field]=PROPERTY_NO",
                `filter[filters][1][value]=${propertyNo}`,
                "ARRV_DATE_F=2026-03-01",
                "ARRV_DATE_T=2026-03-07"
              ].join("&")
            }
          }
        }
      ]
    }
  };
}

async function main() {
  const root = process.cwd();
  const runtimeModulePath = path.join(root, "dist-app/main/wingsRuntime.js");
  const runtime = await import(`${pathToFileURL(runtimeModulePath).href}?t=${Date.now()}`);

  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "uhs-wings-runtime-"));
  const gangnamHar = path.join(tempDir, "gangnam.har");
  const coexHar = path.join(tempDir, "coex.har");
  await fs.promises.writeFile(
    gangnamHar,
    JSON.stringify(buildHar("https://pms.sanhait.com/pms/biz/ir04_0200X_V03/searchListRsvn.do", "91")),
    "utf8"
  );
  await fs.promises.writeFile(
    coexHar,
    JSON.stringify(buildHar("https://pms.sanhait.com/pms/biz/ir04_0200X_V03/searchListRsvn.do", "13")),
    "utf8"
  );

  process.env.UHS_WINGS_HAR_GANGNAM = gangnamHar;
  process.env.UHS_WINGS_HAR_COEX = coexHar;
  runtime.__resetWingsRuntimeForTests();

  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    const pathname = new URL(String(url)).pathname;
    const body = String(options.body || "");
    calls.push({ pathname, body });
    if (pathname.endsWith("/searchListRsvn.do")) {
      const propertyNo = /PROPERTY_NO=([^&]+)/.exec(body)?.[1] || "";
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({
            rows: [
              {
                RSVN_NO: propertyNo === "91" ? "R-GANGNAM" : "R-COEX",
                GLOBAL_RSVN_NO: propertyNo === "91" ? "G-GANGNAM" : "G-COEX",
                ARRV_DATE: "20260301",
                DEPT_DATE: "20260303",
                ROOM_NO: propertyNo === "91" ? "0501" : "0701",
                ACCOUNT: propertyNo === "91" ? "부킹닷컴" : "아고다",
                SOURCE_CODE: propertyNo === "91" ? "BOOKING" : "AGODA",
                ROOM_AMT: propertyNo === "91" ? "100000" : "200000",
                RSVN_STATUS_CODE: "RC",
                PROPERTY_NO: propertyNo,
                GUEST_NAME: propertyNo === "91" ? "홍길동" : "김다은"
              }
            ]
          });
        }
      };
    }
    if (pathname.endsWith("/searchListSource.do")) {
      const propertyNo = /PROPERTY_NO=([^&]+)/.exec(body)?.[1] || "";
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({
            valueList: [
              {
                SOURCE_CODE: propertyNo === "91" ? "BOOKING" : "AGODA",
                SOURCE_CODE_NAME: propertyNo === "91" ? "Booking.com" : "Agoda",
                CATEGORY_CODE: "OTA",
                CATEGORY_NAME: "Online",
                USE_YN: "Y",
                ACTIVE_YN: "Y"
              }
            ]
          });
        }
      };
    }
    throw new Error(`Unexpected fetch ${pathname}`);
  };

  const diagnostics = runtime.getWingsRuntimeDiagnostics();
  assert.equal(diagnostics.source, "har-env");
  assert.deepEqual(diagnostics.configuredBranches.sort(), ["COEX", "GANGNAM"]);
  assert.ok(diagnostics.supportedContracts.includes("source_catalog"));

  const reservations = await runtime.fetchWingsReservations({
    startDate: "2026-03-01",
    endDate: "2026-03-03"
  });
  assert.equal(Array.isArray(reservations.records), true);
  assert.equal(reservations.records.length, 2);
  assert.deepEqual(
    reservations.records.map((row) => row.branch).sort(),
    ["COEX", "GANGNAM"]
  );

  const sourceCatalog = await runtime.fetchWingsLiveContract({
    capability: "source_catalog"
  });
  assert.equal(sourceCatalog.capability, "source_catalog");
  assert.equal(sourceCatalog.items.length, 2);
  assert.deepEqual(
    sourceCatalog.items.map((row) => row.branch).sort(),
    ["COEX", "GANGNAM"]
  );
  assert.ok(calls.some((call) => call.pathname.endsWith("/searchListSource.do")));

  delete process.env.UHS_WINGS_HAR_GANGNAM;
  delete process.env.UHS_WINGS_HAR_COEX;
  delete process.env.UHS_WINGS_HAR_BRANCHES_JSON;
  const previousHome = process.env.HOME;
  const previousUserProfile = process.env.USERPROFILE;
  const desktopRoot = path.join(tempDir, "OneDrive", "바탕 화면");
  await fs.promises.mkdir(desktopRoot, { recursive: true });
  const desktopGangnamHar = path.join(desktopRoot, "pms.sanhait.com.ACCOUNT gangnam.har");
  const desktopCoexHar = path.join(desktopRoot, "pms.sanhait.com.ACCOUNT coex.har");
  await fs.promises.copyFile(gangnamHar, desktopGangnamHar);
  await fs.promises.copyFile(coexHar, desktopCoexHar);
  process.env.HOME = tempDir;
  process.env.USERPROFILE = tempDir;
  runtime.__resetWingsRuntimeForTests();

  const autoDiscoveredDiagnostics = runtime.getWingsRuntimeDiagnostics();
  assert.equal(autoDiscoveredDiagnostics.source, "har-env");
  assert.deepEqual(autoDiscoveredDiagnostics.configuredBranches.sort(), ["COEX", "GANGNAM"]);

  if (typeof previousHome === "string") process.env.HOME = previousHome;
  else delete process.env.HOME;
  if (typeof previousUserProfile === "string") process.env.USERPROFILE = previousUserProfile;
  else delete process.env.USERPROFILE;

  console.log("regression_app_wings_runtime_loader: OK");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
