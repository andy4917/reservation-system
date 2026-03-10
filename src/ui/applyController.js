(() => {
  "use strict";

  const root = globalThis;
  const App = (root.App = root.App || {});
  App.ui = App.ui || {};
  const ns = (App.ui.applyController = App.ui.applyController || {});

  function createApplyController(deps) {
    const {
      state,
      ui,
      text,
      readOnlyToolMode,
      normalizeText,
      resolveActiveQuery,
      isSyncPreviewForActiveQuery,
      isSyncApplyEnabled,
      countClosedItems,
      renderWorkflowProgress,
      renderSupportPolicySurface,
      renderSyncResult,
      updateSyncButtonText,
      setStatus,
      updateSyncApprovalUiRef,
      buildSyncApplyPolicy,
      countClosedItemsForPreview,
      buildErrorRowsFromResults,
      prepareSyncPreviewForRun,
      renderSyncPreviewResult,
      setSyncResultVisible,
      setLoading,
      getSelectedQuery,
      assertSyncRunReady,
      applyStationActions,
      enqueueNaverActions,
      executeQueuedNaverActions
    } = deps;

    function isSyncApprovalRequired() {
      if (readOnlyToolMode === true) return false;
      if (!isSyncApplyEnabled()) return false;
      if (Number(state.syncPreview?.mismatchCount || 0) <= 0) return false;
      return isSyncPreviewForActiveQuery();
    }

    function isSyncApprovalReady() {
      return !isSyncApprovalRequired() || state.syncApprovalChecked === true;
    }

    function buildSyncApprovalFingerprint() {
      const query = resolveActiveQuery();
      const isCurrentPreview = isSyncPreviewForActiveQuery();
      const mismatchCount = isCurrentPreview ? Number(state.syncPreview?.mismatchCount || 0) : 0;
      const closedCount = isCurrentPreview ? countClosedItems(state.syncPreview?.providerKey, state.syncPreview?.actions || []) : 0;
      const validationErrorCount = Number(state.syncPreview?.validation?.errorCount || 0);
      return [
        query?.startDate || "-",
        query?.endDate || "-",
        normalizeText(isCurrentPreview ? state.syncPreview?.providerKey : "-"),
        mismatchCount,
        closedCount,
        validationErrorCount
      ].join("::");
    }

    function updateSyncApprovalUi(options = {}) {
      if (!ui.syncApprovalWrap || !ui.syncApprovalCheck) return;
      const isCurrentPreview = isSyncPreviewForActiveQuery();
      const mismatchCount = isCurrentPreview ? Number(state.syncPreview?.mismatchCount || 0) : 0;
      const closedCount = isCurrentPreview ? countClosedItems(state.syncPreview?.providerKey, state.syncPreview?.actions || []) : 0;
      const query = resolveActiveQuery();
      const fingerprint = buildSyncApprovalFingerprint();
      if (options.reset === true || state.syncApprovalFingerprint !== fingerprint) {
        state.syncApprovalChecked = false;
        state.syncApprovalFingerprint = fingerprint;
      }
      const required = isSyncApprovalRequired();
      ui.syncApprovalWrap.classList.toggle("hidden", !required);
      if (ui.syncApprovalMismatch) ui.syncApprovalMismatch.textContent = String(mismatchCount);
      if (ui.syncApprovalClosed) ui.syncApprovalClosed.textContent = String(closedCount);
      if (ui.syncApprovalPeriod) {
        ui.syncApprovalPeriod.textContent = query ? `${query.startDate} ~ ${query.endDate}` : text.noPeriod;
      }
      ui.syncApprovalCheck.checked = state.syncApprovalChecked === true;
      ui.syncApprovalCheck.disabled = Boolean(state.loading) || !required;
      renderWorkflowProgress();
      renderSupportPolicySurface();
    }

    function blockSyncRunForValidation(preview) {
      if (preview.mismatchCount <= 0) {
        setStatus(text.statusSyncNoDiff);
        ui.status.classList.add("ok");
        return true;
      }
      const policy = preview?.policy && typeof preview.policy === "object"
        ? preview.policy
        : buildSyncApplyPolicy(preview);
      if (policy.blocked) {
        renderSyncResult({
          totalCount: preview.mismatchCount,
          successCount: 0,
          failCount: 1,
          closedCount: countClosedItemsForPreview(preview),
          blocks: policy.issues,
          errors: []
        });
        setStatus(policy.issues[0]?.detail || "적용 차단 규칙에 의해 실행을 중단했습니다.", "error");
        return true;
      }
      if (isSyncApprovalRequired() && state.syncApprovalChecked !== true) {
        setStatus(text.statusNeedSyncApproval, "warn");
        return true;
      }
      return false;
    }

    function blockSyncRunForPreviewMode(preview) {
      if (isSyncApplyEnabled()) return false;
      renderSyncPreviewResult(preview, []);
      state.syncPreview = preview;
      setStatus(text.statusSyncApplySkipped);
      ui.status.classList.add("ok");
      return true;
    }

    function confirmSyncRun(preview, query) {
      const providerName = preview.providerKey === "STATION" ? text.station : text.naver;
      return window.confirm(
        `${providerName} 불일치 ${preview.mismatchCount}건을 적용하시겠습니까?` +
          `\n기간: ${query.startDate} ~ ${query.endDate}`
      );
    }

    async function executeSyncPreviewActions(preview) {
      if (preview.providerKey === "STATION") {
        const results = await applyStationActions(preview.actions, preview.syncConfig.sleepMs);
        return { mode: "immediate", queueSize: 0, results };
      }
      enqueueNaverActions(preview.actions);
      return executeQueuedNaverActions(preview.syncConfig, preview.syncConfig.sleepMs, "manual");
    }

    function finalizeSyncRun(preview, results) {
      const successCount = (results || []).filter((row) => row.status === "APPLIED").length;
      const apiFailCount = (results || []).filter((row) => row.status === "FAILED").length;
      const summary = {
        totalCount: preview.mismatchCount,
        successCount,
        failCount: apiFailCount,
        closedCount: countClosedItemsForPreview(preview),
        errors: buildErrorRowsFromResults(preview.providerKey, results)
      };
      renderSyncResult(summary);

      state.syncPreview = { ...preview, mismatchCount: summary.failCount > 0 ? Math.max(1, summary.failCount) : 0 };
      state.syncApprovalChecked = false;
      updateSyncApprovalUiRef({ reset: true });
      updateSyncButtonText();
      if (summary.failCount > 0) {
        setStatus(`${text.statusSyncDone}: 성공 ${successCount}건, 실패 ${summary.failCount}건`, "error");
      } else {
        setStatus(`${text.statusSyncDone}: 성공 ${successCount}건. ${text.statusSyncVerifyByManualLoad}`);
        ui.status.classList.add("ok");
      }
    }

    function handleSyncRunError(error) {
      setStatus(error?.message ?? String(error), "error");
      renderSyncResult({
        totalCount: 0,
        successCount: 0,
        failCount: 1,
        closedCount: 0,
        blocks: [],
        errors: [{ date: "-", type: "실행 오류", detail: error?.message ?? String(error) }]
      });
      state.syncPreview = { mismatchCount: 0 };
      updateSyncButtonText();
    }

    async function runSheetSync() {
      try {
        state.syncRunning = true;
        updateSyncButtonText();
        setSyncResultVisible(true);
        setLoading(true);
        setStatus(text.statusSyncing);

        const query = getSelectedQuery();
        if (!assertSyncRunReady(query)) return;
        const preview = await prepareSyncPreviewForRun(query);
        renderSyncPreviewResult(preview, []);
        state.syncPreview = preview;
        if (preview.mismatchCount > 0) {
          setStatus(`${text.statusSyncDone}: 불일치 ${preview.mismatchCount}건`);
        } else {
          setStatus(text.statusSyncNoDiff);
        }
        ui.status.classList.add("ok");
      } catch (error) {
        handleSyncRunError(error);
      } finally {
        state.syncRunning = false;
        setLoading(false);
        updateSyncButtonText();
      }
    }

    return {
      isSyncApprovalRequired,
      isSyncApprovalReady,
      buildSyncApprovalFingerprint,
      updateSyncApprovalUi,
      blockSyncRunForValidation,
      blockSyncRunForPreviewMode,
      confirmSyncRun,
      executeSyncPreviewActions,
      finalizeSyncRun,
      handleSyncRunError,
      runSheetSync
    };
  }

  Object.assign(ns, {
    createApplyController
  });
})();
