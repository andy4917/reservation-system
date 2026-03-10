(() => {
  "use strict";

  const root = globalThis;
  const App = (root.App = root.App || {});
  App.ui = App.ui || {};
  const ns = (App.ui.workspacePolicy = App.ui.workspacePolicy || {});

  const normalizeText = App.scan?.normalize?.normalizeText || ((value) => String(value ?? "").trim());

  function capabilityUiStatus({ capabilityKey, productFlow, contextSiteName }) {
    const capability = productFlow?.capabilities?.[capabilityKey];
    if (!capability) {
      return {
        label: "GUARD",
        className: "guard",
        summary: "지원 정책을 다시 확인하세요."
      };
    }
    if (capability.ready === true) {
      return {
        label: "READY",
        className: "ready",
        summary:
          capabilityKey === "provider-session"
            ? "현재 호스트 세션이 확인되어 작업면에 진입할 수 있습니다."
            : "현재 워크플로에서 바로 사용할 수 있습니다."
      };
    }
    if (capabilityKey === "provider-session") {
      return {
        label: "BLOCKED",
        className: "blocked",
        summary: `${normalizeText(contextSiteName) || "현재"} 관리자 페이지 로그인 상태를 먼저 확인하세요.`
      };
    }
    if (capability.configured !== true) {
      return {
        label: "GUARD",
        className: "guard",
        summary: "직접 시작 호스트가 아니며 Utility > Settings에서 설정이 필요합니다."
      };
    }
    return {
      label: "GUARD",
      className: "guard",
      summary: "설정은 있으나 인증 정보가 준비되지 않았습니다."
    };
  }

  function buildPolicyItemHtml(label, status, body, escapeHtml) {
    return (
      `<div class="policy-item">` +
      `<div class="policy-item-head">` +
      `<span>${escapeHtml(label)}</span>` +
      `<span class="policy-item-status ${escapeHtml(status.className)}">${escapeHtml(status.label)}</span>` +
      `</div>` +
      `<div class="policy-item-body">${escapeHtml(body)}</div>` +
      `</div>`
    );
  }

  function renderSupportPolicySurface({
    ui,
    state,
    context,
    escapeHtml,
    directEntryHostLabelsText,
    capabilityUiStatus: resolveCapabilityUiStatus
  }) {
    const directHosts = directEntryHostLabelsText();
    const providerStatus = resolveCapabilityUiStatus("provider-session");
    const sheetsStatus = resolveCapabilityUiStatus("sheets");
    const wingsStatus = resolveCapabilityUiStatus("wings");
    const items = [
      buildPolicyItemHtml(
        "Direct Entry Hosts",
        { label: "READY", className: "ready" },
        `${directHosts}에서만 직접 시작할 수 있습니다. Google Sheets는 보조 연동 서비스입니다.`,
        escapeHtml
      ),
      buildPolicyItemHtml("Provider Session", providerStatus, providerStatus.summary, escapeHtml),
      buildPolicyItemHtml("Google Sheets", sheetsStatus, sheetsStatus.summary, escapeHtml),
      buildPolicyItemHtml("WINGS/PMS", wingsStatus, wingsStatus.summary, escapeHtml)
    ].join("");

    if (ui.supportPolicyList) ui.supportPolicyList.innerHTML = items;
    if (ui.flowGateSupportList) ui.flowGateSupportList.innerHTML = items;
    if (ui.supportPolicySummary) {
      ui.supportPolicySummary.textContent =
        state.productFlow?.workspaceAccess === true
          ? `직접 시작은 ${directHosts}에서 허용됩니다. Google Sheets는 Utility 설정을 거쳐 보조 연동으로 사용합니다.`
          : `${context.siteName} 세션을 확인한 뒤 작업면에 진입합니다.`;
    }
  }

  function activeFlowGate({ productFlow, contextSiteName, taskAccess }) {
    if (productFlow?.workspaceAccess !== true) {
      return {
        kicker: "Start Gate",
        title: `${contextSiteName} 세션 확인 필요`,
        summary: `확장 아이콘으로만 시작할 수 있습니다. ${contextSiteName} 관리자 페이지 로그인 상태를 확인한 뒤 상태를 다시 확인하세요.`,
        utilityLabel: "지원 정책 보기",
        utilityTab: "scope"
      };
    }
    if (!taskAccess?.blocked) return null;
    if (taskAccess.reason === "sheets") {
      return {
        kicker: "Task Guard",
        title: "Google Sheets 설정 필요",
        summary: "Sheet Mapping과 시트 비교 플로우는 Google Sheets 설정과 인증이 준비된 뒤에만 열립니다.",
        utilityLabel: "Utility > Settings",
        utilityTab: "settings"
      };
    }
    if (taskAccess.reason === "wings") {
      return {
        kicker: "Task Guard",
        title: "WINGS/PMS 설정 필요",
        summary: "Reservation Validation과 OTA/PMS Audit는 WINGS/PMS 조회 URL과 인증 번들이 준비된 뒤에만 진입할 수 있습니다.",
        utilityLabel: "Utility > Settings",
        utilityTab: "settings"
      };
    }
    if (taskAccess.reason === "host-scope") {
      const entryHostLabel = normalizeText(productFlow?.entryHost?.directEntryLabel || contextSiteName);
      return {
        kicker: "Task Guard",
        title: "현재 시작 호스트에서는 이 Task를 열 수 없음",
        summary: `${entryHostLabel} 시작 호스트에서는 현재 세션 캡처와 설정 정리까지만 직접 지원합니다. 실행이 필요한 Task는 Naver 또는 Station 관리자 페이지에서 이어서 여세요.`,
        utilityLabel: "Utility > Settings",
        utilityTab: "settings"
      };
    }
    return null;
  }

  function resolveBlockedTaskSurface({ productFlow, taskAccess }) {
    if (productFlow?.workspaceAccess !== true) {
      return {
        secondarySurfaceKind: "utility",
        activeUtilityTab: "scope"
      };
    }
    if (!taskAccess?.blocked) return null;
    return {
      secondarySurfaceKind: "utility",
      activeUtilityTab: normalizeText(taskAccess.utilityTab || "settings").toLowerCase() || "settings"
    };
  }

  function preferredEvidenceTabForTask({ taskId, syncPreviewErrorCount }) {
    const task = normalizeText(taskId || "").toUpperCase();
    if (task === "PMS_RESERVATION_VALIDATION") return "validation";
    if (task === "OTA_PMS_COMPARISON") return "validation";
    if (task === "SHEET_MAPPING_REVIEW") return "trace";
    if (Number(syncPreviewErrorCount || 0) > 0) return "blocking";
    return "result";
  }

  function preferredUtilityTabForTask({ taskId, currentTaskFlowAccess }) {
    const task = normalizeText(taskId || "").toUpperCase();
    const taskAccess = currentTaskFlowAccess(task);
    if (taskAccess.blocked) return normalizeText(taskAccess.utilityTab || "settings").toLowerCase() || "settings";
    if (task === "SHEET_MAPPING_REVIEW") return "settings";
    if (task === "PMS_RESERVATION_VALIDATION" || task === "OTA_PMS_COMPARISON") return "ops";
    return "scope";
  }

  function resolveTaskSurfaceSelection({
    taskId,
    options = {},
    hasSelectedRange,
    preferredEvidenceTab,
    preferredUtilityTab
  }) {
    const task = normalizeText(taskId || "").toUpperCase() || "NAVER_STATION_SYNC";
    const utilityTab = normalizeText(preferredUtilityTab || "scope").toLowerCase() || "scope";
    const evidenceTab = normalizeText(preferredEvidenceTab || "result").toLowerCase() || "result";
    if (options.openSettings === true) {
      return {
        taskId: task,
        secondarySurfaceKind: "utility",
        activeUtilityTab: "settings",
        lastUtilityTab: utilityTab,
        lastEvidenceTab: evidenceTab
      };
    }
    if (options.openScope === true || hasSelectedRange !== true) {
      return {
        taskId: task,
        secondarySurfaceKind: "utility",
        activeUtilityTab: "scope",
        lastUtilityTab: utilityTab,
        lastEvidenceTab: evidenceTab
      };
    }
    return {
      taskId: task,
      secondarySurfaceKind: "evidence",
      activeEvidenceTab: evidenceTab,
      lastUtilityTab: utilityTab,
      lastEvidenceTab: evidenceTab
    };
  }

  function resolveTaskGuideModel(input = {}) {
    const {
      taskId,
      secondarySurfaceKind,
      activeUtilityTab,
      selectedStart,
      selectedEnd,
      reservationCount,
      warnCount,
      failCount,
      anomalyCount,
      sheetRows,
      scanMode,
      mismatchCount,
      errorCount,
      hasLoadedBothInventoryForQuery,
      resolveActiveQuery
    } = input;
    const task = normalizeText(taskId || "").toUpperCase();

    if (task === "PMS_RESERVATION_VALIDATION") {
      return {
        title: "Reservation Validation",
        summary: `PMS 예약과 읽은 예약을 검증하고 anomaly, 누락, 분류 오류를 먼저 확인합니다. 예약 ${reservationCount}건 / 경고 ${warnCount}건 / 실패 ${failCount}건 / anomaly ${anomalyCount}건`,
        action: reservationCount > 0 ? "누락/분류 오류와 anomaly를 검토하세요." : "먼저 예약을 읽어 검증 기준을 만드세요.",
        primaryView: "검증 상태 / anomaly 요약",
        evidence: "Validation Basis",
        utility: "Ops",
        evidenceButton: "Evidence > Validation Basis",
        utilityButton: "Utility > Ops"
      };
    }
    if (task === "SHEET_MAPPING_REVIEW") {
      return {
        title: "Sheet Mapping",
        summary: `시트 구조, 좌표, 맵핑 규칙을 검토해 엔진 정합성을 유지합니다. 스캔 모드 ${scanMode} / 시트 행 ${sheetRows}건`,
        action: secondarySurfaceKind === "utility" && activeUtilityTab === "settings"
          ? "좌표와 맵핑 규칙을 검토하고 저장하세요."
          : "시트 구조와 맵핑 규칙의 정합성을 확인하세요.",
        primaryView: "시트 구조 / 맵핑 상태",
        evidence: "Trace / Log",
        utility: "Settings",
        evidenceButton: "Evidence > Trace / Log",
        utilityButton: "Utility > Settings"
      };
    }
    if (task === "OTA_PMS_COMPARISON") {
      return {
        title: "OTA/PMS Audit",
        summary: `OTA / PMS / Sheet를 교차 대조해 운영 리스크를 조기에 발견합니다. 예약 ${reservationCount}건 / 경고 ${warnCount}건 / 실패 ${failCount}건 / anomaly ${anomalyCount}건`,
        action: reservationCount > 0 ? "교차 대조 결과와 운영 리스크를 검토하세요." : "먼저 예약과 조회 데이터를 읽어 대조 근거를 확보하세요.",
        primaryView: "감사 요약 / 교차 검증 상태",
        evidence: "Validation Basis",
        utility: "Ops",
        evidenceButton: "Evidence > Validation Basis",
        utilityButton: "Utility > Ops"
      };
    }
    return {
      title: "Inventory",
      summary: `사이트와 시트 재고를 비교하고 불일치와 보정 미리보기를 검토합니다. 불일치 ${mismatchCount}건 / 차단 ${errorCount}건`,
      action: !selectedStart || !selectedEnd
        ? "먼저 범위를 선택하세요."
        : !hasLoadedBothInventoryForQuery(resolveActiveQuery())
          ? "사이트와 시트를 함께 조회해 비교 기준을 만드세요."
          : mismatchCount > 0
            ? "불일치와 보정 미리보기를 검토하세요."
            : "비교 결과를 확인하고 필요 시 보정 미리보기를 실행하세요.",
      primaryView: "사이트 vs 시트 비교 / 불일치 리뷰",
      evidence: errorCount > 0 ? "Blocking" : "Result",
      utility: "Scope",
      evidenceButton: errorCount > 0 ? "Evidence > Blocking" : "Evidence > Result",
      utilityButton: "Utility > Scope"
    };
  }

  function renderTaskGuideCard({ ui, model }) {
    if (!ui.taskGuideTitle || !ui.taskGuideSummary || !ui.taskGuideAction || !ui.taskGuidePrimaryView || !ui.taskGuideEvidence || !ui.taskGuideUtility) return;
    ui.taskGuideTitle.textContent = model.title;
    ui.taskGuideSummary.textContent = model.summary;
    ui.taskGuideAction.textContent = model.action;
    ui.taskGuidePrimaryView.textContent = model.primaryView;
    ui.taskGuideEvidence.textContent = model.evidence;
    ui.taskGuideUtility.textContent = model.utility;
    if (ui.taskGuideEvidenceBtn) ui.taskGuideEvidenceBtn.textContent = model.evidenceButton;
    if (ui.taskGuideUtilityBtn) ui.taskGuideUtilityBtn.textContent = model.utilityButton;
  }

  Object.assign(ns, {
    capabilityUiStatus,
    renderSupportPolicySurface,
    activeFlowGate,
    resolveBlockedTaskSurface,
    preferredEvidenceTabForTask,
    preferredUtilityTabForTask,
    resolveTaskSurfaceSelection,
    resolveTaskGuideModel,
    renderTaskGuideCard
  });
})();
