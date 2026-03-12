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
    "src/scan/normalize.js",
    "src/engine/noteKey.js",
    "src/domain/reservationPolicy.js",
    "src/report/validator.js",
    "src/report/reservationVerification.js"
  ].map((p) => path.join(root, p)).forEach(loadScript);

  const validator = globalThis.App?.report?.validator;
  const verification = globalThis.App?.report?.reservationVerification;
  assert.ok(validator, "App.report.validator is required");
  assert.ok(verification, "App.report.reservationVerification is required");

  const report = validator.createVerificationReport();
  const query = { startDate: "2026-03-01", endDate: "2026-03-03" };
  verification.verifyProviderReservationsAgainstSheet({
    report,
    query,
    sheetQuery: query,
    providerKey: "wings-pms",
    providerReservationMeta: { source: "pms-api" },
    providerReservations: [
      {
        reservationNo: "",
        reservationRef: "",
        channel: "AGODA",
        checkin: "2026-03-01",
        checkout: "2026-03-03",
        nights: 2,
        roomNo: "701",
        status: "RC",
        statusBucket: "ACTIVE",
        branch: "COEX",
        guestName: "홍길동",
        phoneTail: "5678",
        remarkHead: "예약자 홍길동 / 연락처 010-1234-5678 / agoda"
      }
    ],
    sheetSnapshot: {
      reservationBlocks: [
        {
          kind: "RESERVATION",
          blockId: "sheet-1",
          branch: "GANGNAM",
          roomNo: "701",
          roomType: "Urban",
          channel: "AGODA",
          note: "예약자 홍길동 / 연락처 010-1234-5678 / agoda",
          dateKeys: ["2026-03-01", "2026-03-02"]
        }
      ]
    },
    isSameQuery: (left, right) => left.startDate === right.startDate && left.endDate === right.endDate
  });

  const issueTypes = new Set((report.issues || []).map((issue) => issue.type));
  assert.equal(issueTypes.has("SOFT_MATCH_USED"), false, "different branches must not soft-match");
  assert.equal(issueTypes.has("MISSING_ACTIVE_IN_PMS"), true);
  assert.equal(issueTypes.has("MISSING_ACTIVE_IN_SHEET"), true);

  console.log("regression_reservation_verification_branch_guard: OK");
}

main();
