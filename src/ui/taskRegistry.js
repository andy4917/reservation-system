(() => {
  "use strict";

  const root = globalThis;
  const App = (root.App = root.App || {});
  App.ui = App.ui || {};
  const ns = (App.ui.taskRegistry = App.ui.taskRegistry || {});
  if (ns.__ready) return;

  function normalizeText(value) {
    return String(value ?? "").trim();
  }

  const TASKS = Object.freeze({
    NAVER_STATION_SYNC: Object.freeze({
      id: "NAVER_STATION_SYNC",
      label: "Inventory",
      shellLabel: "재고 조회 / 비교",
      className: "task-inventory",
      group: "inventory",
      buttonId: "taskNavInventoryBtn",
      requiredCapability: "provider-session",
      supportedHosts: Object.freeze(["naver-partner", "admin-station"]),
      defaultOpen: Object.freeze({ openScope: true }),
      guardUtilityTab: "scope"
    }),
    PMS_RESERVATION_VALIDATION: Object.freeze({
      id: "PMS_RESERVATION_VALIDATION",
      label: "Reservation Validation",
      shellLabel: "예약 읽기 / 검증",
      className: "task-reservation",
      group: "reservation",
      buttonId: "taskNavReservationBtn",
      requiredCapability: "wings",
      supportedHosts: Object.freeze(["naver-partner", "admin-station"]),
      defaultOpen: Object.freeze({ openScope: false }),
      guardUtilityTab: "settings"
    }),
    SHEET_MAPPING_REVIEW: Object.freeze({
      id: "SHEET_MAPPING_REVIEW",
      label: "Sheet Mapping",
      shellLabel: "시트 매핑 / 검토",
      className: "task-sheet",
      group: "ops",
      buttonId: "taskNavSheetBtn",
      requiredCapability: "sheets",
      supportedHosts: Object.freeze(["naver-partner", "admin-station"]),
      defaultOpen: Object.freeze({ openSettings: true, openScope: false }),
      guardUtilityTab: "settings"
    }),
    OTA_PMS_COMPARISON: Object.freeze({
      id: "OTA_PMS_COMPARISON",
      label: "OTA/PMS Audit",
      shellLabel: "OTA / PMS 대조",
      className: "task-audit",
      group: "reservation",
      buttonId: "taskNavAuditBtn",
      requiredCapability: "wings",
      supportedHosts: Object.freeze(["naver-partner", "admin-station"]),
      defaultOpen: Object.freeze({ openScope: false }),
      guardUtilityTab: "settings"
    })
  });

  const TASK_ORDER = Object.freeze([
    "NAVER_STATION_SYNC",
    "PMS_RESERVATION_VALIDATION",
    "SHEET_MAPPING_REVIEW",
    "OTA_PMS_COMPARISON"
  ]);

  function normalizeTaskId(taskId) {
    const text = normalizeText(taskId).toUpperCase();
    return Object.prototype.hasOwnProperty.call(TASKS, text) ? text : "NAVER_STATION_SYNC";
  }

  function getTaskMeta(taskId) {
    return TASKS[normalizeTaskId(taskId)] || TASKS.NAVER_STATION_SYNC;
  }

  function listTaskMetas() {
    return TASK_ORDER.map((taskId) => getTaskMeta(taskId));
  }

  function initializeTaskNavigationUi(ui) {
    listTaskMetas().forEach((task) => {
      const btn = ui?.[task.buttonId];
      if (!btn) return;
      btn.textContent = task.label;
      btn.dataset.taskId = task.id;
      btn.dataset.taskGroup = task.group;
    });
  }

  Object.assign(ns, {
    __ready: true,
    TASKS,
    TASK_ORDER,
    normalizeTaskId,
    getTaskMeta,
    listTaskMetas,
    initializeTaskNavigationUi
  });
})();
