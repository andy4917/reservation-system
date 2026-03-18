import { getBridgeContext, getBridgeMeta, getBridgeRuntime, getBridgeSummary, pingDesktopRuntime } from "../../services/bridgeClient";
import { resolveBridgeIssue } from "../../services/bridgeStatus";
import { buildJobStatusCards } from "../../services/jobRunner";
import { getProviderCapabilityCards } from "../../services/providerRegistry";
import { loadAuthBundleSettingsSnapshot, saveAuthBundleSettingsSnapshot } from "../../services/settingsStorage";
import { useUiStore } from "./uiStore";

export async function bootstrapUiState() {
  try {
    const persistedSettings = loadAuthBundleSettingsSnapshot();
    if (persistedSettings) {
      useUiStore.setState({
        authBundleSettingsSnapshot: persistedSettings
      });
    }

    const [runtime, context, bridgeMeta, bridgeRuntime, bridgeSummary] = await Promise.all([
      pingDesktopRuntime().catch(() => null),
      getBridgeContext().catch(() => null),
      getBridgeMeta().catch(() => null),
      getBridgeRuntime().catch(() => null),
      getBridgeSummary().catch(() => null)
    ]);

    if (runtime) {
      useUiStore.setState((state) => ({
        bridgeStatus: {
          ...state.bridgeStatus,
          connected: runtime.connected,
          capability: bridgeRuntime?.capability || state.bridgeStatus.capability,
          authConfigured: bridgeRuntime?.authConfigured ?? state.bridgeStatus.authConfigured,
          code: bridgeRuntime?.code || state.bridgeStatus.code,
          recoveryAction: bridgeRuntime?.recoveryAction || state.bridgeStatus.recoveryAction,
          message: runtime.connected ? "브라우저가 연결되었습니다." : state.bridgeStatus.message
        }
      }));
    }

    if (context) {
      const hasUpstreamAuth = Boolean(bridgeSummary?.authSummary?.cookieCount || bridgeSummary?.authSummary?.hasBearer);
      const bridgeIssue = resolveBridgeIssue({
        runtimeMode: "live",
        supportLevel: context.sessionAvailable ? "partial-live" : "offline-preview",
        provider: context.provider,
        sessionAvailable: context.sessionAvailable,
        hasUpstreamAuth,
        bridgeRuntimeCode: bridgeRuntime?.code || null,
        bridgeRuntimeRecoveryAction: bridgeRuntime?.recoveryAction || null,
        fallbackRecoveryAction: useUiStore.getState().bridgeStatus.recoveryAction
      });
      const nextSettingsSnapshot =
        context.provider && (bridgeSummary?.authSummary || bridgeSummary?.infoSummary)
          ? {
              provider: context.provider,
              host: context.host || "",
              updatedAt: new Date().toISOString(),
              bridgeSummary: {
                authSummary: bridgeSummary?.authSummary || null,
                infoSummary: bridgeSummary?.infoSummary || null,
                preview: bridgeSummary?.preview || null
              }
            }
          : persistedSettings;
      if (nextSettingsSnapshot) {
        saveAuthBundleSettingsSnapshot(nextSettingsSnapshot);
      }

      useUiStore.setState((state) => ({
        bridgeStatus: {
          ...state.bridgeStatus,
          sessionAvailable: context.sessionAvailable,
          connected: bridgeRuntime?.connected ?? state.bridgeStatus.connected,
          capability: bridgeRuntime?.capability || state.bridgeStatus.capability,
          activeHost: context.host || state.bridgeStatus.activeHost,
          provider: context.provider || state.bridgeStatus.provider,
          message: context.sessionAvailable ? "브라우저가 연결되었습니다." : "브라우저가 연결되지 않았습니다.",
          code: bridgeIssue.code,
            recoveryAction: bridgeIssue.recoveryAction,
            authConfigured: bridgeRuntime?.authConfigured ?? state.bridgeStatus.authConfigured,
            writeEnabled:
              Boolean(context.sessionAvailable && hasUpstreamAuth)
        },
        logs: state.logs,
        bridgeSummary: {
          authSummary: bridgeSummary?.authSummary || null,
          infoSummary: bridgeSummary?.infoSummary || null,
          preview: bridgeSummary?.preview || null
        },
        authBundleSettingsSnapshot: nextSettingsSnapshot || state.authBundleSettingsSnapshot,
        providerCards: getProviderCapabilityCards(),
        jobStatusCards: buildJobStatusCards({
          ...state,
          bridgeStatus: {
            ...state.bridgeStatus,
            sessionAvailable: context.sessionAvailable,
            connected: bridgeRuntime?.connected ?? state.bridgeStatus.connected,
            capability: bridgeRuntime?.capability || state.bridgeStatus.capability,
            activeHost: context.host || state.bridgeStatus.activeHost,
            provider: context.provider || state.bridgeStatus.provider,
            message: context.sessionAvailable ? "브라우저가 연결되었습니다." : "브라우저가 연결되지 않았습니다.",
            code: bridgeIssue.code,
            recoveryAction: bridgeIssue.recoveryAction,
            authConfigured: bridgeRuntime?.authConfigured ?? state.bridgeStatus.authConfigured,
            writeEnabled:
              Boolean(context.sessionAvailable && hasUpstreamAuth)
          },
          bridgeSummary: {
            authSummary: bridgeSummary?.authSummary || null,
            infoSummary: bridgeSummary?.infoSummary || null,
            preview: bridgeSummary?.preview || null
          },
          providerCards: state.providerCards,
          jobStatusCards: state.jobStatusCards
        })
      }));
    }
  } catch (error) {
    useUiStore.setState((state) => ({
      logs: [
        ...state.logs,
        `초기 준비 중 일부 항목을 읽지 못했습니다: ${error instanceof Error ? error.message : String(error)}`
      ]
    }));
  }
}
