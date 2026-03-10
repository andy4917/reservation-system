(() => {
  "use strict";

  const root = globalThis;
  const App = (root.App = root.App || {});
  App.ui = App.ui || {};
  const ns = (App.ui.reservationAuditController = App.ui.reservationAuditController || {});

  function createReservationAuditController(deps) {
    const {
      state,
      ui,
      context,
      text,
      readOnlyToolMode,
      fetchProviderReservations,
      normalizeText,
      normalizeReservationStatusBucket,
      isCurrentProviderApplyAllowed,
      isSyncPreviewForActiveQuery,
      createVerificationReport,
      verifySiteInventoryAccuracy,
      verifySheetInventoryAccuracy,
      verifyProviderReservationsAgainstSheetCore,
      renderInventoryVerification,
      renderHostContextBar,
      activeProviderKey,
      isSameQuery
    } = deps;

    async function loadProviderReservations(query) {
      const reservationMetaRaw = await fetchProviderReservations(context.providerType, query, state.syncConfig).catch((error) => ({
        records: [],
        source: "error",
        url: "",
        candidateCount: 0,
        attempts: [],
        error: error?.message ?? String(error)
      }));
      const reservationMeta = reservationMetaRaw && typeof reservationMetaRaw === "object" ? reservationMetaRaw : {};
      state.providerReservations = Array.isArray(reservationMeta.records) ? reservationMeta.records : [];
      state.providerReservationMeta = reservationMeta;
      return reservationMeta;
    }

    function buildReservationStatusCounts() {
      const reservationCounts = state.providerReservationMeta?.statusCounts && typeof state.providerReservationMeta.statusCounts === "object"
        ? state.providerReservationMeta.statusCounts
        : {};
      const activeCount = Number.isFinite(Number(reservationCounts.active))
        ? Number(reservationCounts.active)
        : (state.providerReservations || []).filter((row) => normalizeReservationStatusBucket(row?.statusBucket || row?.status || "") === "ACTIVE").length;
      const canceledCount = Number.isFinite(Number(reservationCounts.canceled))
        ? Number(reservationCounts.canceled)
        : (state.providerReservations || []).filter((row) => normalizeReservationStatusBucket(row?.statusBucket || row?.status || "") === "CANCELED").length;
      const auditAnomalyCount = countReservationAuditAnomalies();
      return {
        activeCount,
        canceledCount,
        auditAnomalyCount
      };
    }

    function countReservationAuditAnomalies() {
      const counts = state.providerReservationMeta?.statusCounts;
      if (counts && Number.isFinite(Number(counts.auditAnomaly))) {
        return Number(counts.auditAnomaly);
      }
      return (Array.isArray(state.providerReservations) ? state.providerReservations : []).filter((row) => row?.auditAnomaly === true).length;
    }

    function buildReservationLoadStatusLabel() {
      const reservationSource = normalizeText(state.providerReservationMeta?.source || "").toLowerCase();
      const { activeCount, canceledCount } = buildReservationStatusCounts();
      if (reservationSource === "pms-api") {
        return `, PMS 예약 활성 ${activeCount}건 / 취소 ${canceledCount}건`;
      }
      if (state.providerReservations.length > 0) {
        return `, PMS 예약 활성 ${activeCount}건 / 취소 ${canceledCount}건`;
      }
      if (reservationSource === "pms-unconfigured") {
        return ", PMS 예약 설정 없음";
      }
      return "";
    }

    function renderUserOpsSummary() {
      if (!ui.userSyncState || !ui.userMismatchCount || !ui.userPmsStatus || !ui.userLoadState || !ui.userOpsHint) return;
      const mismatchCount = isSyncPreviewForActiveQuery() ? Number(state.syncPreview?.mismatchCount || 0) : 0;
      const mismatchCard = ui.userMismatchCount?.closest?.(".card");
      const readonlyMode = readOnlyToolMode === true;
      const blocked = readonlyMode ? false : (Boolean(state.syncPreview?.policy?.blocked) || !isCurrentProviderApplyAllowed());
      const hasSite = Boolean(state.query && Array.isArray(state.rows) && state.rows.length > 0);
      const hasSheet = Boolean(state.sheetQuery && state.sheetSnapshot);
      const { activeCount, canceledCount, auditAnomalyCount } = buildReservationStatusCounts();

      let syncState = "대기";
      let hint = text.userHintIdle;
      if (state.loading) {
        syncState = "처리 중";
        hint = readonlyMode ? "조회 또는 검토 계산이 진행 중입니다." : "조회 또는 적용이 진행 중입니다.";
      } else if (readonlyMode) {
        syncState = mismatchCount > 0 ? "검토 필요" : hasSite && hasSheet ? "검토 가능" : "대기";
        hint = "읽기 전용 모드입니다. 시트/OTA 쓰기 없이 조회와 비교 결과만 제공합니다.";
      } else if (blocked) {
        syncState = "차단됨";
        hint = "적용은 차단 상태입니다. 차단 사유는 Evidence > Blocking에서, 정책 근거는 Utility > Ops에서 확인하세요.";
      } else if (mismatchCount > 0) {
        syncState = "검토 필요";
        hint = "불일치가 있어 검토가 필요합니다. 상세 불일치는 Evidence에서, 정책과 soft-match 근거는 Utility > Ops에서 확인하세요.";
      } else if (hasSite && hasSheet) {
        syncState = "적용 가능";
        hint = "사이트/시트 조회가 완료되었습니다. Task에는 상태만 표시되고 상세 근거는 Evidence / Utility로 분리됩니다.";
      }

      ui.userSyncState.textContent = syncState;
      ui.userMismatchCount.textContent = String(mismatchCount);
      if (mismatchCard) mismatchCard.classList.toggle("is-critical", mismatchCount > 0);
      ui.userPmsStatus.textContent =
        state.providerReservationMeta?.source === "pms-unconfigured"
          ? "설정 필요"
          : state.providerReservations.length > 0 || activeCount > 0 || canceledCount > 0
            ? `활성 ${activeCount} / 취소 ${canceledCount}`
            : "미조회";
      ui.userLoadState.textContent = hasSite && hasSheet ? "사이트+시트" : hasSite ? "사이트" : hasSheet ? "시트" : "대기";
      if (auditAnomalyCount > 0 && !state.loading) {
        hint = `${hint}\n- night audit anomaly 후보 ${auditAnomalyCount}건은 Utility > Ops에서 확인하세요.`;
      }
      ui.userOpsHint.textContent = hint;
      renderHostContextBar();
    }

    function renderOpsMetaSummary() {
      if (ui.opsPolicySummary) {
        const mismatchCount = isSyncPreviewForActiveQuery() ? Number(state.syncPreview?.mismatchCount || 0) : 0;
        const blocked = readOnlyToolMode === true ? false : (Boolean(state.syncPreview?.policy?.blocked) || !isCurrentProviderApplyAllowed());
        const statusLine = readOnlyToolMode === true
          ? (mismatchCount > 0 ? "검토 필요" : "대기/검토 가능")
          : (blocked ? "차단" : mismatchCount > 0 ? "검토 필요" : "대기/적용 가능");
        ui.opsPolicySummary.textContent =
          `정책 요약\n- 상태모델: ACTIVE / CANCELED (NOSHOW는 ACTIVE + anomaly)\n- 현재 판정: ${statusLine}\n- 현재 불일치: ${mismatchCount}건\n- 수기 OTA(STATION/NAVER)는 PMS 누락 오류에서 제외`;
      }
      if (ui.opsRetentionSummary) {
        const reservationCount = Array.isArray(state.providerReservations) ? state.providerReservations.length : 0;
        ui.opsRetentionSummary.textContent =
          `보존 데이터\n- 런타임 예약요약: ${reservationCount}건\n- 유지: 예약번호, OTA, 날짜, 박수, 객실, 이름 정규화, 전화 끝자리, 토큰 해시\n- 폐기: full note/remark, PMS raw payload, HAR raw payload, plain token/cookie`;
      }
      if (ui.opsEvidenceSummary) {
        const anomalyCount = countReservationAuditAnomalies();
        ui.opsEvidenceSummary.textContent =
          `판정 근거\n- exact ID > blocking(날짜/OTA/객실) > soft-match(이름/전화/remark-note token)\n- soft-match 임계값: 7조건 중 3개 이상 + 날짜근거 1개 + OTA/객실 1개\n- audit anomaly: ${anomalyCount}건`;
      }
    }

    function verifyProviderReservationsAgainstSheet(report, query) {
      if (typeof verifyProviderReservationsAgainstSheetCore !== "function") return;
      return verifyProviderReservationsAgainstSheetCore({
        report,
        query,
        sheetSnapshot: state.sheetSnapshot,
        sheetQuery: state.sheetQuery,
        providerKey: activeProviderKey(),
        providerReservationMeta: state.providerReservationMeta,
        providerReservations: state.providerReservations,
        isSameQuery
      });
    }

    function buildInventoryVerificationReport() {
      const report = createVerificationReport();
      const basis = [];

      if (state.query) {
        basis.push(`${text.siteInventory}: ${state.query.startDate} ~ ${state.query.endDate}`);
        verifySiteInventoryAccuracy(report, state.query);
      }
      if (state.sheetQuery) {
        basis.push(`${text.sheetInventory}: ${state.sheetQuery.startDate} ~ ${state.sheetQuery.endDate}`);
        verifySheetInventoryAccuracy(report, state.sheetQuery);
      }
      if (state.query && state.sheetQuery && isSameQuery(state.query, state.sheetQuery)) {
        basis.push(`PMS 예약: ${state.query.startDate} ~ ${state.query.endDate}`);
        verifyProviderReservationsAgainstSheet(report, state.query);
      }
      report.basis = basis.length ? basis.join(" | ") : text.noPeriod;
      return report;
    }

    function refreshInventoryVerification() {
      state.verificationReport = buildInventoryVerificationReport();
      state.syncPreview = {
        ...(state.syncPreview || {}),
        reservationPairs: state.verificationReport?.reservationPairs || [],
        reservationMismatches: state.verificationReport?.reservationMismatches || []
      };
      renderInventoryVerification(state.verificationReport);
    }

    return {
      loadProviderReservations,
      buildReservationStatusCounts,
      countReservationAuditAnomalies,
      buildReservationLoadStatusLabel,
      renderUserOpsSummary,
      renderOpsMetaSummary,
      verifyProviderReservationsAgainstSheet,
      buildInventoryVerificationReport,
      refreshInventoryVerification
    };
  }

  Object.assign(ns, {
    createReservationAuditController
  });
})();
