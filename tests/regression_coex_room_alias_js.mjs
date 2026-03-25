import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

function main() {
  const root = process.cwd();
  const filePath = path.join(root, "src", "report", "reservationVerification.js");
  const code = fs.readFileSync(filePath, "utf8");

  globalThis.App = {
    scan: {
      normalize: {
        normalizeText: (value) => (typeof value === "string" ? value.trim() : ""),
        isDate: () => false,
        toDateKey: () => "",
        fromDateKey: () => null,
        addDays: () => null,
        quickTextHash: () => "",
      },
    },
    engine: {
      noteKey: {
        buildReservationIdentity: () => ({}),
        calculateTokenOverlapRatio: () => 0,
        calculateNameSimilarity: () => 0,
        hasStrongGuestNameMatch: () => false,
      },
    },
    report: {
      validator: {
        addVerificationPass: () => {},
        addVerificationWarn: () => {},
        addVerificationFail: () => {},
        makeVerificationIssue: () => ({}),
      },
    },
    domain: {
      reservationPolicy: {
        normalizeReservationNoFromText: (value) => value,
        classifyReservationStatusBucket: (value) => value,
      },
    },
  };

  vm.runInThisContext(code, { filename: filePath });
  const runtime = globalThis.App.report.reservationVerification;

  const aliasB112 = new Set(runtime.reservationRoomAliasKeys("B112"));
  assert(aliasB112.has("B112"));
  assert(aliasB112.has("1102"));
  assert(!aliasB112.has("112"));

  const aliasA121 = new Set(runtime.reservationRoomAliasKeys("A121"));
  assert(aliasA121.has("A121"));
  assert(aliasA121.has("2201"));
  assert(!aliasA121.has("1121"));

  assert.equal(runtime.reservationRoomSetsConflict(["B112"], ["1102"]), false);
  assert.equal(runtime.reservationRoomSetsConflict(["A121"], ["2201"]), false);

  console.log("regression_coex_room_alias_js: OK");
}

main();
