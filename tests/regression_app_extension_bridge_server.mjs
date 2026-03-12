import assert from "node:assert/strict";
import path from "node:path";

async function main() {
  const root = process.cwd();
  process.env.UHS_BRIDGE_SHARED_SECRET = "test-bridge-secret";
  const bridgeServer = await import(path.join(root, "dist-app/main/bridgeServer.js"));

  bridgeServer.__resetBridgeStateForTests();
  const runtime = await bridgeServer.startBridgeServer(45124);
  const { port } = runtime;

  try {
    const response = await fetch(`http://127.0.0.1:${port}/bridge/update`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-UHS-Bridge-Secret": "test-bridge-secret"
      },
      body: JSON.stringify({
        provider: "naver-partner",
        host: "partner.booking.naver.com",
        url: "https://partner.booking.naver.com/inventory",
        title: "Inventory",
        updatedAt: "2026-03-10T08:30:00.000Z",
        rows: [
          {
            date: "2026-03-12",
            roomType: "Urban",
            channel: "NAVER",
            siteRaw: "4/6",
            sheetRaw: "6/6",
            status: "mismatch"
          }
        ]
      })
    });
    assert.equal(response.ok, true);
    assert.equal(runtime.capability, "ready");

    const context = bridgeServer.getLatestBridgeContext();
    assert.equal(context.sessionAvailable, true);
    assert.equal(context.provider, "naver-partner");
    assert.equal(context.host, "partner.booking.naver.com");

    const rows = bridgeServer.getProviderRowsFromBridge("naver-partner", {
      startDate: "2026-03-11",
      endDate: "2026-03-13"
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].roomType, "Urban");

    console.log("regression_app_extension_bridge_server: OK");
  } finally {
    await bridgeServer.stopBridgeServer();
    bridgeServer.__resetBridgeStateForTests();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
