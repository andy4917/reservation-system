import { create } from "zustand";
import {
  fetchSheetSnapshot as fetchSheetSnapshotBridge,
  fetchProviderRows,
  fetchProviderReservations,
  captureWingsSession,
  deleteBindingDecision,
  deleteManualScanAnchor,
  loadBindingDecisions,
  loadManualScanAnchor,
  saveBindingDecision,
  saveManualScanAnchor,
  getBridgeContext,
  getBridgeRuntime,
  indexWorkspaceSearch,
  openWingsLoginWindow,
  queryWorkspaceSearch,
  getBridgeSummary
} from "../../services/bridgeClient";
import { buildGeneratedBindingDraft, buildSheetRef, mergeBindingDraftWithSavedDecisions } from "../../services/bindingArtifacts";
import { buildInventoryCompareSnapshot } from "../../services/inventoryCompare";
import { buildJobStatusCards } from "../../services/jobRunner";
import { buildProcessModules } from "../../services/processModules";
import { getProviderCapabilityCards } from "../../services/providerRegistry";
import { buildReservationAuditSnapshot } from "../../services/reservationAudit";
import { buildWorkspaceSearchIndexInput } from "../../services/searchEngine";
import { saveAuthBundleSettingsSnapshot } from "../../services/settingsStorage";
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

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(base: Date, days: number) {
  const next = new Date(base);
  next.setDate(next.getDate() + days);
  return next;
}

function createInitialWorkspaceState(): WorkspaceMockState {
  const today = new Date();
  const inventoryCompare = {
    title: "재고 비교",
    supportLevel: "fixture-fallback" as const,
    sourceLabel: "조회 전",
    lastRunAt: new Date().toISOString(),
    rows: [],
    mismatchCount: 0,
    warningCount: 0,
    matchedCount: 0,
    evidenceLines: ["조회 전"],
    opsLines: ["브라우저 연결 후 조회할 수 있습니다."],
    validationLines: ["차이 항목이 없습니다."],
    logs: []
  };
  const reservationAudit = {
    title: "예약 점검",
    supportLevel: "fixture-fallback" as const,
    sourceLabel: "조회 전",
    lastRunAt: new Date().toISOString(),
    rows: [],
    anomalyCount: 0,
    reviewCount: 0,
    activeCount: 0,
    canceledCount: 0,
    evidenceLines: ["조회 전"],
    opsLines: ["브라우저 연결 후 조회할 수 있습니다."],
    validationLines: ["확인 필요 항목 없음"],
    logs: []
  };
  const sheetRead: SheetReadSnapshot = {
    supportLevel: "fixture-fallback",
    sourceLabel: "조회 전",
    lastRunAt: new Date().toISOString(),
    summary: null,
    selectedRunId: null,
    mappingArtifacts: [],
    visibleSlice: {
      runId: null,
      offset: 0,
      limit: 12,
      total: 0,
      lines: []
    }
  };

  return {
    runtimeMode: "live",
    activeTask: "inventory-compare",
    selectedBranch: "GANGNAM",
    selectedRange: {
      startDate: toDateKey(today),
      endDate: toDateKey(addDays(today, 3))
    },
    activeRunContext: null,
    bridgeStatus: {
      connected: false,
      sessionAvailable: false,
      capability: "degraded",
      activeHost: "",
      provider: "NAVER/STATION",
      message: "브라우저 연결 필요",
      code: "BRIDGE_UNAVAILABLE",
      recoveryAction: "브라우저 확장을 연결하거나 앱에서 윙스 로그인을 연 뒤 다시 조회하세요.",
      authConfigured: false,
      writeEnabled: false
    },
    metrics: [
      { label: "차이 있음", value: "0", tone: "ok" },
      { label: "주의", value: "0", tone: "ok" },
      { label: "일치", value: "0", tone: "default" },
      { label: "조회 상태", value: "미연결", tone: "default" }
    ],
    logs: [],
    evidenceLines: inventoryCompare.evidenceLines,
    opsLines: inventoryCompare.opsLines,
    validationLines: inventoryCompare.validationLines,
    inventoryCompare,
    inventoryCompareLoading: false,
    sheetRead,
    manualScanAnchor: null,
    manualScanAnchorDraft: {},
    sheetTerms: [],
    termBindings: [],
    unresolvedBindings: [],
    reservationAudit,
    reservationAuditLoading: false,
    searchQuery: "",
    searchResults: [],
    processModules: [],
    providerCards: getProviderCapabilityCards(),
    jobStatusCards: [],
    bridgeSummary: {
      authSummary: null,
      infoSummary: null,
      preview: null
    },
    authBundleSettingsSnapshot: null,
    hasPendingQueryChanges: false
  };
}

