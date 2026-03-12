import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

async function main() {
  const root = process.cwd();
  const modulePath = path.join(root, "dist-app/main/wingsSessionPayload.js");
  const payloadModule = await import(`${pathToFileURL(modulePath).href}?t=${Date.now()}`);

  const payload = payloadModule.buildWingsAppBridgePayload({
    url: "https://pms.sanhait.com/pms/biz/ir04_0100X/searchListGlobalRsvn_v03.do",
    title: "Wings Dashboard",
    cookies: [
      {
        name: "JSESSIONID",
        value: "abc123",
        domain: "pms.sanhait.com",
        path: "/",
        secure: true,
        httpOnly: true,
        sameSite: "lax",
        session: true
      },
      {
        name: "csrfToken",
        value: "csrf-1",
        domain: "pms.sanhait.com",
        path: "/",
        secure: true,
        httpOnly: false,
        sameSite: "lax",
        session: true
      }
    ],
    hints: {
      role: "ADMIN"
    }
  });

  assert.equal(payload.provider, "wings-pms");
  assert.equal(payload.authSummary.cookieCount, 2);
  assert.equal(payload.authSummary.hasCsrf, true);
  assert.equal(payload.authSummary.hasRole, true);
  assert.equal(payload.authBundle.material.cookieHeader.includes("JSESSIONID=abc123"), true);
  assert.equal(payload.authBundle.material.csrfToken, "csrf-1");
  assert.equal(payload.authBundle.material.role, "ADMIN");

  console.log("regression_app_wings_session_payload: OK");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
