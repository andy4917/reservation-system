(() => {
  "use strict";

  const root = globalThis;
  const App = (root.App = root.App || {});
  App.ui = App.ui || {};
  const ns = (App.ui.inventoryCompareController = App.ui.inventoryCompareController || {});

  function createInventoryCompareController(deps) {
    const {
      state,
      context,
      prefKey,
      storageSet,
      normalizeText,
      sanitizeSyncConfig,
      readSyncConfigFromUI,
      persistSyncConfig,
      fetchSheetSnapshot,
      fetchProviderRows,
      fetchProviderReservations,
      normalizeRows,
      getLastProviderFetchMeta,
      getProviderFetchInstrumentation,
      summarizeProviderRowSources,
      requireInventoryProviderKey,
      assertProviderInventorySource,
      buildValueModel,
      buildSheetValueModel,
      buildSyncPreviewContext,
      resolveSyncPreviewTargets,
      planSyncPreviewActions,
      countPreviewMismatches,
      buildPreviewRows,
      buildSyncApplyPolicy,
      buildValidationRows,
      countClosedItems,
      collectBlockScanEscalationReasons,
      annotatePreviewBlockScan,
      buildTracePacketForMismatch,
      buildTracePacketsForMismatches,
      renderSummary,
      renderSiteValueTable,
      renderSheetValueTable,
      renderSheetInsightPanel,
      renderSyncResult,
      renderMismatchRows,
      refreshInventoryVerification,
      updateSyncButtonText,
      updateCorrectionButtonState,
      markActionTime,
      resolveActiveQuery,
      isSameQuery
    } = deps;

    function cloneSyncPreviewTargets(targets) {
      const cloned = {};
      Object.entries(targets || {}).forEach(([day, value]) => {
        if (value && typeof value === "object" && !Array.isArray(value)) cloned[day] = { ...value };
        else cloned[day] = value;
      });
      return cloned;
    }

    function buildSyncPreviewTraceArtifacts(query, syncConfig, previewContext, targets, targetMode, validation) {
      return {
        tracePacket: buildTracePacketForMismatch(
          query,
          syncConfig,
          previewContext.providerKey,
          previewContext.roomPreset,
          previewContext.normalizedRows,
          previewContext.snapshot,
          targets,
          targetMode,
          validation
        ),
        tracePackets: buildTracePacketsForMismatches(
          query,
          previewContext.providerKey,
          previewContext.roomPreset,
          previewContext.normalizedRows,
          previewContext.snapshot,
          targets,
          targetMode
        )
      };
    }

    function buildSyncPreviewFromData(query, syncConfig, rows, snapshot) {
      const previewContext = buildSyncPreviewContext(snapshot, rows);
      const {
        providerTargets,
        roomTargets,
        targets,
        targetMode,
        validation
      } = resolveSyncPreviewTargets(previewContext, syncConfig.stockMode);
      const { actions, warnings } = planSyncPreviewActions(previewContext, targets);
      const mismatchCount = countPreviewMismatches(previewContext.providerKey, actions);
      const forcedTargets = cloneSyncPreviewTargets(targets);
      const { tracePacket, tracePackets } = buildSyncPreviewTraceArtifacts(
        query,
        syncConfig,
        previewContext,
        targets,
        targetMode,
        validation
      );
      const preview = {
        providerKey: previewContext.providerKey,
        query,
        snapshot,
        targets,
        targetMode,
        providerTargets,
        roomTargets,
        providerItemMap: previewContext.providerItemMap,
        validation,
        actions,
        warnings,
        forced: { targets: forcedTargets, overrides: [] },
        mismatchCount,
        previewRows: buildPreviewRows(previewContext.providerKey, actions),
        tracePacket,
        tracePackets,
        syncConfig,
        rows: previewContext.normalizedRows
      };

      return {
        ...preview,
        policy: buildSyncApplyPolicy(preview)
      };
    }

    async function buildSyncPreview(query, syncConfig, loadedRows = null, loadedSnapshot = null) {
      const snapshot = loadedSnapshot || (
        await fetchSheetSnapshot(syncConfig, query, false, false, { blockDetailMode: "light" })
      );
      const rows = Array.isArray(loadedRows)
        ? loadedRows
        : normalizeRows(await fetchProviderRows(context.providerType, query), query, context.providerType);
      const basePreview = buildSyncPreviewFromData(query, syncConfig, rows, snapshot);
      const currentMode = normalizeText(basePreview?.snapshot?.scan?.blockDetailMode || "light").toLowerCase() === "full"
        ? "full"
        : "light";
      if (currentMode === "full") {
        return annotatePreviewBlockScan(basePreview, { mode: "full", escalated: false, reasons: [] });
      }

      const escalationReasons = collectBlockScanEscalationReasons(basePreview);
      if (escalationReasons.length <= 0) {
        return annotatePreviewBlockScan(basePreview, { mode: "light", escalated: false, reasons: [] });
      }

      try {
        const fullSnapshot = await fetchSheetSnapshot(syncConfig, query, false, false, {
          blockDetailMode: "full"
        });
        const fullPreview = buildSyncPreviewFromData(query, syncConfig, rows, fullSnapshot);
        return annotatePreviewBlockScan(fullPreview, {
          mode: "full",
          escalated: true,
          reasons: escalationReasons,
          fromMode: "light",
          toMode: "full"
        });
      } catch (escalationError) {
        return annotatePreviewBlockScan(basePreview, {
          mode: "light",
          escalated: false,
          reasons: escalationReasons,
          fromMode: "light",
          toMode: "full",
          escalationError: escalationError?.message ?? String(escalationError)
        });
      }
    }

    function renderSyncPreviewResult(preview, errors = null) {
      const previewErrors = Array.isArray(errors) ? errors : buildValidationRows(preview.validation);
      renderSyncResult({
        totalCount: preview.mismatchCount,
        successCount: 0,
        failCount: 0,
        closedCount: countClosedItems(preview.providerKey, preview.actions),
        blocks: preview?.policy?.issues || [],
        errors: previewErrors
      });
      updateSyncButtonText();
      renderMismatchRows(null, preview?.query || resolveActiveQuery());
      markActionTime("comparison");
    }

    async function refreshSyncPreview(query, loadedRows = null, loadedSnapshot = null) {
      const syncConfig = await persistSyncConfig(false);
      const preview = await buildSyncPreview(query, syncConfig, loadedRows, loadedSnapshot);
      state.sheetQuery = query;
      state.sheetSnapshot = preview.snapshot;
      const validationRows = buildValidationRows(preview.validation);
      state.syncPreview = preview;
      renderSyncResult({
        totalCount: preview.mismatchCount,
        successCount: 0,
        failCount: 0,
        closedCount: countClosedItems(preview.providerKey, preview.actions),
        blocks: preview?.policy?.issues || [],
        errors: validationRows
      });
      updateSyncButtonText();
      renderMismatchRows(null, query);
      return preview;
    }

    async function reloadProviderRows(query) {
      const [rawRows, reservationMetaRaw] = await Promise.all([
        fetchProviderRows(context.providerType, query),
        fetchProviderReservations(context.providerType, query, state.syncConfig).catch((error) => ({
          records: [],
          source: "error",
          url: "",
          candidateCount: 0,
          attempts: [],
          error: error?.message ?? String(error)
        }))
      ]);
      const rows = normalizeRows(rawRows, query, context.providerType);
      const reservationMeta = reservationMetaRaw && typeof reservationMetaRaw === "object" ? reservationMetaRaw : {};

      state.query = query;
      state.rows = rows;
      state.providerRowMeta =
        typeof getLastProviderFetchMeta === "function" ? getLastProviderFetchMeta(context.providerType) : null;
      state.providerReservations = Array.isArray(reservationMeta.records) ? reservationMeta.records : [];
      state.providerReservationMeta = reservationMeta;

      const model = buildValueModel(rows, query, { applyCorrections: state.correctionsApplied === true });
      state.dates = model.dates;
      state.valueRows = model.valueRows;
      renderSummary(rows);
      renderSiteValueTable(state.dates, state.valueRows);
      refreshInventoryVerification();
      await storageSet(prefKey, { startDate: query.startDate, endDate: query.endDate });
      return rows;
    }

    function formatProviderFetchRouteLabel(route) {
      const key = normalizeText(route || "").toLowerCase();
      if (key === "api_only_accept") return "API직행";
      if (key === "api_dom_merge") return "API+DOM";
      if (key === "dom_only_fallback") return "DOM대체";
      if (key === "api_error_no_dom") return "API실패";
      if (key === "api_only_insufficient") return "API저커버리지";
      return "미확인";
    }

    function buildProviderFetchStatusLabel(meta, rows) {
      const sourceCount =
        meta?.sourceCount && typeof meta.sourceCount === "object"
          ? meta.sourceCount
          : typeof summarizeProviderRowSources === "function"
            ? summarizeProviderRowSources(rows)
            : { api: 0, dom: 0, other: 0, total: Array.isArray(rows) ? rows.length : 0 };
      const sourceMixLabel = sourceCount.dom > 0
        ? `, 소스 API ${Number(sourceCount.api || 0)} + DOM ${Number(sourceCount.dom || 0)}`
        : `, 소스 API ${Number(sourceCount.api || 0)}`;
      const routeLabel = meta?.route ? `, 조회경로 ${formatProviderFetchRouteLabel(meta.route)}` : "";
      const sessionCounts =
        meta?.sessionCounts && typeof meta.sessionCounts === "object"
          ? meta.sessionCounts
          : typeof getProviderFetchInstrumentation === "function"
            ? getProviderFetchInstrumentation(context.providerType)
            : null;
      const sessionLabel = sessionCounts
        ? ` (누적 직행 ${Number(sessionCounts.apiOnlyAccept || 0)} / 병합 ${Number(sessionCounts.apiDomMerge || 0)} / DOM대체 ${Number(sessionCounts.domOnlyFallback || 0)})`
        : "";
      return `${sourceMixLabel}${routeLabel}${sessionLabel}`;
    }

    async function reloadSheetSnapshot(query) {
      const syncConfig = await persistSyncConfig(false);
      const snapshot = await fetchSheetSnapshot(syncConfig, query, false, false, { blockDetailMode: "light" });
      const providerKey = requireInventoryProviderKey();
      assertProviderInventorySource(snapshot, providerKey);

      state.sheetQuery = query;
      state.sheetSnapshot = snapshot;
      const model = buildSheetValueModel(snapshot, providerKey, { applyCorrections: state.correctionsApplied === true });
      state.sheetDates = model.dates;
      state.sheetValueRows = model.valueRows;
      renderSheetValueTable(state.sheetDates, state.sheetValueRows);
      renderSheetInsightPanel(snapshot, state.sheetDates, state.sheetValueRows, providerKey);
      refreshInventoryVerification();
      return snapshot;
    }

    function clearMismatchView(query = null) {
      state.syncPreview = { ...(state.syncPreview || {}), mismatchCount: 0 };
      updateSyncButtonText();
      renderMismatchRows([], query);
    }

    async function refreshMismatchFromLoaded(options = {}) {
      const query = state.query;
      if (!query || !state.sheetSnapshot || !state.sheetQuery || !isSameQuery(query, state.sheetQuery)) {
        clearMismatchView(query || state.sheetQuery || null);
        return null;
      }

      const currentConfig = sanitizeSyncConfig(readSyncConfigFromUI());
      state.syncConfig = currentConfig;
      const prevSnapshotRef = state.sheetSnapshot;
      const preview = await buildSyncPreview(query, currentConfig, state.rows, state.sheetSnapshot);
      state.syncPreview = preview;
      if (preview?.snapshot) {
        state.sheetSnapshot = preview.snapshot;
        state.sheetQuery = query;
        if (preview.snapshot !== prevSnapshotRef) {
          const providerKey = requireInventoryProviderKey();
          const model = buildSheetValueModel(preview.snapshot, providerKey, { applyCorrections: state.correctionsApplied === true });
          state.sheetDates = model.dates;
          state.sheetValueRows = model.valueRows;
          renderSheetValueTable(state.sheetDates, state.sheetValueRows);
          renderSheetInsightPanel(preview.snapshot, state.sheetDates, state.sheetValueRows, providerKey);
          refreshInventoryVerification();
        }
      }
      updateSyncButtonText();
      updateCorrectionButtonState();
      renderMismatchRows(null, query);

      if (options?.renderSyncResult !== false) {
        renderSyncResult({
          totalCount: preview.mismatchCount,
          successCount: 0,
          failCount: 0,
          closedCount: countClosedItems(preview.providerKey, preview.actions),
          blocks: preview?.policy?.issues || [],
          errors: buildValidationRows(preview.validation)
        });
      }
      markActionTime("comparison");
      return preview;
    }

    async function prepareSyncPreviewForRun(query) {
      const syncConfig = await persistSyncConfig(false);
      const preview = buildSyncPreviewFromData(query, syncConfig, state.rows, state.sheetSnapshot);
      state.syncPreview = preview;
      renderSyncPreviewResult(preview);
      return preview;
    }

    return {
      buildSyncPreviewFromData,
      buildSyncPreview,
      refreshSyncPreview,
      reloadProviderRows,
      formatProviderFetchRouteLabel,
      buildProviderFetchStatusLabel,
      reloadSheetSnapshot,
      clearMismatchView,
      refreshMismatchFromLoaded,
      renderSyncPreviewResult,
      prepareSyncPreviewForRun
    };
  }

  Object.assign(ns, {
    createInventoryCompareController
  });
})();
