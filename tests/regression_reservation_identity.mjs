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
  const withAlphaTaggedReservationNo = noteKey.buildReservationIdentity(
    "reservation no: DEB260122143405604-1623669 / guest kim",
    { checkin: "2026-03-01", nights: 2, channel: "BOOKING" }
  );
  const withShortTaggedReservationNo = noteKey.buildReservationIdentity(
    "예약번호: 6224 / 연락처: 010-6224-5555 / 예약자 김민수",
    { checkin: "2026-03-01", nights: 2, channel: "STATION" }
  );
  const withPhoneOnly = noteKey.buildReservationIdentity(
    "연락처: 010-6224-5555 / guest kim",
    { checkin: "2026-03-01", nights: 2, channel: "STATION" }
  );

  assert.equal(left.guestName, "홍길동");
  assert.equal(left.phoneTail, "5678");
  assert.ok(left.softKey);
  assert.ok(left.tokenHashes.length > 0);
  assert.equal(withReservationNo.reservationNo, "25170918");
  assert.equal(withAlphaTaggedReservationNo.reservationNo, "DEB2601221434056041623669");
  assert.equal(withShortTaggedReservationNo.reservationNo, "6224");
  assert.equal(withPhoneOnly.reservationNo, "");
  assert.ok(noteKey.calculateTokenOverlapRatio(left.tokenHashes, right.tokenHashes) >= 0.25);

  console.log("regression_reservation_identity: OK");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
