(() => {
  const App = (globalThis.App = globalThis.App || {});
  App.ui = App.ui || {};

  function bindPanelEvents({ ui, state, context, actions = {}, windowRef = globalThis, navigatorRef = globalThis.navigator } = {}) {
    const {
      TEXT,
      ONBOARDING_HIDE_KEY,
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
      applyQuickRange,
      storageSet,
      renderOnboardingChecklist,
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
    const quickSwitchButtons = [
      ui.quickSwitchMain,
      ui.quickSwitchSync,
      ui.quickSwitchSettings,
      ui.quickSwitchOps
    ].filter(Boolean);
    const quickSwitchKeyTargetMap = {
      "1": "main",
      "2": "sync",
      "3": "settings",
      "4": "ops"
    };
    const tableBodies = [ui.siteBody, ui.sheetBody, ui.insightBody].filter(Boolean);
    const focusedCellByBody = new WeakMap();
    const focusedRowByBody = new WeakMap();
    const dragHandle = ui.panelHeader || ui.header || ui.panel;
    let softFocusTimer = 0;
    let softFocusEl = null;
    let dragPointerId = null;
    let dragOffsetX = 0;
    let dragOffsetY = 0;

    function setQuickSwitchActive(targetRaw) {
      const target = normalizeText(targetRaw || "").toLowerCase();
      if (!target) return;
      quickSwitchButtons.forEach((btn) => {
        const match = normalizeText(btn?.dataset?.target || "").toLowerCase() === target;
        btn.classList.toggle("is-active", match);
        btn.setAttribute("aria-pressed", match ? "true" : "false");
      });
    }

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

    function clearPanelInlinePosition() {
      if (!ui.panel) return;
      ui.panel.style.left = "";
      ui.panel.style.top = "";
      ui.panel.style.right = "";
      ui.panel.style.bottom = "";
      state.panelPosition = null;
      ui.panel.classList.remove("is-dragging");
    }

    function clampPanelPosition(nextLeft, nextTop) {
      const panelRect = typeof ui.panel?.getBoundingClientRect === "function" ? ui.panel.getBoundingClientRect() : null;
      const panelWidth = Math.max(1, Number(panelRect?.width || ui.panel?.offsetWidth || 1));
      const panelHeight = Math.max(1, Number(panelRect?.height || ui.panel?.offsetHeight || 1));
      const maxLeft = Math.max(0, Number(windowRef.innerWidth || 0) - panelWidth);
      const maxTop = Math.max(0, Number(windowRef.innerHeight || 0) - panelHeight);
      const left = Math.min(Math.max(0, Number(nextLeft || 0)), maxLeft);
      const top = Math.min(Math.max(0, Number(nextTop || 0)), maxTop);
      return { left, top };
    }

    function applyPanelPosition(leftRaw, topRaw) {
      if (!ui.panel) return;
      const { left, top } = clampPanelPosition(leftRaw, topRaw);
      ui.panel.style.left = `${Math.round(left)}px`;
      ui.panel.style.top = `${Math.round(top)}px`;
      ui.panel.style.right = "auto";
      ui.panel.style.bottom = "auto";
      state.panelPosition = { left: Math.round(left), top: Math.round(top) };
    }

    function restorePanelPositionIfAny() {
      if (!ui.panel) return;
      const left = Number(state.panelPosition?.left);
      const top = Number(state.panelPosition?.top);
      if (!Number.isFinite(left) || !Number.isFinite(top)) {
        clearPanelInlinePosition();
        return;
      }
      applyPanelPosition(left, top);
    }

    function endPanelDrag(pointerId = null) {
      if (dragPointerId === null) return;
      if (pointerId !== null && dragPointerId !== pointerId) return;
      if (ui.panel && typeof ui.panel.releasePointerCapture === "function" && dragPointerId !== null) {
        try {
          ui.panel.releasePointerCapture(dragPointerId);
        } catch (_err) {
          // ignore release errors
        }
      }
      dragPointerId = null;
      if (ui.panel) ui.panel.classList.remove("is-dragging");
    }

    async function runQuickSwitch(targetRaw) {
      const target = normalizeText(targetRaw || "").toLowerCase();
      if (!target) return;
      await ensureStarted();
      let targetEl = null;
      if (target === "main") {
        targetEl = ui.status || ui.siteLabel || ui.flowStepPeriod;
      } else if (target === "sync") {
        targetEl = ui.syncFeatureSection || ui.syncBtn;
      } else if (target === "settings") {
        if (!state.settingsOpen) setSettingsOpen(true);
        targetEl = ui.sheetBox || ui.toggleConfig;
      } else if (target === "ops") {
        if (!state.settingsOpen) setSettingsOpen(true);
        if (!state.opsSectionExpanded) {
          await setOpsSectionExpanded(true, { persist: false });
        }
        targetEl = ui.opsSection || ui.toggleOpsSectionBtn;
      }
      if (!targetEl) return;
      setQuickSwitchActive(target);
      if (typeof targetEl.scrollIntoView === "function") {
        targetEl.scrollIntoView({ behavior: "smooth", block: "start", inline: "nearest" });
      }
      flashSoftFocus(targetEl);
    }

    async function ensureStarted() {
      if (state.started) {
        restorePanelPositionIfAny();
        return;
      }
      state.started = true;
      applyProviderTheme();
      const titleText = context.providerType === "naver-partner" ? TEXT.titleNaver : TEXT.titleStation;
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
      state.onboardingDismissed = (await storageGet(ONBOARDING_HIDE_KEY)) === true;
      updateSyncButtonText();

      const pref = await storageGet(PREF_KEY);
      if (isDate(pref?.startDate) && isDate(pref?.endDate) && pref.startDate <= pref.endDate) {
        state.selectedStart = pref.startDate;
        state.selectedEnd = pref.endDate;
        const startDate = fromDateKey(pref.startDate);
        if (startDate) state.monthCursor = monthStart(startDate);
      }

      state.syncConfig = await loadSyncConfig();
      writeSyncConfigToUI(state.syncConfig);
      setEmbeddedAuthUiState();
      setSecretsMasked(state.secretsMasked);
      applySyncFeatureUiState();
      updateSyncApprovalUi({ reset: true });
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
      restorePanelPositionIfAny();
      setQuickSwitchActive("main");
      if (missingAuth.length <= 0) {
        setStatus(TEXT.selectHint);
      }
    }

    async function onApplyCorrectionClick() {
      await ensureStarted();
      if ((ui.applyCorrectionBtn && ui.applyCorrectionBtn.disabled) || state.loading) return;
      applyAutoCorrectionsToLoadedValues();
    }

    ui.close.addEventListener("click", () => {
      setPanelOpen(false);
    });
    if (ui.launcher) {
      ui.launcher.addEventListener("click", async () => {
        setPanelOpen(true);
        await ensureStarted();
      });
    }
    ui.backdrop.addEventListener("click", () => {
      setPanelOpen(false);
    });
    if (dragHandle && ui.panel) {
      dragHandle.addEventListener("dblclick", (event) => {
        const targetEl = event?.target;
        if (targetEl?.closest?.("button, input, textarea, select, a")) return;
        clearPanelInlinePosition();
        flashSoftFocus(ui.panel);
      });
      dragHandle.addEventListener("pointerdown", (event) => {
        if (!isPanelVisible()) return;
        if (event.button !== 0) return;
        const targetEl = event?.target;
        if (targetEl?.closest?.("button, input, textarea, select, a")) return;
        const rect = typeof ui.panel.getBoundingClientRect === "function" ? ui.panel.getBoundingClientRect() : null;
        if (!rect) return;
        dragPointerId = event.pointerId;
        dragOffsetX = event.clientX - rect.left;
        dragOffsetY = event.clientY - rect.top;
        ui.panel.classList.add("is-dragging");
        ui.panel.style.left = `${Math.round(rect.left)}px`;
        ui.panel.style.top = `${Math.round(rect.top)}px`;
        ui.panel.style.right = "auto";
        ui.panel.style.bottom = "auto";
        if (typeof ui.panel.setPointerCapture === "function") {
          try {
            ui.panel.setPointerCapture(event.pointerId);
          } catch (_err) {
            // ignore pointer capture errors
          }
        }
        event.preventDefault();
      });
      ui.panel.addEventListener("pointermove", (event) => {
        if (dragPointerId === null || dragPointerId !== event.pointerId) return;
        const nextLeft = event.clientX - dragOffsetX;
        const nextTop = event.clientY - dragOffsetY;
        applyPanelPosition(nextLeft, nextTop);
      });
      ui.panel.addEventListener("pointerup", (event) => {
        endPanelDrag(event.pointerId);
      });
      ui.panel.addEventListener("pointercancel", (event) => {
        endPanelDrag(event.pointerId);
      });
    }
    windowRef.addEventListener("resize", () => {
      if (!isPanelVisible()) return;
      restorePanelPositionIfAny();
    });
    windowRef.addEventListener("keydown", (event) => {
      const panelOpen = isPanelVisible();
      if (event.key === "Escape" && panelOpen) {
        endPanelDrag();
        setPanelOpen(false);
        return;
      }
      if (!panelOpen) return;
      if (!event.altKey || event.ctrlKey || event.metaKey) return;
      const tagName = String(event?.target?.tagName || "").toLowerCase();
      const isEditableTarget = event?.target?.isContentEditable === true || ["input", "textarea", "select"].includes(tagName);
      if (isEditableTarget) return;
      const target = quickSwitchKeyTargetMap[String(event.key || "")];
      if (!target) return;
      event.preventDefault();
      void runQuickSwitch(target);
    });
    quickSwitchButtons.forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (btn.disabled) return;
        await runQuickSwitch(btn.dataset.target || "");
      });
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
    if (ui.hideOnboardingBtn) {
      ui.hideOnboardingBtn.addEventListener("click", async () => {
        await ensureStarted();
        state.onboardingDismissed = true;
        await storageSet(ONBOARDING_HIDE_KEY, true);
        renderOnboardingChecklist();
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
      const nextSettingsOpen = !state.settingsOpen;
      setSettingsOpen(nextSettingsOpen);
      setQuickSwitchActive(nextSettingsOpen ? "settings" : "main");
      if (nextSettingsOpen) {
        flashSoftFocus(ui.sheetBox || ui.toggleConfig);
      }
    });
    if (ui.toggleOpsSectionBtn) {
      ui.toggleOpsSectionBtn.addEventListener("click", async () => {
        await ensureStarted();
        if (ui.toggleOpsSectionBtn.disabled) return;
        const nextExpanded = !state.opsSectionExpanded;
        await setOpsSectionExpanded(nextExpanded, { persist: true });
        setQuickSwitchActive(nextExpanded ? "ops" : "settings");
        if (nextExpanded) {
          flashSoftFocus(ui.opsSection || ui.toggleOpsSectionBtn);
        }
      });
    }
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
      setDebugExpanded(!state.debugExpanded);
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
