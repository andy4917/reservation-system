import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";

async function main() {
  const root = process.cwd();
  const build = spawnSync("npm", ["run", "app:build:main"], {
    cwd: root,
    encoding: "utf8"
  });
  assert.equal(build.status, 0, `app:build:main should succeed\nstdout:\n${build.stdout}\nstderr:\n${build.stderr}`);

  const modulePath = path.join(root, "dist-app", "app_v2", "main", "providerSourceReadiness.js");
  const run = new Function(
    "modulePath",
    `
      return import(modulePath).then(({ applyProviderSourceAccessToOperatingSnapshot }) => {
        const stationBlocked = applyProviderSourceAccessToOperatingSnapshot(
          {
            provider: "admin-station",
            owner: "electron-main",
            partition: "persist:station",
            label: "Station",
            startUrl: "https://admin.admin-stationbyuhc.com/",
            windowState: "hidden",
            pageState: "loaded",
            currentUrl: "https://admin.admin-stationbyuhc.com/",
            currentPath: "/",
            currentHost: "admin.admin-stationbyuhc.com",
            title: "STATION by UHC",
            cookieCount: 0,
            providerCookieCount: 0,
            lastError: null,
            storageSnapshotReadState: "not-read",
            storageSnapshotError: null,
            lastLoadedAt: "2026-03-19T00:00:00.000Z",
            lastLoadStartedAt: "2026-03-19T00:00:00.000Z",
            lastLoadFinishedAt: "2026-03-19T00:00:01.000Z",
            lastLoadFailedAt: null,
            operatingStatus: "ready",
            operatingSummary: "Station read 작업 준비가 확인되었습니다.",
            rawSignals: {
              pageState: "loaded",
              currentUrl: "https://admin.admin-stationbyuhc.com/",
              currentPath: "/",
              currentHost: "admin.admin-stationbyuhc.com",
              title: "STATION by UHC",
              cookieCount: 0,
              providerCookieCount: 0,
              lastError: null,
              lastLoadedAt: "2026-03-19T00:00:00.000Z",
              lastLoadStartedAt: "2026-03-19T00:00:00.000Z",
              lastLoadFinishedAt: "2026-03-19T00:00:01.000Z",
              lastLoadFailedAt: null
            },
            operatingEvidence: {
              provider: "admin-station",
              derivedStatus: "ready",
              rawSignals: {
                pageState: "loaded",
                currentUrl: "https://admin.admin-stationbyuhc.com/",
                currentPath: "/",
                currentHost: "admin.admin-stationbyuhc.com",
                title: "STATION by UHC",
                cookieCount: 0,
                providerCookieCount: 0,
                lastError: null,
                lastLoadedAt: "2026-03-19T00:00:00.000Z",
                lastLoadStartedAt: "2026-03-19T00:00:00.000Z",
                lastLoadFinishedAt: "2026-03-19T00:00:01.000Z",
                lastLoadFailedAt: null
              },
              sourceError: null,
              reasons: ["host-matched"]
            }
          },
          {
            provider: "admin-station",
            sessionAvailable: false,
            source: "unconfigured",
            sessionSignals: ["admin-station-token:missing"]
          }
        );

        const naverReady = applyProviderSourceAccessToOperatingSnapshot(
          {
            provider: "naver-partner",
            owner: "electron-main",
            partition: "persist:naver",
            label: "Naver",
            startUrl: "https://partner.booking.naver.com/",
            windowState: "hidden",
            pageState: "loaded",
            currentUrl: "https://new.smartplace.naver.com/",
            currentPath: "/",
            currentHost: "new.smartplace.naver.com",
            title: "네이버 스마트플레이스",
            cookieCount: 7,
            providerCookieCount: 7,
            lastError: null,
            storageSnapshotReadState: "ok",
            storageSnapshotError: null,
            lastLoadedAt: "2026-03-19T00:00:00.000Z",
            lastLoadStartedAt: "2026-03-19T00:00:00.000Z",
            lastLoadFinishedAt: "2026-03-19T00:00:01.000Z",
            lastLoadFailedAt: null,
            operatingStatus: "ready",
            operatingSummary: "네이버 파트너 read 작업 준비가 확인되었습니다.",
            rawSignals: {
              pageState: "loaded",
              currentUrl: "https://new.smartplace.naver.com/",
              currentPath: "/",
              currentHost: "new.smartplace.naver.com",
              title: "네이버 스마트플레이스",
              cookieCount: 7,
              providerCookieCount: 7,
              lastError: null,
              lastLoadedAt: "2026-03-19T00:00:00.000Z",
              lastLoadStartedAt: "2026-03-19T00:00:00.000Z",
              lastLoadFinishedAt: "2026-03-19T00:00:01.000Z",
              lastLoadFailedAt: null
            },
            operatingEvidence: {
              provider: "naver-partner",
              derivedStatus: "ready",
              rawSignals: {
                pageState: "loaded",
                currentUrl: "https://new.smartplace.naver.com/",
                currentPath: "/",
                currentHost: "new.smartplace.naver.com",
                title: "네이버 스마트플레이스",
                cookieCount: 7,
                providerCookieCount: 7,
                lastError: null,
                lastLoadedAt: "2026-03-19T00:00:00.000Z",
                lastLoadStartedAt: "2026-03-19T00:00:00.000Z",
                lastLoadFinishedAt: "2026-03-19T00:00:01.000Z",
                lastLoadFailedAt: null
              },
              sourceError: null,
              reasons: ["host-matched", "surface-recognized"]
            }
          },
          {
            provider: "naver-partner",
            sessionAvailable: true,
            source: "app-provider-browser",
            sessionSignals: []
          }
        );

        return { stationBlocked, naverReady };
      });
    `
  );

  const result = await run(modulePath);
  assert.equal(result.stationBlocked.operatingStatus, "needs-login");
  assert.match(result.stationBlocked.operatingSummary, /세션|토큰/);
  assert.ok(result.stationBlocked.operatingEvidence.reasons.includes("admin-station-token:missing"));
  assert.equal(result.stationBlocked.operatingEvidence.derivedStatus, "needs-login");
  assert.equal(result.naverReady.operatingStatus, "ready");
  assert.equal(result.naverReady.operatingEvidence.derivedStatus, "ready");

  console.log("regression_app_v2_provider_source_access: OK");
}

await main();
