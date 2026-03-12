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
  assert.ok(normalize, "App.scan.normalize is required");
  assert.ok(pmsFetch?.fetchWingsLiveContract, "fetchWingsLiveContract is required");
  assert.deepEqual(
    pmsFetch.getSupportedWingsLiveContracts(),
    [
      "assigned_room_lookup",
      "assigned_room_guest_info",
      "assignable_room_lookup",
      "assignable_room_type_lookup",
      "account_contract_lookup",
      "linked_reservation_lookup",
      "market_catalog",
      "nationality_language_lookup",
      "rate_catalog",
      "reservation_rate_lookup",
      "reservation_detail",
      "reservation_lookup",
      "reservation_lookup_local",
      "reservation_summary",
      "room_availability_chart",
      "room_availability_summary",
      "room_block_chart",
      "room_type_catalog",
      "sale_person_catalog",
      "source_catalog",
      "special_service_lookup"
    ]
  );

  const syncConfig = normalize.sanitizeSyncConfig({
    pmsBranchProfiles: [
      {
        branch: "강남",
        pmsPreset: {
          presetKey: "wings-global-guest-list",
          propertyNo: "91",
          bsnsCode: "91",
          pageId: "IR04_0100X_V03"
        },
        pmsAuthBundle: {
          method: "POST",
          contentType: "form",
          requestBody: "PROPERTY_NO=91&BSNS_CODE=91&ARRV_DATE_F=20260301&ARRV_DATE_T=20260307"
        }
      },
      {
        branch: "코엑스",
        pmsReservationUrl: "https://pms.sanhait.com/pms/biz/ir04_0200X_V03/searchListRsvn.do",
        pmsAuthBundle: {
          method: "POST",
          contentType: "form",
          requestBody: "PROPERTY_NO=13&BSNS_CODE=13&ARRV_DATE_F=20260301&ARRV_DATE_T=20260307"
        }
      }
    ]
  });

  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    const pathname = new URL(String(url)).pathname;
    const body = String(options.body || "");
    calls.push({ pathname, body });
    if (pathname.endsWith("/searchListGlobalRsvn_v03.do")) {
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({
            rows: [
              {
                RSVN_NO: "R-GANGNAM",
                GLOBAL_RSVN_NO: "G-GANGNAM",
                ARRV_DATE: "20260301",
                DEPT_DATE: "20260303",
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
    if (pathname.endsWith("/searchListRsvn.do")) {
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({
            rows: [
              {
                RSVN_NO: "R-COEX",
                GLOBAL_RSVN_NO: "G-COEX",
                ARRV_DATE: "20260301",
                DEPT_DATE: "20260302",
                ROOM_NO: "0701",
                ACCOUNT: "아고다",
                SOURCE_CODE: "AGODA",
                ROOM_AMT: "200000",
                RSVN_STATUS_CODE: "RC",
                PROPERTY_NO: "13"
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
                SOURCE_CODE: propertyNo === "91" ? "CMS" : "DIR",
                SOURCE_CODE_NAME: propertyNo === "91" ? "Booking Engine" : "Direct Reservation",
                CATEGORY_CODE: "OFL",
                CATEGORY_NAME: "Off-Line",
                USE_YN: "Y",
                ACTIVE_YN: "Yes"
              }
            ]
          });
        }
      };
    }
    if (pathname.endsWith("/searchListGlobalRsvn_v03_SUM.do")) {
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({
            rows: [
              {
                BIZ_DATE: "20260301",
                ACTIVE_CNT: "7",
                CANCEL_CNT: "1"
              }
            ]
          });
        }
      };
    }
    if (pathname.endsWith("/searchLangByNatCode.do")) {
      const propertyNo = /PROPERTY_NO=([^&]+)/.exec(body)?.[1] || "";
      const natCode = /NAT_CODE=([^&]+)/.exec(body)?.[1] || "";
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({
            rows: {
              NAT_CODE: natCode,
              LANG_CODE: propertyNo === "91" ? "ENG" : "KOR",
              LANG_NAME: propertyNo === "91" ? "English" : "Korean"
            }
          });
        }
      };
    }
    if (pathname.endsWith("/searchListLinkedReservation.do")) {
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({
            rows: [
              {
                RSVN_NO: "25150113",
                GLOBAL_RSVN_NO: "GR-25150113",
                LINK_RSVN_NO: "25150114",
                LINK_GLOBAL_RSVN_NO: "GR-25150114",
                LINK_TYPE: "MERGED"
              }
            ]
          });
        }
      };
    }
    if (pathname.endsWith("/searchListRoomBlockChart_V03.do") || pathname.endsWith("/searchListRoomAvaiable.do") || pathname.endsWith("/searchListRoomAvailable.do")) {
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({
            rows: [
              {
                BSNS_DATE: "20260301",
                ROOM_TYPE_CODE: "FSS",
                ROOM_TYPE_NAME: "Family Spa Suite",
                AVAILABLE_ROOM_CNT: "4",
                TOTAL_ROOM_CNT: "10",
                OCCUPIED_ROOM_CNT: "6"
              }
            ]
          });
        }
      };
    }
    if (pathname.endsWith("/searchFITReserv.do")) {
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({
            rows: {
              RSVN_NO: "25150113",
              RSVN_SEQ_NO: "1",
              ARRV_DATE: "20260321",
              DEPT_DATE: "20260325",
              NIGHTS: 4,
              ROOM_TYPE_CODE: "FSS",
              ROOM_TYPE_NAME: "Family Spa Suite",
              INHS_GEST_NAME: "Nguyen Thanh",
              LANG_NAME: "English",
              NAT_CODE: "USA",
              RSVN_STATUS_CODE: "RR"
            }
          });
        }
      };
    }
    if (pathname.endsWith("/searchGuestInfo.do")) {
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({
            rows: [
              {
                RSVN_NO: "25162205",
                RSVN_SEQ_NO: "1",
                INHS_GEST_NAME: "Erica Loke",
                ROOM_NO: "0401",
                ROOM_TYPE_CODE: "GSS",
                ARRV_DATE: "20260411",
                DEPT_DATE: "20260419",
                NAT_CODE: "SGP",
                LANG_CODE: "ENG",
                LANG_NAME: "English"
              }
            ]
          });
        }
      };
    }
    if (pathname.endsWith("/searchListAssignedRoom.do")) {
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({
            rows: [
              {
                ARRV_DATE: "20260411",
                DEPT_DATE: "20260419",
                RSVN_NO: "25162205",
                RSVN_SEQ_NO: "1",
                ROOM_NO: "0401",
                ROOM_TYPE_CODE: "GSS",
                ROOM_STATUS_CODE: "VAC",
                INHS_GEST_NAME: "Erica Loke",
                PROPERTY_NO: "91",
                BSNS_CODE: "91"
              }
            ]
          });
        }
      };
    }
    if (
      pathname.endsWith("/searchListRoomType.do") ||
      pathname.endsWith("/searchListMarket.do") ||
      pathname.endsWith("/selectListRate.do") ||
      pathname.endsWith("/selectListSalePerson.do") ||
      pathname.endsWith("/searchListAccountContract.do") ||
      pathname.endsWith("/searchListSpecialService.do") ||
      pathname.endsWith("/searchRoomRateOnRsvn.do") ||
      pathname.endsWith("/searchListRoom.do") ||
      pathname.endsWith("/searchListRoomTypeByParam.do")
    ) {
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({
            rows: [
              {
                CODE: "SAMPLE",
                NAME: "Sample Value"
              }
            ]
          });
        }
      };
    }
    throw new Error(`Unexpected fetch ${pathname}`);
  };

  const reservationLookup = await pmsFetch.fetchWingsLiveContract(
    "admin-station",
    { capability: "reservation_lookup", startDate: "2026-03-01", endDate: "2026-03-03" },
    syncConfig
  );
  assert.equal(reservationLookup.capability, "reservation_lookup");
  assert.equal(reservationLookup.records.length, 1);
  assert.equal(reservationLookup.records[0].branch, "GANGNAM");

  const reservationLookupLocal = await pmsFetch.fetchWingsLiveContract(
    "admin-station",
    { capability: "reservation_lookup_local", startDate: "2026-03-01", endDate: "2026-03-03" },
    syncConfig
  );
  assert.equal(reservationLookupLocal.records.length, 1);
  assert.equal(reservationLookupLocal.records[0].branch, "COEX");
  assert.equal(reservationLookupLocal.endpointCapability, "reservation_lookup_local");

  const sourceCatalog = await pmsFetch.fetchWingsLiveContract(
    "admin-station",
    { capability: "source_catalog" },
    syncConfig
  );
  assert.equal(sourceCatalog.items.length, 2);
  assert.deepEqual(sourceCatalog.items.map((row) => row.branch).sort(), ["COEX", "GANGNAM"]);

  const reservationSummary = await pmsFetch.fetchWingsLiveContract(
    "admin-station",
    { capability: "reservation_summary", startDate: "2026-03-01", endDate: "2026-03-03" },
    syncConfig
  );
  assert.equal(reservationSummary.items.length, 2);

  const linkedReservation = await pmsFetch.fetchWingsLiveContract(
    "admin-station",
    { capability: "linked_reservation_lookup", branch: "강남", reservationNo: "25150113" },
    syncConfig
  );
  assert.equal(linkedReservation.items.length, 1);
  assert.equal(linkedReservation.items[0].linkedReservationNo, "25150114");

  const roomAvailability = await pmsFetch.fetchWingsLiveContract(
    "admin-station",
    { capability: "room_availability_chart", startDate: "2026-03-01", endDate: "2026-03-03" },
    syncConfig
  );
  assert.equal(roomAvailability.items.length, 2);
  assert.equal(roomAvailability.items[0].roomTypeCode, "FSS");

  const nationalityLookup = await pmsFetch.fetchWingsLiveContract(
    "admin-station",
    { capability: "nationality_language_lookup", natCode: "USA" },
    syncConfig
  );
  assert.equal(nationalityLookup.items.length, 2);
  assert.equal(nationalityLookup.items[0].natCode, "USA");

  const reservationDetail = await pmsFetch.fetchWingsLiveContract(
    "admin-station",
    { capability: "reservation_detail", branch: "강남", reservationNo: "25150113", reservationSeqNo: "1" },
    syncConfig
  );
  assert.equal(reservationDetail.items.length, 1);
  assert.equal(reservationDetail.items[0].reservationNo, "25150113");
  assert.equal(reservationDetail.items[0].languageName, "English");

  const guestInfo = await pmsFetch.fetchWingsLiveContract(
    "admin-station",
    { capability: "assigned_room_guest_info", reservationNo: "25162205", branch: "강남" },
    syncConfig
  );
  assert.equal(guestInfo.items.length, 1);
  assert.equal(guestInfo.items[0].guestName, "Erica Loke");

  const assignedRoom = await pmsFetch.fetchWingsLiveContract(
    "admin-station",
    {
      capability: "assigned_room_lookup",
      reservationNo: "25162205",
      reservationSeqNo: "1",
      arrvDate: "2026-04-11",
      deptDate: "2026-04-19",
      roomTypeCode: "GSS"
    },
    syncConfig
  );
  assert.equal(assignedRoom.items.length, 1);
  assert.equal(assignedRoom.items[0].branch, "GANGNAM");
  assert.equal(
    calls.filter((row) => row.pathname.endsWith("/searchListAssignedRoom.do")).length,
    1,
    "assigned_room_lookup should only run against supported branch profiles"
  );

  console.log("regression_wings_live_contracts: OK");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
