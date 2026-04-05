import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";

function main() {
  const root = process.cwd();
  const build = spawnSync("npm", ["run", "app:build:main"], {
    cwd: root,
    encoding: "utf8"
  });
  assert.equal(build.status, 0, `app:build:main should succeed\nstdout:\n${build.stdout}\nstderr:\n${build.stderr}`);

  const modulePath = path.join(root, "dist-app", "app_v2", "main", "runtimeReadiness.js");

  const run = new Function(
    "modulePath",
    `
      return import(modulePath).then(({ summarizeRuntimeReadiness }) => {
        const settings = {
          config: { spreadsheet: "sheet-id", sheetName: "2026" },
          isConfigured: true,
          missingRequired: [],
          updatedAt: "2026-03-19T00:00:00.000Z",
          storagePath: "test-user-data/app-v2-settings.json"
        };
        const sheet = {
          checkedAt: "2026-03-19T00:00:00.000Z",
          status: "ready",
          summary: "ready",
          spreadsheetId: "sheet-id",
          sheetName: "2026",
          accessMode: "access-token",
          lastError: null
        };
        const partialPreflight = {
          checkedAt: "2026-03-19T00:00:00.000Z",
          overallStatus: "attention",
          canRun: true,
          summary: "partial",
          settings,
          providers: [
            {
              provider: "wings-pms",
              owner: "electron-main",
              partition: "persist:wings",
              label: "Wings",
              startUrl: "https://example.com",
              windowState: "hidden",
              pageState: "loaded",
              currentUrl: "https://example.com",
              currentHost: "example.com",
              title: "Wings",
              cookieCount: 1,
              lastError: null,
              lastLoadedAt: "2026-03-19T00:00:00.000Z",
              operatingStatus: "ready",
              operatingSummary: "ready"
            },
            {
              provider: "naver-partner",
              owner: "electron-main",
              partition: "persist:naver",
              label: "Naver",
              startUrl: "https://example.com",
              windowState: "hidden",
              pageState: "loaded",
              currentUrl: "https://example.com/login",
              currentHost: "example.com",
              title: "Login",
              cookieCount: 0,
              lastError: null,
              lastLoadedAt: "2026-03-19T00:00:00.000Z",
              operatingStatus: "needs-login",
              operatingSummary: "login required"
            },
            {
              provider: "admin-station",
              owner: "electron-main",
              partition: "persist:station",
              label: "Station",
              startUrl: "https://example.com",
              windowState: "hidden",
              pageState: "loaded",
              currentUrl: "https://example.com/station",
              currentHost: "example.com",
              title: "Station",
              cookieCount: 1,
              lastError: null,
              lastLoadedAt: "2026-03-19T00:00:00.000Z",
              operatingStatus: "ready",
              operatingSummary: "ready"
            }
          ]
        };
        const fullPreflight = {
          ...partialPreflight,
          overallStatus: "ready",
          providers: partialPreflight.providers.map((provider) => ({
            ...provider,
            pageState: "loaded",
            cookieCount: 1,
            lastLoadedAt: "2026-03-19T00:00:00.000Z",
            operatingStatus: "ready",
            operatingSummary: "ready"
          }))
        };
        return { partial: summarizeRuntimeReadiness("live-read", settings, sheet, partialPreflight), full: summarizeRuntimeReadiness("live-read", settings, sheet, fullPreflight) };
      });
    `
  );

  return Promise.resolve(run(modulePath)).then(({ partial, full }) => {
    assert.equal(partial.overallReady, false);
    assert.equal(partial.v2Gate, "locked");
    assert.equal(partial.supportLevel, "offline-preview");
    assert.deepEqual(partial.blockingSources, ["naver-partner"]);
    assert.equal(typeof partial.preflight.summary, "string");
    assert.equal(partial.preflight.summary.includes("partial"), false);
    assert.equal(partial.preflight.summary.includes("naver-partner"), true);

    assert.equal(full.overallReady, true);
    assert.equal(full.v2Gate, "open");
    assert.equal(full.supportLevel, "read-live");
    assert.equal(full.preflight.summary.includes("wings-pms"), true);
    assert.equal(full.preflight.summary.includes("admin-station"), true);
    assert.equal(full.preflight.summary.includes("naver-partner"), true);

    console.log("regression_app_v2_runtime_readiness_contract: OK");
  });
}

await main();