function buildTaskMetrics(state: WorkspaceMockState): SummaryMetric[] {
  if (state.activeTask === "reservation-audit") {
    return [
      { label: "이상", value: String(state.reservationAudit.anomalyCount), tone: state.reservationAudit.anomalyCount > 0 ? "critical" : "ok" },
      { label: "검토", value: String(state.reservationAudit.reviewCount), tone: state.reservationAudit.reviewCount > 0 ? "warn" : "ok" },
      { label: "진행 중", value: String(state.reservationAudit.activeCount), tone: "default" },
      { label: "취소", value: String(state.reservationAudit.canceledCount), tone: "default" }
    ];
  }

  return [
    { label: "차이 있음", value: String(state.inventoryCompare.mismatchCount), tone: state.inventoryCompare.mismatchCount > 0 ? "critical" : "ok" },
    { label: "주의", value: String(state.inventoryCompare.warningCount), tone: state.inventoryCompare.warningCount > 0 ? "warn" : "ok" },
    { label: "일치", value: String(state.inventoryCompare.matchedCount), tone: "ok" },
    {
      label: "조회 상태",
      value: state.inventoryCompare.supportLevel === "read-live" ? "실시간" : state.inventoryCompare.supportLevel === "partial-live" ? "일부 연결" : "미연결",
      tone: state.inventoryCompare.supportLevel === "read-live" ? "ok" : state.inventoryCompare.supportLevel === "partial-live" ? "warn" : "default"
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
  setRuntimeMode: (mode: WorkspaceMockState["runtimeMode"]) => void;
  setActiveRightPanelTab: (tab: RightPanelTab) => void;
  setSelectedBranch: (branch: BranchSelection) => void;
  setSelectedRange: (range: { startDate: string; endDate: string }) => void;
  setSearchQuery: (query: string) => void;
  openWingsLogin: () => Promise<void>;
  captureWingsSession: () => Promise<void>;
  setManualScanAnchorDraft: (patch: Record<string, number | null | undefined>) => void;
  saveManualScanAnchorDraft: () => Promise<void>;
  deleteManualScanAnchorDraft: () => Promise<void>;
  saveManualBindingDecision: (anchorId: string, termId: string) => Promise<void>;
  deleteManualBindingDecision: (decisionKey: string) => Promise<void>;
  runSelectedQuery: () => Promise<void>;
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

async function rebuildBindingState(sheetRead: SheetReadSnapshot, branch: BranchSelection) {
  const generatedBindingDraft = buildGeneratedBindingDraft(sheetRead, branch);
  const savedBindingDecisions =
    generatedBindingDraft.sheetRef
      ? (await loadBindingDecisions({
          type: "binding.loadDecisions",
          branch,
          sheetRef: {
            spreadsheetId: generatedBindingDraft.sheetRef.spreadsheetId,
            sheetName: generatedBindingDraft.sheetRef.sheetName,
            sheetId: generatedBindingDraft.sheetRef.sheetId,
            timezone: generatedBindingDraft.sheetRef.timezone
          }
        }).catch(() => ({ ok: true as const, decisions: [] }))).decisions
      : [];
  return mergeBindingDraftWithSavedDecisions(generatedBindingDraft, savedBindingDecisions, branch);
}

function findSectionKeyForUnresolved(state: WorkspaceMockState, anchorId: string) {
  for (const artifact of state.sheetRead.mappingArtifacts) {
    if (artifact.unresolved.some((item) => item.anchorId === anchorId)) {
      return artifact.section.sectionKey;
    }
  }
  return null;
}

async function refreshSearchResults(runId: string | null, query: string) {
  const normalizedQuery = String(query || "").trim();
  if (!runId || !normalizedQuery) return [];
  const response = await queryWorkspaceSearch({
    type: "search.queryWorkspace",
    runId,
    query: normalizedQuery,
    limit: 12
  }).catch(() => null);
  return response?.ok ? response.hits : [];
}

export const useUiStore = create<UiStore>((set, get) => ({
  ...createInitialWorkspaceState(),
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
        searchResults: state.searchResults
      };
    }),
  setRuntimeMode: (runtimeMode) =>
    set((state) => ({
      runtimeMode,
      hasPendingQueryChanges: true,
      activeRunContext: null,
      logs: [...state.logs, `runtime mode changed: ${runtimeMode}`]
    })),
  setActiveRightPanelTab: (tab) => set({ activeRightPanelTab: tab }),
  setSelectedBranch: (branch) => set({ selectedBranch: branch, hasPendingQueryChanges: true }),
  setSelectedRange: (range) => {
    const startDate = String(range.startDate || "").trim();
    const endDate = String(range.endDate || "").trim();
    if (!startDate || !endDate || startDate > endDate) return;
    set({ selectedRange: { startDate, endDate }, hasPendingQueryChanges: true });
  },
  setSearchQuery: (query) => {
    const nextQuery = String(query || "");
    set({ searchQuery: nextQuery });
    const currentRunId = get().sheetRead.selectedRunId;
    void refreshSearchResults(currentRunId, nextQuery).then((hits) => {
      if (get().searchQuery !== nextQuery) return;
      set({ searchResults: hits });
    });
  },
  openWingsLogin: async () => {
    const result = await openWingsLoginWindow().catch(() => null);
    set((state) => ({
      logs: result ? [...state.logs, `Wings login window ${result.opened ? "opened" : "focused"}: ${result.url}`] : [...state.logs, "Wings login window open failed."]
    }));
  },
  captureWingsSession: async () => {
    const result = await captureWingsSession().catch(() => null);
    set((state) => ({
      logs: result
        ? [...state.logs, `Wings session capture: ${result.sessionAvailable ? "available" : "missing"} / cookies ${result.authSummary.cookieCount} / ${result.url}`]
        : [...state.logs, "Wings session capture failed."]
    }));
  },
  setManualScanAnchorDraft: (patch) =>
    set((state) => ({
      manualScanAnchorDraft: {
        ...state.manualScanAnchorDraft,
        ...patch
      }
    })),
  saveManualScanAnchorDraft: async () => {
    const currentState = get();
    const summary = currentState.sheetRead.summary;
    if (!summary) return;
    const anchor = await saveManualScanAnchor({
      type: "scanAnchor.save",
      branch: currentState.selectedBranch,
      sheetRef: {
        spreadsheetId: summary.spreadsheetId,
        sheetName: summary.sheetName,
        sheetId: null,
        timezone: "Asia/Seoul"
      },
      scan: currentState.manualScanAnchorDraft
    }).catch(() => null);
    if (!anchor?.ok) {
      set((state) => ({
        logs: [...state.logs, "manual scan anchor save failed."]
      }));
      return;
    }
    set({
      manualScanAnchor: anchor.anchor
    });
    await get().refreshInventoryCompare();
  },
  deleteManualScanAnchorDraft: async () => {
    const currentState = get();
    const summary = currentState.sheetRead.summary;
    if (!summary) return;
    const result = await deleteManualScanAnchor({
      type: "scanAnchor.delete",
      branch: currentState.selectedBranch,
      sheetRef: {
        spreadsheetId: summary.spreadsheetId,
        sheetName: summary.sheetName,
        sheetId: null,
        timezone: "Asia/Seoul"
      }
    }).catch(() => null);
    if (!result?.ok) {
      set((state) => ({
        logs: [...state.logs, "manual scan anchor delete failed."]
      }));
      return;
    }
    set({
      manualScanAnchor: null,
      manualScanAnchorDraft: {}
    });
    await get().refreshInventoryCompare();
  },
  saveManualBindingDecision: async (anchorId, termId) => {
    const currentState = get();
    const unresolved = currentState.unresolvedBindings.find((item) => item.anchorId === anchorId);
    const sheetRef = buildSheetRef(currentState.sheetRead.summary, currentState.selectedBranch);
    if (!unresolved || !sheetRef || !unresolved.candidateTerms.includes(termId)) {
      set((state) => ({
        logs: [...state.logs, `binding save skipped: ${anchorId} -> ${termId}`]
      }));
      return;
    }
    const result = await saveBindingDecision({
      type: "binding.saveDecision",
      decision: {
        branch: currentState.selectedBranch,
        sheetRef: {
          spreadsheetId: sheetRef.spreadsheetId,
          sheetName: sheetRef.sheetName,
          sheetId: sheetRef.sheetId,
          timezone: sheetRef.timezone
        },
        sectionKey: findSectionKeyForUnresolved(currentState, unresolved.anchorId),
        anchorId: unresolved.anchorId,
        rawHeader: unresolved.rawHeader,
        termId,
        confidence: 1
      }
    }).catch(() => null);
    if (!result?.ok) {
      set((state) => ({
        logs: [...state.logs, `binding save failed: ${anchorId} -> ${termId}`]
      }));
      return;
    }
    const bindingDraft = await rebuildBindingState(currentState.sheetRead, currentState.selectedBranch);
    set((state) => ({
      sheetTerms: bindingDraft.sheetTerms,
      termBindings: bindingDraft.termBindings,
      unresolvedBindings: bindingDraft.unresolvedBindings,
      logs: [...state.logs, `binding saved: ${anchorId} -> ${termId}`]
    }));
  },
  deleteManualBindingDecision: async (decisionKey) => {
    const currentState = get();
    if (!decisionKey) return;
    const result = await deleteBindingDecision({
      type: "binding.deleteDecision",
      decisionKey
    }).catch(() => null);
    if (!result?.ok || !result.deleted) {
      set((state) => ({
        logs: [...state.logs, `binding delete failed: ${decisionKey}`]
      }));
      return;
    }
    const bindingDraft = await rebuildBindingState(currentState.sheetRead, currentState.selectedBranch);
    set((state) => ({
      sheetTerms: bindingDraft.sheetTerms,
      termBindings: bindingDraft.termBindings,
      unresolvedBindings: bindingDraft.unresolvedBindings,
      logs: [...state.logs, `binding deleted: ${decisionKey}`]
    }));
  },
  runSelectedQuery: async () => {
    set({ hasPendingQueryChanges: false });
    await get().refreshWorkspaceData();
  },
  refreshWorkspaceData: async () => {
    await get().refreshInventoryCompare();
  },
  refreshInventoryCompare: async () => {
    const currentState = get();
    const { selectedRange, selectedBranch } = currentState;
    const initialRunContext = buildRunContext(currentState, currentState.bridgeStatus.provider || null);
    set({
      inventoryCompareLoading: true,
      reservationAuditLoading: true,
      activeRunContext: initialRunContext
    });

    const [liveSheetSnapshot, context, bridgeRuntime, bridgeSummary] = await Promise.all([
      fetchSheetSnapshotBridge({
        type: "provider.fetchSheetSnapshot",
        query: {
          ...selectedRange,
          branch: selectedBranch
        }
      }).catch(() => null),
      getBridgeContext().catch(() => null),
      getBridgeRuntime().catch(() => null),
      getBridgeSummary().catch(() => null)
    ]);

    const providerRowResponses = await Promise.all([
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
    ]);
    const liveReservationResponse = await fetchProviderReservations({
      type: "provider.fetchReservations",
      provider: "wings-pms",
      query: selectedRange
    }).catch(() => null);

    const branchFilter = selectedBranch;
    const mergedLiveRows = providerRowResponses.flatMap((response) =>
      Array.isArray(response?.payload)
        ? response.payload.map((row) => ({
            ...row,
            provider: response.provider
          }))
        : []
    );
    const filteredLiveRows = mergedLiveRows.filter((row) => String(row?.branch || "").trim().toUpperCase() === branchFilter);
    const filteredLiveReservationRows = Array.isArray(liveReservationResponse?.payload)
      ? liveReservationResponse.payload.filter((row) => String(row?.branch || "").trim().toUpperCase() === branchFilter)
      : [];

    const liveContextAvailable =
      Boolean(context?.sessionAvailable) ||
      providerRowResponses.some((response) => Boolean(response?.source && response.source !== "unsupported-provider"));

    const snapshot = buildInventoryCompareSnapshot({
      mode: currentState.runtimeMode,
      sourceLabel: filteredLiveRows.length > 0 ? "실시간 데이터" : liveContextAvailable ? "연결 확인 중" : "조회 전",
      liveRows: filteredLiveRows,
      liveProvider: "naver-partner",
      usedDomFallback: providerRowResponses.some((response) => response?.usedDomFallback === true),
      liveContextAvailable,
      branch: selectedBranch
    });
    const reservationAudit = buildReservationAuditSnapshot({
      mode: currentState.runtimeMode,
      sourceLabel: filteredLiveReservationRows.length > 0 ? "예약 데이터" : liveContextAvailable ? "연결 확인 중" : "조회 전",
      liveReservationRows: filteredLiveReservationRows,
      bridgeSummary: bridgeSummary || currentState.bridgeSummary,
      liveContextAvailable:
        Boolean(context?.sessionAvailable) ||
        (typeof liveReservationResponse?.source === "string" &&
          !["pms-unconfigured", "unavailable", "bridge-unavailable"].includes(liveReservationResponse.source)),
      branch: selectedBranch
    });
    const sheetPayload = liveSheetSnapshot?.payload || {
      runId: null,
      summary: null,
      mappingArtifacts: [],
      visibleSlice: {
        runId: null,
        offset: 0,
        limit: 12,
        total: 0,
        lines: []
      }
    };
    const sheetSummary = sheetPayload.summary || null;
    const sheetRead: SheetReadSnapshot = {
      supportLevel:
        sheetSummary && liveSheetSnapshot?.source === "sheet-api"
          ? "read-live"
          : liveContextAvailable
            ? "partial-live"
            : "fixture-fallback",
      sourceLabel:
        sheetSummary && liveSheetSnapshot?.source === "sheet-api"
          ? "실시간 시트 데이터"
          : sheetSummary && liveSheetSnapshot?.source === "sheet-unconfigured"
            ? "시트 설정 필요"
            : sheetSummary && liveSheetSnapshot?.source
            ? "시트 오류 확인 필요"
            : liveContextAvailable
            ? "시트 확인 중"
            : "조회 전",
      lastRunAt: new Date().toISOString(),
      summary: sheetSummary,
      selectedRunId: sheetPayload.runId,
      mappingArtifacts: Array.isArray(sheetPayload.mappingArtifacts) ? sheetPayload.mappingArtifacts : [],
      visibleSlice: sheetPayload.visibleSlice
    };
    const loadedManualScanAnchor =
      sheetSummary?.spreadsheetId && sheetSummary?.sheetName
        ? await loadManualScanAnchor({
            type: "scanAnchor.load",
            branch: selectedBranch,
            sheetRef: {
              spreadsheetId: sheetSummary.spreadsheetId,
              sheetName: sheetSummary.sheetName,
              sheetId: null,
              timezone: "Asia/Seoul"
            }
          }).catch(() => null)
        : null;
    const bindingDraft = await rebuildBindingState(sheetRead, selectedBranch);

    const hasUpstreamAuth = Boolean(bridgeSummary?.authSummary?.cookieCount || bridgeSummary?.authSummary?.hasBearer);
    const bridgeIssue = resolveBridgeIssue({
      runtimeMode: "live",
      supportLevel: filteredLiveReservationRows.length > 0 ? reservationAudit.supportLevel : snapshot.supportLevel,
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
      provider: context?.provider || (context?.sessionAvailable ? "실시간 연결" : "연결 대기"),
      sessionAvailable: context?.sessionAvailable ?? currentState.bridgeStatus.sessionAvailable,
      activeHost: context?.host || currentState.bridgeStatus.activeHost,
      message: context?.sessionAvailable ? "브라우저가 연결되었습니다." : "브라우저가 연결되지 않았습니다.",
      code: bridgeIssue.code,
      recoveryAction: bridgeIssue.recoveryAction,
      authConfigured: bridgeRuntime?.authConfigured ?? currentState.bridgeStatus.authConfigured,
      writeEnabled: reservationAudit.supportLevel === "read-live" && hasUpstreamAuth
    };

    const nextWorkspaceState = {
      ...currentState,
      activeRunContext: buildRunContext(currentState, context?.provider || null),
      inventoryCompare: snapshot,
      sheetRead,
      manualScanAnchor: loadedManualScanAnchor,
      manualScanAnchorDraft: loadedManualScanAnchor?.scan || {},
      sheetTerms: bindingDraft.sheetTerms,
      termBindings: bindingDraft.termBindings,
      unresolvedBindings: bindingDraft.unresolvedBindings,
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
      reservationAudit,
      selectedBranch
    };
    const projectedState = projectTaskState(nextWorkspaceState);
    if (nextWorkspaceState.authBundleSettingsSnapshot) {
      saveAuthBundleSettingsSnapshot(nextWorkspaceState.authBundleSettingsSnapshot);
    }
    const searchInput = buildWorkspaceSearchIndexInput({
      ...nextWorkspaceState,
      ...projectedState
    });
    if (searchInput) {
      await indexWorkspaceSearch({
        type: "search.indexWorkspace",
        payload: searchInput
      }).catch(() => null);
    }
    const nextSearchResults = searchInput
      ? await refreshSearchResults(searchInput.runId, currentState.searchQuery)
      : [];
    set({
      inventoryCompareLoading: false,
      reservationAuditLoading: false,
      activeRunContext: nextWorkspaceState.activeRunContext,
      inventoryCompare: snapshot,
      sheetRead,
      sheetTerms: bindingDraft.sheetTerms,
      termBindings: bindingDraft.termBindings,
      unresolvedBindings: bindingDraft.unresolvedBindings,
      reservationAudit,
      metrics: projectedState.metrics,
      evidenceLines: projectedState.evidenceLines,
      opsLines: projectedState.opsLines,
      validationLines: projectedState.validationLines,
      logs: [
        ...sheetRead.visibleSlice.lines,
        ...projectedState.logs
      ],
      bridgeStatus: nextBridgeStatus,
      bridgeSummary: nextWorkspaceState.bridgeSummary,
      authBundleSettingsSnapshot: nextWorkspaceState.authBundleSettingsSnapshot,
      providerCards: getProviderCapabilityCards(),
      processModules: buildProcessModules(nextWorkspaceState),
      jobStatusCards: buildJobStatusCards(nextWorkspaceState),
      searchResults: nextSearchResults
    });
  }
}));
