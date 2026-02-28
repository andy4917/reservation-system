(() => {
  "use strict";

  const root = globalThis;
  const App = (root.App = root.App || {});
  App.scan = App.scan || {};
  const ns = (App.scan.aggregator = App.scan.aggregator || {});
  const C = App.constants || {};
  const {
    FIXED_NAVER_BUSINESS_ID,
    FIXED_STATION_BRANCH_ID,
    PREF_KEY,
    SYNC_CFG_KEY,
    SYNC_APPLY_KEY,
    SYNC_FEATURE_KEY_LEGACY,
    DEFAULT_SPREADSHEET_ID,
    DEFAULT_SHEET_NAME,
    DEFAULT_START_ROW,
    DEFAULT_YEAR,
    DEFAULT_GOOGLE_CLIENT_ID,
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
  const R = App.engine?.rules || {};
  const { normalizeText } = N;
  const { colorObjToHex, parseStockValue, applyProviderMaximumRule } = R;
  const PKG_ROW_LABEL_RE = /(pkg|package|\uD328\uD0A4\uC9C0)/i;

  function rowAliasText(matrix, row) {
    const tokens = [];
    for (let col = 0; col <= 5; col += 1) {
      const text = normalizeText(matrix.get(row, col).formattedValue).toLowerCase();
      if (text) tokens.push(text);
    }
    return tokens.join(" ").trim();
  }


  function rowMatchesProviderAlias(matrix, row, providerKey) {
    const tokens = INVENTORY_PROVIDER_ALIASES[String(providerKey || "").toUpperCase()] || [];
    if (!tokens.length) return false;
    const joined = rowAliasText(matrix, row);
    return tokens.some((token) => joined.includes(token));
  }


  function rowMatchesAnyProviderAlias(matrix, row) {
    return Object.keys(INVENTORY_PROVIDER_ALIASES).some((providerKey) => rowMatchesProviderAlias(matrix, row, providerKey));
  }


  function findInventoryRows(matrix, rowStart) {
    const found = {};
    for (let row = rowStart; row <= matrix.maxRow; row += 1) {
      if (matrix.hiddenRows?.has(row)) continue;
      Object.entries(INVENTORY_PROVIDER_ALIASES).forEach(([channel, tokens]) => {
        if (found[channel] !== undefined) return;
        const joined = rowAliasText(matrix, row);
        if (tokens.some((token) => joined.includes(token))) found[channel] = row;
      });
      if (found.STATION !== undefined && found.NAVER !== undefined) break;
    }
    return found;
  }


  function extractInventoryValuesByDate(matrix, row, dateCols, providerKey = "") {
    const out = {};
    dateCols.forEach((dc) => {
      const raw = matrix.get(row, dc.col).formattedValue;
      const parsed = parseStockValue(raw);
      out[dc.dateKey] = applyProviderMaximumRule(parsed, providerKey, dc.dateKey);
    });
    return out;
  }

  function scoreInventoryDataRow(matrix, row, dateCols) {
    const stats = {
      parsedCount: 0,
      rawCount: 0,
      noteCount: 0,
      formulaCount: 0,
      colorOnlyCount: 0
    };
    (dateCols || []).forEach((dc) => {
      const cell = matrix.get(row, dc.col);
      const raw = normalizeText(cell?.formattedValue || "");
      const note = normalizeText(cell?.note || "");
      const formula = normalizeText(cell?.formula || "");
      const hasColor = Boolean(normalizeText(colorObjToHex(cell?.backgroundColor || null)));
      if (raw) stats.rawCount += 1;
      if (note) stats.noteCount += 1;
      if (formula) stats.formulaCount += 1;
      if (!raw && !note && hasColor) stats.colorOnlyCount += 1;
      if (raw) {
        const low = raw.toLowerCase();
        if (CLOSED_TEXTS.has(low)) {
          stats.parsedCount += 1;
        } else {
          const parsed = parseStockValue(raw);
          if (Number.isInteger(parsed?.current) || Number.isInteger(parsed?.maximum)) {
            stats.parsedCount += 1;
          }
        }
      }
    });
    const score =
      stats.parsedCount * 100 +
      stats.rawCount * 10 +
      stats.noteCount -
      stats.colorOnlyCount * 40 -
      stats.formulaCount * 5;
    return { ...stats, score };
  }


  function detectInventoryTypeKeyFromAlias(alias) {
    const text = normalizeText(alias).toLowerCase();
    if (!text) return "";
    const compact = text.replace(/[^a-z0-9]/g, "");
    if (!compact) return "";
    const containsLabel = (label) => {
      const labelKey = normalizeText(label).toLowerCase().replace(/[^a-z0-9]/g, "");
      if (!labelKey) return false;
      return compact.includes(labelKey) || labelKey.includes(compact);
    };
    if (text.includes("urban") || containsLabel(ROOM_TYPE_LABELS?.urban)) return "urban";
    if (
      (text.includes("double") && text.includes("twin")) ||
      containsLabel(ROOM_TYPE_LABELS?.doubleTwin)
    ) {
      return "doubleTwin";
    }
    if (text.includes("grand") || containsLabel(ROOM_TYPE_LABELS?.grand)) return "grand";
    return "";
  }

  function rowAliasLooksPkg(alias) {
    const text = normalizeText(alias).toLowerCase();
    if (!text) return false;
    return PKG_ROW_LABEL_RE.test(text);
  }


  function collectProviderInventoryDataRows(matrix, startRow, dateCols, limit = 3, options = null) {
    if (!Number.isInteger(startRow)) return [];
    const maxCount = Math.max(1, Number(limit) || 1);
    const typeOrder = ["urban", "doubleTwin", "grand"];
    const includePkgRows = options?.allowPkgInventoryRows === true;
    const providerKeyRaw = normalizeText(options?.providerKey || "").toUpperCase();
    const providerKey = Object.prototype.hasOwnProperty.call(INVENTORY_PROVIDER_ALIASES, providerKeyRaw)
      ? providerKeyRaw
      : "";
    const candidates = [];
    const bestTypedCandidate = {};
    const fallbackRows = [];
    const isDifferentProviderAliasRow = (row) => {
      if (!rowMatchesAnyProviderAlias(matrix, row)) return false;
      if (!providerKey) return true;
      return !rowMatchesProviderAlias(matrix, row, providerKey);
    };
    const evaluateRowCandidate = (row, label, allowAliasRow = false) => {
      if (!allowAliasRow && rowMatchesAnyProviderAlias(matrix, row)) return;
      const safeLabel = normalizeText(label || rowAliasText(matrix, row)).toLowerCase();
      if (safeLabel && ["\uD569\uACC4", "total", "room sold", "sold"].some((token) => safeLabel.includes(token))) return;
      if (!includePkgRows && rowAliasLooksPkg(safeLabel)) return;
      const hasAnyDateValue = (dateCols || []).some((dc) => {
        const cell = matrix.get(row, dc.col);
        return Boolean(
          normalizeText(cell.formattedValue) ||
          normalizeText(cell.note) ||
          normalizeText(colorObjToHex(cell.backgroundColor))
        );
      });
      if (!hasAnyDateValue) return;
      fallbackRows.push(row);
      const stat = scoreInventoryDataRow(matrix, row, dateCols);
      if (stat.parsedCount <= 0) return;
      const typeKey = detectInventoryTypeKeyFromAlias(safeLabel);
      const candidate = { row, typeKey, ...stat };
      candidates.push(candidate);
      if (!typeKey) return;
      const prev = bestTypedCandidate[typeKey];
      if (
        !prev ||
        candidate.score > prev.score ||
        (candidate.score === prev.score && candidate.row < prev.row)
      ) {
        bestTypedCandidate[typeKey] = candidate;
      }
    };

    // Some templates store Urban values on the provider row itself (e.g., "STATION Urban ...").
    // Include this row when it clearly looks like a room-type row to avoid one-row index shifts.
    const providerLabel = rowAliasText(matrix, startRow);
    if (detectInventoryTypeKeyFromAlias(providerLabel)) {
      evaluateRowCandidate(startRow, providerLabel, true);
    }

    const scanStart = startRow + 1; // provider aggregate row is handled via inventory row values.
    const scanEnd = Math.min(matrix.maxRow, scanStart + 20);
    for (let row = scanStart; row <= scanEnd; row += 1) {
      if (matrix.hiddenRows?.has(row)) continue;
      if (isDifferentProviderAliasRow(row)) break;
      evaluateRowCandidate(row, rowAliasText(matrix, row), true);
    }
    if (candidates.length > 0) {
      const pickedRows = new Set();
      const typedSlots = typeOrder
        .slice(0, maxCount)
        .map((typeKey) => {
          const row = bestTypedCandidate[typeKey]?.row;
          if (Number.isInteger(row)) pickedRows.add(row);
          return Number.isInteger(row) ? row : null;
        });
      const hasTypedSlot = typedSlots.some((row) => Number.isInteger(row));
      if (hasTypedSlot) {
        const sorted = [...candidates].sort((a, b) => b.score - a.score || a.row - b.row);
        for (const candidate of sorted) {
          if (pickedRows.has(candidate.row)) continue;
          const emptyIdx = typedSlots.findIndex((row) => !Number.isInteger(row));
          if (emptyIdx < 0) break;
          typedSlots[emptyIdx] = candidate.row;
          pickedRows.add(candidate.row);
        }
        return typedSlots;
      }

      const picked = [];
      const sorted = [...candidates].sort((a, b) => b.score - a.score || a.row - b.row);
      for (const candidate of sorted) {
        if (picked.length >= maxCount) break;
        if (pickedRows.has(candidate.row)) continue;
        picked.push(candidate.row);
        pickedRows.add(candidate.row);
      }
      if (picked.length > 0) return picked;
    }
    return fallbackRows.slice(0, maxCount);
  }


  function extractInventoryRoomValuesByDate(matrix, rows, dateCols, roomPreset, providerKey = "") {
    const out = {};
    (roomPreset || []).forEach((room, index) => {
      const row = Array.isArray(rows) ? rows[index] : null;
      out[room.id] = Number.isInteger(row) ? extractInventoryValuesByDate(matrix, row, dateCols, providerKey) : {};
    });
    return out;
  }

  Object.assign(ns, {
    rowAliasText,
    rowMatchesProviderAlias,
    rowMatchesAnyProviderAlias,
    findInventoryRows,
    extractInventoryValuesByDate,
    collectProviderInventoryDataRows,
    extractInventoryRoomValuesByDate,
  });
})();
