import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { pathToFileURL } from "node:url";

async function loadBuiltModule(filePath) {
  if (typeof vm.SourceTextModule !== "function") {
    return import(`${pathToFileURL(filePath).href}?t=${Date.now()}`);
  }

  const code = await fs.promises.readFile(filePath, "utf8");
  const context = vm.createContext({
    console,
    Date
  });
  const mod = new vm.SourceTextModule(code, {
    context,
    identifier: filePath
  });
  await mod.link(() => {
    throw new Error("reservationAudit build output should not import runtime dependencies");
  });
  await mod.evaluate();
  return mod.namespace;
}

async function main() {
  const root = process.cwd();
  const modulePath = path.join(root, "dist-app/services/reservationAudit.js");
  const reservationAudit = await loadBuiltModule(modulePath);

  assert.equal(typeof reservationAudit.buildReservationAuditSnapshot, "function");

  const snapshot = reservationAudit.buildReservationAuditSnapshot({
    mode: "live",
    sourceLabel: "partial-live",
    liveContextAvailable: true,
    bridgeSummary: {
      authSummary: {
        cookieCount: 3,
        domains: ["pms.sanhait.com"],
        hasBearer: false,
        hasCsrf: true,
        hasRole: true
      },
      infoSummary: {
        count: 5,
        channels: ["NAVER", "STATION"],
        dates: ["2026-03-12", "2026-03-13"]
      }
    }
  });

  assert.equal(snapshot.sourceLabel, "partial-live");
  assert.equal(snapshot.supportLevel, "partial-live");
  assert.equal(snapshot.reviewCount, 1);
  assert.equal(snapshot.anomalyCount, 0);
  assert.equal(snapshot.rows.length, 1);
  assert.match(snapshot.rows[0].reason, /bridge auth\/info summary/i);
  assert.match(snapshot.validationLines[1], /fixture fallback/i);

  console.log("regression_app_reservation_audit_snapshot: OK");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
