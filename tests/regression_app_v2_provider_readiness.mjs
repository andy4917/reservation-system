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

  const modulePath = path.join(root, "dist-app", "app_v2", "main", "providerOperatingAdapter.js");
  const run = new Function(
    "modulePath",
    `
      return import(modulePath).then(({ evaluateProviderOperatingState }) => {
        return {
          wingsLogin: evaluateProviderOperatingState({
            provider: "wings-pms",
            owner: "electron-main",
            partition: "persist:wings",
            label: "Wings",
            startUrl: "https://pms.sanhait.com/",
            windowState: "hidden",
            pageState: "loaded",
            currentUrl: "https://pms.sanhait.com/",
            currentHost: "pms.sanhait.com",
            title: "Wings Workspace",
            lastLoadedAt: "2026-03-19T00:00:00.000Z",
            lastError: null,
            cookieCount: 2,
            providerCookieCount: 0
          }).operatingStatus,
          wingsReady: evaluateProviderOperatingState({
            provider: "wings-pms",
            owner: "electron-main",
            partition: "persist:wings",
            label: "Wings",
            startUrl: "https://pms.sanhait.com/",
            windowState: "hidden",
            pageState: "loaded",
            currentUrl: "https://pms.sanhait.com/",
            currentHost: "pms.sanhait.com",
            title: "Wings Workspace",
            lastLoadedAt: "2026-03-19T00:00:00.000Z",
            lastError: null,
            cookieCount: 5,
            providerCookieCount: 2
          }).operatingStatus,
          wingsReadySignal: evaluateProviderOperatingState({
            provider: "wings-pms",
            owner: "electron-main",
            partition: "persist:wings",
            label: "Wings",
            startUrl: "https://pms.sanhait.com/",
            windowState: "hidden",
            pageState: "loaded",
            currentUrl: "https://pms.sanhait.com/",
            currentHost: "pms.sanhait.com",
            title: "Wings Workspace",
            lastLoadedAt: "2026-03-19T00:00:00.000Z",
            lastError: null,
            cookieCount: 5,
            providerCookieCount: 2
          }),
          naverLoading: evaluateProviderOperatingState({
            provider: "naver-partner",
            owner: "electron-main",
            partition: "persist:naver",
            label: "Naver",
            startUrl: "https://partner.booking.naver.com/",
            windowState: "hidden",
            pageState: "loading",
            currentUrl: "https://partner.booking.naver.com/",
            currentHost: "partner.booking.naver.com",
            title: "네이버 예약",
            lastLoadedAt: null,
            lastError: null,
            cookieCount: 0
          }).operatingStatus,
          naverLogin: evaluateProviderOperatingState({
            provider: "naver-partner",
            owner: "electron-main",
            partition: "persist:naver",
            label: "Naver",
            startUrl: "https://partner.booking.naver.com/",
            windowState: "hidden",
            pageState: "loaded",
            currentUrl: "https://partner.booking.naver.com/login",
            currentHost: "partner.booking.naver.com",
            title: "로그인",
            lastLoadedAt: "2026-03-19T00:00:00.000Z",
            lastError: null,
            cookieCount: 0
          }).operatingStatus,
          naverReady: evaluateProviderOperatingState({
            provider: "naver-partner",
            owner: "electron-main",
            partition: "persist:naver",
            label: "Naver",
            startUrl: "https://partner.booking.naver.com/",
            windowState: "hidden",
            pageState: "loaded",
            currentUrl: "https://new.smartplace.naver.com/",
            currentHost: "new.smartplace.naver.com",
            title: "네이버 스마트플레이스",
            lastLoadedAt: "2026-03-19T00:00:00.000Z",
            lastError: null,
            cookieCount: 2
          }).operatingStatus,
          naverInvalidHostAttention: evaluateProviderOperatingState({
            provider: "naver-partner",
            owner: "electron-main",
            partition: "persist:naver",
            label: "Naver",
            startUrl: "https://partner.booking.naver.com/",
            windowState: "hidden",
            pageState: "loaded",
            currentUrl: "https://partner.booking.naver.com/partner",
            currentHost: "malicious.example.com",
            title: "Naver Partner",
            lastLoadedAt: "2026-03-19T00:00:00.000Z",
            lastError: null,
            cookieCount: 2
          }),
          stationReady: evaluateProviderOperatingState({
            provider: "admin-station",
            owner: "electron-main",
            partition: "persist:station",
            label: "Station",
            startUrl: "https://admin.admin-stationbyuhc.com/",
            windowState: "hidden",
            pageState: "loaded",
            currentUrl: "https://admin.admin-stationbyuhc.com/",
            currentHost: "admin.admin-stationbyuhc.com",
            title: "STATION by UHC",
            lastLoadedAt: "2026-03-19T00:00:00.000Z",
            lastError: null,
            cookieCount: 0
          }).operatingStatus,
          stationLogin: evaluateProviderOperatingState({
            provider: "admin-station",
            owner: "electron-main",
            partition: "persist:station",
            label: "Station",
            startUrl: "https://admin.admin-stationbyuhc.com/",
            windowState: "hidden",
            pageState: "loaded",
            currentUrl: "https://admin.admin-stationbyuhc.com/auth/login",
            currentHost: "admin.admin-stationbyuhc.com",
            title: "로그인",
            lastLoadedAt: "2026-03-19T00:00:00.000Z",
            lastError: null,
            cookieCount: 0
          }).operatingStatus,
          stationError: evaluateProviderOperatingState({
            provider: "admin-station",
            owner: "electron-main",
            partition: "persist:station",
            label: "Station",
            startUrl: "https://admin.admin-stationbyuhc.com/",
            windowState: "hidden",
            pageState: "error",
            currentUrl: "https://admin.admin-stationbyuhc.com/",
            currentHost: "admin.admin-stationbyuhc.com",
            title: "STATION by UHC",
            lastLoadedAt: null,
            lastError: "navigation-failed",
            cookieCount: 0
          })
        };
      });
    `
  );

  const result = await run(modulePath);
  assert.equal(result.wingsLogin, "needs-login");
  assert.equal(result.wingsReady, "ready");
  assert.equal(result.wingsReadySignal.operatingStatus, "ready");
  assert.equal(result.wingsReadySignal.rawSignals.currentUrl, "https://pms.sanhait.com/");
  assert.equal(result.wingsReadySignal.rawSignals.cookieCount, 5);
  assert.equal(result.wingsReadySignal.rawSignals.providerCookieCount, 2);
  assert.equal(result.wingsReadySignal.rawSignals.pageState, "loaded");
  assert.equal(result.wingsReadySignal.operatingEvidence.provider, "wings-pms");
  assert.equal(result.wingsReadySignal.operatingEvidence.derivedStatus, "ready");
  assert.equal(result.naverLoading, "attention");
  assert.equal(result.naverLogin, "needs-login");
  assert.equal(result.naverReady, "ready");
  assert.equal(result.stationReady, "ready");
  assert.equal(result.stationLogin, "needs-login");
  assert.equal(result.stationError.operatingStatus, "error");
  assert.equal(result.naverInvalidHostAttention.operatingStatus, "error");
  assert.equal(result.naverInvalidHostAttention.operatingEvidence.provider, "naver-partner");
  assert.equal(result.naverInvalidHostAttention.operatingEvidence.rawSignals.currentHost, "malicious.example.com");
  assert.equal(result.stationError.rawSignals.currentUrl, "https://admin.admin-stationbyuhc.com/");
  assert.equal(result.stationError.operatingEvidence.sourceError, "navigation-failed");

  console.log("regression_app_v2_provider_readiness: OK");
}

await main();
