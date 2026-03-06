import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

function readManifest(root) {
  return JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
}

function loadProductFlow(root) {
  const source = fs.readFileSync(path.join(root, "src/ui/productFlow.js"), "utf8");
  const sandbox = {
    URL,
    console,
    globalThis: {}
  };
  vm.runInNewContext(source, sandbox, { filename: "productFlow.js" });
  return sandbox.globalThis.App?.ui?.productFlow;
}

function loadBackground(root, manifest) {
  const source = fs.readFileSync(path.join(root, "src/background.js"), "utf8");
  const calls = {
    badgeText: [],
    badgeColor: [],
    titles: [],
    sendMessage: [],
    executeScript: [],
    onClicked: null
  };
  const chrome = {
    runtime: {
      getManifest: () => manifest,
      onMessage: { addListener: () => {} },
      lastError: null
    },
    action: {
      onClicked: {
        addListener: (listener) => {
          calls.onClicked = listener;
        }
      },
      setBadgeText: (payload) => {
        calls.badgeText.push(payload);
      },
      setBadgeBackgroundColor: (payload) => {
        calls.badgeColor.push(payload);
      },
      setTitle: (payload) => {
        calls.titles.push(payload);
      }
    },
    tabs: {
      sendMessage: (tabId, message, callback) => {
        calls.sendMessage.push({ tabId, message });
        const result = sandbox.__sendMessageHandler ? sandbox.__sendMessageHandler(tabId, message) : { response: { ok: true } };
        chrome.runtime.lastError = result?.lastError ? { message: result.lastError } : null;
        callback?.(result?.response);
        chrome.runtime.lastError = null;
      }
    },
    scripting: {
      executeScript: (payload, callback) => {
        calls.executeScript.push(payload);
        const result = sandbox.__executeScriptHandler ? sandbox.__executeScriptHandler(payload) : { ok: true };
        chrome.runtime.lastError = result?.lastError ? { message: result.lastError } : null;
        callback?.();
        chrome.runtime.lastError = null;
      }
    }
  };
  const sandbox = {
    URL,
    console,
    chrome,
    indexedDB: { open: () => ({}) },
    crypto: globalThis.crypto,
    TextEncoder,
    TextDecoder,
    Uint8Array,
    btoa: globalThis.btoa,
    atob: globalThis.atob
  };
  vm.runInNewContext(source, sandbox, { filename: "background.js" });
  return { sandbox, calls };
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

async function main() {
  const root = process.cwd();
  const manifest = readManifest(root);
  const productFlow = loadProductFlow(root);
  assert.ok(productFlow, "productFlow module should load");

  const manifestHosts = extractDirectEntryHostnames(manifest);
  const policyHosts = Object.values(productFlow.ENTRY_HOSTS)
    .flatMap((policy) => policy.hostnames || [])
    .sort();
  assert.deepEqual(policyHosts, manifestHosts, "manifest content-script matches should equal direct entry hosts");
  assert.deepEqual(policyHosts, [
    "admin.admin-stationbyuhc.com",
    "partner.booking.naver.com",
    "pms.sanhait.com"
  ], "direct entry host policy should include Naver, Station, and WINGS only");

  const naverEntry = productFlow.detectEntrySupportByUrl("https://partner.booking.naver.com/booking/management");
  const stationEntry = productFlow.detectEntrySupportByUrl("https://admin.admin-stationbyuhc.com/admin/branch/18/calendar");
  const wingsEntry = productFlow.detectEntrySupportByUrl("https://pms.sanhait.com/pms/biz/test/viewReservation.do");
  const sheetsEntry = productFlow.detectEntrySupportByUrl("https://docs.google.com/spreadsheets/d/example/edit");
  const unsupportedEntry = productFlow.detectEntrySupportByUrl("https://example.com/");
  assert.equal(naverEntry.supported, true, "Naver should be a supported direct entry host");
  assert.equal(stationEntry.providerType, "admin-station", "Station host should map to admin-station");
  assert.equal(wingsEntry.providerType, "wings-pms", "WINGS host should map to wings-pms");
  assert.equal(sheetsEntry.reason, "indirect-integration", "Google Sheets should be treated as an indirect integration");
  assert.equal(sheetsEntry.integrationKey, "sheets", "Google Sheets integration key should be reported");
  assert.equal(unsupportedEntry.reason, "unsupported", "unsupported hosts should be rejected");

  const naverBlocked = productFlow.evaluateProductFlow({
    providerType: "naver-partner",
    providerSessionReady: false
  });
  assert.equal(naverBlocked.workspaceAccess, false, "workspace should stay blocked until the provider session is ready");
  assert.equal(naverBlocked.gate.reason, "provider-session", "session gate should block workspace entry");
  assert.equal(naverBlocked.tasks.NAVER_STATION_SYNC.reason, "provider-session", "tasks should stay blocked before session validation");

  const naverReady = productFlow.evaluateProductFlow({
    providerType: "naver-partner",
    providerSessionReady: true
  });
  assert.equal(naverReady.workspaceAccess, true, "workspace should open after provider session validation");
  assert.equal(naverReady.tasks.NAVER_STATION_SYNC.blocked, false, "inventory task should open on Naver");
  assert.equal(naverReady.tasks.SHEET_MAPPING_REVIEW.reason, "sheets", "sheet task should guard until Sheets integration is ready");
  assert.equal(naverReady.tasks.OTA_PMS_COMPARISON.reason, "wings", "PMS tasks should guard until WINGS integration is ready");

  const wingsReady = productFlow.evaluateProductFlow({
    providerType: "wings-pms",
    providerSessionReady: true,
    sheetConfigured: true,
    sheetAuthReady: true,
    pmsConfigured: true,
    pmsAuthReady: true
  });
  assert.equal(wingsReady.workspaceAccess, true, "WINGS start host should be able to pass the start gate");
  assert.equal(wingsReady.tasks.NAVER_STATION_SYNC.reason, "host-scope", "WINGS start host should guard inventory task by host scope");
  assert.equal(wingsReady.tasks.PMS_RESERVATION_VALIDATION.reason, "host-scope", "WINGS start host should guard PMS task by host scope");

  const directScriptFiles = manifest.content_scripts?.[0]?.js || [];

  const supportedBg = loadBackground(root, manifest);
  let deliveryAttempt = 0;
  supportedBg.sandbox.__sendMessageHandler = (_tabId, message) => {
    deliveryAttempt += 1;
    if (deliveryAttempt === 1 && message.mode === "toggle") {
      return { lastError: "Receiving end does not exist." };
    }
    return { response: { ok: true, open: true } };
  };
  await supportedBg.sandbox.handleActionClick({ id: 101, url: "https://pms.sanhait.com/pms/biz/test/viewReservation.do" });
  assert.equal(supportedBg.calls.executeScript.length, 1, "supported start hosts should inject content scripts when no receiver exists yet");
  assert.equal(supportedBg.calls.sendMessage.length, 2, "supported start hosts should retry panel open after injection");
  assert.deepEqual(
    [...(supportedBg.calls.executeScript[0].files || [])],
    directScriptFiles,
    "background should inject the manifest content-script bundle"
  );
  assert.equal(supportedBg.calls.badgeText.at(-1)?.text, "", "supported start host should clear the action badge");

  const unsupportedBg = loadBackground(root, manifest);
  await unsupportedBg.sandbox.handleActionClick({ id: 202, url: "https://docs.google.com/spreadsheets/d/example/edit" });
  assert.equal(unsupportedBg.calls.executeScript.length, 0, "indirect integrations should not start from the action icon");
  assert.equal(unsupportedBg.calls.sendMessage.length, 0, "unsupported hosts should not receive panel toggle messages");
  assert.equal(unsupportedBg.calls.badgeText.at(-1)?.text, "!", "unsupported hosts should show a guard badge");
  assert.match(unsupportedBg.calls.titles.at(-1)?.title || "", /지원 시작 호스트/, "unsupported host tooltip should explain the start-host guard");

  console.log("regression_product_flow_acceptance: OK");
}

await main();
