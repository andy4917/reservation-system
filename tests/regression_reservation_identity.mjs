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
    "src/scan/normalize.js",
    "src/engine/noteKey.js"
  ]
    .map((p) => path.join(root, p))
    .forEach(loadScript);

  const noteKey = globalThis.App?.engine?.noteKey;
  assert.ok(noteKey, "App.engine.noteKey is required");

  const left = noteKey.buildReservationIdentity(
    "예약자: 홍길동 / 연락처: 010-1234-5678 / trip 장기투숙",
    { checkin: "2026-03-01", checkout: "2026-03-03", nights: 2, channel: "TRIP" }
  );
  const right = noteKey.buildReservationIdentity(
    "guest 홍길동 phone 01012345678 long stay trip",
    { checkin: "2026-03-01", checkout: "2026-03-03", nights: 2, channel: "TRIP" }
  );
  const withReservationNo = noteKey.buildReservationIdentity(
    "예약번호 25170918 / 예약자 홍길동",
    { checkin: "2026-03-01", nights: 2, channel: "TRIP" }
  );

  assert.equal(left.guestName, "홍길동");
  assert.equal(left.phoneTail, "5678");
  assert.ok(left.softKey);
  assert.ok(left.tokenHashes.length > 0);
  assert.equal(withReservationNo.reservationNo, "25170918");
  assert.ok(noteKey.calculateTokenOverlapRatio(left.tokenHashes, right.tokenHashes) >= 0.25);

  console.log("regression_reservation_identity: OK");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
