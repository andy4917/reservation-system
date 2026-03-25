import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function main() {
  const root = process.cwd();
  const build = spawnSync("npm", ["run", "app:build:main"], {
    cwd: root,
    encoding: "utf8"
  });
  assert.equal(build.status, 0, `app:build:main should succeed\nstdout:\n${build.stdout}\nstderr:\n${build.stderr}`);

  const modulePath = path.join(root, "dist-app", "app_v2", "main", "sourceReservationRuntime.js");
  const run = new Function(
    "modulePath",
    "tempDir",
    `
      return import(modulePath).then(async ({ buildSourceReservationsFromPmsRecords, writeSourceReservationsFixture }) => {
        const records = [
          {
            reservationNo: "R-100",
            checkin: "2026-03-20",
            checkout: "2026-03-22",
            nights: 2,
            roomNo: "0501",
            sourceCode: "BOOKING",
            statusBucket: "ACTIVE",
            status: "RR",
            branch: "GANGNAM",
            guestName: "Kim",
            phoneTail: "1234"
          },
          {
            reservationNo: "R-200",
            checkin: "2026-03-21",
            checkout: "2026-03-22",
            nights: 1,
            roomNo: "0701",
            sourceCode: "AGODA",
            statusBucket: "CANCELED",
            status: "CX",
            branch: "COEX"
          }
        ];

        const rows = buildSourceReservationsFromPmsRecords(records, "PMS");
        const written = await writeSourceReservationsFixture(rows, tempDir);
        return { rows, written };
      });
    `
  );

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "app-v2-source-runtime-"));
  return Promise.resolve(run(modulePath, tempDir)).then(({ rows, written }) => {
    assert.equal(rows.length, 2);
    assert.deepEqual(rows[0], {
      source_system: "PMS",
      reservation_no: "R-100",
      channel: "BOOKING",
      checkin: "2026-03-20",
      checkout: "2026-03-22",
      nights: 2,
      room_no: "0501",
      price: null,
      account: "",
      status: "RR",
      status_bucket: "ACTIVE",
      audit_anomaly: false,
      branch: "GANGNAM",
      reservation_ref: "",
      nationality_nights: ""
    });
    assert.equal(rows[1].status_bucket, "CANCELED");
    assert.equal(rows[1].audit_anomaly, false);
    assert.equal(fs.existsSync(written.path), true);

    const payload = JSON.parse(fs.readFileSync(written.path, "utf8"));
    assert.equal(Array.isArray(payload), true);
    assert.equal(payload.length, 2);

    console.log("regression_app_v2_source_reservation_runtime: OK");
  });
}

await main();
