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
  ]
    .map((p) => path.join(root, p))
    .forEach(loadScript);

  const normalize = globalThis.App?.scan?.normalize;
  const pmsFetch = globalThis.App?.io?.pmsFetch;
  assert.ok(normalize, "App.scan.normalize is required");
  assert.ok(pmsFetch, "App.io.pmsFetch is required");

  const sanitized = normalize.sanitizeSyncConfig({
    pmsReservationUrl: "https://pms.sanhait.com/pms/biz/ir04_0100X/searchListGlobalRsvn_v03.do",
    pmsAuthBundle: {
      method: "POST",
      contentType: "form",
      requestBody: "BSNS_CODE=91&PROPERTY_NO=91&ARRV_DATE_F=20260228&ARRV_DATE_T=20260307",
      headers: {
        "x-test-header": "ok"
      }
    }
  });

  assert.equal(sanitized.pmsAuthBundle.method, "POST");
  assert.equal(sanitized.pmsAuthBundle.contentType, "form");
  assert.match(sanitized.pmsAuthBundle.requestBody, /ARRV_DATE_F=20260228/);

  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({
          rows: [
            {
              RSVN_NO: "25170918",
              GLOBAL_RSVN_NO: "1964355080",
              ARRV_DATE: "20260301",
              DEPT_DATE: "20260303",
              ROOM_NO: "0701",
              ACCOUNT: "아고다",
              SOURCE_CODE: "AGODA",
              ROOM_AMT: "627480",
              RSVN_STATUS_CODE: "RC",
              PROPERTY_NO: "91",
              GUEST_NAME: "홍길동",
              PHONE_NO: "010-1234-5678",
              REMARK: "예약자 홍길동 / 연락처 010-1234-5678 / 장기투숙"
            }
          ],
          resultCd: "00",
          resultMsg: "정상처리 되었습니다."
        });
      }
    };
  };

  const result = await pmsFetch.fetchProviderReservations("admin-station", {
    startDate: "2026-03-01",
    endDate: "2026-03-03"
  }, sanitized);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.method, "POST");
  assert.equal(
    calls[0].options.headers["Content-Type"],
    "application/x-www-form-urlencoded; charset=UTF-8"
  );
  assert.equal(calls[0].options.headers["X-Requested-With"], "XMLHttpRequest");
  assert.equal(calls[0].options.headers["x-test-header"], "ok");
  assert.match(calls[0].options.body, /ARRV_DATE_F=2026-03-01/);
  assert.match(calls[0].options.body, /ARRV_DATE_T=2026-03-03/);

  assert.equal(result.source, "pms-api");
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].reservationNo, "25170918");
  assert.equal(result.records[0].checkin, "2026-03-01");
  assert.equal(result.records[0].checkout, "2026-03-03");
  assert.equal(result.records[0].statusBucket, "ACTIVE");
  assert.equal(result.records[0].guestName, "홍길동");
  assert.equal(result.records[0].phoneTail, "5678");
  assert.equal(Array.isArray(result.records[0].identityTokenHashes), true);
  assert.equal("raw" in result.records[0], false);
  assert.deepEqual(result.statusCounts, { active: 1, canceled: 0, auditAnomaly: 0 });

  const cacheKey = pmsFetch.buildPmsReservationCacheKey(
    "admin-station",
    sanitized.pmsReservationUrl,
    { method: "POST", body: "ARRV_DATE_F=2026-03-01&ARRV_DATE_T=2026-03-03" },
    {
      ...sanitized.pmsAuthBundle,
      authorization: "Bearer secret-token-value",
      cookieHeader: "SESSION=very-secret",
      csrfToken: "csrf-secret"
    },
    { startDate: "2026-03-01", endDate: "2026-03-03" }
  );
  assert.doesNotMatch(cacheKey, /secret-token-value/);
  assert.doesNotMatch(cacheKey, /SESSION=very-secret/);
  assert.doesNotMatch(cacheKey, /csrf-secret/);

  const cachedResult = await pmsFetch.fetchProviderReservations("admin-station", {
    startDate: "2026-03-01",
    endDate: "2026-03-03"
  }, sanitized);
  assert.equal(calls.length, 1, "same request should reuse short-term cache");
  assert.notEqual(cachedResult, result, "cached result should be cloned");
  assert.equal(cachedResult.records[0].reservationNo, "25170918");

  let retryCalls = 0;
  globalThis.fetch = async () => {
    retryCalls += 1;
    if (retryCalls === 1) {
      return {
        ok: false,
        status: 503,
        async text() {
          return "temporary outage";
        }
      };
    }
    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({
          rows: [
            {
              RSVN_NO: "25170919",
              GLOBAL_RSVN_NO: "1964355081",
              ARRV_DATE: "20260304",
              DEPT_DATE: "20260305",
              ROOM_NO: "0702",
              ACCOUNT: "부킹닷컴",
              SOURCE_CODE: "BOOKING",
              ROOM_AMT: "314000",
              RSVN_STATUS_CODE: "RC",
              PROPERTY_NO: "91"
            },
            {
              RSVN_NO: "25170920",
              GLOBAL_RSVN_NO: "1964355082",
              ARRV_DATE: "20260304",
              DEPT_DATE: "20260305",
              ROOM_NO: "0703",
              ACCOUNT: "부킹닷컴",
              SOURCE_CODE: "BOOKING",
              ROOM_AMT: "0",
              RSVN_STATUS_CODE: "NS",
              PROPERTY_NO: "91",
              REMARK: "예약자 김지연 / 연락처 010-8888-9999 / night audit"
            },
            {
              RSVN_NO: "25170921",
              GLOBAL_RSVN_NO: "1964355083",
              ARRV_DATE: "20260304",
              DEPT_DATE: "20260305",
              ROOM_NO: "0704",
              ACCOUNT: "부킹닷컴",
              SOURCE_CODE: "BOOKING",
              ROOM_AMT: "0",
              RSVN_STATUS_CODE: "CN",
              PROPERTY_NO: "91",
              REMARK: "예약자 김취소 / 연락처 010-8888-9999"
            }
          ]
        });
      }
    };
  };
  const retried = await pmsFetch.fetchProviderReservations("admin-station", {
    startDate: "2026-03-04",
    endDate: "2026-03-05"
  }, sanitized);
  assert.equal(retryCalls, 2, "retryable PMS errors should be retried once");
  assert.equal(retried.records[0].reservationNo, "25170919");
  assert.equal(retried.records[0].statusBucket, "ACTIVE");
  assert.equal(retried.records[1].reservationNo, "25170920");
  assert.equal(retried.records[1].statusBucket, "ACTIVE");
  assert.equal(retried.records[1].auditAnomaly, true);
  assert.equal(retried.records[2].reservationNo, "25170921");
  assert.equal(retried.records[2].statusBucket, "CANCELED");
  assert.deepEqual(retried.statusCounts, { active: 2, canceled: 1, auditAnomaly: 1 });

  await assert.rejects(
    () => pmsFetch.fetchProviderReservations("admin-station", {
      startDate: "2026-03-01",
      endDate: "2026-03-03"
    }, normalize.sanitizeSyncConfig({
      pmsReservationUrl: "https://pms.sanhait.com/pms/biz/ir04_0100X/updateReservation.do",
      pmsAuthBundle: {
        method: "POST",
        contentType: "form",
        requestBody: "PROPERTY_NO=91"
      }
    })),
    /읽기 전용 엔드포인트만 허용/
  );

  console.log("regression_pms_fetch_wings_post: OK");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
