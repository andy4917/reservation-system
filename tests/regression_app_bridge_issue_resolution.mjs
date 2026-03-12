import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { pathToFileURL } from "node:url";

async function loadBuiltModule(filePath) {
  if (typeof vm.SourceTextModule !== "function") {
    return import(`${pathToFileURL(filePath).href}?t=${Date.now()}`);
  }

  const code = await fs.promises.readFile(filePath, "utf8");
  const context = vm.createContext({ console });
  const mod = new vm.SourceTextModule(code, {
    context,
    identifier: filePath
  });
  await mod.link(() => {
    throw new Error("bridgeStatus build output should not import runtime dependencies");
  });
  await mod.evaluate();
  return mod.namespace;
}

async function main() {
  const root = process.cwd();
  const modulePath = path.join(root, "dist-app/services/bridgeStatus.js");
  const bridgeStatus = await loadBuiltModule(modulePath);

  const bindFailure = bridgeStatus.resolveBridgeIssue({
    runtimeMode: "live",
    supportLevel: "fixture-fallback",
    sessionAvailable: false,
    hasUpstreamAuth: false,
    bridgeRuntimeCode: "BRIDGE_PORT_BIND_FAILED",
    bridgeRuntimeRecoveryAction: "Free the configured port or change UHS_BRIDGE_PORT, then retry the app."
  });
  assert.equal(bindFailure.code, "BRIDGE_PORT_BIND_FAILED");
  assert.match(bindFailure.recoveryAction, /port/i);

  const upstreamExpired = bridgeStatus.resolveBridgeIssue({
    runtimeMode: "live",
    supportLevel: "partial-live",
    sessionAvailable: true,
    hasUpstreamAuth: false,
    bridgeRuntimeCode: null,
    bridgeRuntimeRecoveryAction: null
  });
  assert.equal(upstreamExpired.code, "UPSTREAM_AUTH_EXPIRED");

  const fallback = bridgeStatus.resolveBridgeIssue({
    runtimeMode: "live",
    supportLevel: "fixture-fallback",
    sessionAvailable: false,
    hasUpstreamAuth: false,
    bridgeRuntimeCode: null,
    bridgeRuntimeRecoveryAction: null
  });
  assert.equal(fallback.code, "FIXTURE_FALLBACK_ACTIVE");

  console.log("regression_app_bridge_issue_resolution: OK");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
