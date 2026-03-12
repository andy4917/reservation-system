import { create } from "zustand";
import { uiMockState } from "../../fixtures/uiMockState";
import {
  fetchSheetSnapshot as fetchSheetSnapshotBridge,
  fetchProviderRows,
  fetchProviderReservations,
  captureWingsSession,
  getBridgeContext,
  getBridgeRuntime,
  openWingsLoginWindow,
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
import { resolveBridgeIssue } from "../../services/bridgeStatus";
import type {
  AppRunContext,
  AppTaskId,
  BranchSelection,
  RightPanelTab,
  SheetReadSnapshot,
  SummaryMetric,
  WorkspaceMockState
} from "../types";
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
  setSelectedBranch: (branch: BranchSelection) => void;
  setSelectedRange: (range: { startDate: string; endDate: string }) => void;
  setSearchQuery: (query: string) => void;
  setRecommendationEnabled: (enabled: boolean) => void;
  updateRecommendationSettings: (patch: Partial<RecommendationSettings>) => void;
  warmRecommendationRuntime: () => Promise<void>;
  runRecommendationSampleEmbed: () => Promise<void>;
  openWingsLogin: () => Promise<void>;
  captureWingsSession: () => Promise<void>;
  refreshWorkspaceData: () => Promise<void>;
  refreshInventoryCompare: () => Promise<void>;
}

