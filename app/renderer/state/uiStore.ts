import { create } from "zustand";
import {
  fetchLiveReadBundle as fetchLiveReadBundleBridge,
  fetchSheetSnapshot as fetchSheetSnapshotBridge,
  fetchProviderRows,
  fetchProviderReservations,
  captureWingsSession,
  buildOperatorExport as buildOperatorExportBridge,
  exportOperatorHandoff as exportOperatorHandoffBridge,
  repeatOperatorHandoff as repeatOperatorHandoffBridge,
  updateOperatorHandoffStatus as updateOperatorHandoffStatusBridge,
  deleteBindingDecision,
  deleteManualScanAnchor,
  loadBindingDecisions,
  loadRecommendationTraces,
  loadManualScanAnchor,
  saveBindingDecision,
  saveManualScanAnchor,
  saveRecommendationTrace,
  getBridgeContext,
  getBridgeRuntime,
  indexWorkspaceSearch,
  openWingsLoginWindow,
  queryWorkspaceSearch,
  getBridgeSummary
} from "../../services/bridgeClient";
import type { OperatorExportHandoffFormat, OperatorExportHandoffStatus } from "../../contracts/index.js";
import { buildGeneratedBindingDraft, buildSheetRef, mergeBindingDraftWithSavedDecisions } from "../../services/bindingArtifacts";
import { buildInventoryCompareSnapshot } from "../../services/inventoryCompare";
import { buildJobStatusCards } from "../../services/jobRunner";
import { buildProcessModules } from "../../services/processModules";
import { buildRecommendationTraceInput, matchesRecommendationTrace } from "../../services/recommendationRuntime";
import { getProviderCapabilityCards } from "../../services/providerRegistry";
import { buildReservationAuditSnapshot } from "../../services/reservationAudit";
import { buildWorkspaceSearchIndexInput } from "../../services/searchEngine";
import { saveAuthBundleSettingsSnapshot } from "../../services/settingsStorage";
import { resolveBridgeIssue } from "../../services/bridgeStatus";

