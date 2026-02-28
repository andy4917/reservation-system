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

    async function ensureStarted() {
      if (state.started) return;
      state.started = true;
      applyProviderTheme();
      const titleText = context.providerType === "naver-partner" ? TEXT.titleNaver : TEXT.titleStation;
      ui.panelTitle.textContent = titleText;
      ui.toggle.textContent = titleText;
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
      if (missingAuth.length <= 0) {
        setStatus(TEXT.selectHint);
      }
    }

    async function onApplyCorrectionClick() {
      await ensureStarted();
      if ((ui.applyCorrectionBtn && ui.applyCorrectionBtn.disabled) || state.loading) return;
      applyAutoCorrectionsToLoadedValues();
    }

    ui.toggle.addEventListener("click", async () => {
      const shouldOpen = !isPanelVisible();
      setPanelOpen(shouldOpen);
      if (!shouldOpen) return;
      try {
        await ensureStarted();
      } catch (error) {
        setStatus(`초기화 오류: ${error?.message ?? String(error)}`, "error");
        console.error("[InventoryBoard] ensureStarted failed", error);
      }
    });

    ui.close.addEventListener("click", () => {
      setPanelOpen(false);
    });
    ui.backdrop.addEventListener("click", () => {
      setPanelOpen(false);
    });
    windowRef.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && isPanelVisible()) setPanelOpen(false);
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
      await loadInventory();
    });
    if (ui.loadAll) {
      ui.loadAll.addEventListener("click", async () => {
        await ensureStarted();
        await loadAllInventory();
      });
    }
    ui.loadSheet.addEventListener("click", async () => {
      await ensureStarted();
      await loadSheetInventory();
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
      setSettingsOpen(!state.settingsOpen);
    });
    if (ui.toggleOpsSectionBtn) {
      ui.toggleOpsSectionBtn.addEventListener("click", async () => {
        await ensureStarted();
        if (ui.toggleOpsSectionBtn.disabled) return;
        await setOpsSectionExpanded(!state.opsSectionExpanded, { persist: true });
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