function buildRunContext(state: WorkspaceMockState, provider: string | null = null): AppRunContext {
  return {
    id: `${state.runtimeMode}:${state.selectedBranch}:${state.selectedRange.startDate}:${state.selectedRange.endDate}:${Date.now()}`,
    branch: state.selectedBranch,
    startDate: state.selectedRange.startDate,
    endDate: state.selectedRange.endDate,
    runtimeMode: state.runtimeMode,
    requestedAt: new Date().toISOString(),
    sourceProvider: provider
  };
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
  setSelectedBranch: (branch) => {
    set({ selectedBranch: branch });
    void get().refreshInventoryCompare();
  },
  setSelectedRange: (range) => {
    const startDate = String(range.startDate || "").trim();
    const endDate = String(range.endDate || "").trim();
    if (!startDate || !endDate || startDate > endDate) return;
    set({ selectedRange: { startDate, endDate } });
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
  openWingsLogin: async () => {
    const result = await openWingsLoginWindow().catch(() => null);
    set((state) => ({
      logs: result
        ? [...state.logs, `Wings login window ${result.opened ? "opened" : "focused"}: ${result.url}`]
        : [...state.logs, "Wings login window open failed."]
    }));
  },
  captureWingsSession: async () => {
    const result = await captureWingsSession().catch(() => null);
    set((state) => ({
      logs: result
        ? [
            ...state.logs,
            `Wings session capture: ${result.sessionAvailable ? "available" : "missing"} / cookies ${result.authSummary.cookieCount} / ${result.url}`
          ]
        : [...state.logs, "Wings session capture failed."]
    }));
    await get().refreshWorkspaceData();
  },
  refreshWorkspaceData: async () => {
    await get().refreshInventoryCompare();
  },
  refreshInventoryCompare: async () => {
    const currentState = get();
    const { runtimeMode, selectedRange, selectedBranch, recommendationSettings } = currentState;
    const initialRunContext = buildRunContext(currentState, currentState.bridgeStatus.provider || null);
    set({
      inventoryCompareLoading: true,
      reservationAuditLoading: true,
      activeRunContext: initialRunContext
    });

    const [
      fixtureSnapshot,
      reservationAuditFixture,
      liveSheetSnapshot,
      context,
      bridgeRuntime,
      bridgeSummary,
      recommendationRuntime,
      recommendationRuntimeDiagnostics
    ] = await Promise.all([
      loadInventoryCompareSnapshot(runtimeMode),
      loadReservationAuditSnapshot(runtimeMode),
      runtimeMode === "live"
        ? fetchSheetSnapshotBridge({
            type: "provider.fetchSheetSnapshot",
            query: selectedRange
          }).catch(() => null)
        : Promise.resolve(null),
      runtimeMode === "live" ? getBridgeContext().catch(() => null) : Promise.resolve(null),
      getBridgeRuntime().catch(() => null),
      runtimeMode === "live" ? getBridgeSummary().catch(() => null) : Promise.resolve(null),
      getRecommendationRuntime(recommendationSettings).catch(() => null),
      getRecommendationRuntimeDiagnostics(recommendationSettings).catch(() => null)
    ]);
    const providerRowResponses =
      runtimeMode === "live"
        ? await Promise.all([
            fetchProviderRows({
              type: "provider.fetchRows",
              provider: "naver-partner",
              query: selectedRange
            }).catch(() => null),
            fetchProviderRows({
              type: "provider.fetchRows",
              provider: "admin-station",
              query: selectedRange
            }).catch(() => null)
          ])
        : [];
    const liveReservationResponse =
      runtimeMode === "live"
        ? await fetchProviderReservations({
            type: "provider.fetchReservations",
            provider: "wings-pms",
            query: selectedRange
          }).catch(() => null)
        : null;
    const branchFilter = selectedBranch === "ALL" ? "" : selectedBranch;
    const mergedLiveRows = providerRowResponses.flatMap((response) =>
      Array.isArray(response?.payload)
        ? response.payload.map((row) => ({
            ...row,
            provider: response.provider
          }))
        : []
    );
    const filteredLiveRows = Array.isArray(mergedLiveRows)
      ? mergedLiveRows.filter((row) => !branchFilter || String(row?.branch || "").trim().toUpperCase() === branchFilter)
      : mergedLiveRows;
    const filteredLiveReservationRows = Array.isArray(liveReservationResponse?.payload)
      ? liveReservationResponse.payload.filter((row) => !branchFilter || String(row?.branch || "").trim().toUpperCase() === branchFilter)
      : liveReservationResponse?.payload;
    const snapshot =
      runtimeMode === "live"
        ? buildInventoryCompareSnapshot({
            mode: "live",
            sourceLabel:
              filteredLiveRows?.length
                ? "read-live"
                : providerRowResponses.some((response) => Boolean(response?.source && response.source !== "unsupported-provider"))
                  ? "partial-live"
                  : context?.sessionAvailable
                  ? "partial-live"
                  : "fixture-fallback",
            liveRows: filteredLiveRows,
            liveProvider: "naver-partner",
            usedDomFallback: providerRowResponses.some((response) => response?.usedDomFallback === true),
            liveContextAvailable:
              Boolean(context?.sessionAvailable) ||
              providerRowResponses.some((response) => Boolean(response?.source && response.source !== "unsupported-provider")),
            branch: selectedBranch
          })
        : fixtureSnapshot;
    const reservationAudit =
      runtimeMode === "live"
        ? buildReservationAuditSnapshot({
            mode: "live",
            sourceLabel:
              filteredLiveReservationRows?.length
                ? "read-live"
                : (liveReservationResponse?.source === "pms-api" || context?.sessionAvailable) &&
                    (bridgeSummary?.authSummary?.cookieCount || bridgeSummary?.authSummary?.hasBearer)
                  ? "partial-live"
                  : "fixture-fallback",
            liveReservationRows: filteredLiveReservationRows,
            bridgeSummary: bridgeSummary || currentState.bridgeSummary,
            liveContextAvailable:
              Boolean(context?.sessionAvailable) ||
              (typeof liveReservationResponse?.source === "string" &&
                !["pms-unconfigured", "unavailable", "bridge-unavailable"].includes(liveReservationResponse.source)),
            branch: selectedBranch
          })
        : reservationAuditFixture;
    const sheetRead: SheetReadSnapshot =
      runtimeMode === "live"
        ? {
            supportLevel:
              liveSheetSnapshot?.payload && liveSheetSnapshot.source === "sheet-api"
                ? "read-live"
                : liveSheetSnapshot?.source === "sheet-unconfigured"
                  ? "fixture-fallback"
                  : "partial-live",
            sourceLabel:
              liveSheetSnapshot?.payload && liveSheetSnapshot.source === "sheet-api"
                ? "read-live"
                : liveSheetSnapshot?.source || "sheet-unconfigured",
            lastRunAt: new Date().toISOString(),
            summary: liveSheetSnapshot?.payload || null,
            logs: [
              liveSheetSnapshot?.payload
                ? `Sheet snapshot loaded: ${liveSheetSnapshot.payload.sheetName} ${liveSheetSnapshot.payload.startDate}..${liveSheetSnapshot.payload.endDate}`
                : `Sheet snapshot unavailable: ${liveSheetSnapshot?.error || liveSheetSnapshot?.source || "unknown"}`
            ]
          }
        : {
            supportLevel: "dry-run-only" as const,
            sourceLabel: runtimeMode === "replay" ? "Replay sheet fixture" : "Dry-run sheet fixture",
            lastRunAt: new Date().toISOString(),
            summary: null,
            logs: [`Sheet snapshot skipped in ${runtimeMode} mode.`]
          };
    const providerLabel =
      runtimeMode === "live"
        ? context?.provider || (context?.sessionAvailable ? "connected-live" : "Bridge Pending")
        : "NAVER/STATION";
    const bridgeMessage =
      runtimeMode === "live"
        ? context?.sessionAvailable
          ? "Live workspace available."
          : "Live workspace unavailable."
        : "Fixture workspace loaded.";
    const hasUpstreamAuth = Boolean(bridgeSummary?.authSummary?.cookieCount || bridgeSummary?.authSummary?.hasBearer);
    const bridgeIssue = resolveBridgeIssue({
      runtimeMode,
      supportLevel: filteredLiveReservationRows?.length ? reservationAudit.supportLevel : snapshot.supportLevel,
      provider: context?.provider || null,
      sessionAvailable: context?.sessionAvailable || false,
      hasUpstreamAuth,
      bridgeRuntimeCode: bridgeRuntime?.code || null,
      bridgeRuntimeRecoveryAction: bridgeRuntime?.recoveryAction || null,
      fallbackRecoveryAction: currentState.bridgeStatus.recoveryAction
    });
    const nextBridgeStatus = {
      ...currentState.bridgeStatus,
      connected: bridgeRuntime?.connected ?? currentState.bridgeStatus.connected,
      capability: bridgeRuntime?.capability || currentState.bridgeStatus.capability,
      provider: providerLabel,
      sessionAvailable: context?.sessionAvailable ?? currentState.bridgeStatus.sessionAvailable,
      activeHost: context?.host || currentState.bridgeStatus.activeHost,
      message: bridgeMessage,
      code: bridgeIssue.code,
      recoveryAction: bridgeIssue.recoveryAction,
      authConfigured: bridgeRuntime?.authConfigured ?? currentState.bridgeStatus.authConfigured,
      writeEnabled:
        runtimeMode === "live" &&
        reservationAudit.supportLevel === "read-live" &&
        hasUpstreamAuth
    };
    const nextWorkspaceState = {
      ...currentState,
      activeRunContext: buildRunContext(currentState, context?.provider || null),
      inventoryCompare: snapshot,
      sheetRead,
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
      reservationAudit,
      selectedBranch
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
      activeRunContext: nextWorkspaceState.activeRunContext,
      inventoryCompare: snapshot,
      sheetRead,
      reservationAudit,
      metrics: projectedState.metrics,
      evidenceLines: projectedState.evidenceLines,
      opsLines: projectedState.opsLines,
      validationLines: projectedState.validationLines,
      logs: [
        ...sheetRead.logs,
        ...projectedState.logs,
        recommendationRuntime
          ? `Recommendation runtime: ${recommendationRuntime.activeRuntime}`
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
