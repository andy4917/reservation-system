import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

function loadScript(filePath, context) {
  const code = fs.readFileSync(filePath, "utf8");
  vm.runInContext(code, context, { filename: filePath });
}

async function main() {
  const root = process.cwd();
  const context = vm.createContext({
    globalThis: {},
    InventoryEntryPolicy: {
      normalizeText(value) {
        return String(value ?? "").trim();
      },
      detectProviderTypeFromHost(host) {
        return String(host).includes("partner.booking.naver.com") ? "naver-partner" : "";
      }
    }
  });
  context.globalThis = context;
  context.globalThis.InventoryEntryPolicy = context.InventoryEntryPolicy;

  loadScript(path.join(root, "src/bridge/authBridge.js"), context);
  loadScript(path.join(root, "src/bridge/infoBridge.js"), context);

  const authBridge = context.globalThis.InventoryAuthBridge;
  const infoBridge = context.globalThis.InventoryInfoBridge;

  assert.ok(authBridge);
  assert.ok(infoBridge);

  const summary = authBridge.summarizeAuthState(
    [
      { name: "SID", value: "1", domain: ".naver.com", path: "/", secure: true, url: "https://naver.com/" },
      { name: "SID", value: "1", domain: ".naver.com", path: "/", secure: true, url: "https://naver.com/" }
    ],
    { csrfToken: "csrf-token" }
  );
  assert.equal(summary.cookieCount, 1);
  assert.equal(summary.hasCsrf, true);

  const detected = infoBridge.detectContext("partner.booking.naver.com", "https://partner.booking.naver.com/x", "Inventory");
  assert.equal(detected.providerType, "naver-partner");

  const rowSummary = infoBridge.summarizeRows([{ date: "2026-03-12", channel: "NAVER" }]);
  assert.equal(rowSummary.count, 1);
  assert.equal(rowSummary.channels[0], "NAVER");

  console.log("regression_extension_auth_info_modules: OK");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
