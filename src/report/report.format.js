(() => {
  "use strict";

  const root = globalThis;
  const App = (root.App = root.App || {});
  App.report = App.report || {};
  const ns = (App.report.reportFormat = App.report.reportFormat || {});
  const C = App.constants || {};
  const {
    POLICY_NAVER_BUSINESS_ID,
    POLICY_STATION_BRANCH_ID,
    PREF_KEY,
    SYNC_CFG_KEY,
    SYNC_APPLY_KEY,
    SYNC_FEATURE_KEY_COMPAT,
    POLICY_SPREADSHEET_ID,
    POLICY_SHEET_NAME,
    POLICY_START_ROW,
    POLICY_SHEET_YEAR,
    POLICY_GOOGLE_CLIENT_ID,
    DEFAULT_SYNC_SLEEP_MS,
    SHEET_GRID_FAST_ROW_LIMIT,
    NAVER_SCHEDULE_FETCH_CONCURRENCY,
    ROOM_MAPPING_WARN_THRESHOLD,
    STATION_TOKEN_CACHE_TTL_MS,
    DATE_RANGE_CACHE_LIMIT,
    APPLY_JITTER_MS,
    APPLY_RETRY_LIMIT,
    EMBEDDED_AUTH_MODE,
    EMBEDDED_AUTH,
    TEXT,
    ROOM_PRESETS,
    ROOM_TYPE_LABELS,
    ROOM_TYPE_BY_ROOM_NO,
    CLOSED_TEXTS,
    V2_COLOR_STATUS_CHANNEL_MAP,
    RESERVATION_BLOCK_COLOR_HEX,
    INVENTORY_PROVIDER_ALIASES,
    DATE_LABEL_RE,
    ROOM_ROW_SKIP_TOKENS,
    DATE_HEADER_HINT,
    SHEET_HINTS_SCAN_RANGE,
    SHEET_HINTS_ROOM_MAP_RANGE,
    SHEET_HINT_CACHE_TTL_MS,
    SHEET_SNAPSHOT_CACHE_TTL_MS,
    SHEET_SNAPSHOT_CACHE_MAX,
    NAVER_BIZ_ITEMS_CACHE_TTL_MS,
    DEFAULT_SCAN_CONFIG,
  } = C;
  const N = App.scan?.normalize || {};
  const { normalizeText, safeInt, normalizeOpenStatus, sanitizeSyncConfig, sanitizeScanConfig, colZeroToA1, mergeRoomTypeMap } = N;

  function normalizeDisplayInventoryValue(value) {
    const text = normalizeText(value);
    if (!text) return "";
    const low = text.toLowerCase();
    if (CLOSED_TEXTS.has(low)) return TEXT.closed;
    return text;
  }


  function parseStockFraction(value) {
    const text = normalizeText(value);
    if (!text.includes("/")) return null;
    if ((text.match(/\//g) || []).length !== 1) return null;
    const match = text.match(/^(\d+)\s*\/\s*(\d+)$/);
    if (!match) return null;
    return { current: Number(match[1]), maximum: Number(match[2]) };
  }


  function isClosedByFractionRule(value) {
    const fraction = parseStockFraction(value);
    if (!fraction) return false;
    return Number(fraction.current) >= Number(fraction.maximum);
  }


  function autoCorrectInventoryDisplayValue(value) {
    const normalized = normalizeDisplayInventoryValue(value);
    if (!normalized) return { text: "", corrected: false, originalRaw: "" };
    if (normalized === TEXT.closed) return { text: TEXT.closed, corrected: false, originalRaw: "" };
    const fraction = parseStockFraction(normalized);
    if (!fraction) return { text: normalized, corrected: false, originalRaw: "" };
    const current = Number(fraction.current);
    const maximum = Number(fraction.maximum);
    if (Number.isFinite(current) && Number.isFinite(maximum) && current >= maximum) {
      return {
        text: TEXT.closed,
        corrected: true,
        originalRaw: normalized,
        reason: "N_GE_M"
      };
    }
    return { text: normalized, corrected: false, originalRaw: "" };
  }


  function rowToValue(row) {
    if (!row) return "";
    const reserved = safeInt(
      row.displayCurrent ??
        row.reservedStock ??
        row.bookingCount ??
        row.reservationCount ??
        row.currentBookingCount ??
        row.occupiedBookingCount
    );
    const total = safeInt(
      row.displayMaximum ??
        row.totalStock ??
        row.maxStock ??
        row.maximumStock ??
        row.maxCount ??
        row.stock ??
        row.stockCount ??
        row.settingStock ??
        row.availableStock
    );
    const normalizedOpen = normalizeOpenStatus(row.openStatus);
    if (normalizedOpen === "CLOSED") return TEXT.closed;
    return normalizeDisplayInventoryValue(`${reserved}/${total}`);
  }


  function tableCellDisplayText(cell) {
    if (cell && typeof cell === "object" && !Array.isArray(cell)) {
      if (Object.prototype.hasOwnProperty.call(cell, "text")) return String(cell.text ?? "");
      if (Object.prototype.hasOwnProperty.call(cell, "raw")) {
        return normalizeDisplayInventoryValue(String(cell.raw ?? ""));
      }
    }
    return String(cell ?? "");
  }


  function tableCellIsCorrected(cell) {
    return Boolean(cell && typeof cell === "object" && cell.corrected === true);
  }


  function tableCellTooltip(cell) {
    if (!tableCellIsCorrected(cell)) return "";
    const original = normalizeDisplayInventoryValue(cell?.originalRaw || "");
    const next = tableCellDisplayText(cell);
    const reason = normalizeText(cell?.reason || "");
    const reasonSuffix = reason ? ` [${reason}]` : "";
    if (!original) return `auto-correct${reasonSuffix}: ${next}`;
    return `auto-correct${reasonSuffix}: ${original} -> ${next}`;
  }


  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }


  function normalizeCopyTemplateRows(rowTemplateRows) {
    const normalized = (Array.isArray(rowTemplateRows) ? rowTemplateRows : [])
      .map((row) => Number(row))
      .filter((row) => Number.isInteger(row))
      .sort((a, b) => a - b);
    for (let i = 1; i < normalized.length; i += 1) {
      if (normalized[i] <= normalized[i - 1]) return [];
    }
    return normalized;
  }


  function tableCellCopyText(cell) {
    // Clipboard output should contain only the corrected final inventory value.
    return normalizeDisplayInventoryValue(tableCellDisplayText(cell));
  }


  function expandCopyRowsByTemplate(valueRows, rowTemplateRows) {
    const baseRows = (valueRows || []).map((row) =>
      (Array.isArray(row?.cells) ? row.cells : []).map((cell) => tableCellCopyText(cell))
    );
    const templateRows = normalizeCopyTemplateRows(rowTemplateRows);
    if (!baseRows.length || templateRows.length !== baseRows.length) return baseRows;

    const colCount = Math.max(...baseRows.map((cells) => cells.length), 0);
    const blankRow = new Array(colCount).fill("");
    const expandedRows = [];
    let spacerCount = 0;

    for (let i = 0; i < baseRows.length; i += 1) {
      expandedRows.push(baseRows[i]);
      if (i >= baseRows.length - 1) continue;
      const gap = Math.max(0, templateRows[i + 1] - templateRows[i] - 1);
      spacerCount += gap;
      if (spacerCount > 20) return baseRows;
      for (let j = 0; j < gap; j += 1) expandedRows.push([...blankRow]);
    }
    return expandedRows;
  }


  function valueRowsToTsv(valueRows, rowTemplateRows = []) {
    return expandCopyRowsByTemplate(valueRows, rowTemplateRows)
      .map((cells) => cells.join("\t"))
      .join("\n");
  }


  function rowsToTsv(rows) {
    return (rows || [])
      .map((row) => (Array.isArray(row) ? row : [row]).map((cell) => String(cell ?? "")).join("\t"))
      .join("\n");
  }


  function oneBasedColToA1(colOneBased, fallbackOneBased = 1) {
    const n = Number.isInteger(colOneBased) && colOneBased > 0 ? colOneBased : fallbackOneBased;
    return colZeroToA1(Math.max(0, n - 1));
  }


  function buildScanConfigTemplateTsv(config) {
    const cfg = sanitizeSyncConfig(config || {});
    const scan = sanitizeScanConfig(cfg.scan || {});
    const fallbackDateRow = scan.dateRow || (DATE_HEADER_HINT.dateRow + 1);
    const fallbackWeekdayRow = scan.weekdayRow || (fallbackDateRow + 1);
    const fallbackRoomStartRow = scan.roomStartRow || (fallbackDateRow + 2);
    const fallbackInvStartRow = scan.inventorySearchStartRow || fallbackRoomStartRow;
    const dateStartCol = oneBasedColToA1(scan.dateStartCol, 3);
    const dateEndCol = oneBasedColToA1(scan.dateEndCol, 53);

    const rows = [
      ["key", "value", "note"],
      ["mode", scan.mode || "manual", "manual or auto"],
      ["date_row", fallbackDateRow, "date header row"],
      ["weekday_row", fallbackWeekdayRow, "weekday header row"],
      ["date_start_col", dateStartCol, "date start column"],
      ["date_end_col", dateEndCol, "date end column"],
      ["room_start_row", fallbackRoomStartRow, "room list start row"],
      ["urban_start_row", scan.urbanStartRow || "", "room block Urban start"],
      ["urban_end_row", scan.urbanEndRow || "", "room block Urban end"],
      ["double_twin_start_row", scan.doubleTwinStartRow || "", "room block Double Twin start"],
      ["double_twin_end_row", scan.doubleTwinEndRow || "", "room block Double Twin end"],
      ["grand_start_row", scan.grandStartRow || "", "room block Grand start"],
      ["grand_end_row", scan.grandEndRow || "", "room block Grand end"],
      ["inventory_search_start_row", fallbackInvStartRow, "inventory alias search start"],
      ["station_inventory_row", scan.stationInventoryRow || "", "station provider row (optional)"],
      ["naver_inventory_row", scan.naverInventoryRow || "", "naver provider row (optional)"],
      ["station_urban_start_row", scan.stationUrbanStartRow || "", "station Urban start (optional)"],
      ["station_urban_end_row", scan.stationUrbanEndRow || "", "station Urban end (optional)"],
      ["station_double_twin_start_row", scan.stationDoubleTwinStartRow || "", "station Double Twin start (optional)"],
      ["station_double_twin_end_row", scan.stationDoubleTwinEndRow || "", "station Double Twin end (optional)"],
      ["station_grand_start_row", scan.stationGrandStartRow || "", "station Grand start (optional)"],
      ["station_grand_end_row", scan.stationGrandEndRow || "", "station Grand end (optional)"],
      ["naver_urban_start_row", scan.naverUrbanStartRow || "", "naver Urban start (optional)"],
      ["naver_urban_end_row", scan.naverUrbanEndRow || "", "naver Urban end (optional)"],
      ["naver_double_twin_start_row", scan.naverDoubleTwinStartRow || "", "naver Double Twin start (optional)"],
      ["naver_double_twin_end_row", scan.naverDoubleTwinEndRow || "", "naver Double Twin end (optional)"],
      ["naver_grand_start_row", scan.naverGrandStartRow || "", "naver Grand start (optional)"],
      ["naver_grand_end_row", scan.naverGrandEndRow || "", "naver Grand end (optional)"],
      ["room_sold_vac_scan_start_row", scan.roomSoldVacScanStartRow || "", "ROOM SOLD/VAC formula scan start (optional)"],
      ["room_sold_vac_scan_end_row", scan.roomSoldVacScanEndRow || "", "ROOM SOLD/VAC formula scan end (optional)"]
    ];
    return rowsToTsv(rows);
  }

  function buildRoomMapTemplateTsv(roomTypeMap) {
    const mergedMap = mergeRoomTypeMap(ROOM_TYPE_BY_ROOM_NO, roomTypeMap || {});
    const entries = Object.entries(mergedMap).sort(([a], [b]) =>
      String(a).localeCompare(String(b), "ko", { numeric: true, sensitivity: "base" })
    );
    const rows = [["room_no", "room_type", "note"]];
    entries.forEach(([roomNo, roomType]) => {
      rows.push([roomNo, roomType, ""]);
    });
    return rowsToTsv(rows);
  }

  Object.assign(ns, {
    normalizeDisplayInventoryValue,
    parseStockFraction,
    isClosedByFractionRule,
    autoCorrectInventoryDisplayValue,
    rowToValue,
    tableCellDisplayText,
    tableCellIsCorrected,
    tableCellTooltip,
    escapeHtml,
    normalizeCopyTemplateRows,
    tableCellCopyText,
    expandCopyRowsByTemplate,
    valueRowsToTsv,
    rowsToTsv,
    oneBasedColToA1,
    buildScanConfigTemplateTsv,
    buildRoomMapTemplateTsv,
  });
})();

