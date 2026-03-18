(() => {
  "use strict";

  const root = globalThis;
  const App = (root.App = root.App || {});
  App.scan = App.scan || {};
  const ns = (App.scan.blockBuilder = App.scan.blockBuilder || {});
  const C = App.constants || {};
  const { ROOM_TYPE_LABELS, ROOM_TYPE_BY_ROOM_NO, DATE_LABEL_RE, ROOM_ROW_SKIP_TOKENS, DATE_HEADER_HINT, CLOSED_TEXTS, IGNORED_COLOR_HEX } = C;
  const N = App.scan?.normalize || {};
  const R = App.engine?.rules || {};
  const { normalizeText, normalizeRoomNoKey, oneBasedToZeroBased, safeInt, sanitizeScanConfig, colZeroToA1 } = N;
  const { colorObjToHex, classifySheetCellStatus, classifySheetCellColorStatus, createCellStatusResolver, isLikelyRoomNo, resolveManualRoomTypeByRow, buildRoomPartitions, mapPresetRoomTypeKeys, inferRoomValueFormat, formatExpectedInventoryRaw, areInventoryRawsEquivalent, scoreRoomTypeMatch, roomNameKey, parseStockValue, resolveExpectedCountsFromStat } = R;

  function rowAliasText(matrix, row) {
    const a = normalizeText(matrix.get(row, 0).formattedValue).toLowerCase();
    const b = normalizeText(matrix.get(row, 1).formattedValue).toLowerCase();
    return `${a} ${b}`.trim();
  }

  function extractTypedCellValue(rawValue) {
    const source = rawValue && typeof rawValue === "object" ? rawValue : {};
    const candidates = [
      ["formulaValue", "FORMULA"],
      ["numberValue", "NUMBER"],
      ["stringValue", "STRING"],
      ["boolValue", "BOOL"],
      ["errorValue", "ERROR"]
    ];
    for (const [key, type] of candidates) {
      if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
      const value = source[key];
      if (value === null || value === undefined) continue;
      return { type, value };
    }
    return { type: "EMPTY", value: null };
  }

  function buildThemeColorMap(spreadsheetTheme) {
    const map = {};
    const themeColors = Array.isArray(spreadsheetTheme?.themeColors) ? spreadsheetTheme.themeColors : [];
    themeColors.forEach((entry) => {
      const typeKey = normalizeText(entry?.colorType || entry?.themeColorType || "").toUpperCase();
      const rgb = entry?.color?.rgbColor;
      if (!typeKey || !rgb || typeof rgb !== "object") return;
      map[typeKey] = rgb;
    });
    return map;
  }

  function resolveColorFromStyle(style, themeColorMap) {
    if (!style || typeof style !== "object") return null;
    if (style.rgbColor && typeof style.rgbColor === "object") return style.rgbColor;
    const themeKey = normalizeText(style.themeColor || "").toUpperCase();
    if (themeKey && themeColorMap && themeColorMap[themeKey]) return themeColorMap[themeKey];
    return null;
  }

  function resolveCellBackgroundColor(eff, entered, themeColorMap) {
    return (
      resolveColorFromStyle(eff?.backgroundColorStyle, themeColorMap) ||
      eff?.backgroundColor ||
      resolveColorFromStyle(entered?.backgroundColorStyle, themeColorMap) ||
      entered?.backgroundColor ||
      null
    );
  }

  function parseSheetCell(raw, themeColorMap) {
    const eff = raw?.effectiveFormat || {};
    const entered = raw?.userEnteredFormat || {};
    const userEnteredValue = raw?.userEnteredValue || {};
    const effectiveValue = raw?.effectiveValue || {};
    const userTyped = extractTypedCellValue(userEnteredValue);
    const effectiveTyped = extractTypedCellValue(effectiveValue);
    return {
      formattedValue: normalizeText(raw?.formattedValue || ""),
      note: normalizeText(raw?.note || ""),
      backgroundColor: resolveCellBackgroundColor(eff, entered, themeColorMap),
      formula: normalizeText(userEnteredValue?.formulaValue || ""),
      userEnteredValueType: userTyped.type,
      userEnteredValueRaw: userTyped.value,
      effectiveValueType: effectiveTyped.type,
      effectiveValueRaw: effectiveTyped.value
    };
  }

  function parseBlockPrice(value) {
    const text = normalizeText(value || "");
    if (!text) return null;
    const matches = text.match(/-?\d[\d,]*/g);
    if (!Array.isArray(matches) || matches.length <= 0) return null;
    let best = "";
    matches.forEach((token) => {
      const digits = String(token || "").replace(/[^\d-]/g, "");
      const bestDigits = best.replace(/[^\d-]/g, "");
      if (!digits || digits === "-") return;
      if (digits.length > bestDigits.length) best = digits;
    });
    if (!best || best === "-") return null;
    const parsed = Number(best.replace(/,/g, ""));
    return Number.isFinite(parsed) ? Math.round(parsed) : null;
  }


  function buildSheetMatrix(grid, startRow1Based, sheetMerges = [], options = null) {
    const startRowFallback = Math.max(0, (Number(startRow1Based) || 1) - 1);
    const startRow = Number.isInteger(grid?.startRow) ? grid.startRow : startRowFallback;
    const startCol = Number.isInteger(grid?.startColumn) ? grid.startColumn : 0;
    const rowData = Array.isArray(grid?.rowData) ? grid.rowData : [];
    const rowMeta = Array.isArray(grid?.rowMetadata) ? grid.rowMetadata : [];
    const themeColorMap = buildThemeColorMap(options?.spreadsheetTheme || null);

    const cells = new Map();
    const hiddenRows = new Set();
    let maxRow = startRow;
    let maxCol = startCol;

    rowData.forEach((rowObj, rowOffset) => {
      const absRow = startRow + rowOffset;
      const meta = rowMeta[rowOffset] || null;
      if (meta?.hiddenByUser === true || meta?.hiddenByFilter === true) hiddenRows.add(absRow);
      const values = Array.isArray(rowObj?.values) ? rowObj.values : [];
      values.forEach((val, colOffset) => {
        const absCol = startCol + colOffset;
        cells.set(`${absRow}:${absCol}`, parseSheetCell(val || {}, themeColorMap));
        if (absCol > maxCol) maxCol = absCol;
      });
      if (absRow > maxRow) maxRow = absRow;
    });

    const mergedAnchorByCell = new Map();
    const mergeRangeByAnchor = new Map();
    const mergeRanges = Array.isArray(sheetMerges) ? sheetMerges : [];
    mergeRanges.forEach((merge) => {
      const sRow = Number(merge?.startRowIndex);
      const eRow = Number(merge?.endRowIndex);
      const sCol = Number(merge?.startColumnIndex);
      const eCol = Number(merge?.endColumnIndex);
      if (!Number.isInteger(sRow) || !Number.isInteger(eRow) || !Number.isInteger(sCol) || !Number.isInteger(eCol)) return;
      if (eRow <= sRow || eCol <= sCol) return;
      const rowFrom = Math.max(sRow, startRow);
      const rowTo = Math.min(eRow - 1, maxRow);
      const colFrom = Math.max(sCol, startCol);
      const colTo = Math.min(eCol - 1, maxCol);
      if (rowFrom > rowTo || colFrom > colTo) return;
      const anchorKey = `${sRow}:${sCol}`;
      mergeRangeByAnchor.set(anchorKey, {
        startRow: sRow,
        endRow: eRow - 1,
        startCol: sCol,
        endCol: eCol - 1
      });
      for (let row = rowFrom; row <= rowTo; row += 1) {
        for (let col = colFrom; col <= colTo; col += 1) {
          if (row === sRow && col === sCol) continue;
          mergedAnchorByCell.set(`${row}:${col}`, anchorKey);
        }
      }
    });

    return {
      startRow,
      startCol,
      maxRow,
      maxCol,
      hiddenRows,
      get(row, col) {
        const key = `${row}:${col}`;
        const raw = cells.get(key) || { formattedValue: "", note: "", backgroundColor: null };
        const anchorKey = mergedAnchorByCell.get(key);
        if (!anchorKey) return raw;
        const rawHasContent = Boolean(normalizeText(raw.formattedValue) || normalizeText(raw.note));
        if (rawHasContent) return raw;
        const anchor = cells.get(anchorKey);
        return anchor || raw;
      },
      getMergeRange(row, col) {
        const key = `${row}:${col}`;
        const anchorKey = mergedAnchorByCell.get(key) || (mergeRangeByAnchor.has(key) ? key : null);
        if (!anchorKey) return null;
        const range = mergeRangeByAnchor.get(anchorKey);
        if (!range) return null;
        return {
          startRow: Number(range.startRow),
          endRow: Number(range.endRow),
          startCol: Number(range.startCol),
          endCol: Number(range.endCol)
        };
      }
    };
  }


  function isoFromDateParts(year, month, day) {
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
    const d = new Date(Date.UTC(year, month - 1, day));
    if (
      d.getUTCFullYear() !== year ||
      d.getUTCMonth() !== month - 1 ||
      d.getUTCDate() !== day
    ) {
      return null;
    }
    const mm = String(month).padStart(2, "0");
    const dd = String(day).padStart(2, "0");
    return `${year}-${mm}-${dd}`;
  }


  function parseDateLabel(label, year) {
    const m = normalizeText(label).match(DATE_LABEL_RE);
    if (!m) return null;
    const month = Number(m[1]);
    const day = Number(m[2]);
    return isoFromDateParts(Number(year), month, day);
  }


  function parseCountIfRangesFromFormula(formula) {
    const text = normalizeText(formula || "").replace(/\$/g, "");
    if (!text) return [];
    const ranges = [];
    const re = /COUNTIF\(\s*([A-Z]{1,3})(\d+)(?:\s*:\s*([A-Z]{1,3})(\d+))?\s*[,;]/gi;
    let match = null;
    while ((match = re.exec(text)) !== null) {
      const start = Number(match[2]);
      const end = Number(match[4] || match[2]);
      if (!Number.isInteger(start) || !Number.isInteger(end)) continue;
      ranges.push({
        startRowOneBased: Math.min(start, end),
        endRowOneBased: Math.max(start, end)
      });
    }
    return ranges;
  }


  function pickNarrowestRange(ranges) {
    let best = null;
    (ranges || []).forEach((range) => {
      const start = Number(range?.startRowOneBased);
      const end = Number(range?.endRowOneBased);
      if (!Number.isInteger(start) || !Number.isInteger(end)) return;
      if (start <= 0 || end <= 0) return;
      const span = Math.max(1, end - start + 1);
      if (!best || span < best.span) {
        best = { startRowOneBased: start, endRowOneBased: end, span };
      }
    });
    return best;
  }


  function parseSoldFormulaHint(formula) {
    const text = normalizeText(formula || "");
    if (!text) return null;
    if (!/COUNTIF\(/i.test(text)) return null;
    if (!/"VAC"/i.test(text) || !/"VIP"/i.test(text) || !/"OOO"/i.test(text)) return null;
    if (!/"\uB9C8\uCF00\uD305"/.test(text) && !/"MARKETING"/i.test(text)) return null;
    const range = pickNarrowestRange(parseCountIfRangesFromFormula(text));
    if (!range) return null;
    const totalMatch = text.match(/=\s*(\d+)\s*-/);
    const total = totalMatch ? Number(totalMatch[1]) : null;
    return {
      kind: "sold",
      total: Number.isInteger(total) ? total : null,
      startRowOneBased: range.startRowOneBased,
      endRowOneBased: range.endRowOneBased
    };
  }


  function parseVacFormulaHint(formula) {
    const text = normalizeText(formula || "");
    if (!text) return null;
    if (!/COUNTIF\(/i.test(text)) return null;
    if (!/"VAC"/i.test(text)) return null;
    const range = pickNarrowestRange(parseCountIfRangesFromFormula(text));
    if (!range) return null;
    return {
      kind: "vac",
      total: null,
      startRowOneBased: range.startRowOneBased,
      endRowOneBased: range.endRowOneBased
    };
  }


  function resolveRoomTypeByAliasText(aliasText) {
    const key = roomNameKey(aliasText);
    if (!key) return "";
    const urbanKey = roomNameKey(ROOM_TYPE_LABELS.urban);
    const doubleTwinKey = roomNameKey(ROOM_TYPE_LABELS.doubleTwin);
    const grandKey = roomNameKey(ROOM_TYPE_LABELS.grand);
    if (
      (urbanKey && (key.includes(urbanKey) || urbanKey.includes(key))) ||
      key.includes("urban")
    ) {
      return "urban";
    }
    if (
      (doubleTwinKey && (key.includes(doubleTwinKey) || doubleTwinKey.includes(key))) ||
      (key.includes("double") && key.includes("twin"))
    ) {
      return "doubleTwin";
    }
    if (
      (grandKey && (key.includes(grandKey) || grandKey.includes(key))) ||
      key.includes("grand")
    ) {
      return "grand";
    }
    return "";
  }


  function inferRoomTypeByNeighborhood(matrix, row) {
    const offsets = [0, -1, 1, -2, 2, -3, 3];
    for (const offset of offsets) {
      const targetRow = row + offset;
      if (targetRow < matrix.startRow || targetRow > matrix.maxRow) continue;
      const alias = rowAliasText(matrix, targetRow);
      const type = resolveRoomTypeByAliasText(alias);
      if (type) return type;
    }
    return "";
  }


  function detectRoomTypeFormulaHints(matrix, dateCols, scanRowRange = null) {
    const empty = {
      roomTypeRanges: { urban: null, doubleTwin: null, grand: null },
      soldRanges: { urban: null, doubleTwin: null, grand: null },
      vacRanges: { urban: null, doubleTwin: null, grand: null },
      expectedTypeTotalsByKey: {},
      expectedTypeCounts: { urban: null, doubleTwin: null, grand: null },
      matches: []
    };
    if (!matrix || !Array.isArray(dateCols) || dateCols.length <= 0) return empty;

    const probeCols = Array.from(new Set(dateCols.map((dc) => dc.col))).slice(0, 14);
    if (probeCols.length <= 0) return empty;

    const candidatesByType = {};
    const pushHint = (type, hint, row, col, alias) => {
      if (!type || !hint) return;
      const start = Math.max(0, Number(hint.startRowOneBased || 1) - 1);
      const end = Math.max(start, Number(hint.endRowOneBased || hint.startRowOneBased || 1) - 1);
      const span = Math.max(1, end - start + 1);
      const bucket = candidatesByType[type] || (candidatesByType[type] = []);
      bucket.push({
        kind: hint.kind,
        total: Number.isInteger(hint.total) ? hint.total : null,
        start,
        end,
        span,
        row,
        col,
        alias
      });
    };

    const minScanRow = Number.isInteger(scanRowRange?.start)
      ? Math.max(matrix.startRow, scanRowRange.start)
      : matrix.startRow;
    const maxScanRow = Number.isInteger(scanRowRange?.end)
      ? Math.min(matrix.maxRow, scanRowRange.end)
      : matrix.maxRow;
    if (maxScanRow < minScanRow) return empty;

    for (let row = minScanRow; row <= maxScanRow; row += 1) {
      if (matrix.hiddenRows?.has(row)) continue;
      for (const col of probeCols) {
        const cell = matrix.get(row, col);
        const formula = normalizeText(cell?.formula || "");
        if (!formula) continue;
        const soldHint = parseSoldFormulaHint(formula);
        const vacHint = soldHint ? null : parseVacFormulaHint(formula);
        if (!soldHint && !vacHint) continue;
        const alias = rowAliasText(matrix, row);
        const type = resolveRoomTypeByAliasText(alias) || inferRoomTypeByNeighborhood(matrix, row);
        if (!type) continue;
        if (soldHint) pushHint(type, soldHint, row, col, alias);
        else pushHint(type, vacHint, row, col, alias);
      }
    }

    const roomTypeRanges = { urban: null, doubleTwin: null, grand: null };
    const expectedTypeCounts = { urban: null, doubleTwin: null, grand: null };
    const expectedTypeTotalsByKey = {};
    const typeToLabel = {
      urban: ROOM_TYPE_LABELS.urban,
      doubleTwin: ROOM_TYPE_LABELS.doubleTwin,
      grand: ROOM_TYPE_LABELS.grand
    };

    const bestByType = {};
    const soldBestByType = {};
    const vacBestByType = {};
    Object.entries(candidatesByType).forEach(([type, candidates]) => {
      const list = Array.isArray(candidates) ? candidates : [];
      if (!list.length) return;
      const soldCandidates = list
        .filter((row) => row.kind === "sold")
        .sort((a, b) => a.span - b.span || a.row - b.row || a.col - b.col);
      const vacCandidates = list
        .filter((row) => row.kind === "vac")
        .sort((a, b) => a.span - b.span || a.row - b.row || a.col - b.col);
      const soldBest = soldCandidates[0] || null;
      const vacBest = vacCandidates[0] || null;
      if (soldBest) soldBestByType[type] = soldBest;
      if (vacBest) vacBestByType[type] = vacBest;
      const total = Number.isInteger(soldBest?.total) ? soldBest.total : null;

      let chosen = soldBest || vacBest || null;
      if (soldBest && vacBest && Number.isInteger(total) && total > 0) {
        const soldDelta = Math.abs(soldBest.span - total);
        const vacDelta = Math.abs(vacBest.span - total);
        chosen = vacDelta < soldDelta ? vacBest : soldBest;
      }
      if (!chosen) return;
      bestByType[type] = {
        ...chosen,
        total
      };
    });

    const soldRanges = { urban: null, doubleTwin: null, grand: null };
    const vacRanges = { urban: null, doubleTwin: null, grand: null };
    Object.entries(soldBestByType).forEach(([type, info]) => {
      soldRanges[type] = { start: info.start, end: info.end };
    });
    Object.entries(vacBestByType).forEach(([type, info]) => {
      vacRanges[type] = { start: info.start, end: info.end };
    });

    Object.entries(bestByType).forEach(([type, info]) => {
      roomTypeRanges[type] = { start: info.start, end: info.end };
      if (Number.isInteger(info.total) && info.total > 0) {
        expectedTypeCounts[type] = info.total;
        const typeKey = roomNameKey(typeToLabel[type] || type);
        if (typeKey) expectedTypeTotalsByKey[typeKey] = info.total;
      }
    });

    const matches = [];
    const appendMatch = (type, info, kind, total = null) => {
      if (!type || !info) return;
      matches.push({
        type,
        kind,
        total: Number.isInteger(total) ? total : null,
        startRow: info.start + 1,
        endRow: info.end + 1,
        formulaRow: info.row + 1,
        formulaCol: info.col + 1,
        alias: info.alias || ""
      });
    };
    ["urban", "doubleTwin", "grand"].forEach((type) => {
      const sold = soldBestByType[type] || null;
      const vac = vacBestByType[type] || null;
      if (sold) appendMatch(type, sold, "sold", sold.total);
      if (vac) appendMatch(type, vac, "vac", null);
      if (!sold && !vac && bestByType[type]) {
        appendMatch(type, bestByType[type], bestByType[type].kind, bestByType[type].total);
      }
    });

    return {
      roomTypeRanges,
      soldRanges,
      vacRanges,
      expectedTypeTotalsByKey,
      expectedTypeCounts,
      matches
    };
  }


  function findDateColumns(matrix, startRow, year, scanConfig = null) {
    const scan = sanitizeScanConfig(scanConfig || {});
    const manualMode = scan.mode === "manual";
    const configuredStartCol = oneBasedToZeroBased(scan.dateStartCol);
    const configuredEndCol = oneBasedToZeroBased(scan.dateEndCol);
    const colStart = Number.isInteger(configuredStartCol) ? Math.max(2, configuredStartCol) : 2;
    const colEnd = Number.isInteger(configuredEndCol)
      ? Math.max(colStart, Math.min(configuredEndCol, matrix.maxCol))
      : matrix.maxCol;

    const buildColsForRow = (row) => {
      const cols = [];
      for (let col = colStart; col <= colEnd; col += 1) {
        const dateKey = parseDateLabel(matrix.get(row, col).formattedValue, year);
        if (dateKey) cols.push({ col, dateKey, label: matrix.get(row, col).formattedValue, weekdayLabel: "" });
      }
      return cols;
    };

    const manualDateRow = oneBasedToZeroBased(scan.dateRow);
    if (manualMode && Number.isInteger(manualDateRow)) {
      const manualCols = buildColsForRow(manualDateRow);
      if (manualCols.length > 0) {
        const manualWeekdayRow = oneBasedToZeroBased(scan.weekdayRow);
        const weekdayRow = Number.isInteger(manualWeekdayRow) ? manualWeekdayRow : manualDateRow + 1;
        manualCols.forEach((item) => {
          item.weekdayLabel = normalizeText(matrix.get(weekdayRow, item.col).formattedValue);
        });
        return { dateRow: manualDateRow, dateCols: manualCols.sort((a, b) => a.col - b.col) };
      }
    }

    const hintDate = parseDateLabel(
      matrix.get(DATE_HEADER_HINT.dateRow, DATE_HEADER_HINT.dateProbeCol).formattedValue,
      year
    );
    if (hintDate) {
      const hintedCols = buildColsForRow(DATE_HEADER_HINT.dateRow);
      if (hintedCols.length >= 7) {
        hintedCols.forEach((item) => {
          item.weekdayLabel = normalizeText(
            matrix.get(DATE_HEADER_HINT.weekdayRow, item.col).formattedValue
          );
        });
        return { dateRow: DATE_HEADER_HINT.dateRow, dateCols: hintedCols.sort((a, b) => a.col - b.col) };
      }
    }

    let bestRow = -1;
    let bestCols = [];

    for (let row = startRow; row <= matrix.maxRow; row += 1) {
      const cols = buildColsForRow(row);
      if (cols.length > bestCols.length) {
        bestCols = cols;
        bestRow = row;
      }
    }

    if (bestRow < 0 || bestCols.length < 7) {
      throw new Error("시트에서 날짜 열을 찾지 못했습니다. (예: 3월 13일)");
    }
    const weekdayRow = bestRow + 1;
    bestCols.forEach((item) => {
      item.weekdayLabel = normalizeText(matrix.get(weekdayRow, item.col).formattedValue);
    });
    return { dateRow: bestRow, dateCols: bestCols.sort((a, b) => a.col - b.col) };
  }


  function mapSheetRoomRowsByPartitions(matrix, partitions, roomTypeByRoomNo = ROOM_TYPE_BY_ROOM_NO) {
    const rows = [];
    const seenRoomNos = new Set();

    (partitions || []).forEach((partition) => {
      const start = Number(partition?.range?.start);
      const end = Number(partition?.range?.end);
      if (!Number.isInteger(start) || !Number.isInteger(end)) return;
      for (let row = start; row <= end; row += 1) {
        if (matrix.hiddenRows?.has(row)) continue;
        const roomNo = normalizeText(matrix.get(row, 1).formattedValue);
        if (!roomNo || !isLikelyRoomNo(roomNo)) continue;
        const alias = rowAliasText(matrix, row);
        if (ROOM_ROW_SKIP_TOKENS.some((token) => alias.includes(token))) continue;
        if (partition?.roomNoPattern && !partition.roomNoPattern.test(roomNo)) continue;
        const roomNoKey = normalizeRoomNoKey(roomNo);
        if (!roomNoKey || seenRoomNos.has(roomNoKey)) continue;
        const explicitRoomType = roomTypeByRoomNo?.[roomNoKey] || "";
        if (!explicitRoomType) continue;
        if (roomNameKey(explicitRoomType) !== roomNameKey(partition.roomType)) continue;
        seenRoomNos.add(roomNoKey);
        rows.push({
          row,
          roomType: explicitRoomType,
          roomTypeKey: roomNameKey(explicitRoomType) || explicitRoomType.toLowerCase(),
          roomNo,
          partitionKey: String(partition.key || "")
        });
      }
    });
    return rows;
  }


  function mapSheetRoomRows(
    matrix,
    dateCols,
    scanRowStart,
    roomTypeByRoomNo = ROOM_TYPE_BY_ROOM_NO,
    roomTypeRanges = null,
    scanRowEnd = null
  ) {
    const rows = [];
    let currentRoomType = "";
    const maxRow = Number.isInteger(scanRowEnd) ? Math.min(scanRowEnd, matrix.maxRow) : matrix.maxRow;
    const hasManualTypeRanges = Boolean(
      roomTypeRanges?.urban || roomTypeRanges?.doubleTwin || roomTypeRanges?.grand
    );

    const inferRoomTypeFromLabel = (value) => {
      const text = normalizeText(value);
      const low = text.toLowerCase();
      if (!low) return "";
      if (low.includes("grand") || text.includes("8인")) return ROOM_TYPE_LABELS.grand;
      if ((low.includes("double") && low.includes("twin")) || text.includes("4인")) return ROOM_TYPE_LABELS.doubleTwin;
      if (low.includes("urban") || text.includes("6인")) return ROOM_TYPE_LABELS.urban;
      return "";
    };

    const rowHasRoomSignals = (row) => {
      const sampleCols = (dateCols || []).slice(0, Math.min((dateCols || []).length, 31));
      if (!sampleCols.length) return false;
      for (const dc of sampleCols) {
        const cell = matrix.get(row, dc.col);
        const raw = normalizeText(cell?.formattedValue || "");
        const note = normalizeText(cell?.note || "");
        const colorHex = normalizeText(colorObjToHex(cell?.backgroundColor || null)).toUpperCase();
        if (note) return true;
        if (colorHex && !(IGNORED_COLOR_HEX instanceof Set && IGNORED_COLOR_HEX.has(colorHex)) && colorHex !== "#FFFFFF") {
          return true;
        }
        const low = raw.toLowerCase();
        if (raw && (CLOSED_TEXTS instanceof Set && CLOSED_TEXTS.has(low))) return true;
        if (["vac", "vip", "ooo", "marketing", "마케팅"].includes(low)) return true;
      }
      return false;
    };

    for (let row = scanRowStart; row <= maxRow; row += 1) {
      if (matrix.hiddenRows?.has(row)) continue;

      const roomTypeRaw = normalizeText(matrix.get(row, 0).formattedValue);
      const roomNo = normalizeText(matrix.get(row, 1).formattedValue);
      if (roomTypeRaw) currentRoomType = roomTypeRaw;
      if (!roomNo) continue;

      const alias = rowAliasText(matrix, row);
      if (ROOM_ROW_SKIP_TOKENS.some((token) => alias.includes(token))) continue;
      if (!isLikelyRoomNo(roomNo)) continue;

      const roomNoKey = normalizeRoomNoKey(roomNo);
      const rangedRoomType = resolveManualRoomTypeByRow(row, roomTypeRanges);
      const inferredRoomType = inferRoomTypeFromLabel(roomTypeRaw || currentRoomType || "");
      const hasRoomSignal = rowHasRoomSignals(row);
      if (hasManualTypeRanges && !rangedRoomType) continue;
      const explicitRoomType = roomTypeByRoomNo?.[roomNoKey] || "";
      const knownRoomNo = Boolean(explicitRoomType);
      if (!knownRoomNo && !rangedRoomType && (!inferredRoomType || !hasRoomSignal)) continue;

      // When the sheet itself provides a stable local room-type header, prefer it over
      // the shared fallback ROOM_MAP. This avoids cross-branch collisions such as
      // Gangnam rows reusing COEX room numbers (401/501/1101/1102).
      const preferLocalHeaderType = !hasManualTypeRanges && Boolean(inferredRoomType) && hasRoomSignal;
      const roomType = rangedRoomType ||
        (preferLocalHeaderType ? inferredRoomType : "") ||
        explicitRoomType ||
        inferredRoomType ||
        currentRoomType ||
        "UNKNOWN_ROOM_TYPE";
      rows.push({
        row,
        roomType,
        roomTypeKey: roomNameKey(roomType) || roomType.toLowerCase(),
        roomNo
      });
    }
    return rows;
  }


  function summarizeRoomTypeStatsByDate(
    matrix,
    dateCols,
    roomRows,
    expectedTypeTotalsByKey = {},
    statusAt = null
  ) {
    const resolveStatus = typeof statusAt === "function" ? statusAt : createCellStatusResolver(matrix);
    const out = {};
    (dateCols || []).forEach((dc) => {
      const day = dc.dateKey;
      const byType = {};
      (roomRows || []).forEach((room) => {
        const typeKey = String(room.roomTypeKey || room.roomType || "unknown");
        if (!byType[typeKey]) {
          byType[typeKey] = {
            roomType: room.roomType,
            total: 0,
            vac: 0,
            empty: 0,
            vip: 0,
            marketing: 0,
            ooo: 0,
            other: 0,
            sold: 0
          };
        }
        const stat = byType[typeKey];
        stat.total += 1;
        const status = resolveStatus(room.row, dc.col);
        if (status === "VAC") stat.vac += 1;
        else if (status === "EMPTY") stat.empty += 1;
        else if (status === "VIP") stat.vip += 1;
        else if (status === "MARKETING") stat.marketing += 1;
        else if (status === "OOO") stat.ooo += 1;
        else if (status === "OTHER") stat.other += 1;
      });
      Object.entries(byType).forEach(([typeKey, stat]) => {
        const expectedTotal = safeInt(expectedTypeTotalsByKey?.[typeKey], stat.total);
        const nonReservation = stat.vac + stat.vip + stat.marketing + stat.ooo;
        // 시트 기준 예약 블록 계산식:
        // 예약건 = 총객실 - (VAC + VIP + 마케팅 + OOO)
        const soldByFormula = Math.max(expectedTotal - nonReservation, 0);
        stat.expectedTotal = expectedTotal;
        stat.nonReservation = nonReservation;
        stat.vacancy = stat.vac; // COUNTIF(...,"VAC")
        stat.soldFormula = soldByFormula;
        stat.soldLegacy = Math.max(stat.vip + stat.marketing + stat.ooo + stat.other, 0);
        stat.sold = soldByFormula;
      });
      out[day] = byType;
    });
    return out;
  }


  function summarizeRoomCellStatuses(matrix, dateCols, roomRows, statusAt = null) {
    const resolveStatus = typeof statusAt === "function" ? statusAt : createCellStatusResolver(matrix);
    const counts = { VAC: 0, EMPTY: 0, VIP: 0, OOO: 0, MARKETING: 0, OTHER: 0 };
    const colorStatusCounts = { OCCUPIED: 0, BLOCKED: 0, VACANT: 0, UNKNOWN: 0 };
    let unknownColorCount = 0;
    const unknownColorCells = [];
    const unknownColorCellLimit = 1200;
    const roomTypeCounts = {};
    const partitionCounts = {};
    (roomRows || []).forEach((room) => {
      const key = String(room?.roomTypeKey || room?.roomType || "UNKNOWN_ROOM_TYPE");
      roomTypeCounts[key] = (roomTypeCounts[key] || 0) + 1;
      const partitionKey = normalizeText(room?.partitionKey || "");
      if (partitionKey) partitionCounts[partitionKey] = (partitionCounts[partitionKey] || 0) + 1;
      (dateCols || []).forEach((dc) => {
        const cell = matrix.get(room.row, dc.col);
        const colorStatus = classifySheetCellColorStatus(cell);
        if (Object.prototype.hasOwnProperty.call(colorStatusCounts, colorStatus.status)) {
          colorStatusCounts[colorStatus.status] += 1;
        }
        if (colorStatus.errorCode) {
          unknownColorCount += 1;
          if (unknownColorCells.length < unknownColorCellLimit) {
            const hex = normalizeText(colorObjToHex(cell?.backgroundColor || null)).toUpperCase();
            unknownColorCells.push({
              date: normalizeText(dc?.dateKey || ""),
              row: Number(room?.row ?? 0) + 1,
              col: Number(dc?.col ?? 0) + 1,
              colA1: colZeroToA1(Number(dc?.col ?? 0)),
              roomNo: normalizeText(room?.roomNo || ""),
              roomType: normalizeText(room?.roomType || ""),
              roomTypeKey: normalizeText(room?.roomTypeKey || ""),
              colorHex: hex || "",
              errorCode: normalizeText(colorStatus.errorCode || "")
            });
          }
        }
        const status = resolveStatus(room.row, dc.col);
        if (!counts[status]) counts[status] = 0;
        counts[status] += 1;
      });
    });
    return {
      roomRows: (roomRows || []).length,
      dayCount: (dateCols || []).length,
      totalCells: (roomRows || []).length * (dateCols || []).length,
      statusCounts: counts,
      colorStatusCounts,
      unknownColorCount,
      unknownColorCells,
      unknownColorOverflow: Math.max(unknownColorCount - unknownColorCells.length, 0),
      roomTypeCounts,
      partitionCounts
    };
  }


  function countExpectedRoomTypesFromMap(roomTypeByRoomNo = ROOM_TYPE_BY_ROOM_NO) {
    const out = {
      urban: 0,
      doubleTwin: 0,
      grand: 0
    };
    Object.values(roomTypeByRoomNo || {}).forEach((roomTypeRaw) => {
      const key = roomNameKey(roomTypeRaw);
      if (key === roomNameKey(ROOM_TYPE_LABELS.urban)) out.urban += 1;
      else if (key === roomNameKey(ROOM_TYPE_LABELS.doubleTwin)) out.doubleTwin += 1;
      else if (key === roomNameKey(ROOM_TYPE_LABELS.grand)) out.grand += 1;
    });
    return out;
  }


  function buildExpectedRoomTypeTotalsByKey(roomTypeByRoomNo = ROOM_TYPE_BY_ROOM_NO) {
    const out = {};
    Object.values(roomTypeByRoomNo || {}).forEach((roomTypeRaw) => {
      const key = roomNameKey(roomTypeRaw);
      if (!key) return;
      out[key] = (out[key] || 0) + 1;
    });
    return out;
  }


  function summarizeDetectedRoomTypeCounts(roomTypeCounts = {}) {
    const out = {
      urban: 0,
      doubleTwin: 0,
      grand: 0
    };
    Object.entries(roomTypeCounts || {}).forEach(([roomTypeKey, count]) => {
      const key = roomNameKey(roomTypeKey);
      if (key === roomNameKey(ROOM_TYPE_LABELS.urban)) out.urban += safeInt(count, 0);
      else if (key === roomNameKey(ROOM_TYPE_LABELS.doubleTwin)) out.doubleTwin += safeInt(count, 0);
      else if (key === roomNameKey(ROOM_TYPE_LABELS.grand)) out.grand += safeInt(count, 0);
    });
    return out;
  }


  function countExpectedPartitionRooms(roomTypeByRoomNo = ROOM_TYPE_BY_ROOM_NO) {
    const out = {
      urban_num: 0,
      urban_alpha: 0,
      double_num: 0,
      double_alpha: 0,
      grand: 0
    };
    Object.entries(roomTypeByRoomNo || {}).forEach(([roomNoRaw, roomTypeRaw]) => {
      const roomNo = normalizeRoomNoKey(roomNoRaw);
      const key = roomNameKey(roomTypeRaw);
      const isAlpha = /^A/.test(roomNo);
      if (key === roomNameKey(ROOM_TYPE_LABELS.urban)) out[isAlpha ? "urban_alpha" : "urban_num"] += 1;
      else if (key === roomNameKey(ROOM_TYPE_LABELS.doubleTwin)) out[isAlpha ? "double_alpha" : "double_num"] += 1;
      else if (key === roomNameKey(ROOM_TYPE_LABELS.grand)) out.grand += 1;
    });
    return out;
  }


  function summarizeDetectedPartitionCounts(partitionCounts = {}) {
    return {
      urban_num: safeInt(partitionCounts.urban_num ?? 0),
      urban_alpha: safeInt(partitionCounts.urban_alpha ?? 0),
      double_num: safeInt(partitionCounts.double_num ?? 0),
      double_alpha: safeInt(partitionCounts.double_alpha ?? 0),
      grand: safeInt(partitionCounts.grand ?? 0)
    };
  }

  function quickNoteHash(value) {
    const text = String(value ?? "");
    let h = 0;
    for (let i = 0; i < text.length; i += 1) {
      h = (h * 31 + text.charCodeAt(i)) >>> 0;
    }
    return h.toString(36);
  }

  function extractReservationBlocksByDate(matrix, dateCols, roomRows, options = null) {
    const opts = options && typeof options === "object" ? options : {};
    const mode = normalizeText(opts.mode || "full").toLowerCase() === "provider" ? "provider" : "full";
    const providerChannels = new Set(
      (Array.isArray(opts.providerChannels) ? opts.providerChannels : ["NAVER", "STATION"])
        .map((value) => normalizeText(value || "").toUpperCase())
        .filter(Boolean)
    );
    const includeBlocked = opts.includeBlocked !== false;
    const sortedDateCols = [...(dateCols || [])]
      .filter((dc) => Number.isInteger(dc?.col) && normalizeText(dc?.dateKey))
      .sort((a, b) => a.col - b.col);
    if (!sortedDateCols.length || !(roomRows || []).length) {
      return { blocks: [], cellMap: {} };
    }

    const dayByCol = new Map(sortedDateCols.map((dc) => [dc.col, dc.dateKey]));
    const blocks = [];
    const cellMap = {};
    let blockSeq = 0;

    const addBlock = (
      room,
      statusKind,
      channel,
      note,
      source,
      cols,
      mergeRange = null
    ) => {
      const dateKeys = cols.map((col) => dayByCol.get(col)).filter(Boolean);
      if (!dateKeys.length) return;
      const startCol = cols[0];
      const endCol = cols[cols.length - 1];
      const startCell = matrix.get(Number(room?.row ?? 0), startCol);
      const price = parseBlockPrice(startCell?.formattedValue || "");
      blockSeq += 1;
      const blockId = `B${blockSeq}`;
      const noteKey = note ? `note:${quickNoteHash(note)}` : "";
      const block = {
        blockId,
        kind: statusKind,
        row: Number(room?.row ?? 0) + 1,
        roomNo: normalizeText(room?.roomNo || ""),
        roomType: normalizeText(room?.roomType || ""),
        roomTypeKey: normalizeText(room?.roomTypeKey || ""),
        channel: normalizeText(channel || ""),
        note,
        noteKey,
        source,
        merge: mergeRange
          ? {
              startRow: Number(mergeRange.startRow) + 1,
              endRow: Number(mergeRange.endRow) + 1,
              startCol: Number(mergeRange.startCol) + 1,
              endCol: Number(mergeRange.endCol) + 1,
              startColA1: colZeroToA1(Number(mergeRange.startCol)),
              endColA1: colZeroToA1(Number(mergeRange.endCol))
            }
          : null,
        startCol: startCol + 1,
        endCol: endCol + 1,
        startColA1: colZeroToA1(startCol),
        endColA1: colZeroToA1(endCol),
        startDate: dateKeys[0],
        endDate: dateKeys[dateKeys.length - 1],
        nights: dateKeys.length,
        dateKeys,
        price
      };
      blocks.push(block);
      dateKeys.forEach((day, idx) => {
        const col = cols[idx];
        const key = `${room.row}:${day}`;
        cellMap[key] = {
          blockId,
          kind: statusKind,
          channel: block.channel,
          roomRow: block.row,
          roomNo: block.roomNo,
          roomType: block.roomType,
          roomTypeKey: block.roomTypeKey,
          col: Number(col) + 1,
          colA1: colZeroToA1(Number(col)),
          source
        };
      });
    };

    const classifyBlockSeed = (cell) => {
      const colorStatus = classifySheetCellColorStatus(cell);
      const note = normalizeText(cell?.note || "");
      if (colorStatus.status === "OCCUPIED") {
        const channel = normalizeText(colorStatus.channel || "UNKNOWN");
        if (mode === "provider" && !providerChannels.has(channel.toUpperCase())) {
          return { include: false, kind: "", channel: "", note: "" };
        }
        return {
          include: true,
          kind: "RESERVATION",
          channel,
          note
        };
      }
      if (colorStatus.status === "BLOCKED" && includeBlocked) {
        return {
          include: true,
          kind: "BLOCKED",
          channel: normalizeText(colorStatus.channel || "BLOCKED"),
          note
        };
      }
      if (mode === "full" && note) {
        return {
          include: true,
          kind: "RESERVATION",
          channel: "UNKNOWN",
          note
        };
      }
      return { include: false, kind: "", channel: "", note: "" };
    };

    (roomRows || [])
      .slice()
      .sort((a, b) => Number(a?.row ?? 0) - Number(b?.row ?? 0))
      .forEach((room) => {
        const row = Number(room?.row);
        if (!Number.isInteger(row)) return;
        let i = 0;
        while (i < sortedDateCols.length) {
          const dc = sortedDateCols[i];
          const col = dc.col;
          const cell = matrix.get(row, col);
          const seed = classifyBlockSeed(cell);
          if (!seed.include) {
            i += 1;
            continue;
          }

          const mergeRange = typeof matrix.getMergeRange === "function" ? matrix.getMergeRange(row, col) : null;
          const isRowMerge =
            Number.isInteger(mergeRange?.startRow) &&
            Number.isInteger(mergeRange?.endRow) &&
            Number.isInteger(mergeRange?.startCol) &&
            Number.isInteger(mergeRange?.endCol) &&
            mergeRange.startRow === row &&
            mergeRange.endRow === row &&
            mergeRange.startCol < mergeRange.endCol;

          if (isRowMerge) {
            if (col !== mergeRange.startCol) {
              i += 1;
              continue;
            }
            const mergedCols = [];
            let j = i;
            while (j < sortedDateCols.length && sortedDateCols[j].col <= mergeRange.endCol) {
              if (sortedDateCols[j].col >= mergeRange.startCol) mergedCols.push(sortedDateCols[j].col);
              j += 1;
            }
            if (mergedCols.length > 0) {
              addBlock(room, seed.kind, seed.channel, seed.note, "MERGED", mergedCols, mergeRange);
            }
            i = j;
            continue;
          }

          const runCols = [col];
          const noteKey = seed.note ? quickNoteHash(seed.note) : "";
          let j = i + 1;
          while (j < sortedDateCols.length) {
            const nextCol = sortedDateCols[j].col;
            const nextMerge = typeof matrix.getMergeRange === "function" ? matrix.getMergeRange(row, nextCol) : null;
            const nextIsRowMerge =
              Number.isInteger(nextMerge?.startRow) &&
              Number.isInteger(nextMerge?.endRow) &&
              nextMerge.startRow === row &&
              nextMerge.endRow === row &&
              nextMerge.startCol < nextMerge.endCol;
            if (nextIsRowMerge) break;

            const nextCell = matrix.get(row, nextCol);
            const nextSeed = classifyBlockSeed(nextCell);
            if (!nextSeed.include) break;
            if (nextSeed.kind !== seed.kind) break;
            if (normalizeText(nextSeed.channel || "") !== normalizeText(seed.channel || "")) break;
            const nextNoteKey = nextSeed.note ? quickNoteHash(nextSeed.note) : "";
            if (noteKey !== nextNoteKey) break;
            runCols.push(nextCol);
            j += 1;
          }

          addBlock(room, seed.kind, seed.channel, seed.note, "CELL_RUN", runCols, null);
          i = j;
        }
      });

    return { blocks, cellMap };
  }


  function buildDerivedRoomValuesFromSheetState(
    matrix,
    dateRow,
    dateCols,
    roomPreset,
    originalRoomValues,
    roomStartRowOverride = null,
    roomTypeByRoomNo = ROOM_TYPE_BY_ROOM_NO,
    providerKey = "",
    roomTypeRanges = null,
    roomScanEndRowOverride = null,
    expectedTypeTotalsByKeyOverride = null
  ) {
    const roomStartRow = Number.isInteger(roomStartRowOverride) ? roomStartRowOverride : dateRow + 2;
    const roomPartitions = buildRoomPartitions(roomTypeRanges);
    const roomRows = roomPartitions.length > 0
      ? mapSheetRoomRowsByPartitions(matrix, roomPartitions, roomTypeByRoomNo)
      : mapSheetRoomRows(
          matrix,
          dateCols,
          roomStartRow,
          roomTypeByRoomNo,
          roomTypeRanges,
          roomScanEndRowOverride
        );
    if (!roomRows.length) {
      const statusAt = createCellStatusResolver(matrix);
      return {
        roomValues: originalRoomValues || {},
        correctionCount: 0,
        roomRows: [],
        roomTypeMap: {},
        diagnostics: summarizeRoomCellStatuses(matrix, dateCols, roomRows, statusAt),
        expectedTypeTotalsByKey:
          expectedTypeTotalsByKeyOverride && Object.keys(expectedTypeTotalsByKeyOverride).length > 0
            ? { ...expectedTypeTotalsByKeyOverride }
            : buildExpectedRoomTypeTotalsByKey(roomTypeByRoomNo)
      };
    }

    const statusAt = createCellStatusResolver(matrix);
    const expectedTypeTotalsByKey =
      expectedTypeTotalsByKeyOverride && Object.keys(expectedTypeTotalsByKeyOverride).length > 0
        ? { ...expectedTypeTotalsByKeyOverride }
        : buildExpectedRoomTypeTotalsByKey(roomTypeByRoomNo);
    const statsByDateType = summarizeRoomTypeStatsByDate(
      matrix,
      dateCols,
      roomRows,
      expectedTypeTotalsByKey,
      statusAt
    );
    const roomTypeKeys = Array.from(new Set(roomRows.map((row) => String(row.roomTypeKey || "")).filter(Boolean)));
    const roomTypeMap = mapPresetRoomTypeKeys(roomPreset, roomTypeKeys);
    const out = {};
    let correctionCount = 0;

    (roomPreset || []).forEach((room) => {
      const roomId = String(room.id);
      const roomTypeKey = roomTypeMap.get(roomId);
      const currentByDate = originalRoomValues?.[roomId] || {};
      const statsByDay = {};
      (dateCols || []).forEach((dc) => {
        statsByDay[dc.dateKey] = roomTypeKey ? statsByDateType?.[dc.dateKey]?.[roomTypeKey] || null : null;
      });
      const formatKind = inferRoomValueFormat(currentByDate, statsByDay, providerKey);
      const roomOut = {};

      (dateCols || []).forEach((dc) => {
        const day = dc.dateKey;
        const stat = statsByDay[day];
        const existing = currentByDate?.[day] || parseStockValue("");
        if (!stat) {
          roomOut[day] = existing;
          return;
        }
        const expectedCounts = resolveExpectedCountsFromStat(stat, providerKey, day, existing);
        const expectedRaw = formatExpectedInventoryRaw(
          formatKind,
          stat,
          providerKey,
          day,
          existing,
          expectedCounts
        );
        if (!expectedRaw) {
          roomOut[day] = existing;
          return;
        }
        const originalRaw = normalizeText(existing?.raw || "");
        const corrected = !areInventoryRawsEquivalent(originalRaw, expectedRaw, providerKey, day);
        if (corrected) {
          correctionCount += 1;
          roomOut[day] = {
            ...parseStockValue(expectedRaw),
            raw: expectedRaw,
            corrected: true,
            originalRaw,
            roomType: stat.roomType,
            formatKind,
            stationVacQualified: expectedCounts?.stationVacQualified === true
          };
        } else {
          roomOut[day] = {
            ...existing,
            corrected: false,
            originalRaw,
            roomType: stat.roomType,
            formatKind,
            stationVacQualified: expectedCounts?.stationVacQualified === true
          };
        }
      });
      out[roomId] = roomOut;
    });

    return {
      roomValues: out,
      correctionCount,
      roomRows: [...roomRows],
      roomTypeMap: Object.fromEntries(roomTypeMap.entries()),
      diagnostics: summarizeRoomCellStatuses(matrix, dateCols, roomRows, statusAt),
      expectedTypeTotalsByKey
    };
  }

  function buildRoomTypeMapFromSheetLocalHeaders(
    matrix,
    dateCols,
    scanRowStart,
    roomTypeRanges = null,
    scanRowEnd = null
  ) {
    const rows = mapSheetRoomRows(matrix, dateCols, scanRowStart, {}, roomTypeRanges, scanRowEnd);
    const out = {};
    (rows || []).forEach((row) => {
      const roomNoKey = normalizeRoomNoKey(row?.roomNo || "");
      const roomType = normalizeText(row?.roomType || "");
      if (!roomNoKey || !roomType) return;
      out[roomNoKey] = roomType;
    });
    return out;
  }

  Object.assign(ns, {
    parseSheetCell,
    buildSheetMatrix,
    isoFromDateParts,
    parseDateLabel,
    detectRoomTypeFormulaHints,
    findDateColumns,
    mapSheetRoomRowsByPartitions,
    mapSheetRoomRows,
    summarizeRoomTypeStatsByDate,
    summarizeRoomCellStatuses,
    countExpectedRoomTypesFromMap,
    buildExpectedRoomTypeTotalsByKey,
    summarizeDetectedRoomTypeCounts,
    countExpectedPartitionRooms,
    summarizeDetectedPartitionCounts,
    extractReservationBlocksByDate,
    buildDerivedRoomValuesFromSheetState,
    buildRoomTypeMapFromSheetLocalHeaders,
  });
})();
