import { create } from "zustand";
import { uiMockState } from "../../fixtures/uiMockState";
import {
  fetchProviderRows,
  getBridgeContext,
  getBridgeRuntime,
  getRecommendationRuntime,
  getRecommendationRuntimeDiagnostics,
  sampleRecommendationEmbed as sampleRecommendationEmbedBridge,
  warmRecommendationRuntime as warmRecommendationRuntimeBridge
} from "../../services/bridgeClient";
import { getBridgeSummary } from "../../services/bridgeClient";
import { buildInventoryCompareSnapshot, loadInventoryCompareSnapshot } from "../../services/inventoryCompare";
import { buildJobStatusCards } from "../../services/jobRunner";
import { buildProcessModules } from "../../services/processModules";
import { getProviderCapabilityCards } from "../../services/providerRegistry";
import { buildReservationAuditSnapshot, loadReservationAuditSnapshot } from "../../services/reservationAudit";
import { buildRecommendationAssist } from "../../services/recommendationLayer";
import { runWorkspaceSearch } from "../../services/searchEngine";
import {
  normalizeRecommendationSettings,
  saveAuthBundleSettingsSnapshot,
  saveRecommendationSettings
} from "../../services/settingsStorage";
import type { AppTaskId, RightPanelTab, SummaryMetric, WorkspaceMockState } from "../types";
import type { RuntimeMode } from "../../contracts";
import type { RecommendationSettings } from "../../contracts";

function buildTaskMetrics(state: WorkspaceMockState): SummaryMetric[] {
  if (state.activeTask === "reservation-audit") {
    return [
      {
        label: "Audit Anomaly",
        value: String(state.reservationAudit.anomalyCount),
        tone: state.reservationAudit.anomalyCount > 0 ? "critical" : "ok"
      },
      {
        label: "Review Queue",
        value: String(state.reservationAudit.reviewCount),
        tone: state.reservationAudit.reviewCount > 0 ? "warn" : "ok"
      },
      {
        label: "Active Stay",
        value: String(state.reservationAudit.activeCount),
        tone: "default"
      },
      {
        label: "Canceled",
        value: String(state.reservationAudit.canceledCount),
        tone: "default"
      }
    ];
  }

  return [
    {
      label: "Mismatch",
      value: String(state.inventoryCompare.mismatchCount),
      tone: state.inventoryCompare.mismatchCount > 0 ? "critical" : "ok"
    },
    {
      label: "Preview Warn",
      value: String(state.inventoryCompare.warningCount),
      tone: state.inventoryCompare.warningCount > 0 ? "warn" : "ok"
    },
    { label: "Matched", value: String(state.inventoryCompare.matchedCount), tone: "ok" },
    {
      label: "Live Support",
      value:
        state.inventoryCompare.supportLevel === "read-live"
          ? "Read live"
          : state.inventoryCompare.supportLevel === "partial-live"
            ? "Partial"
            : state.inventoryCompare.supportLevel === "fixture-fallback"
              ? "Fallback"
              : "Dry-run",
      tone:
        state.inventoryCompare.supportLevel === "read-live"
          ? "ok"
          : state.inventoryCompare.supportLevel === "partial-live"
            ? "warn"
            : state.inventoryCompare.supportLevel === "fixture-fallback"
              ? "critical"
              : "default"
    }
  ];
}

function projectTaskState(state: WorkspaceMockState) {
  if (state.activeTask === "reservation-audit") {
    return {
      metrics: buildTaskMetrics(state),
      evidenceLines: state.reservationAudit.evidenceLines,
      opsLines: state.reservationAudit.opsLines,
      validationLines: state.reservationAudit.validationLines,
      logs: state.reservationAudit.logs
    };
  }

  return {
    metrics: buildTaskMetrics(state),
    evidenceLines: state.inventoryCompare.evidenceLines,
    opsLines: state.inventoryCompare.opsLines,
    validationLines: state.inventoryCompare.validationLines,
    logs: state.inventoryCompare.logs
  };
}

