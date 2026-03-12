import type { BridgeErrorCode } from "../contracts";
import type { LiveSupportLevel, RuntimeMode } from "../contracts";

export interface BridgeIssueResolution {
  code: BridgeErrorCode | null;
  recoveryAction: string | null;
}

export function resolveBridgeIssue(params: {
  runtimeMode: RuntimeMode;
  supportLevel: LiveSupportLevel;
  sessionAvailable: boolean;
  hasUpstreamAuth: boolean;
  bridgeRuntimeCode?: BridgeErrorCode | null;
  bridgeRuntimeRecoveryAction?: string | null;
  fallbackRecoveryAction?: string | null;
}): BridgeIssueResolution {
  const {
    runtimeMode,
    supportLevel,
    sessionAvailable,
    hasUpstreamAuth,
    bridgeRuntimeCode = null,
    bridgeRuntimeRecoveryAction = null,
    fallbackRecoveryAction = null
  } = params;

  if (bridgeRuntimeCode) {
    return {
      code: bridgeRuntimeCode,
      recoveryAction: bridgeRuntimeRecoveryAction || fallbackRecoveryAction
    };
  }

  if (sessionAvailable && !hasUpstreamAuth) {
    return {
      code: "UPSTREAM_AUTH_EXPIRED",
      recoveryAction: "Re-authenticate the provider session in the extension. Read-only review can continue."
    };
  }

  if (runtimeMode === "live" && supportLevel === "fixture-fallback") {
    return {
      code: "FIXTURE_FALLBACK_ACTIVE",
      recoveryAction: "Attach the extension session and verify bridge authentication before retrying live mode."
    };
  }

  return {
    code: null,
    recoveryAction: bridgeRuntimeRecoveryAction || fallbackRecoveryAction
  };
}
