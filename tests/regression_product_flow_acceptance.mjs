import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

function readManifest(root) {
  return JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
}

function loadEntryPolicy(root) {
  const source = fs.readFileSync(path.join(root, "src/shared/entryPolicy.js"), "utf8");
  const sandbox = { URL, console, globalThis: {} };
  vm.runInNewContext(source, sandbox, { filename: "entryPolicy.js" });
  return sandbox.globalThis.InventoryEntryPolicy;
}

function loadBackground(root) {
  const source = fs.readFileSync(path.join(root, "src/background.js"), "utf8");
  const calls = {
    listener: null
  };
  const chrome = {
    runtime: {
      onMessage: {
        addListener(listener) {
          calls.listener = listener;
        }
      }
    }
  };
  const sandbox = {
    console,
    chrome,
    indexedDB: { open: () => ({}) },
    crypto: globalThis.crypto,
    TextEncoder,
    TextDecoder,
    Uint8Array,
    atob: globalThis.atob,
    btoa: globalThis.btoa,
    globalThis: {
      InventoryEntryPolicy: loadEntryPolicy(root)
    }
  };
  sandbox.globalThis.globalThis = sandbox.globalThis;
  vm.runInNewContext(source, sandbox, { filename: "background.js" });
  return calls;
}

function extractDirectEntryHostnames(manifest) {
  return [...new Set((manifest.content_scripts || []).flatMap((item) => item.matches || []))]
    .map((pattern) => {
      const match = String(pattern || "").match(/^https?:\/\/([^/]+)\/\*$/i);
      assert.ok(match, `unsupported match pattern in manifest: ${pattern}`);
      return match[1];
    })
    .sort();
}

async function getBridgeContext(listener, url) {
  return await new Promise((resolve) => {
    let keepAlive = false;
    keepAlive = listener(
      { type: "inventory.bridge.getContext" },
      { tab: { id: 7, url } },
      (response) => resolve({ keepAlive, response })
    );
    if (!keepAlive) return;
  });
}

async function main() {
  const root = process.cwd();
  const manifest = readManifest(root);
  const entryPolicy = loadEntryPolicy(root);
  const background = loadBackground(root);

  assert.ok(entryPolicy, "entry policy should load");
  assert.equal(typeof entryPolicy.detectEntrySupportByUrl, "function");
  assert.equal(typeof background.listener, "function", "background message listener should register");

  const manifestHosts = extractDirectEntryHostnames(manifest);
  const policyHosts = Object.values(entryPolicy.ENTRY_HOSTS)
    .flatMap((policy) => policy.hostnames || [])
    .sort();
  assert.deepEqual(policyHosts, manifestHosts, "manifest matches should equal direct entry host policy");
  assert.deepEqual(policyHosts, [
    "admin.admin-stationbyuhc.com",
    "partner.booking.naver.com",
    "pms.sanhait.com"
  ]);

  const naverEntry = entryPolicy.detectEntrySupportByUrl("https://partner.booking.naver.com/booking/management");
  const stationEntry = entryPolicy.detectEntrySupportByUrl("https://admin.admin-stationbyuhc.com/admin/branch/18/calendar");
  const wingsEntry = entryPolicy.detectEntrySupportByUrl("https://pms.sanhait.com/pms/biz/test/viewReservation.do");
  const sheetsEntry = entryPolicy.detectEntrySupportByUrl("https://docs.google.com/spreadsheets/d/example/edit");
  const unsupportedEntry = entryPolicy.detectEntrySupportByUrl("https://example.com/");

  assert.equal(naverEntry.supported, true);
  assert.equal(stationEntry.providerType, "admin-station");
  assert.equal(wingsEntry.providerType, "wings-pms");
  assert.equal(sheetsEntry.reason, "indirect-integration");
  assert.equal(sheetsEntry.integrationKey, "sheets");
  assert.equal(unsupportedEntry.reason, "unsupported");

  const supportedContext = await getBridgeContext(background.listener, "https://pms.sanhait.com/pms/biz/test/viewReservation.do");
  assert.equal(supportedContext.response.ok, true);
  assert.equal(supportedContext.response.context.entrySupport.providerType, "wings-pms");
  assert.equal(supportedContext.response.context.entrySupport.supported, true);

  const indirectContext = await getBridgeContext(background.listener, "https://docs.google.com/spreadsheets/d/example/edit");
  assert.equal(indirectContext.response.context.entrySupport.reason, "indirect-integration");
  assert.equal(indirectContext.response.context.entrySupport.integrationKey, "sheets");

  console.log("regression_product_flow_acceptance: OK");
}

await main();
