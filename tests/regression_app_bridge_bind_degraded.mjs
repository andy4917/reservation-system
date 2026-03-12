import assert from "node:assert/strict";
import path from "node:path";

async function main() {
  const root = process.cwd();
  process.env.UHS_BRIDGE_SHARED_SECRET = "bind-test-secret";
  const bridgeServer = await import(path.join(root, "dist-app/main/bridgeServer.js"));

  bridgeServer.__resetBridgeStateForTests();
  const first = await bridgeServer.startBridgeServer(45126);

  try {
    assert.equal(first.connected, true);

    const secondModule = await import(`${path.join(root, "dist-app/main/bridgeServer.js")}?bind=${Date.now()}`);
    secondModule.__resetBridgeStateForTests();
    const degraded = await secondModule.startBridgeServer(45126);

    try {
      assert.equal(degraded.connected, false);
      assert.equal(degraded.capability, "degraded");
      assert.equal(degraded.code, "BRIDGE_PORT_BIND_FAILED");
    } finally {
      await secondModule.stopBridgeServer().catch(() => {});
      secondModule.__resetBridgeStateForTests();
    }

    console.log("regression_app_bridge_bind_degraded: OK");
  } finally {
    await bridgeServer.stopBridgeServer();
    bridgeServer.__resetBridgeStateForTests();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
