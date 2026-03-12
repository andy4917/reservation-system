import assert from "node:assert/strict";
import path from "node:path";

async function main() {
  const root = process.cwd();
  const bridgeServer = await import(path.join(root, "dist-app/main/bridgeServer.js"));

  bridgeServer.__resetBridgeStateForTests();
  bridgeServer.upsertLocalBridgePayload({
    provider: "wings-pms",
    host: "pms.sanhait.com",
    url: "https://pms.sanhait.com/",
    title: "Wings",
    rows: [],
    authSummary: {
      cookieCount: 1,
      domains: ["pms.sanhait.com"],
      hasBearer: false,
      hasCsrf: true,
      hasRole: true
    },
    infoSummary: {
      count: 0,
      channels: [],
      dates: []
    },
    authBundle: {
      provider: "wings-pms",
      capturedAt: "2026-03-13T00:00:00.000Z",
      sourceHost: "pms.sanhait.com",
      sourceUrls: ["https://pms.sanhait.com/"],
      cookies: [{ name: "JSESSIONID", value: "abc", domain: "pms.sanhait.com", path: "/" }],
      material: {
        cookieHeader: "JSESSIONID=abc",
        csrfToken: "csrf"
      }
    },
    bodyTextSample: "",
    updatedAt: "2026-03-13T00:00:00.000Z"
  });

  const context = bridgeServer.getLatestBridgeContext("wings-pms");
  const summary = bridgeServer.getLatestBridgeSummary("wings-pms");
  const bundle = bridgeServer.getLatestBridgeAuthBundle("wings-pms");

  assert.equal(context.sessionAvailable, true);
  assert.equal(context.host, "pms.sanhait.com");
  assert.equal(summary.authSummary.cookieCount, 1);
  assert.equal(bundle.material.cookieHeader, "JSESSIONID=abc");

  console.log("regression_app_local_bridge_payload: OK");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
