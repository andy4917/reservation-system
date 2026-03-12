import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

async function main() {
  const root = process.cwd();
  const modulePath = path.join(root, "dist-app/services/bridgeStatus.js");
  const bridgeStatus = await import(`${pathToFileURL(modulePath).href}?t=${Date.now()}`);

  const result = bridgeStatus.resolveBridgeIssue({
    runtimeMode: "live",
    supportLevel: "partial-live",
    provider: "wings-pms",
    sessionAvailable: true,
    hasUpstreamAuth: true,
    bridgeRuntimeCode: "BRIDGE_AUTH_REQUIRED",
    bridgeRuntimeRecoveryAction: "bridge required",
    fallbackRecoveryAction: "fallback"
  });

  assert.equal(result.code, null);
  assert.equal(result.recoveryAction, null);

  console.log("regression_app_bridge_status_wings_session: OK");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
