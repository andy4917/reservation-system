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
  provider?: string | null;
  bridgeRuntimeCode?: BridgeErrorCode | null;
  bridgeRuntimeRecoveryAction?: string | null;
  fallbackRecoveryAction?: string | null;
}): BridgeIssueResolution {
  const {
    runtimeMode,
    supportLevel,
    sessionAvailable,
    hasUpstreamAuth,
    provider = null,
    bridgeRuntimeCode = null,
    bridgeRuntimeRecoveryAction = null,
    fallbackRecoveryAction = null
  } = params;

  if (provider === "wings-pms" && sessionAvailable && hasUpstreamAuth) {
    return {
      code: null,
      recoveryAction: null
    };
  }

  if (bridgeRuntimeCode) {
    return {
      code: bridgeRuntimeCode,
      recoveryAction: bridgeRuntimeRecoveryAction || fallbackRecoveryAction
    };
  }

  if (sessionAvailable && !hasUpstreamAuth) {
    return {
      code: "UPSTREAM_AUTH_EXPIRED",
      recoveryAction: "Re-authenticate the provider session in the extension or open the in-app Wings login window, then capture the current session."
    };
  }

  if (runtimeMode === "live" && supportLevel === "offline-preview") {
    return {
      code: "OFFLINE_PREVIEW_ACTIVE",
      recoveryAction: "Attach the extension session or use the in-app Wings login window, then capture provider authentication before retrying live mode."
    };
  }

  return {
    code: null,
    recoveryAction: bridgeRuntimeRecoveryAction || fallbackRecoveryAction
  };
}
