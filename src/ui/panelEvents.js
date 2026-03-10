(() => {
  const App = (globalThis.App = globalThis.App || {});
  App.ui = App.ui || {};

  function bindPanelEvents({ ui, state, context, actions = {}, windowRef = globalThis, navigatorRef = globalThis.navigator } = {}) {
    const taskRegistry = globalThis.App?.ui?.taskRegistry || {};
    const {
      TEXT,
      PREF_KEY,
      isPanelVisible,
      setPanelOpen,
      applyProviderTheme,
      setCorrectionsApplied,
      renderSyncResult,
      setSyncResultVisible,
      setSettingsOpen,
      setErrorExpanded,
      setDebugExpanded,
      setDebugDetails,
      loadSyncApplyEnabled,
      storageGet,
      updateSyncButtonText,
      isDate,
      fromDateKey,
      monthStart,
      loadSyncConfig,
      writeSyncConfigToUI,
      setEmbeddedAuthUiState,
      setSecretsMasked,
      applySyncFeatureUiState,
      updateSyncApprovalUi,
      getEmbeddedAuthMissingFields,
      setStatus,
      renderCalendar,
      renderSummary,
      renderSiteValueTable,
      renderSheetValueTable,
      clearSheetInsightPanel,
      renderMismatchRows,
      createVerificationReport,
      renderInventoryVerification,
      updateCorrectionButtonState,
      renderWorkflowProgress,
      renderUserOpsSummary,
      renderOpsMetaSummary,
      setActiveTask,
      setFitMode,
      setPanelWidthMode,
      setScopeDrawerOpen,
      openEvidenceTab,
      openUtilityTab,
      openTaskEvidenceSurface,
      openTaskUtilitySurface,
      syncSelectedRangeFromHost,
      refreshProductFlowState,
      renderWorkspaceShellState,
      syncViewportFitMode,
      applyQuickRange,
      setLoadingAction,
      loadInventory,
      loadAllInventory,
      loadSheetInventory,
      applyAutoCorrectionsToLoadedValues,
      downloadCorrectionDiffCsv,
      downloadUnknownColorCsv,
      copySiteValuesOnly,
      copySheetValuesOnly,
      persistSyncConfig,
      clearMismatchView,
      resolveActiveQuery,
      isSyncApplyEnabled,
      setSyncFeatureEnabled,
      setOpsSectionExpanded,
      updateScanModeUiState,
      renderManualRangePreview,
      readPmsPresetFromUI,
      normalizeText,
      getFieldValue,
      setFieldValue,
      renderPmsPresetPreview,
      applyPmsPresetTemplate,
      applyPmsHarTemplate,
      buildManualRangesTextFromSnapshot,
      captureProviderAuthBundle,
      formatAuthBundleForTextarea,
      clearRuntimeArtifacts,
      downloadTracePacketsJson,
      downloadTracePacketsCsv,
      downloadGoldenSetBundle,
      runSheetSync,
      goPrevMonth,
      goNextMonth,
      resetDateRange
    } = actions;
    const tableBodies = [ui.siteBody, ui.sheetBody, ui.insightBody].filter(Boolean);
    const focusedCellByBody = new WeakMap();
    const focusedRowByBody = new WeakMap();
    let softFocusTimer = 0;
    let softFocusEl = null;

    function flashSoftFocus(targetEl) {
      if (!targetEl || typeof targetEl.classList?.add !== "function") return;
      if (softFocusTimer) {
        windowRef.clearTimeout(softFocusTimer);
        softFocusTimer = 0;
      }
      if (softFocusEl && softFocusEl !== targetEl && typeof softFocusEl.classList?.remove === "function") {
        softFocusEl.classList.remove("soft-focus-highlight");
      }
      softFocusEl = targetEl;
      softFocusEl.classList.add("soft-focus-highlight");
      softFocusTimer = windowRef.setTimeout(() => {
        if (softFocusEl && typeof softFocusEl.classList?.remove === "function") {
          softFocusEl.classList.remove("soft-focus-highlight");
        }
        softFocusEl = null;
        softFocusTimer = 0;
      }, 820);
    }

    function setTableCellSoftFocus(bodyEl, cellEl) {
      if (!bodyEl || !cellEl || !bodyEl.contains(cellEl)) return;
      const prevCell = focusedCellByBody.get(bodyEl);
      if (prevCell && prevCell !== cellEl && typeof prevCell.classList?.remove === "function") {
        prevCell.classList.remove("cell-soft-focus");
      }
      const prevRow = focusedRowByBody.get(bodyEl);
      const nextRow = typeof cellEl.closest === "function" ? cellEl.closest("tr") : null;
      if (prevRow && prevRow !== nextRow && typeof prevRow.classList?.remove === "function") {
        prevRow.classList.remove("row-soft-focus");
      }
      cellEl.classList.add("cell-soft-focus");
      if (nextRow) nextRow.classList.add("row-soft-focus");
      focusedCellByBody.set(bodyEl, cellEl);
      if (nextRow) focusedRowByBody.set(bodyEl, nextRow);
      flashSoftFocus(cellEl);
    }

    async function ensureStarted() {
      if (state.bootstrapped) {
        await refreshProductFlowState({ render: false });
        renderWorkspaceShellState();
        return;
      }
      state.bootstrapped = true;
      applyProviderTheme();
      const titleText =
        context.providerType === "naver-partner"
          ? TEXT.titleNaver
          : context.providerType === "admin-station"
            ? TEXT.titleStation
            : "WINGS PMS";
      ui.panelTitle.textContent = titleText;
      ui.siteLabel.textContent = `${TEXT.sitePrefix} ${context.siteName}`;
      setCorrectionsApplied(false);
      state.syncPreview = { mismatchCount: 0 };
      renderSyncResult({ totalCount: 0, successCount: 0, failCount: 0, closedCount: 0, errors: [] });
      setSyncResultVisible(false);
      setSettingsOpen(false);
      setErrorExpanded(false);
      setDebugExpanded(false);
      setDebugDetails("-");
      state.syncApplyEnabled = await loadSyncApplyEnabled();
      updateSyncButtonText();

      const pref = await storageGet(PREF_KEY);
      if (isDate(pref?.startDate) && isDate(pref?.endDate) && pref.startDate <= pref.endDate) {
        state.selectedStart = pref.startDate;
        state.selectedEnd = pref.endDate;
        const startDate = fromDateKey(pref.startDate);
        if (startDate) state.monthCursor = monthStart(startDate);
      }
      syncSelectedRangeFromHost({ emit: false, silent: true });

      state.syncConfig = await loadSyncConfig();
      writeSyncConfigToUI(state.syncConfig);
      setEmbeddedAuthUiState();
      setSecretsMasked(state.secretsMasked);
      applySyncFeatureUiState();
      updateSyncApprovalUi({ reset: true });
      await refreshProductFlowState({ render: false });
      const missingAuth = getEmbeddedAuthMissingFields(state.syncConfig);
      if (missingAuth.length > 0) {
        setStatus(`내장 인증 누락 항목: ${missingAuth.join(", ")}`, "error");
      }

      renderCalendar();
      renderSummary([]);
      renderSiteValueTable([], []);
      renderSheetValueTable([], []);
      clearSheetInsightPanel();
      renderMismatchRows([], null);
      state.verificationReport = createVerificationReport();
      renderInventoryVerification(state.verificationReport);
      updateCorrectionButtonState();
      renderWorkflowProgress();
      renderUserOpsSummary();
      renderOpsMetaSummary();
      renderWorkspaceShellState();
      if (missingAuth.length <= 0) {
        setStatus(TEXT.selectHint);
      }
    }

    async function onApplyCorrectionClick() {
      await ensureStarted();
      if ((ui.applyCorrectionBtn && ui.applyCorrectionBtn.disabled) || state.loading) return;
      applyAutoCorrectionsToLoadedValues();
    }

    async function openTaskWorkspace(taskId, options = {}) {
      await ensureStarted();
      syncSelectedRangeFromHost({ emit: false, silent: true });
      setActiveTask(taskId, {
        openPanel: false,
        openSettings: options.openSettings === true,
        openScope: options.openScope === true
      });
      if (options.openScope === true) openUtilityTab?.("scope");
      else if (options.openSettings === true) openUtilityTab?.("settings");
      else if (!state.selectedStart || !state.selectedEnd) openUtilityTab?.("scope");
      else openTaskEvidenceSurface?.(taskId);
      setPanelOpen(true);
      windowRef.requestAnimationFrame(() => {
        const targetEl =
          options.openSettings === true ? (ui.utilitySettingsPanel || ui.toggleConfig) :
          options.openScope === true ? (ui.utilityScopePanel || ui.scopeToggleBtn) :
          ui.panelHeader || ui.panel;
        flashSoftFocus(targetEl);
      });
    }

    ui.close.addEventListener("click", () => {
      setPanelOpen(false);
    });
    ui.backdrop.addEventListener("click", () => {
      setPanelOpen(false);
    });
    const navEntries =
      typeof taskRegistry.listTaskMetas === "function"
        ? taskRegistry.listTaskMetas().map((task) => [ui[task.buttonId], task.id, { ...(task.defaultOpen || {}) }])
        : [
            [ui.taskNavInventoryBtn, "NAVER_STATION_SYNC", { openScope: true }],
            [ui.taskNavReservationBtn, "PMS_RESERVATION_VALIDATION", { openScope: false }],
            [ui.taskNavSheetBtn, "SHEET_MAPPING_REVIEW", { openSettings: true, openScope: false }],
            [ui.taskNavAuditBtn, "OTA_PMS_COMPARISON", { openScope: false }]
          ];
    navEntries.forEach(([btn, taskId, options]) => {
      if (!btn) return;
      btn.addEventListener("click", async () => {
        if (btn.disabled) return;
        await openTaskWorkspace(taskId, options);
      });
    });
    if (ui.scopeToggleBtn) {
      ui.scopeToggleBtn.addEventListener("click", async () => {
        await ensureStarted();
        setScopeDrawerOpen(!state.scopeDrawerOpen);
        if (state.scopeDrawerOpen) {
          flashSoftFocus(ui.scopeDrawer || ui.scopeToggleBtn);
        }
      });
    }
    [
      [ui.evidenceResultTabBtn, () => openEvidenceTab?.("result"), ui.evidenceResultPanel],
      [ui.evidenceBlockingTabBtn, () => openEvidenceTab?.("blocking"), ui.evidenceBlockingPanel],
      [ui.evidenceValidationTabBtn, () => openEvidenceTab?.("validation"), ui.evidenceValidationPanel],
      [ui.evidenceTraceTabBtn, () => openEvidenceTab?.("trace"), ui.evidenceTracePanel],
      [ui.evidenceExportTabBtn, () => openEvidenceTab?.("export"), ui.evidenceExportPanel],
      [ui.utilityScopeTabBtn, () => openUtilityTab?.("scope"), ui.utilityScopePanel],
      [ui.utilitySettingsTabBtn, () => openUtilityTab?.("settings"), ui.utilitySettingsPanel],
      [ui.utilityOpsTabBtn, () => openUtilityTab?.("ops"), ui.utilityOpsPanel],
      [ui.utilityDebugTabBtn, () => openUtilityTab?.("debug"), ui.utilityDebugPanel]
    ].forEach(([btn, onOpen, targetEl]) => {
      if (!btn) return;
      btn.addEventListener("click", async () => {
        await ensureStarted();
        onOpen?.();
        setPanelOpen(true);
        windowRef.requestAnimationFrame(() => {
          flashSoftFocus(targetEl || btn);
        });
      });
    });
    if (ui.taskGuideEvidenceBtn) {
      ui.taskGuideEvidenceBtn.addEventListener("click", async () => {
        await ensureStarted();
        openTaskEvidenceSurface?.(state.activeTask);
        setPanelOpen(true);
        windowRef.requestAnimationFrame(() => {
          flashSoftFocus(ui.evidenceSurface || ui.secondarySurface || ui.taskGuideEvidenceBtn);
        });
      });
    }
    if (ui.taskGuideUtilityBtn) {
      ui.taskGuideUtilityBtn.addEventListener("click", async () => {
        await ensureStarted();
        openTaskUtilitySurface?.(state.activeTask);
        setPanelOpen(true);
        windowRef.requestAnimationFrame(() => {
          flashSoftFocus(ui.utilitySurface || ui.secondarySurface || ui.taskGuideUtilityBtn);
        });
      });
    }
    if (ui.flowGateUtilityBtn) {
      ui.flowGateUtilityBtn.addEventListener("click", async () => {
        await ensureStarted();
        const openSettings = state.productFlow?.workspaceAccess === true;
        openUtilityTab?.(openSettings ? "settings" : "scope");
        setPanelOpen(true);
        windowRef.requestAnimationFrame(() => {
          flashSoftFocus(openSettings ? (ui.utilitySettingsPanel || ui.flowGateUtilityBtn) : (ui.utilityScopePanel || ui.flowGateUtilityBtn));
        });
      });
    }
    if (ui.flowGateRefreshBtn) {
      ui.flowGateRefreshBtn.addEventListener("click", async () => {
        await ensureStarted();
        await refreshProductFlowState();
        flashSoftFocus(ui.flowGateCard || ui.flowGateRefreshBtn);
      });
    }
    [
      [ui.fitAutoBtn, "auto"],
      [ui.fitFocusBtn, "focus"],
      [ui.fitCompactBtn, "compact"]
    ].forEach(([btn, mode]) => {
      if (!btn) return;
      btn.addEventListener("click", async () => {
        await ensureStarted();
        setFitMode(mode);
      });
    });
    [
      [ui.widthCollapsedBtn, "collapsed"],
      [ui.widthStandardBtn, "standard"],
      [ui.widthExpandedBtn, "expanded"]
    ].forEach(([btn, mode]) => {
      if (!btn) return;
      btn.addEventListener("click", async () => {
        await ensureStarted();
        if (btn.classList.contains("is-disabled")) return;
        setPanelWidthMode(mode);
      });
    });
    windowRef.addEventListener("resize", () => {
      if (!isPanelVisible()) return;
      syncViewportFitMode();
    });
    windowRef.addEventListener("focus", () => {
      if (!state.bootstrapped) return;
      syncSelectedRangeFromHost({ emit: false, silent: true });
      void refreshProductFlowState();
    });
    windowRef.addEventListener("popstate", () => {
      if (!state.bootstrapped) return;
      syncSelectedRangeFromHost({ emit: false, silent: true });
    });
    windowRef.addEventListener("hashchange", () => {
      if (!state.bootstrapped) return;
      syncSelectedRangeFromHost({ emit: false, silent: true });
    });
    windowRef.addEventListener("keydown", (event) => {
      const panelOpen = isPanelVisible();
      if (event.key === "Escape" && panelOpen) {
        setPanelOpen(false);
        return;
      }
      if (!panelOpen) return;
      if (!event.altKey || event.ctrlKey || event.metaKey) return;
      const tagName = String(event?.target?.tagName || "").toLowerCase();
      const isEditableTarget = event?.target?.isContentEditable === true || ["input", "textarea", "select"].includes(tagName);
      if (isEditableTarget) return;
    });
    tableBodies.forEach((bodyEl) => {
      bodyEl.addEventListener("click", (event) => {
        const cell = event?.target?.closest?.("td");
        if (!cell || !bodyEl.contains(cell) || cell.classList.contains("room-col")) return;
        setTableCellSoftFocus(bodyEl, cell);
      });
    });

    ui.prevMonth.addEventListener("click", goPrevMonth);
    ui.nextMonth.addEventListener("click", goNextMonth);
    ui.resetDate.addEventListener("click", resetDateRange);
    if (ui.presetRange2d) {
      ui.presetRange2d.addEventListener("click", async () => {
        await ensureStarted();
        applyQuickRange("2d");
      });
    }
    if (ui.presetRange7d) {
      ui.presetRange7d.addEventListener("click", async () => {
        await ensureStarted();
        applyQuickRange("7d");
      });
    }
    if (ui.presetRangeMonth) {
      ui.presetRangeMonth.addEventListener("click", async () => {
        await ensureStarted();
        applyQuickRange("month");
      });
    }
    ui.load.addEventListener("click", async () => {
      await ensureStarted();
      setLoadingAction("site");
      try {
        await loadInventory();
      } finally {
        setLoadingAction("");
      }
    });
    if (ui.loadAll) {
      ui.loadAll.addEventListener("click", async () => {
        await ensureStarted();
        setLoadingAction("all");
        try {
          await loadAllInventory();
        } finally {
          setLoadingAction("");
        }
      });
    }
    ui.loadSheet.addEventListener("click", async () => {
      await ensureStarted();
      setLoadingAction("sheet");
      try {
        await loadSheetInventory();
      } finally {
        setLoadingAction("");
      }
    });
    if (ui.applyCorrectionSiteBtn) {
      ui.applyCorrectionSiteBtn.addEventListener("click", onApplyCorrectionClick);
    }
    ui.applyCorrectionBtn.addEventListener("click", onApplyCorrectionClick);
    ui.downloadCorrectionDiffBtn.addEventListener("click", async () => {
      await ensureStarted();
      if (ui.downloadCorrectionDiffBtn.disabled) return;
      downloadCorrectionDiffCsv();
    });
    ui.exportUnknownColorBtn.addEventListener("click", async () => {
      await ensureStarted();
      if (ui.exportUnknownColorBtn.disabled) return;
      downloadUnknownColorCsv();
    });
    ui.copySite.addEventListener("click", async () => {
      await ensureStarted();
      await copySiteValuesOnly();
    });
    ui.copySheet.addEventListener("click", async () => {
      await ensureStarted();
      await copySheetValuesOnly();
    });
    ui.saveSyncCfg.addEventListener("click", async () => {
      await ensureStarted();
      await persistSyncConfig(true);
      await refreshProductFlowState({ render: false });
      clearMismatchView(resolveActiveQuery());
      renderSyncResult({ totalCount: 0, successCount: 0, failCount: 0, closedCount: 0, errors: [] });
      setStatus(TEXT.statusSyncSavedNeedReload);
      ui.status.classList.add("ok");
    });
    if (ui.toggleSecretsBtn) {
      ui.toggleSecretsBtn.addEventListener("click", async () => {
        await ensureStarted();
        if (ui.toggleSecretsBtn.disabled) return;
        setSecretsMasked(!state.secretsMasked);
        setStatus(state.secretsMasked ? TEXT.secretMaskOn : TEXT.secretMaskOff);
        ui.status.classList.add("ok");
      });
    }
    ui.syncFeatureToggle.addEventListener("click", async () => {
      await ensureStarted();
      await setSyncFeatureEnabled(!isSyncApplyEnabled(), true);
    });
    if (ui.syncApprovalCheck) {
      ui.syncApprovalCheck.addEventListener("change", async () => {
        await ensureStarted();
        state.syncApprovalChecked = ui.syncApprovalCheck.checked === true;
        updateSyncButtonText();
        applySyncFeatureUiState();
      });
    }
    ui.toggleConfig.addEventListener("click", async () => {
      await ensureStarted();
      const utilityOpen = state.secondarySurfaceKind === "utility";
      if (utilityOpen) {
        openEvidenceTab?.(state.lastEvidenceTab || "result");
        flashSoftFocus(ui.evidenceSurface || ui.toggleConfig);
        return;
      }
      openUtilityTab?.(state.lastUtilityTab || "settings");
      flashSoftFocus(ui.utilitySurface || ui.toggleConfig);
    });
    ui.cfgScanMode.addEventListener("change", () => {
      updateScanModeUiState();
    });
    ui.cfgDateAnchorRow.addEventListener("input", () => {
      renderManualRangePreview();
    });
    ui.cfgManualRanges.addEventListener("input", () => {
      renderManualRangePreview();
    });
    if (ui.cfgPmsPresetKey) {
      ui.cfgPmsPresetKey.addEventListener("change", () => {
        const preset = readPmsPresetFromUI();
        if (preset.presetKey === "wings-global-guest-list" && !normalizeText(getFieldValue(ui.cfgPmsPageId))) {
          setFieldValue(ui.cfgPmsPageId, "IR04_0100X_V03");
        }
        if (preset.presetKey.startsWith("wings-") && !normalizeText(getFieldValue(ui.cfgPmsPageSize))) {
          setFieldValue(ui.cfgPmsPageSize, "300");
        }
        renderPmsPresetPreview();
      });
    }
    [ui.cfgPmsPropertyNo, ui.cfgPmsBsnsCode, ui.cfgPmsPageId, ui.cfgPmsPageSize, ui.cfgPmsReservationUrl].forEach((el) => {
      if (!el) return;
      el.addEventListener("input", () => {
        renderPmsPresetPreview();
      });
    });
    if (ui.cfgPmsPresetApplyBtn) {
      ui.cfgPmsPresetApplyBtn.addEventListener("click", async () => {
        await ensureStarted();
        applyPmsPresetTemplate();
      });
    }
    if (ui.cfgPmsHarConvertBtn) {
      ui.cfgPmsHarConvertBtn.addEventListener("click", async () => {
        await ensureStarted();
        applyPmsHarTemplate();
      });
    }
    ui.cfgManualRangeSampleBtn.addEventListener("click", async () => {
      await ensureStarted();
      const sample = buildManualRangesTextFromSnapshot(state.sheetSnapshot);
      if (!sample) {
        setStatus("시트 재고를 먼저 조회하면 현재 스캔값으로 수동 범위를 채울 수 있습니다.", "error");
        return;
      }
      setFieldValue(ui.cfgManualRanges, sample);
      renderManualRangePreview();
      setStatus("현재 스캔값으로 수동 범위를 채웠습니다.");
      ui.status.classList.add("ok");
    });
    if (ui.captureAuthBundleBtn) {
      ui.captureAuthBundleBtn.addEventListener("click", async () => {
        await ensureStarted();
        try {
          const bundle = await captureProviderAuthBundle(context.providerType);
          if (!bundle) {
            setStatus("현재 사이트에서 캡처할 인증 세션을 찾지 못했습니다. 먼저 로그인 상태를 확인하세요.", "error");
            return;
          }
          setFieldValue(ui.cfgAuthBundle, formatAuthBundleForTextarea(bundle));
          setSecretsMasked(state.secretsMasked);
          await refreshProductFlowState({ render: false });
          setStatus(TEXT.statusAuthBundleCaptured);
          ui.status.classList.add("ok");
        } catch (error) {
          setStatus(error?.message ?? String(error), "error");
        }
      });
    }
    if (ui.copyAuthBundleBtn) {
      ui.copyAuthBundleBtn.addEventListener("click", async () => {
        await ensureStarted();
        const bundleText = getFieldValue(ui.cfgAuthBundle).trim();
        if (!bundleText) {
          setStatus("복사할 인증 번들이 없습니다. 먼저 현재 세션을 캡처하세요.", "error");
          return;
        }
        try {
          await navigatorRef.clipboard.writeText(bundleText);
          setStatus(TEXT.statusAuthBundleCopied);
          ui.status.classList.add("ok");
        } catch (error) {
          setStatus(error?.message ?? String(error), "error");
        }
      });
    }
    ui.toggleErrorBtn.addEventListener("click", async () => {
      await ensureStarted();
      if (ui.toggleErrorBtn.disabled) return;
      setErrorExpanded(!state.errorExpanded);
    });
    ui.toggleDebugBtn.addEventListener("click", async () => {
      await ensureStarted();
      if (ui.toggleDebugBtn.disabled) return;
      setDebugExpanded(true);
    });
    if (ui.clearRuntimeBtn) {
      ui.clearRuntimeBtn.addEventListener("click", async () => {
        await ensureStarted();
        if (ui.clearRuntimeBtn.disabled) return;
        clearRuntimeArtifacts();
      });
    }
    ui.exportTraceJson.addEventListener("click", async () => {
      await ensureStarted();
      if (ui.exportTraceJson.disabled) return;
      downloadTracePacketsJson();
    });
    ui.exportTraceCsv.addEventListener("click", async () => {
      await ensureStarted();
      if (ui.exportTraceCsv.disabled) return;
      downloadTracePacketsCsv();
    });
    if (ui.exportGoldenSetBtn) {
      ui.exportGoldenSetBtn.addEventListener("click", async () => {
        await ensureStarted();
        if (ui.exportGoldenSetBtn.disabled) return;
        downloadGoldenSetBundle();
      });
    }
    ui.syncBtn.addEventListener("click", async () => {
      await ensureStarted();
      await runSheetSync();
    });

    return {
      ensureStarted,
      onApplyCorrectionClick
    };
  }

  App.ui.panelEvents = {
    bindPanelEvents
  };
})();
