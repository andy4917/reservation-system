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

  const modulePath = path.join(root, "dist-app", "app_v2", "main", "providerOperatingWaiter.js");
  const run = new Function(
    "modulePath",
    `
      return import(modulePath).then(async ({ waitForProviderReadyOrSettledState }) => {
        let readyReads = 0;
        const readySnapshot = await waitForProviderReadyOrSettledState(async () => {
          readyReads += 1;
          return readyReads < 3
            ? {
                provider: "naver-partner",
                owner: "electron-main",
                partition: "persist:naver",
                label: "Naver",
                startUrl: "https://partner.booking.naver.com/",
                windowState: "hidden",
                pageState: "loading",
                currentUrl: "https://partner.booking.naver.com/",
                currentPath: "/",
                currentHost: "partner.booking.naver.com",
                title: "네이버 예약",
                cookieCount: 2,
                providerCookieCount: 2,
                lastError: null,
                storageSnapshotReadState: "not-read",
                storageSnapshotError: null,
                lastLoadedAt: null,
                lastLoadStartedAt: "2026-03-19T00:00:00.000Z",
                lastLoadFinishedAt: null,
                lastLoadFailedAt: null
              }
            : {
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
                cookieCount: 2,
                providerCookieCount: 2,
                lastError: null,
                storageSnapshotReadState: "not-read",
                storageSnapshotError: null,
                lastLoadedAt: "2026-03-19T00:00:01.000Z",
                lastLoadStartedAt: "2026-03-19T00:00:00.000Z",
                lastLoadFinishedAt: "2026-03-19T00:00:01.000Z",
                lastLoadFailedAt: null
              };
        }, 1200);

        const timeoutSnapshot = await waitForProviderReadyOrSettledState(async () => ({
          provider: "wings-pms",
          owner: "electron-main",
          partition: "persist:wings",
          label: "Wings",
          startUrl: "https://pms.sanhait.com/",
          windowState: "hidden",
          pageState: "loading",
          currentUrl: "https://pms.sanhait.com/",
          currentPath: "/",
          currentHost: "pms.sanhait.com",
          title: "Wings Workspace",
          cookieCount: 2,
          providerCookieCount: 2,
          lastError: null,
          storageSnapshotReadState: "not-read",
          storageSnapshotError: null,
          lastLoadedAt: null,
          lastLoadStartedAt: "2026-03-19T00:00:00.000Z",
          lastLoadFinishedAt: null,
          lastLoadFailedAt: null
        }), 350);

        return { readySnapshot, readyReads, timeoutSnapshot };
      });
    `
  );

  const result = await run(modulePath);
  assert.equal(result.readySnapshot.operatingStatus, "ready");
  assert.ok(result.readyReads >= 3);
  assert.equal(result.timeoutSnapshot.operatingStatus, "attention");
  assert.equal(result.timeoutSnapshot.operatingEvidence.reasons[0], "page-state:loading");

  console.log("regression_app_v2_provider_operating_waiter: OK");
}

await main();