function isLiveSourceAvailable(source: unknown) {
  const normalized = typeof source === "string" ? source.trim() : "";
  if (!normalized) return false;
  return !["unsupported-provider", "unavailable", "bridge-unavailable", "pms-unconfigured", "sheet-unconfigured"].includes(
    normalized
  );
}
import type {
  AppRunContext,
  AppTaskId,
  BranchSelection,
  HandoffHistoryFilter,
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
    supportLevel: "offline-preview" as const,
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
    supportLevel: "offline-preview" as const,
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
    supportLevel: "offline-preview",
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
    activeFocus: null,
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
    recommendationTraces: [],
    operatorExport: null,
    handoffHistoryFilter: "all",
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
  setHandoffHistoryFilter: (filter: HandoffHistoryFilter) => void;
  setSelectedBranch: (branch: BranchSelection) => void;
  setSelectedRange: (range: { startDate: string; endDate: string }) => void;
  setSearchQuery: (query: string) => void;
  openWingsLogin: () => Promise<void>;
  captureWingsSession: () => Promise<void>;
  setManualScanAnchorDraft: (patch: Record<string, number | null | undefined>) => void;
  saveManualScanAnchorDraft: () => Promise<void>;
  deleteManualScanAnchorDraft: () => Promise<void>;
  saveManualBindingDecision: (anchorId: string, termId: string) => Promise<void>;
  rejectRecommendationCandidate: (anchorId: string, candidateId: string) => Promise<void>;
  deleteManualBindingDecision: (decisionKey: string) => Promise<void>;
  refreshOperatorExport: () => Promise<void>;
  exportOperatorHandoff: (target: "clipboard" | "file", format: OperatorExportHandoffFormat) => Promise<void>;
  repeatOperatorHandoff: (handoffId: string, target: "clipboard" | "file") => Promise<void>;
  setOperatorHandoffStatus: (handoffId: string, status: OperatorExportHandoffStatus) => Promise<void>;
  jumpToSearchResult: (docId: string) => void;
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

function findUnresolvedBinding(state: WorkspaceMockState, anchorId: string) {
  return state.unresolvedBindings.find((item) => item.anchorId === anchorId) || null;
}

async function loadRecommendationState(sheetRead: SheetReadSnapshot, branch: BranchSelection) {
  const sheetRef = buildSheetRef(sheetRead.summary, branch);
  if (!sheetRef) return [];
  return loadRecommendationTraces({
    type: "recommendation.loadTraces",
    branch,
    sheetRef: {
      spreadsheetId: sheetRef.spreadsheetId,
      sheetName: sheetRef.sheetName,
      sheetId: sheetRef.sheetId,
      timezone: sheetRef.timezone
    }
  }).catch(() => []);
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

async function loadOperatorExport(state: WorkspaceMockState) {
  const runId = String(state.sheetRead.selectedRunId || "").trim();
  if (!runId) return null;
  const response = await buildOperatorExportBridge({
    type: "operator.buildExport",
    runId,
    branch: state.selectedBranch
  }).catch(() => null);
  return response?.ok ? response.exportBundle : null;
}

async function reindexWorkspaceSearch(state: WorkspaceMockState) {
  const projection = projectTaskState(state);
  const searchInput = buildWorkspaceSearchIndexInput({
    ...state,
    ...projection
  });
  if (!searchInput) {
    return [];
  }
  await indexWorkspaceSearch({
    type: "search.indexWorkspace",
    payload: searchInput
  }).catch(() => null);
  return refreshSearchResults(searchInput.runId, state.searchQuery);
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
  setHandoffHistoryFilter: (handoffHistoryFilter) => set({ handoffHistoryFilter }),
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
    const unresolved = findUnresolvedBinding(currentState, anchorId);
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
    await saveRecommendationTrace({
      type: "recommendation.saveTrace",
      trace: buildRecommendationTraceInput({
        branch: currentState.selectedBranch,
        sheetRef: {
          spreadsheetId: sheetRef.spreadsheetId,
          sheetName: sheetRef.sheetName,
          sheetId: sheetRef.sheetId,
          timezone: sheetRef.timezone
        },
        runId: currentState.sheetRead.selectedRunId,
        sectionKey: findSectionKeyForUnresolved(currentState, unresolved.anchorId),
        unresolved,
        candidateId: termId,
        outcome: "accepted"
      })
    }).catch(() => null);
    const bindingDraft = await rebuildBindingState(currentState.sheetRead, currentState.selectedBranch);
    const recommendationTraces = await loadRecommendationState(currentState.sheetRead, currentState.selectedBranch);
    set((state) => ({
      sheetTerms: bindingDraft.sheetTerms,
      termBindings: bindingDraft.termBindings,
      unresolvedBindings: bindingDraft.unresolvedBindings,
      recommendationTraces,
      logs: [...state.logs, `binding saved: ${anchorId} -> ${termId}`]
    }));
    const operatorExport = await loadOperatorExport(get());
    const nextSearchResults = await reindexWorkspaceSearch(get());
    set({ searchResults: nextSearchResults, operatorExport });
  },
  rejectRecommendationCandidate: async (anchorId, candidateId) => {
    const currentState = get();
    const unresolved = findUnresolvedBinding(currentState, anchorId);
    const sheetRef = buildSheetRef(currentState.sheetRead.summary, currentState.selectedBranch);
    if (!unresolved || !sheetRef || !unresolved.candidateTerms.includes(candidateId)) {
      set((state) => ({
        logs: [...state.logs, `recommendation reject skipped: ${anchorId} -> ${candidateId}`]
      }));
      return;
    }
    const saved = await saveRecommendationTrace({
      type: "recommendation.saveTrace",
      trace: buildRecommendationTraceInput({
        branch: currentState.selectedBranch,
        sheetRef: {
          spreadsheetId: sheetRef.spreadsheetId,
          sheetName: sheetRef.sheetName,
          sheetId: sheetRef.sheetId,
          timezone: sheetRef.timezone
        },
        runId: currentState.sheetRead.selectedRunId,
        sectionKey: findSectionKeyForUnresolved(currentState, unresolved.anchorId),
        unresolved,
        candidateId,
        outcome: "rejected"
      })
    }).catch(() => null);
    if (!saved?.ok) {
      set((state) => ({
        logs: [...state.logs, `recommendation reject failed: ${anchorId} -> ${candidateId}`]
      }));
      return;
    }
    const recommendationTraces = await loadRecommendationState(currentState.sheetRead, currentState.selectedBranch);
    set((state) => ({
      recommendationTraces,
      logs: [...state.logs, `recommendation rejected: ${anchorId} -> ${candidateId}`]
    }));
    const operatorExport = await loadOperatorExport(get());
    const nextSearchResults = await reindexWorkspaceSearch(get());
    set({ searchResults: nextSearchResults, operatorExport });
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
    const operatorExport = await loadOperatorExport(get());
    const nextSearchResults = await reindexWorkspaceSearch(get());
    set({ searchResults: nextSearchResults, operatorExport });
  },
  refreshOperatorExport: async () => {
    const operatorExport = await loadOperatorExport(get());
    set({ operatorExport });
  },
  exportOperatorHandoff: async (target, format) => {
    const currentState = get();
    const runId = String(currentState.sheetRead.selectedRunId || "").trim();
    if (!runId) {
      set((state) => ({
        logs: [...state.logs, "operator export handoff skipped: no selected run."]
      }));
      return;
    }
    const result = await exportOperatorHandoffBridge({
      type: "operator.exportHandoff",
      runId,
      branch: currentState.selectedBranch,
      target,
      format
    }).catch(() => null);
    if (!result?.ok || !result.exported) {
      set((state) => ({
        logs: [...state.logs, `operator export handoff skipped: ${target} ${format}`]
      }));
      return;
    }
    set((state) => ({
      logs: [
        ...state.logs,
        result.target === "clipboard"
          ? `operator export copied: ${result.format} ${result.bytes} bytes`
          : `operator export saved: ${result.filePath || result.fileName || result.format}`
      ]
    }));
    const operatorExport = await loadOperatorExport(get());
    set({ operatorExport });
  },
  repeatOperatorHandoff: async (handoffId, target) => {
    const normalizedId = String(handoffId || "").trim();
    if (!normalizedId) return;
    const result = await repeatOperatorHandoffBridge({
      type: "operator.repeatHandoff",
      handoffId: normalizedId,
      target
    }).catch(() => null);
    if (!result?.ok || !result.repeated) {
      set((state) => ({
        logs: [...state.logs, `operator handoff repeat failed: ${normalizedId}`]
      }));
      return;
    }
    set((state) => ({
      logs: [
        ...state.logs,
        result.filePath ? `operator handoff repeat saved: ${result.filePath}` : `operator handoff repeat copied: ${normalizedId}`
      ]
    }));
    const operatorExport = await loadOperatorExport(get());
    set({ operatorExport });
  },
  setOperatorHandoffStatus: async (handoffId, status) => {
    const normalizedId = String(handoffId || "").trim();
    if (!normalizedId) return;
    const result = await updateOperatorHandoffStatusBridge({
      type: "operator.updateHandoffStatus",
      handoffId: normalizedId,
      status
    }).catch(() => null);
    if (!result?.ok || !result.handoff) {
      set((state) => ({
        logs: [...state.logs, `operator handoff status update failed: ${normalizedId}`]
      }));
      return;
    }
    set((state) => ({
      logs: [...state.logs, `operator handoff status updated: ${normalizedId} -> ${status}`]
    }));
    const operatorExport = await loadOperatorExport(get());
    set({ operatorExport });
  },
  jumpToSearchResult: (docId) => {
    const currentState = get();
    const hit = currentState.searchResults.find((item) => item.docId === docId);
    if (!hit) return;
    const nextTask = hit.jumpTarget.task;
    set((state) => {
      const nextState = {
        ...state,
        activeTask: nextTask
      };
      const projection = projectTaskState(nextState);
      return {
        activeTask: nextTask,
        activeFocus: {
          task: nextTask,
          rowId: hit.jumpTarget.rowId || null,
          anchorId: hit.jumpTarget.anchorId || null,
          sectionKey: hit.jumpTarget.sectionKey || null,
          lineIndex: typeof hit.jumpTarget.lineIndex === "number" ? hit.jumpTarget.lineIndex : null
        },
        activeRightPanelTab: hit.jumpTarget.panel || state.activeRightPanelTab,
        metrics: projection.metrics,
        evidenceLines: projection.evidenceLines,
        opsLines: projection.opsLines,
        validationLines: projection.validationLines,
        logs: projection.logs
      };
    });
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

    const [liveBundleResponse, context, bridgeRuntime, bridgeSummary] = await Promise.all([
      fetchLiveReadBundleBridge({
        type: "provider.fetchLiveReadBundle",
        context: {
          runId: initialRunContext.id,
          branch: selectedBranch,
          startDate: selectedRange.startDate,
          endDate: selectedRange.endDate,
          requestedAt: initialRunContext.requestedAt,
          runtimeMode: initialRunContext.runtimeMode,
          sourceProvider: initialRunContext.sourceProvider
        }
      }).catch(() => null),
      getBridgeContext().catch(() => null),
      getBridgeRuntime().catch(() => null),
      getBridgeSummary().catch(() => null)
    ]);

    const liveBundle = liveBundleResponse?.payload || null;
    const liveSheetSnapshot = liveBundle?.sheet
      ? liveBundle.sheet
      : await fetchSheetSnapshotBridge({
          type: "provider.fetchSheetSnapshot",
          query: {
            ...selectedRange,
            branch: selectedBranch,
            runId: initialRunContext.id
          }
        }).catch(() => null);

    const providerRowResponses = liveBundle
      ? [liveBundle.providerRows["naver-partner"], liveBundle.providerRows["admin-station"]]
      : await Promise.all([
          fetchProviderRows({
            type: "provider.fetchRows",
            provider: "naver-partner",
            query: {
              ...selectedRange,
              branch: selectedBranch,
              runId: initialRunContext.id
            }
          }).catch(() => null),
          fetchProviderRows({
            type: "provider.fetchRows",
            provider: "admin-station",
            query: {
              ...selectedRange,
              branch: selectedBranch,
              runId: initialRunContext.id
            }
          }).catch(() => null)
        ]);
    const liveReservationResponse = liveBundle
      ? liveBundle.reservations
      : await fetchProviderReservations({
          type: "provider.fetchReservations",
          provider: "wings-pms",
          query: {
            ...selectedRange,
            branch: selectedBranch,
            runId: initialRunContext.id
          }
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
      providerRowResponses.some((response) => isLiveSourceAvailable(response?.source));

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
        isLiveSourceAvailable(liveReservationResponse?.source),
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
            : "offline-preview",
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
    const recommendationTraces = await loadRecommendationState(sheetRead, selectedBranch);
    const operatorExport = await loadOperatorExport({
      ...currentState,
      sheetRead,
      termBindings: bindingDraft.termBindings,
      unresolvedBindings: bindingDraft.unresolvedBindings,
      recommendationTraces
    });

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
      activeRunContext:
        liveBundle?.context
          ? {
              id: liveBundle.context.runId,
              branch: selectedBranch,
              startDate: liveBundle.context.startDate,
              endDate: liveBundle.context.endDate,
              runtimeMode: currentState.runtimeMode,
              requestedAt: liveBundle.context.requestedAt,
              sourceProvider: liveBundle.context.sourceProvider || context?.provider || null
            }
          : {
              ...initialRunContext,
              sourceProvider: context?.provider || null
            },
      inventoryCompare: snapshot,
      sheetRead,
      manualScanAnchor: loadedManualScanAnchor,
      manualScanAnchorDraft: loadedManualScanAnchor?.scan || {},
      sheetTerms: bindingDraft.sheetTerms,
      termBindings: bindingDraft.termBindings,
      unresolvedBindings: bindingDraft.unresolvedBindings,
      recommendationTraces,
      operatorExport,
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
      recommendationTraces,
      operatorExport,
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
