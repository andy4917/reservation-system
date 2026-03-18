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
  const originalSecret = process.env.UHS_GOOGLE_CLIENT_SECRET;
  process.env.UHS_GOOGLE_CLIENT_SECRET = "fresh-secret";

  globalThis.App = {};
  globalThis.location = {
    host: "partner.booking.naver.com",
    href: "https://partner.booking.naver.com/",
    pathname: "/",
    hash: ""
  };
  globalThis.InventoryEntryPolicy = {
    detectProviderTypeFromHost(host) {
      if (String(host).includes("partner.booking.naver.com")) return "naver-partner";
      return "";
    }
  };

  let storedPayload = null;
  globalThis.chrome = {
    storage: {
      local: {
        get(_keys, callback) {
          callback({});
        },
        set(payload, callback) {
          storedPayload = payload;
          callback();
        }
      }
    }
  };

  const fetchCalls = [];
  globalThis.fetch = async (_url, init = {}) => {
    const bodyText = String(init.body || "");
    fetchCalls.push(bodyText);
    const params = new URLSearchParams(bodyText);
    const candidateSecret = params.get("client_secret");
    if (candidateSecret === "stale-secret") {
      return {
        ok: false,
        status: 401,
        text: async () => '{"error":"invalid_client","error_description":"Unauthorized"}'
      };
    }
    assert.equal(candidateSecret, "fresh-secret");
    return {
      ok: true,
      status: 200,
      json: async () => ({
        access_token: "fresh-access-token",
        expires_in: 3600
      })
    };
  };

  loadScript(path.join(root, "src/constants.js"));
  globalThis.App.constants.configuredProviderIds = {
    stationBranchId: String(globalThis.App.constants.POLICY_STATION_BRANCH_ID || ""),
    naverBusinessId: String(globalThis.App.constants.POLICY_NAVER_BUSINESS_ID || "")
  };
  loadScript(path.join(root, "src/scan/normalize.js"));

  const normalize = globalThis.App?.scan?.normalize;
  assert.ok(normalize?.refreshGoogleAccessToken, "refreshGoogleAccessToken export is required");

  const syncConfig = {
    spreadsheet: "spreadsheet-123",
    sheetName: "2026",
    startRow: 1,
    year: 2026,
    refreshToken: "refresh-token",
    clientId: "client-id",
    clientSecret: "stale-secret",
    scan: { mode: "auto" }
  };

  const refreshed = await normalize.refreshGoogleAccessToken(syncConfig);
  assert.equal(refreshed, "fresh-access-token");
  assert.equal(syncConfig.clientSecret, "fresh-secret");
  assert.equal(syncConfig.accessToken, "fresh-access-token");
  assert.equal(fetchCalls.length, 2);
  assert.ok(fetchCalls[0].includes("client_secret=stale-secret"));
  assert.ok(fetchCalls[1].includes("client_secret=fresh-secret"));
  assert.ok(storedPayload, "refreshed config should be persisted");

  if (originalSecret === undefined) {
    delete process.env.UHS_GOOGLE_CLIENT_SECRET;
  } else {
    process.env.UHS_GOOGLE_CLIENT_SECRET = originalSecret;
  }

  console.log("regression_google_refresh_secret_fallback: OK");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
