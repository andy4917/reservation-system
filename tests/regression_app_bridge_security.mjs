import assert from "node:assert/strict";
import path from "node:path";

async function main() {
  const root = process.cwd();
  process.env.UHS_BRIDGE_SHARED_SECRET = "security-test-secret";
  process.env.UHS_BRIDGE_MAX_BODY_BYTES = "256";
  process.env.UHS_BRIDGE_RATE_LIMIT_MAX_REQUESTS = "5";
  process.env.UHS_BRIDGE_RATE_LIMIT_WINDOW_MS = "1000";
  const bridgeServer = await import(path.join(root, "dist-app/main/bridgeServer.js"));

  bridgeServer.__resetBridgeStateForTests();
  const runtime = await bridgeServer.startBridgeServer(45125);

  try {
    assert.equal(runtime.connected, true);

    const noSecret = await fetch(`http://127.0.0.1:${runtime.port}/bridge/update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    const noSecretJson = await noSecret.json();
    assert.equal(noSecret.status, 401);
    assert.equal(noSecretJson.failure.code, "BRIDGE_AUTH_INVALID");

    const malformed = await fetch(`http://127.0.0.1:${runtime.port}/bridge/update`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-UHS-Bridge-Secret": "security-test-secret"
      },
      body: "{bad json"
    });
    const malformedJson = await malformed.json();
    assert.equal(malformed.status, 400);
    assert.equal(malformedJson.failure.code, "BRIDGE_SCHEMA_INVALID");

    const oversized = await fetch(`http://127.0.0.1:${runtime.port}/bridge/update`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-UHS-Bridge-Secret": "security-test-secret"
      },
      body: JSON.stringify({
        provider: "naver-partner",
        rows: [],
        host: "x".repeat(600)
      })
    });
    const oversizedJson = await oversized.json();
    assert.equal(oversized.status, 413);
    assert.equal(oversizedJson.failure.code, "BRIDGE_PAYLOAD_TOO_LARGE");

    const limitedRequests = await Promise.all(
      Array.from({ length: 6 }, () =>
        fetch(`http://127.0.0.1:${runtime.port}/bridge/state`, {
          headers: { "X-UHS-Bridge-Secret": "security-test-secret" }
        })
      )
    );
    const limitedJson = await limitedRequests[5].json();
    assert.equal(limitedRequests[5].status, 429);
    assert.equal(limitedJson.failure.code, "BRIDGE_RATE_LIMITED");

    console.log("regression_app_bridge_security: OK");
  } finally {
    await bridgeServer.stopBridgeServer();
    bridgeServer.__resetBridgeStateForTests();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
