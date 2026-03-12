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
  const fetchCalls = [];
  const runtimeListeners = [];
  const context = vm.createContext({
    setInterval() {
      return 1;
    },
    clearInterval() {},
    fetch: async (url, init) => {
      fetchCalls.push({ url, init });
      return { ok: true };
    },
    chrome: {
      runtime: {
        sendMessage(_message, callback) {
          callback?.({ summary: null });
        },
        onMessage: {
          addListener(listener) {
            runtimeListeners.push(listener);
          }
        }
      }
    },
    location: {
      host: "partner.booking.naver.com",
      href: "https://partner.booking.naver.com/calendar",
      origin: "https://partner.booking.naver.com",
      protocol: "https:",
      title: "The Seolleung dashboard"
    },
    document: {
      title: "The Seolleung dashboard",
      visibilityState: "visible",
      cookie: "",
      querySelector() {
        return null;
      },
      body: {
        textContent:
          " 2026-03-12 | Urban | 4 / 6 | 예약번호 DEB260122143405604-1623669 | 객실 A301 | The Seolleung \n2026-03-13 Double 2/3 room 1002",
        innerText:
          " 2026-03-12 | Urban | 4 / 6 | 예약번호 DEB260122143405604-1623669 | 객실 A301 | The Seolleung \n2026-03-13 Double 2/3 room 1002"
      },
      addEventListener() {}
    },
    localStorage: {
      length: 0,
      key() {
        return null;
      },
      getItem() {
        return null;
      }
    },
    sessionStorage: {
      length: 0,
      key() {
        return null;
      },
      getItem() {
        return null;
      }
    },
    addEventListener() {},
    Date,
    console,
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
  context.window = context;
  context.globalThis.InventoryEntryPolicy = context.InventoryEntryPolicy;

  loadScript(path.join(root, "src/bridge/infoBridge.js"), context);
  loadScript(path.join(root, "src/bridge/providerAuthCapture.js"), context);
  loadScript(path.join(root, "src/shared/syncPolicy.js"), context);
  loadScript(path.join(root, "src/extensionBridge.entry.js"), context);

  const bridge = context.globalThis.App?.bridge;
  assert.ok(bridge, "App.bridge should be initialized");
  assert.equal(runtimeListeners.length, 1, "bridge runtime listener should register once");

  await bridge.pushBridgeState();

  assert.ok(fetchCalls.length >= 1, "bridge state push should POST payload");
  const payload = JSON.parse(fetchCalls.at(-1).init.body);
  assert.equal(payload.rows.length >= 1, true);

  const firstRow = payload.rows[0];
  assert.equal(firstRow.reservationRef, "DEB260122143405604-1623669");
  assert.equal(firstRow.roomNo, "A301");
  assert.equal(firstRow.branch, "BRANCH_THE_SEOLLEUNG");
  assert.equal(firstRow.rawLine.includes("|"), false);
  assert.equal(firstRow.sourceLineIndex, 0);
  assert.deepEqual(firstRow.candidateBasis, ["date", "ratio", "channel", "reservation_ref", "room_no", "branch"]);
  assert.deepEqual(
    firstRow.signals.map((signal) => signal.kind),
    ["date", "ratio", "channel", "reservation_ref", "room_no", "branch"]
  );
  assert.deepEqual(
    firstRow.tags.map((tag) => tag.kind).sort(),
    ["branch", "channel", "date", "ratio", "reservation_ref", "room_no"]
  );

  console.log("regression_extension_bridge_candidate_tags: OK");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
