import { getBridgeContext, getBridgeMeta, getBridgeRuntime, getBridgeSummary, pingDesktopRuntime } from "../../services/bridgeClient";
import { resolveBridgeIssue } from "../../services/bridgeStatus";
import { buildJobStatusCards } from "../../services/jobRunner";
import { getProviderCapabilityCards } from "../../services/providerRegistry";
import { loadAuthBundleSettingsSnapshot, loadRecommendationSettings, saveAuthBundleSettingsSnapshot } from "../../services/settingsStorage";
import { useUiStore } from "./uiStore";

export async function bootstrapUiState() {
  try {
    const persistedSettings = loadAuthBundleSettingsSnapshot();
    const recommendationSettings = loadRecommendationSettings();
    if (persistedSettings) {
      useUiStore.setState({
        authBundleSettingsSnapshot: persistedSettings,
        recommendationSettings
      });
    } else {
      useUiStore.setState({
        recommendationSettings
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
          message: runtime.connected
            ? `Desktop runtime connected: ${runtime.bridgeVersion}`
            : state.bridgeStatus.message
        },
        logs: [...state.logs, `Desktop runtime ping received: ${runtime.bridgeVersion}`]
      }));
    }

    if (context) {
      const hasUpstreamAuth = Boolean(bridgeSummary?.authSummary?.cookieCount || bridgeSummary?.authSummary?.hasBearer);
      const bridgeIssue = resolveBridgeIssue({
        runtimeMode: "live",
        supportLevel: context.sessionAvailable ? (hasUpstreamAuth ? "partial-live" : "fixture-fallback") : "fixture-fallback",
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
          message: context.sessionAvailable
            ? `Bridge context ready: ${context.provider ?? "unknown"} @ ${context.host ?? "unknown host"}`
            : bridgeRuntime?.message || state.bridgeStatus.message,
          code: bridgeIssue.code,
          recoveryAction: bridgeIssue.recoveryAction,
          authConfigured: bridgeRuntime?.authConfigured ?? state.bridgeStatus.authConfigured,
          writeEnabled:
            Boolean(context.sessionAvailable && hasUpstreamAuth) &&
            bridgeRuntime?.capability !== "degraded"
        },
        logs: [
          ...state.logs,
          bridgeMeta?.port ? `Extension bridge server listening on 127.0.0.1:${bridgeMeta.port}` : null,
          context.sessionAvailable
            ? `Bridge context detected: ${context.provider ?? "unknown"} @ ${context.host ?? "unknown host"}`
            : "Bridge context unavailable. Live mode stays on fixture fallback."
        ].filter((line): line is string => Boolean(line)),
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
            message: context.sessionAvailable
              ? `Bridge context ready: ${context.provider ?? "unknown"} @ ${context.host ?? "unknown host"}`
              : bridgeRuntime?.message || state.bridgeStatus.message,
            code: bridgeIssue.code,
            recoveryAction: bridgeIssue.recoveryAction,
            authConfigured: bridgeRuntime?.authConfigured ?? state.bridgeStatus.authConfigured,
            writeEnabled:
              Boolean(context.sessionAvailable && hasUpstreamAuth) &&
              bridgeRuntime?.capability !== "degraded"
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

    await useUiStore.getState().refreshWorkspaceData();
    await useUiStore.getState().warmRecommendationRuntime();
  } catch (error) {
    useUiStore.setState((state) => ({
      logs: [
        ...state.logs,
        `Bootstrap degraded: ${error instanceof Error ? error.message : String(error)}`
      ]
    }));
    await useUiStore.getState().refreshWorkspaceData();
  }
}
