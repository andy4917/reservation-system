(() => {
  "use strict";

  const root = globalThis;
  const App = (root.App = root.App || {});
  App.report = App.report || {};
  const ns = (App.report.validator = App.report.validator || {});

  const C = App.constants || {};
  const { TEXT } = C;
  const F = App.report?.reportFormat || {};
  const { normalizeDisplayInventoryValue, parseStockFraction } = F;

  function createVerificationReport() {
    return {
      checkedCount: 0,
      passCount: 0,
      warnCount: 0,
      failCount: 0,
      basis: TEXT.noPeriod,
      issues: []
    };
  }


  function addVerificationPass(report) {
    report.checkedCount += 1;
    report.passCount += 1;
  }


  function addVerificationWarn(report, issue) {
    report.checkedCount += 1;
    report.warnCount += 1;
    if (issue) report.issues.push({ ...issue, level: "warn" });
  }


  function addVerificationFail(report, issue) {
    report.checkedCount += 1;
    report.failCount += 1;
    if (issue) report.issues.push({ ...issue, level: "fail" });
  }


  function makeVerificationIssue(scope, date, room, type, detail) {
    return {
      scope: String(scope || "-"),
      date: String(date || "-"),
      room: String(room || "-"),
      type: String(type || "-"),
      detail: String(detail || "-")
    };
  }


  function validateInventoryDisplayCell(value) {
    const normalized = normalizeDisplayInventoryValue(value);
    if (!normalized) {
      return { type: "EMPTY_VALUE", detail: "媛믪씠 鍮꾩뼱 ?덉뒿?덈떎." };
    }
    if (normalized === TEXT.closed) return null;

    const fraction = parseStockFraction(normalized);
    if (!fraction) {
      return { type: "INVALID_FORMAT", detail: `?ш퀬 ?쒓린 ?뺤떇???섎せ?섏뿀?듬땲?? ${normalized}` };
    }
    return null;
  }


  function toMappingMethodLabel(method) {
    if (method === "id_exact") return "ID ?숈씪";
    if (method === "name_exact") return "?대쫫 ?숈씪";
    if (method === "name_type") return "媛앹떎????숈씪";
    if (method === "name_partial") return "?대쫫 遺遺??쇱튂";
    return "미확인";
  }

  Object.assign(ns, {
    createVerificationReport,
    addVerificationPass,
    addVerificationWarn,
    addVerificationFail,
    makeVerificationIssue,
    validateInventoryDisplayCell,
    toMappingMethodLabel,
  });
})();
