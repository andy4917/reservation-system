(() => {
  "use strict";

  const root = globalThis;
  const App = (root.App = root.App || {});
  App.ui = App.ui || {};
  const ns = (App.ui.appShell = App.ui.appShell || {});

  const normalizeText = App.scan?.normalize?.normalizeText || ((value) => String(value ?? "").trim());

  function currentCapabilityLabel({
    state,
    readOnlyToolMode,
    isCurrentProviderApplyAllowed
  }) {
    if (state.productFlow?.workspaceAccess !== true) return "세션 확인 필요";
    const taskAccess = state.currentTaskFlowAccess();
    if (taskAccess.blocked && taskAccess.reason === "host-scope") return "호스트 가드";
    if (taskAccess.blocked && taskAccess.reason === "sheets") return "시트 가드";
    if (taskAccess.blocked && taskAccess.reason === "wings") return "PMS 가드";
    if (readOnlyToolMode === true) return "읽기 전용 / 비교 가능";
    if (!isCurrentProviderApplyAllowed()) return "비교 가능 / 반영 차단";
    if (Boolean(state.syncPreview?.policy?.blocked)) return "비교 가능 / 검토 차단";
    return "반영 가능";
  }

  function nextActionLabel({
    state,
    ui,
    text,
    hasLoadedBothInventoryForQuery,
    resolveActiveQuery
  }) {
    const query = resolveActiveQuery();
    const task = normalizeText(state.activeTask || "").toUpperCase();
    const taskAccess = state.currentTaskFlowAccess(task);
    if (state.loading) return "처리 중";
    if (state.productFlow?.workspaceAccess !== true) return "로그인 확인";
    if (taskAccess.blocked && taskAccess.reason === "host-scope") return "호스트 전환";
    if (taskAccess.blocked && taskAccess.reason === "sheets") return "시트 설정";
    if (taskAccess.blocked && taskAccess.reason === "wings") return "PMS 설정";
    if (!state.selectedStart || !state.selectedEnd) return "범위 선택";
    if (task === "SHEET_MAPPING_REVIEW") {
      return state.secondarySurfaceKind === "utility" && state.activeUtilityTab === "settings" ? "설정 저장" : "시트 검토";
    }
    if (task === "PMS_RESERVATION_VALIDATION" || task === "OTA_PMS_COMPARISON") {
      return state.providerReservations.length > 0 ? "차이 검토" : "예약 읽기";
    }
    if (!hasLoadedBothInventoryForQuery(query)) return text.loadAll;
    return normalizeText(ui.syncBtnLabel?.textContent || "") || text.syncRun;
  }

  function currentRangeSourceLabel({ state }) {
    if (state.rangeSource === "host") {
      if (state.rangeSourceDetail === "url") return "호스트(URL)";
      if (state.rangeSourceDetail === "dom") return "호스트(DOM)";
      return "호스트";
    }
    return "셸";
  }

  function renderHostContextBar({
    ui,
    state,
    context,
    resolveContextEntityText,
    currentCapabilityLabel
  }) {
    if (!ui.contextHostBadge || !ui.contextEntityName || !ui.contextConnectionStatus || !ui.contextPermissionState || !ui.contextLastRun) return;
    ui.contextHostBadge.textContent =
      context.providerType === "admin-station"
        ? "STATION"
        : context.providerType === "wings-pms"
          ? "WINGS"
          : "NAVER";
    ui.contextEntityName.textContent = resolveContextEntityText();
    ui.contextPermissionState.textContent = currentCapabilityLabel();
    ui.contextConnectionStatus.textContent =
      state.loading ? "조회 중" :
      state.lastStatusTone === "error" ? "연결 주의" :
      state.lastStatusTone === "warn" ? "검토 주의" :
      "연결됨";
    ui.contextLastRun.textContent =
      `Last Query ${state.lastActionTimes.query} / Compare ${state.lastActionTimes.comparison} / Apply ${state.lastActionTimes.application}`;
  }

  function renderFlowGateCard({ ui, activeFlowGate }) {
    const gate = activeFlowGate();
    if (ui.flowGateCard) ui.flowGateCard.classList.toggle("hidden", !gate);
    if (!gate) return;
    if (ui.flowGateKicker) ui.flowGateKicker.textContent = gate.kicker;
    if (ui.flowGateTitle) ui.flowGateTitle.textContent = gate.title;
    if (ui.flowGateSummary) ui.flowGateSummary.textContent = gate.summary;
    if (ui.flowGateUtilityBtn) ui.flowGateUtilityBtn.textContent = gate.utilityLabel;
  }

  function renderWorkspaceShellState({
    ui,
    state,
    syncDerivedSurfaceState,
    taskClassById,
    taskLabelById,
    renderTaskGuideCard,
    renderFlowGateCard,
    syncViewportFitMode,
    renderHostContextBar
  }) {
    if (!ui.wrap) return;
    syncDerivedSurfaceState();
    const workspaceBlocked = state.productFlow?.workspaceAccess !== true;
    const taskFlowAccess = state.currentTaskFlowAccess();
    const taskGuarded = !workspaceBlocked && taskFlowAccess.blocked === true;
    const showMainWorkspace = !workspaceBlocked && !taskGuarded;
    const showVerification = ["PMS_RESERVATION_VALIDATION", "OTA_PMS_COMPARISON"].includes(normalizeText(state.activeTask || "").toUpperCase());
    if (!showVerification && state.secondarySurfaceKind === "evidence" && state.activeEvidenceTab === "validation") {
      state.activeEvidenceTab = "result";
      state.lastEvidenceTab = "result";
      syncDerivedSurfaceState();
    }
    ui.wrap.classList.remove("task-inventory", "task-reservation", "task-sheet", "task-audit", "scope-open", "utility-open", "secondary-evidence", "secondary-utility");
    ui.wrap.classList.add(taskClassById(state.activeTask));
    ui.wrap.classList.add("sidebar-docked");
    ui.wrap.classList.toggle("workspace-blocked", workspaceBlocked || taskGuarded);
    ui.wrap.classList.toggle("scope-open", state.scopeDrawerOpen);
    ui.wrap.classList.toggle("utility-open", state.secondarySurfaceKind === "utility");
    ui.wrap.classList.toggle("secondary-evidence", state.secondarySurfaceKind === "evidence");
    ui.wrap.classList.toggle("secondary-utility", state.secondarySurfaceKind === "utility");
    ui.wrap.classList.toggle("panel-open", state.isPanelVisible());

    if (ui.evidenceSurface) ui.evidenceSurface.classList.toggle("is-active", state.secondarySurfaceKind === "evidence");
    if (ui.utilitySurface) ui.utilitySurface.classList.toggle("is-active", state.secondarySurfaceKind === "utility");
    if (ui.scopeToggleBtn) ui.scopeToggleBtn.textContent = state.secondarySurfaceKind === "utility" && state.activeUtilityTab === "scope" ? "범위 닫기" : "범위";
    if (ui.toggleConfig) ui.toggleConfig.textContent = state.secondarySurfaceKind === "utility" ? "Utility 닫기" : "Utility";
    if (ui.workspaceTaskPill) ui.workspaceTaskPill.textContent = taskLabelById(state.activeTask);
    if (ui.workspaceContextSummary) {
      ui.workspaceContextSummary.textContent = `현재 단계: ${state.stepLabelText()} / 기간 기준: ${state.currentRangeSourceLabel()} / 다음 행동: ${state.nextActionLabel()} / Density ${state.densityMode} / Width ${state.panelWidthMode}`;
    }
    renderTaskGuideCard();
    renderFlowGateCard();

    const navItems = state.getTaskNavItems();
    navItems.forEach(([btn, taskId]) => {
      const taskAccess = state.productFlow?.tasks?.[taskId] || { blocked: false };
      btn?.classList.toggle("is-active", normalizeText(state.activeTask || "").toUpperCase() === taskId);
      if (btn) btn.disabled = workspaceBlocked ? false : taskAccess.blocked === true;
    });

    [
      [ui.workspaceFlow, showMainWorkspace],
      [ui.status, showMainWorkspace],
      [ui.readOnlyNotice, showMainWorkspace],
      [ui.primarySummary, showMainWorkspace],
      [ui.userOpsSummary, showMainWorkspace],
      [ui.userOpsHint, showMainWorkspace],
      [ui.taskGuideCard, showMainWorkspace],
      [ui.severityBanner, showMainWorkspace && !ui.severityBanner?.classList.contains("hidden")],
      [ui.workspaceActionPrimary, showMainWorkspace],
      [ui.workspaceActionSecondary, showMainWorkspace],
      [ui.reviewSection, showMainWorkspace],
      [ui.comparisonSection, showMainWorkspace]
    ].forEach(([el, visible]) => {
      if (!el) return;
      if (el === ui.severityBanner) {
        el.classList.toggle("hidden", !visible);
        return;
      }
      el.classList.toggle("hidden", !visible);
    });

    [
      [ui.evidenceResultTabBtn, "result", state.activeEvidenceTab, state.secondarySurfaceKind],
      [ui.evidenceBlockingTabBtn, "blocking", state.activeEvidenceTab, state.secondarySurfaceKind],
      [ui.evidenceValidationTabBtn, "validation", state.activeEvidenceTab, state.secondarySurfaceKind],
      [ui.evidenceTraceTabBtn, "trace", state.activeEvidenceTab, state.secondarySurfaceKind],
      [ui.evidenceExportTabBtn, "export", state.activeEvidenceTab, state.secondarySurfaceKind]
    ].forEach(([btn, tabId, activeTab, kind]) => btn?.classList.toggle("is-active", kind === "evidence" && activeTab === tabId));
    [
      [ui.utilityScopeTabBtn, "scope", state.activeUtilityTab, state.secondarySurfaceKind],
      [ui.utilitySettingsTabBtn, "settings", state.activeUtilityTab, state.secondarySurfaceKind],
      [ui.utilityOpsTabBtn, "ops", state.activeUtilityTab, state.secondarySurfaceKind],
      [ui.utilityDebugTabBtn, "debug", state.activeUtilityTab, state.secondarySurfaceKind]
    ].forEach(([btn, tabId, activeTab, kind]) => btn?.classList.toggle("is-active", kind === "utility" && activeTab === tabId));

    [
      [ui.evidenceResultPanel, state.secondarySurfaceKind === "evidence" && state.activeEvidenceTab === "result"],
      [ui.evidenceBlockingPanel, state.secondarySurfaceKind === "evidence" && state.activeEvidenceTab === "blocking"],
      [ui.evidenceValidationPanel, state.secondarySurfaceKind === "evidence" && state.activeEvidenceTab === "validation"],
      [ui.evidenceTracePanel, state.secondarySurfaceKind === "evidence" && state.activeEvidenceTab === "trace"],
      [ui.evidenceExportPanel, state.secondarySurfaceKind === "evidence" && state.activeEvidenceTab === "export"],
      [ui.utilityScopePanel, state.secondarySurfaceKind === "utility" && state.activeUtilityTab === "scope"],
      [ui.utilitySettingsPanel, state.secondarySurfaceKind === "utility" && state.activeUtilityTab === "settings"],
      [ui.utilityOpsPanel, state.secondarySurfaceKind === "utility" && state.activeUtilityTab === "ops"],
      [ui.utilityDebugPanel, state.secondarySurfaceKind === "utility" && state.activeUtilityTab === "debug"]
    ].forEach(([el, visible]) => el?.classList.toggle("hidden", !visible));

    if (ui.evidenceValidationTabBtn) ui.evidenceValidationTabBtn.classList.toggle("hidden", !showVerification);
    const showResults = state.syncResultVisible === true || Number(state.syncPreview?.errorCount || 0) > 0 || state.activeEvidenceTab === "result";
    if (ui.syncResultWrap) ui.syncResultWrap.classList.toggle("hidden", !showResults);
    if (ui.flowGateCard) ui.flowGateCard.classList.toggle("hidden", !(workspaceBlocked || taskGuarded));
    syncViewportFitMode();
    renderHostContextBar();
  }

  Object.assign(ns, {
    currentCapabilityLabel,
    nextActionLabel,
    currentRangeSourceLabel,
    renderHostContextBar,
    renderFlowGateCard,
    renderWorkspaceShellState
  });
})();