interface UiStore extends WorkspaceMockState {
  activeRightPanelTab: RightPanelTab;
  setActiveTask: (task: AppTaskId) => void;
  setActiveRightPanelTab: (tab: RightPanelTab) => void;
  setRuntimeMode: (mode: RuntimeMode) => void;
  setSearchQuery: (query: string) => void;
  setRecommendationEnabled: (enabled: boolean) => void;
  updateRecommendationSettings: (patch: Partial<RecommendationSettings>) => void;
  warmRecommendationRuntime: () => Promise<void>;
  runRecommendationSampleEmbed: () => Promise<void>;
  refreshWorkspaceData: () => Promise<void>;
  refreshInventoryCompare: () => Promise<void>;
}

export const useUiStore = create<UiStore>((set, get) => ({
  ...uiMockState,
  activeRightPanelTab: "evidence",
  setActiveTask: (task) =>
    set((state) => {
      const nextState = { ...state, activeTask: task };
      const taskProjection = projectTaskState(nextState);
      return {
        activeTask: task,
        metrics: taskProjection.metrics,
        evidenceLines: taskProjection.evidenceLines,
        opsLines: taskProjection.opsLines,
        validationLines: taskProjection.validationLines,
        logs: taskProjection.logs,
        processModules: buildProcessModules(nextState),
        jobStatusCards: buildJobStatusCards(nextState),
        searchResults: runWorkspaceSearch({ ...nextState, ...taskProjection }, state.searchQuery)
      };
    }),
  setActiveRightPanelTab: (tab) => set({ activeRightPanelTab: tab }),
  setRuntimeMode: (mode) => {
    set({ runtimeMode: mode });
    void get().refreshInventoryCompare();
  },
  setSearchQuery: (query) =>
    set((state) => {
      const nextState = { ...state, searchQuery: query };
      return {
        searchQuery: query,
        searchResults: runWorkspaceSearch(nextState, query)
      };
    }),
  setRecommendationEnabled: (enabled) => {
    set((state) => {
      const recommendationSettings = normalizeRecommendationSettings({
        ...state.recommendationSettings,
        enabled
      });
      saveRecommendationSettings(recommendationSettings);
      return {
        recommendationSettings,
        recommendationSampleEmbedResult: null
      };
    });
    void get().refreshInventoryCompare();
  },
  updateRecommendationSettings: (patch) => {
    set((state) => {
      const recommendationSettings = normalizeRecommendationSettings({
        ...state.recommendationSettings,
        ...patch
      });
      saveRecommendationSettings(recommendationSettings);
      return {
        recommendationSettings,
        recommendationSampleEmbedResult: null
      };
    });
    void get().refreshInventoryCompare();
  },
  warmRecommendationRuntime: async () => {
    const currentState = get();
    const diagnostics = await warmRecommendationRuntimeBridge(currentState.recommendationSettings).catch(() => null);
    set((state) => ({
      recommendationRuntime: diagnostics?.status || state.recommendationRuntime,
      recommendationRuntimeDiagnostics: diagnostics || state.recommendationRuntimeDiagnostics,
      logs: diagnostics
        ? [
            ...state.logs,
            `Recommendation warm-up: ${diagnostics.warmedUp ? "ready" : "failed"} / ${diagnostics.lastWarmupFailureCode || diagnostics.status.resolvedVariant} / cache ${diagnostics.embeddingCacheSize}`
          ]
        : state.logs
    }));
  },
  runRecommendationSampleEmbed: async () => {
    const currentState = get();
    const result = await sampleRecommendationEmbedBridge(currentState.recommendationSettings).catch(() => null);
    set((state) => ({
      recommendationRuntime: result?.diagnostics.status || state.recommendationRuntime,
      recommendationRuntimeDiagnostics: result?.diagnostics || state.recommendationRuntimeDiagnostics,
      recommendationSampleEmbedResult: result || state.recommendationSampleEmbedResult,
      logs: result
        ? [
            ...state.logs,
            result.ok
              ? `Recommendation sample embed: ok / dim ${result.vectorLength}`
              : `Recommendation sample embed: failed / ${result.errorCode || "unknown"}`
          ]
        : state.logs
    }));
  },
  refreshWorkspaceData: async () => {
    await get().refreshInventoryCompare();
  },
  refreshInventoryCompare: async () => {
    const currentState = get();
    const { runtimeMode, selectedRange, recommendationSettings } = currentState;
    set({ inventoryCompareLoading: true, reservationAuditLoading: true });

    const [
      fixtureSnapshot,
      reservationAuditFixture,
      context,
      bridgeRuntime,
      bridgeSummary,
      recommendationRuntime,
      recommendationRuntimeDiagnostics
    ] = await Promise.all([
      loadInventoryCompareSnapshot(runtimeMode),
      loadReservationAuditSnapshot(runtimeMode),
      runtimeMode === "live" ? getBridgeContext().catch(() => null) : Promise.resolve(null),
      getBridgeRuntime().catch(() => null),
      runtimeMode === "live" ? getBridgeSummary().catch(() => null) : Promise.resolve(null),
      getRecommendationRuntime(recommendationSettings).catch(() => null),
      getRecommendationRuntimeDiagnostics(recommendationSettings).catch(() => null)
    ]);
    const liveRowsResponse =
      runtimeMode === "live" && context?.sessionAvailable && context.provider
        ? await fetchProviderRows({
            type: "provider.fetchRows",
            provider: context.provider,
            query: selectedRange
          }).catch(() => null)
        : null;
    const snapshot =
      runtimeMode === "live"
        ? buildInventoryCompareSnapshot({
            mode: "live",
            sourceLabel:
              liveRowsResponse?.payload?.length
                ? liveRowsResponse.usedDomFallback
                  ? "Bridge live rows (DOM fallback)"
                  : "Bridge live rows"
                : context?.sessionAvailable
                  ? "Bridge live rows pending payload"
                  : "Bridge pending, fixture fallback",
            liveRows: liveRowsResponse?.payload,
            liveProvider: context?.provider || "naver-partner",
            usedDomFallback: liveRowsResponse?.usedDomFallback || false,
            liveContextAvailable: context?.sessionAvailable || false
          })
        : fixtureSnapshot;
    const reservationAudit =
      runtimeMode === "live"
        ? buildReservationAuditSnapshot({
            mode: "live",
            sourceLabel:
              context?.sessionAvailable && (bridgeSummary?.authSummary?.cookieCount || bridgeSummary?.authSummary?.hasBearer)
                ? "Bridge auth ready, audit fixture fallback"
                : "Bridge pending, audit fixture fallback",
            bridgeSummary: bridgeSummary || currentState.bridgeSummary,
            liveContextAvailable: context?.sessionAvailable || false
          })
        : reservationAuditFixture;
    const providerLabel =
      runtimeMode === "live"
        ? context?.provider || (context?.sessionAvailable ? "connected-live" : "Bridge Pending")
        : "NAVER/STATION";
    const bridgeMessage =
      runtimeMode === "live"
        ? context?.sessionAvailable
          ? liveRowsResponse?.payload?.length
            ? `Live bridge context detected at ${context.host ?? "unknown host"}. provider rows are flowing into the app.`
            : `Live bridge context detected at ${context.host ?? "unknown host"}. provider.fetchRows responded with no rows for the selected range.`
          : "Live mode selected, but no active bridge context was reported. provider.fetchRows remains pending."
        : `Fixture compare loaded for ${runtimeMode} mode.`;
    const nextBridgeStatus = {
      ...currentState.bridgeStatus,
      connected: bridgeRuntime?.connected ?? currentState.bridgeStatus.connected,
      capability: bridgeRuntime?.capability || currentState.bridgeStatus.capability,
      provider: providerLabel,
      sessionAvailable: context?.sessionAvailable ?? currentState.bridgeStatus.sessionAvailable,
      activeHost: context?.host || currentState.bridgeStatus.activeHost,
      message: bridgeMessage
        + (bridgeRuntime?.capability === "degraded" ? ` · ${bridgeRuntime.message}` : ""),
      code:
        runtimeMode === "live" && snapshot.supportLevel === "fixture-fallback"
          ? "FIXTURE_FALLBACK_ACTIVE"
          : context?.sessionAvailable && !(bridgeSummary?.authSummary?.cookieCount || bridgeSummary?.authSummary?.hasBearer)
            ? "UPSTREAM_AUTH_EXPIRED"
            : bridgeRuntime?.code || null,
      recoveryAction:
        runtimeMode === "live" && snapshot.supportLevel === "fixture-fallback"
          ? "Attach the extension session and verify bridge authentication before retrying live mode."
          : context?.sessionAvailable && !(bridgeSummary?.authSummary?.cookieCount || bridgeSummary?.authSummary?.hasBearer)
            ? "Re-authenticate the provider session in the extension. Read-only review can continue."
            : bridgeRuntime?.recoveryAction || currentState.bridgeStatus.recoveryAction,
      authConfigured: bridgeRuntime?.authConfigured ?? currentState.bridgeStatus.authConfigured,
      writeEnabled:
        runtimeMode === "live" &&
        snapshot.supportLevel === "read-live" &&
        Boolean(bridgeSummary?.authSummary?.cookieCount || bridgeSummary?.authSummary?.hasBearer)
    };
    const nextWorkspaceState = {
      ...currentState,
      inventoryCompare: snapshot,
      bridgeStatus: nextBridgeStatus,
      bridgeSummary: {
        authSummary: bridgeSummary?.authSummary || currentState.bridgeSummary.authSummary,
        infoSummary: bridgeSummary?.infoSummary || currentState.bridgeSummary.infoSummary,
        preview: bridgeSummary?.preview || currentState.bridgeSummary.preview
      },
      providerCards: getProviderCapabilityCards(),
      jobStatusCards: currentState.jobStatusCards,
      authBundleSettingsSnapshot:
        context?.provider && (bridgeSummary?.authSummary || bridgeSummary?.infoSummary)
          ? {
              provider: context.provider,
              host: context.host || "",
              updatedAt: new Date().toISOString(),
              bridgeSummary: {
                authSummary: bridgeSummary?.authSummary || currentState.bridgeSummary.authSummary,
                infoSummary: bridgeSummary?.infoSummary || currentState.bridgeSummary.infoSummary,
                preview: bridgeSummary?.preview || currentState.bridgeSummary.preview
              }
            }
          : currentState.authBundleSettingsSnapshot,
      recommendationSettings,
      recommendationRuntime,
      recommendationRuntimeDiagnostics,
      reservationAudit
    };
    const recommendationAssist = await buildRecommendationAssist(nextWorkspaceState, {
      enabled: recommendationSettings.enabled,
      settings: recommendationSettings
    });
    const projectedState = projectTaskState({ ...nextWorkspaceState, recommendationAssist });
    if (nextWorkspaceState.authBundleSettingsSnapshot) {
      saveAuthBundleSettingsSnapshot(nextWorkspaceState.authBundleSettingsSnapshot);
    }
    set({
      inventoryCompareLoading: false,
      reservationAuditLoading: false,
      inventoryCompare: snapshot,
      reservationAudit,
      metrics: projectedState.metrics,
      evidenceLines: projectedState.evidenceLines,
      opsLines: projectedState.opsLines,
      validationLines: projectedState.validationLines,
      logs: [
        ...projectedState.logs,
        recommendationRuntime
          ? `Recommendation runtime: ${recommendationRuntime.activeRuntime} (${recommendationRuntime.reason})`
          : "Recommendation runtime: renderer fallback"
      ],
      bridgeStatus: nextBridgeStatus,
      bridgeSummary: nextWorkspaceState.bridgeSummary,
      authBundleSettingsSnapshot: nextWorkspaceState.authBundleSettingsSnapshot,
      recommendationSettings,
      recommendationRuntime,
      recommendationRuntimeDiagnostics,
      recommendationAssist,
      providerCards: getProviderCapabilityCards(),
      processModules: buildProcessModules({ ...nextWorkspaceState, recommendationAssist }),
      jobStatusCards: buildJobStatusCards({ ...nextWorkspaceState, recommendationAssist }),
      searchResults: runWorkspaceSearch({ ...nextWorkspaceState, ...projectedState, recommendationAssist }, currentState.searchQuery)
    });
  }
}));
