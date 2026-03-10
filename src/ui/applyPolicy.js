(() => {
  "use strict";

  const root = globalThis;
  const App = (root.App = root.App || {});
  App.ui = App.ui || {};
  const ns = (App.ui.applyPolicy = App.ui.applyPolicy || {});

  const normalizeText = App.scan?.normalize?.normalizeText || ((value) => String(value ?? "").trim());

  function buildValidationRows(validation) {
    return (validation?.issues || []).map((issue) => ({
      date: issue?.date || "-",
      type: issue?.level === "error" ? "SHEET_ERROR" : "SHEET_WARN",
      detail: String(issue?.message || "")
    }));
  }

  function normalizePlannerWarning(warning) {
    if (!warning) return null;
    if (typeof warning === "string") {
      const calendarMatch = warning.match(/\[station\]\s+no calendar rows for\s+(\d{4}-\d{2}-\d{2})/i);
      if (calendarMatch) {
        return {
          provider: "STATION",
          code: "STATION_NO_CALENDAR_ROWS",
          date: calendarMatch[1],
          message: warning
        };
      }
      const priceSetMatch = warning.match(/\[station\]\s+no priceSetId for\s+(\d{4}-\d{2}-\d{2})/i);
      if (priceSetMatch) {
        return {
          provider: "STATION",
          code: "STATION_NO_PRICE_SET_ID",
          date: priceSetMatch[1],
          message: warning
        };
      }
      return {
        provider: "STATION",
        code: "STATION_PLANNER_WARNING",
        date: "-",
        message: warning
      };
    }
    if (typeof warning !== "object" || Array.isArray(warning)) return null;
    return {
      provider: normalizeText(warning.provider || "STATION").toUpperCase() || "STATION",
      code: normalizeText(warning.code || "STATION_PLANNER_WARNING").toUpperCase() || "STATION_PLANNER_WARNING",
      date: normalizeText(warning.date || "-") || "-",
      message: String(warning.message || "")
    };
  }

  function providerTypeFromProviderKey(providerKey) {
    return normalizeText(providerKey).toUpperCase() === "STATION" ? "admin-station" : "naver-partner";
  }

  function buildSyncApplyPolicy({
    preview,
    text,
    applyBlockingScanWarnCodes,
    applyBlockingPreviewWarnCodes,
    applyBlockingPlannerWarningCodes,
    getPreviewSourceUsage
  }) {
    const issues = [];
    const pushIssue = (row) => {
      if (!row || typeof row !== "object") return;
      issues.push({
        date: row.date || "-",
        type: row.type || "적용 차단",
        detail: row.detail || ""
      });
    };

    const scanIssues = Array.isArray(preview?.snapshot?.scan?.validation?.issues)
      ? preview.snapshot.scan.validation.issues
      : [];
    scanIssues.forEach((issue) => {
      const severity = normalizeText(issue?.severity || "").toLowerCase();
      const code = normalizeText(issue?.code || "").toUpperCase();
      const message = String(issue?.message || code || "scan issue");
      if (severity === "error") {
        pushIssue({ type: "적용 차단(SCAN_ERROR)", detail: message });
        return;
      }
      if (severity === "warn" && applyBlockingScanWarnCodes.has(code)) {
        pushIssue({ type: "적용 차단(SCAN_WARN)", detail: message });
      }
    });

    (preview?.validation?.issues || []).forEach((issue) => {
      const level = normalizeText(issue?.level || "").toLowerCase();
      const code = normalizeText(issue?.code || "").toUpperCase();
      const message = String(issue?.message || code || "validation issue");
      if (level === "error") {
        pushIssue({ date: issue?.date || "-", type: "적용 차단(SHEET_ERROR)", detail: message });
        return;
      }
      if (level === "warn" && applyBlockingPreviewWarnCodes.has(code)) {
        pushIssue({ date: issue?.date || "-", type: "적용 차단(SHEET_WARN)", detail: message });
      }
    });

    (preview?.warnings || [])
      .map((warning) => normalizePlannerWarning(warning))
      .filter(Boolean)
      .forEach((warning) => {
        if (!applyBlockingPlannerWarningCodes.has(warning.code)) return;
        pushIssue({
          date: warning.date || "-",
          type: "적용 차단(PLAN_WARN)",
          detail: warning.message || warning.code
        });
      });

    const providerType = providerTypeFromProviderKey(preview?.providerKey || "");
    const providerApply = preview?.syncConfig?.providerApply && typeof preview.syncConfig.providerApply === "object"
      ? preview.syncConfig.providerApply
      : {};
    if (providerApply[providerType] === false) {
      pushIssue({
        type: "적용 차단(SETTINGS)",
        detail: `${providerType === "naver-partner" ? text.syncProviderApplyHintNaver : text.syncProviderApplyHintStation} 설정이 꺼져 있습니다.`
      });
    }

    const previewSourceUsage = typeof getPreviewSourceUsage === "function" ? getPreviewSourceUsage(preview) : null;
    const providerRawCount = Number(previewSourceUsage?.counts?.provider_raw || 0);
    if (providerRawCount > 0) {
      pushIssue({
        type: "적용 차단(LOW_TRUST_SOURCE)",
        detail: `저신뢰 소스(provider_raw) ${providerRawCount}개가 감지되어 실제 적용을 차단했습니다. 시트 재고 데이터행을 먼저 고정하세요.`
      });
    }

    return {
      blocked: issues.length > 0,
      issues
    };
  }

  Object.assign(ns, {
    buildValidationRows,
    normalizePlannerWarning,
    providerTypeFromProviderKey,
    buildSyncApplyPolicy
  });
})();
