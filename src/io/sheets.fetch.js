(() => {
  "use strict";

  const root = globalThis;
  const App = (root.App = root.App || {});
  App.io = App.io || {};
  const ns = (App.io.sheetsFetch = App.io.sheetsFetch || {});
  const entryPolicy = root.InventoryEntryPolicy || {};
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
  const K = App.engine?.noteKey || {};
  const R = App.engine?.rules || {};
  const B = App.scan?.blockBuilder || {};
  const A = App.scan?.aggregator || {};
  const { normalizeText, parseJsonMaybe, sanitizeScanConfig, parseOptionalPositiveInt, parseColumnRefToOneBased, oneBasedToZeroBased, colZeroToA1, gridRangeToA1, parseScanConfigFromValuesGrid, parseRoomTypeMapFromValuesGrid, extractSpreadsheetId, ensureGoogleAccessToken, resolveEffectiveScanConfig, mergeRoomTypeMap, hasGoogleRefreshCredentials, normalizeScanKey } = N;
  const { buildSnapshotCacheKey, buildSnapshotQuickCacheKey, digestValueRanges } = K;
  const { buildManualRoomTypeRanges, hasCompleteManualRoomTypeRanges, areInventoryRawsEquivalent, parseStockValue, colorObjToHex } = R;
  const {
    buildSheetMatrix,
    findDateColumns,
    detectRoomTypeFormulaHints,
    extractReservationBlocksByDate,
    buildDerivedRoomValuesFromSheetState,
    countExpectedRoomTypesFromMap,
    summarizeDetectedRoomTypeCounts,
    countExpectedPartitionRooms,
    summarizeDetectedPartitionCounts
  } = B;
  const {
    rowAliasText,
    rowMatchesAnyProviderAlias,
    findInventoryRows,
    collectProviderInventoryDataRows,
    extractInventoryRoomValuesByDate,
    extractInventoryValuesByDate
  } = A;
  const PKG_ROW_LABEL_RE = /(pkg|package|\uD328\uD0A4\uC9C0)/i;
  function detectContext() {
    const providerType =
      typeof entryPolicy.detectProviderTypeFromHost === "function"
        ? entryPolicy.detectProviderTypeFromHost(location.host)
        : "";
    if (providerType === "naver-partner") return { providerType, siteName: TEXT.naver };
    if (providerType === "admin-station") return { providerType, siteName: TEXT.station };
    return null;
  }

  const context = detectContext();
  if (!context) return;
  const sheetReadHintsCache = new Map();
  const sheetSnapshotCache = new Map();

  function toPositiveIntOrNull(value) {
    const n = Number(value);
    if (!Number.isInteger(n) || n <= 0) return null;
    return n;
  }

  function buildScanValidationIssues(
    expectedTypeCounts,
    detectedRoomCount,
    hasTypeMismatch,
    hasInsufficientRows,
    extraIssues = []
  ) {
    const issues = [];
    const expected = expectedTypeCounts || {};
    ["urban", "doubleTwin", "grand"].forEach((type) => {
      const value = Number(expected[type]);
      if (!Number.isInteger(value) || value <= 0) {
        issues.push({
          code: "EXPECTED_TYPE_COUNT_NON_POSITIVE",
          severity: "error",
          type,
          value: Number.isFinite(value) ? value : null,
          message: `Expected room type count must be positive: ${type}=${value}`
        });
      }
    });
    if (!Number.isInteger(Number(detectedRoomCount)) || Number(detectedRoomCount) <= 0) {
      issues.push({
        code: "DETECTED_ROOM_COUNT_NON_POSITIVE",
        severity: "error",
        value: Number(detectedRoomCount),
        message: `Detected room row count must be positive: detected=${detectedRoomCount}`
      });
    }
    if (hasTypeMismatch) {
      issues.push({
        code: "ROOM_TYPE_COUNT_MISMATCH",
        severity: "warn",
        message: "Detected room type counts mismatch expected counts."
      });
    }
    if (hasInsufficientRows) {
      issues.push({
        code: "ROOM_ROWS_INSUFFICIENT",
        severity: "warn",
        message: "Detected room rows are insufficient compared with expected counts."
      });
    }
    if (Array.isArray(extraIssues) && extraIssues.length > 0) {
      extraIssues.forEach((issue) => {
        if (!issue || typeof issue !== "object") return;
        if (!normalizeText(issue.code)) return;
        const severity = String(issue.severity || "warn").toLowerCase() === "error" ? "error" : "warn";
        issues.push({
          code: String(issue.code),
          severity,
          value: Number.isFinite(Number(issue.value)) ? Number(issue.value) : null,
          message: String(issue.message || "")
        });
      });
    }
    return issues;
  }

  function buildRawDerivedMismatchIssues(providerKey, dateCols, rawRoomValues, derivedRoomValues) {
    const dates = Array.isArray(dateCols) ? dateCols.map((dc) => dc?.dateKey).filter(Boolean) : [];
    if (!dates.length) return { issues: [], comparedCount: 0, mismatchCount: 0 };

    let comparedCount = 0;
    let mismatchCount = 0;

    Object.keys(rawRoomValues || {}).forEach((roomId) => {
      const rawByDate = rawRoomValues?.[roomId] || {};
      const derivedByDate = derivedRoomValues?.[roomId] || {};
      dates.forEach((day) => {
        const raw = normalizeText(rawByDate?.[day]?.raw || "");
        const derived = normalizeText(derivedByDate?.[day]?.raw || "");
        if (!raw || !derived) return;
        comparedCount += 1;
        if (!areInventoryRawsEquivalent(raw, derived, providerKey, day)) mismatchCount += 1;
      });
    });

    const issues = [];
    if (mismatchCount > 0) {
      issues.push({
        code: "RAW_DERIVED_VALUE_MISMATCH",
        severity: "warn",
        value: mismatchCount,
        message: `Raw inventory rows and derived room values differ (${mismatchCount}/${comparedCount}).`
      });
    }
    return { issues, comparedCount, mismatchCount };
  }

  function buildFormulaSoldVacRangeMismatchIssues(formulaHints) {
    const issues = [];
    const soldRanges = formulaHints?.soldRanges || {};
    const vacRanges = formulaHints?.vacRanges || {};
    ["urban", "doubleTwin", "grand"].forEach((type) => {
      const sold = soldRanges?.[type];
      const vac = vacRanges?.[type];
      if (!Number.isInteger(sold?.start) || !Number.isInteger(sold?.end)) return;
      if (!Number.isInteger(vac?.start) || !Number.isInteger(vac?.end)) return;
      if (sold.start === vac.start && sold.end === vac.end) return;
      issues.push({
        code: "FORMULA_SOLD_VAC_RANGE_MISMATCH",
        severity: "warn",
        message:
          `${type} formula range mismatch (SOLD ${sold.start + 1}-${sold.end + 1} vs VAC ${vac.start + 1}-${vac.end + 1}).`
      });
    });
    return issues;
  }

  function buildProviderValueRowMismatchIssues(providerKey, dateCols, providerRowValues, chosenRowValues, providerRow, chosenRow) {
    const issues = [];
    if (!Number.isInteger(providerRow) || !Number.isInteger(chosenRow) || providerRow === chosenRow) {
      return { issues, comparedCount: 0, mismatchCount: 0 };
    }
    const dates = Array.isArray(dateCols) ? dateCols.map((dc) => dc?.dateKey).filter(Boolean) : [];
    let comparedCount = 0;
    let mismatchCount = 0;
    dates.forEach((day) => {
      const leftRaw = normalizeText(providerRowValues?.[day]?.raw || "");
      const rightRaw = normalizeText(chosenRowValues?.[day]?.raw || "");
      if (!leftRaw || !rightRaw) return;
      comparedCount += 1;
      if (!areInventoryRawsEquivalent(leftRaw, rightRaw, providerKey, day)) mismatchCount += 1;
    });
    if (comparedCount > 0 && mismatchCount > 0) {
      issues.push({
        code: "PROVIDER_VALUE_ROW_MISMATCH",
        severity: "warn",
        value: mismatchCount,
        message:
          `${providerKey} provider row ${providerRow + 1} and value row ${chosenRow + 1} differ (${mismatchCount}/${comparedCount}).`
      });
    }
    return { issues, comparedCount, mismatchCount };
  }

  function buildProviderValueSourceCoverageIssues(providerKey, dateCols, valuesByDate, selectedRow) {
    const issues = [];
    const dates = Array.isArray(dateCols) ? dateCols.map((dc) => dc?.dateKey).filter(Boolean) : [];
    if (!dates.length) return { issues, rawCount: 0, parsedCount: 0 };
    let rawCount = 0;
    let parsedCount = 0;
    dates.forEach((day) => {
      const raw = normalizeText(valuesByDate?.[day]?.raw || "");
      if (!raw) return;
      rawCount += 1;
      const low = raw.toLowerCase();
      if (CLOSED_TEXTS.has(low)) {
        parsedCount += 1;
        return;
      }
      const parsed = parseStockValue(raw);
      if (Number.isInteger(parsed?.current) || Number.isInteger(parsed?.maximum)) parsedCount += 1;
    });
    if (rawCount <= 0 || parsedCount <= 0) {
      issues.push({
        code: "PROVIDER_VALUE_SOURCE_EMPTY",
        severity: "error",
        value: parsedCount,
        message: `${providerKey} value source row ${Number.isInteger(selectedRow) ? selectedRow + 1 : "-"} has no parsable inventory values.`
      });
      return { issues, rawCount, parsedCount };
    }
    if (parsedCount < Math.max(1, Math.ceil(dates.length * 0.5))) {
      issues.push({
        code: "PROVIDER_VALUE_SOURCE_LOW_COVERAGE",
        severity: "warn",
        value: parsedCount,
        message:
          `${providerKey} value source row ${Number.isInteger(selectedRow) ? selectedRow + 1 : "-"} has low parsed coverage (${parsedCount}/${dates.length}).`
      });
    }
    return { issues, rawCount, parsedCount };
  }

  function oneBasedRangeLabel(range) {
    if (!Number.isInteger(range?.start) && !Number.isInteger(range?.end)) return "-";
    const start = Number.isInteger(range?.start) ? range.start + 1 : null;
    const end = Number.isInteger(range?.end) ? range.end + 1 : null;
    if (Number.isInteger(start) && Number.isInteger(end)) return `${Math.min(start, end)}~${Math.max(start, end)}`;
    return Number.isInteger(start) ? String(start) : Number.isInteger(end) ? String(end) : "-";
  }

  function buildInventoryDataRowSlotIssues(providerKey, dataRows, manualTypeRanges = null, options = null) {
    const issues = [];
    const slots = Array.isArray(dataRows) ? dataRows.slice(0, 3) : [];
    const mode = normalizeText(options?.mode || "auto").toLowerCase() === "manual" ? "manual" : "auto";
    const hasCompleteManualTypeRanges = options?.hasCompleteManualTypeRanges === true;
    const strictMode = mode === "manual" || hasCompleteManualTypeRanges;
    const slotRows = {
      urban: Number.isInteger(slots[0]) ? slots[0] + 1 : null,
      doubleTwin: Number.isInteger(slots[1]) ? slots[1] + 1 : null,
      grand: Number.isInteger(slots[2]) ? slots[2] + 1 : null
    };
    if (!Number.isInteger(slots[0]) || !Number.isInteger(slots[1]) || !Number.isInteger(slots[2])) {
      const manualHint = manualTypeRanges
        ? ` (manual U ${oneBasedRangeLabel(manualTypeRanges?.urban)}, D ${oneBasedRangeLabel(manualTypeRanges?.doubleTwin)}, G ${oneBasedRangeLabel(manualTypeRanges?.grand)})`
        : "";
      issues.push({
        code: "INVENTORY_DATA_ROW_SLOT_MISSING",
        severity: strictMode ? "error" : "warn",
        message:
          `${providerKey} inventory data row slots are incomplete. ` +
          `urban=${slotRows.urban ?? "-"}, doubleTwin=${slotRows.doubleTwin ?? "-"}, grand=${slotRows.grand ?? "-"}${manualHint}` +
          (!strictMode ? " (auto mode: continuing with derived/provider fallback)" : "")
      });
      return issues;
    }

    const uniqueRows = new Set(slots);
    if (uniqueRows.size !== slots.length) {
      issues.push({
        code: "INVENTORY_DATA_ROW_SLOT_DUPLICATE",
        severity: "error",
        message:
          `${providerKey} inventory data row slots contain duplicate rows. ` +
          `urban=${slotRows.urban}, doubleTwin=${slotRows.doubleTwin}, grand=${slotRows.grand}`
      });
    }
    if (!(slots[0] < slots[1] && slots[1] < slots[2])) {
      issues.push({
        code: "INVENTORY_DATA_ROW_SLOT_ORDER_INVALID",
        severity: "error",
        message:
          `${providerKey} inventory data row slots must be strictly increasing. ` +
          `urban=${slotRows.urban}, doubleTwin=${slotRows.doubleTwin}, grand=${slotRows.grand}`
      });
    }
    return issues;
  }

  function normalizeOneBasedRange(startOneBased, endOneBased) {
    const startRaw = oneBasedToZeroBased(startOneBased);
    const endRaw = oneBasedToZeroBased(endOneBased);
    let start = Number.isInteger(startRaw) ? startRaw : null;
    let end = Number.isInteger(endRaw) ? endRaw : null;
    if (!Number.isInteger(start) && Number.isInteger(end)) start = end;
    if (Number.isInteger(start) && !Number.isInteger(end)) end = start;
    if (!Number.isInteger(start) || !Number.isInteger(end)) return null;
    if (end < start) return { start: end, end: start };
    return { start, end };
  }

  function buildProviderInventoryTypeRanges(scanCfg, providerKey) {
    const prefix = String(providerKey || "").toUpperCase() === "STATION" ? "station" : "naver";
    const upperFirst = (text) => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
    const pick = (typeKey) => {
      const startKey = `${prefix}${upperFirst(typeKey)}StartRow`;
      const endKey = `${prefix}${upperFirst(typeKey)}EndRow`;
      return normalizeOneBasedRange(scanCfg?.[startKey], scanCfg?.[endKey]);
    };
    return {
      urban: pick("urban"),
      doubleTwin: pick("doubleTwin"),
      grand: pick("grand")
    };
  }

  function hasCompleteProviderInventoryTypeRanges(typeRanges) {
    const ranges = typeRanges || {};
    return (
      Number.isInteger(ranges?.urban?.start) &&
      Number.isInteger(ranges?.urban?.end) &&
      Number.isInteger(ranges?.doubleTwin?.start) &&
      Number.isInteger(ranges?.doubleTwin?.end) &&
      Number.isInteger(ranges?.grand?.start) &&
      Number.isInteger(ranges?.grand?.end)
    );
  }

  function hasAnyProviderInventoryTypeRanges(typeRanges) {
    const keys = ["urban", "doubleTwin", "grand"];
    return keys.some((key) => {
      const range = typeRanges?.[key];
      return Number.isInteger(range?.start) || Number.isInteger(range?.end);
    });
  }

  function buildRoomSoldVacFormulaScanRange(scanCfg) {
    return normalizeOneBasedRange(scanCfg?.roomSoldVacScanStartRow, scanCfg?.roomSoldVacScanEndRow);
  }

  function toOneBasedRangeObject(range) {
    return {
      startRow: Number.isInteger(range?.start) ? range.start + 1 : null,
      endRow: Number.isInteger(range?.end) ? range.end + 1 : null
    };
  }

  function toOneBasedTypeRanges(typeRanges) {
    return {
      urban: toOneBasedRangeObject(typeRanges?.urban),
      doubleTwin: toOneBasedRangeObject(typeRanges?.doubleTwin),
      grand: toOneBasedRangeObject(typeRanges?.grand)
    };
  }

  function rowAliasHasInventoryTypeKey(label) {
    const text = normalizeText(label).toLowerCase();
    if (!text) return false;
    const compact = text.replace(/[^a-z0-9]/g, "");
    if (!compact) return false;
    const labels = [
      normalizeText(ROOM_TYPE_LABELS?.urban || "").toLowerCase().replace(/[^a-z0-9]/g, ""),
      normalizeText(ROOM_TYPE_LABELS?.doubleTwin || "").toLowerCase().replace(/[^a-z0-9]/g, ""),
      normalizeText(ROOM_TYPE_LABELS?.grand || "").toLowerCase().replace(/[^a-z0-9]/g, "")
    ].filter(Boolean);
    if (text.includes("urban")) return true;
    if (text.includes("double") && text.includes("twin")) return true;
    if (text.includes("grand")) return true;
    return labels.some((labelKey) => compact.includes(labelKey) || labelKey.includes(compact));
  }

  function rowAliasLooksPkg(label) {
    const text = normalizeText(label).toLowerCase();
    if (!text) return false;
    return PKG_ROW_LABEL_RE.test(text);
  }

  function pickBestInventoryDataRowInRange(matrix, range, dateCols, options = null) {
    if (!Number.isInteger(range?.start) || !Number.isInteger(range?.end)) return null;
    const allowPkgInventoryRows = options?.allowPkgInventoryRows === true;

    const scoreInventoryDataRowSignal = (row) => {
      let parsedCount = 0;
      let rawCount = 0;
      let noteCount = 0;
      let formulaCount = 0;
      let colorOnlyCount = 0;
      (dateCols || []).forEach((dc) => {
        const cell = matrix.get(row, dc.col);
        const raw = normalizeText(cell?.formattedValue || "");
        const note = normalizeText(cell?.note || "");
        const formula = normalizeText(cell?.formula || "");
        const hasColor = Boolean(normalizeText(colorObjToHex(cell?.backgroundColor || null)));
        if (raw) rawCount += 1;
        if (note) noteCount += 1;
        if (formula) formulaCount += 1;
        if (!raw && !note && hasColor) colorOnlyCount += 1;
        if (raw) {
          const low = raw.toLowerCase();
          if (CLOSED_TEXTS.has(low)) parsedCount += 1;
          else {
            const parsed = parseStockValue(raw);
            if (Number.isInteger(parsed?.current) || Number.isInteger(parsed?.maximum)) parsedCount += 1;
          }
        }
      });
      const score =
        parsedCount * 100 +
        rawCount * 10 +
        noteCount -
        colorOnlyCount * 40 -
        formulaCount * 5;
      return { parsedCount, rawCount, score };
    };

    let best = null;
    let fallback = null;
    for (let row = range.start; row <= range.end; row += 1) {
      if (matrix.hiddenRows?.has(row)) continue;
      const label = rowAliasText(matrix, row);
      if (rowMatchesAnyProviderAlias(matrix, row) && !rowAliasHasInventoryTypeKey(label)) continue;
      if (label && ["total", "room sold", "sold"].some((token) => label.includes(token))) continue;
      if (!allowPkgInventoryRows && rowAliasLooksPkg(label)) continue;
      const scored = scoreInventoryDataRowSignal(row);
      if (!fallback || scored.rawCount > fallback.rawCount || (scored.rawCount === fallback.rawCount && row < fallback.row)) {
        fallback = { row, rawCount: scored.rawCount };
      }
      if (scored.parsedCount <= 0) continue;
      if (!best || scored.score > best.score || (scored.score === best.score && row < best.row)) {
        best = { row, score: scored.score };
      }
    }
    if (Number.isInteger(best?.row)) return best.row;
    return Number.isInteger(fallback?.row) ? fallback.row : null;
  }

  function collectProviderInventoryDataRowsByTypeRanges(matrix, dateCols, typeRanges, options = null) {
    const order = ["urban", "doubleTwin", "grand"];
    return order.map((typeKey) => pickBestInventoryDataRowInRange(matrix, typeRanges?.[typeKey], dateCols, options));
  }

  function toTraceSafeValue(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      return value;
    }
    try {
      return JSON.stringify(value);
    } catch (_) {
      return String(value);
    }
  }

  function evaluateProviderValueSourceCandidate(matrix, dateCols, providerKey, row) {
    const values = extractInventoryValuesByDate(matrix, row, dateCols, providerKey);
    let parsedCount = 0;
    let rawCount = 0;
    const cellTraceByDate = {};
    (dateCols || []).forEach((dc) => {
      const day = dc?.dateKey;
      if (!day) return;
      const cell = matrix.get(row, dc.col);
      const raw = normalizeText(cell?.formattedValue || "");
      if (raw) rawCount += 1;
      const low = raw.toLowerCase();
      const parsedInv = values?.[day] || parseStockValue(raw);
      if (raw && CLOSED_TEXTS.has(low)) {
        parsedCount += 1;
      } else if (Number.isInteger(parsedInv?.current) || Number.isInteger(parsedInv?.maximum)) {
        parsedCount += 1;
      }
      cellTraceByDate[day] = {
        row: row + 1,
        col: dc.col + 1,
        colA1: colZeroToA1(dc.col),
        formattedValue: raw,
        displayedValue: raw,
        formula: normalizeText(cell?.formula || ""),
        note: normalizeText(cell?.note || ""),
        userEnteredValueType: normalizeText(cell?.userEnteredValueType || ""),
        userEnteredValueRaw: toTraceSafeValue(cell?.userEnteredValueRaw),
        effectiveValueType: normalizeText(cell?.effectiveValueType || ""),
        effectiveValueRaw: toTraceSafeValue(cell?.effectiveValueRaw),
        parserRead: {
          raw: normalizeText(parsedInv?.raw || ""),
          current: Number.isInteger(parsedInv?.current) ? Number(parsedInv.current) : null,
          maximum: Number.isInteger(parsedInv?.maximum) ? Number(parsedInv.maximum) : null
        }
      };
    });
    return {
      row,
      values,
      parsedCount,
      rawCount,
      score: parsedCount * 100 + rawCount,
      cellTraceByDate
    };
  }

  function pickProviderInventoryValueSource(matrix, dateCols, providerKey, providerRow, dataRows) {
    const rows = [];
    const seenRows = new Set();
    const addRow = (row) => {
      if (!Number.isInteger(row)) return;
      if (seenRows.has(row)) return;
      seenRows.add(row);
      rows.push(row);
    };
    addRow(providerRow);
    (Array.isArray(dataRows) ? dataRows : []).forEach((row) => addRow(row));

    const evaluated = rows.map((row) => evaluateProviderValueSourceCandidate(matrix, dateCols, providerKey, row));
    let best = null;
    evaluated.forEach((candidate) => {
      const row = candidate.row;
      const score = candidate.score;
      const rowIsProvider = Number.isInteger(providerRow) && row === providerRow;
      const bestIsProvider = Number.isInteger(providerRow) && best?.row === providerRow;
      if (
        !best ||
        score > best.score ||
        (score === best.score && rowIsProvider && !bestIsProvider) ||
        (score === best.score && rowIsProvider === bestIsProvider && row < best.row)
      ) {
        best = candidate;
      }
    });
    if (!best || best.score <= 0) {
      return {
        row: null,
        values: {},
        providerRow: Number.isInteger(providerRow) ? providerRow : null,
        selectedReason: "no_parsable_candidate",
        candidates: evaluated.map((candidate) => ({
          row: candidate.row,
          score: candidate.score,
          parsedCount: candidate.parsedCount,
          rawCount: candidate.rawCount
        })),
        cellTraceByDate: {}
      };
    }
    const providerCandidate = evaluated.find((candidate) => Number.isInteger(providerRow) && candidate.row === providerRow) || null;
    let selectedReason = "highest_parse_coverage";
    if (Number.isInteger(providerRow) && best.row === providerRow) {
      selectedReason = "provider_row_selected";
    } else if (providerCandidate && best.score > providerCandidate.score) {
      selectedReason = "fallback_to_better_data_row";
    } else if (providerCandidate && best.score === providerCandidate.score) {
      selectedReason = "provider_row_tie_break_lost";
    }
    return {
      row: best.row,
      values: best.values,
      providerRow: Number.isInteger(providerRow) ? providerRow : null,
      selectedReason,
      selectedScore: best.score,
      selectedParsedCount: best.parsedCount,
      selectedRawCount: best.rawCount,
      candidates: evaluated.map((candidate) => ({
        row: candidate.row,
        score: candidate.score,
        parsedCount: candidate.parsedCount,
        rawCount: candidate.rawCount
      })),
      cellTraceByDate: best.cellTraceByDate
    };
  }

  function summarizeReservationBlocksDetailed(blocks) {
    const safeBlocks = Array.isArray(blocks) ? blocks : [];
    const byTypeChannel = {};
    const providerOnly = { NAVER: { blocks: 0, nights: 0 }, STATION: { blocks: 0, nights: 0 } };
    safeBlocks.forEach((block) => {
      const typeKey = normalizeText(block?.roomTypeKey || block?.roomType || "").toLowerCase() || "unknown";
      const channel = normalizeText(block?.channel || "UNKNOWN").toUpperCase() || "UNKNOWN";
      const nights = Math.max(0, Number(block?.nights || 0));
      if (!byTypeChannel[typeKey]) byTypeChannel[typeKey] = {};
      if (!byTypeChannel[typeKey][channel]) byTypeChannel[typeKey][channel] = { blocks: 0, nights: 0 };
      byTypeChannel[typeKey][channel].blocks += 1;
      byTypeChannel[typeKey][channel].nights += nights;
      if (channel === "NAVER" || channel === "STATION") {
        providerOnly[channel].blocks += 1;
        providerOnly[channel].nights += nights;
      }
    });
    return { byTypeChannel, providerOnly };
  }

  function buildValidationErrorMessage(issues) {
    const errors = (issues || []).filter((x) => String(x?.severity || "").toLowerCase() === "error");
    if (!errors.length) return "";
    const summary = errors
      .map((x) => `${x.code}${x.type ? `(${x.type})` : ""}${Number.isInteger(x.value) ? `=${x.value}` : ""}`)
      .join(", ");
    return `Sheet scan validation failed: ${summary}`;
  }

  function quoteSheetTitleForA1(sheetTitle) {
    const rawTitle = String(sheetTitle || "");
    const escapedTitle = rawTitle.replace(/'/g, "''");
    return /[^A-Za-z0-9_]/.test(rawTitle) ? `'${escapedTitle}'` : rawTitle;
  }

  function summarizeSheetsFieldViolations(text) {
    const payload = typeof parseJsonMaybe === "function" ? parseJsonMaybe(text) : null;
    const details = Array.isArray(payload?.error?.details) ? payload.error.details : [];
    if (!details.length) return "";
    const out = [];
    details.forEach((detail) => {
      const violations = Array.isArray(detail?.fieldViolations) ? detail.fieldViolations : [];
      violations.forEach((violation) => {
        const field = normalizeText(violation?.field || "");
        const description = normalizeText(violation?.description || "");
        if (!field && !description) return;
        out.push(description ? `${field}: ${description}` : field);
      });
    });
    return out.join(", ");
  }

  function assertReadonlySheetsRequest(method, requestUrl) {
    const m = normalizeText(method).toUpperCase();
    if (m !== "GET") {
      throw new Error(`Sheets read-only constraint violated: ${m} ${requestUrl}`);
    }
  }


  async function fetchSheetMetadataAnchors(spreadsheetId, sheetName, accessToken) {
    const key = `${spreadsheetId}::${sheetName}`;
    const now = Date.now();
    const cached = sheetReadHintsCache.get(key);
    if (cached && now - cached.ts <= SHEET_HINT_CACHE_TTL_MS) return cached.data;

    const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`);
    url.searchParams.set(
      "fields",
      "sheets(properties(sheetId,title)),namedRanges(name,range),developerMetadata(metadataKey,metadataValue,location)"
    );
    const method = "GET";
    assertReadonlySheetsRequest(method, url);
    const response = await fetch(url, {
      method,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`
      }
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Failed to fetch spreadsheet metadata (${response.status}): ${text.slice(0, 180)}`);
    }
    const payload = await response.json();
    const targetSheet = (payload?.sheets || []).find((s) => String(s?.properties?.title || "") === String(sheetName)) || null;
    const targetSheetId = Number(targetSheet?.properties?.sheetId);

    const namedRanges = {};
    const sheetTitleById = new Map(
      (payload?.sheets || [])
        .map((sheet) => [Number(sheet?.properties?.sheetId), normalizeText(sheet?.properties?.title || "")])
        .filter(([sheetId, title]) => Number.isFinite(sheetId) && Boolean(title))
    );
    (payload?.namedRanges || []).forEach((nr) => {
      const name = normalizeText(nr?.name || "").toUpperCase();
      if (!name) return;
      const range = nr?.range || {};
      const rangeSheetId = Number(range?.sheetId);
      const rangeSheetTitle = Number.isFinite(rangeSheetId) ? sheetTitleById.get(rangeSheetId) : "";
      const a1 = gridRangeToA1(range, rangeSheetTitle || sheetName);
      if (a1) namedRanges[name] = a1;
    });

    const metadata = {};
    (payload?.developerMetadata || []).forEach((md) => {
      const keyText = normalizeScanKey(md?.metadataKey || "");
      const valueText = normalizeText(md?.metadataValue || "");
      if (!keyText || !valueText) return;
      const locationSheetId = Number(md?.location?.dimensionRange?.sheetId ?? md?.location?.sheetId);
      if (Number.isFinite(targetSheetId) && Number.isFinite(locationSheetId) && locationSheetId !== targetSheetId) return;
      metadata[keyText] = valueText;
    });

    const out = { namedRanges, metadata };
    sheetReadHintsCache.set(key, { ts: now, data: out });
    return out;
  }


  async function fetchSheetValuesBatch(spreadsheetId, accessToken, ranges) {
    const normalizedRanges = (ranges || []).map((r) => normalizeText(r)).filter(Boolean);
    if (!normalizedRanges.length) return [];
    const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet`);
    normalizedRanges.forEach((range) => url.searchParams.append("ranges", range));
    url.searchParams.set("majorDimension", "ROWS");
    url.searchParams.set("valueRenderOption", "FORMATTED_VALUE");
    const method = "GET";
    assertReadonlySheetsRequest(method, url);
    const response = await fetch(url, {
      method,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`
      }
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Failed to batchGet sheet values (${response.status}): ${text.slice(0, 180)}`);
    }
    const payload = await response.json();
    return Array.isArray(payload?.valueRanges) ? payload.valueRanges : [];
  }


  function scanConfigFromMetadata(metadata) {
    const out = {};
    const parseBooleanFlag = (value, fallback = false) => {
      if (typeof value === "boolean") return value;
      const text = normalizeText(value).toLowerCase();
      if (!text) return Boolean(fallback);
      if (["1", "true", "y", "yes", "on", "enable", "enabled"].includes(text)) return true;
      if (["0", "false", "n", "no", "off", "disable", "disabled"].includes(text)) return false;
      return Boolean(fallback);
    };
    const pick = (keys) => {
      for (const key of keys) {
        const value = metadata?.[normalizeScanKey(key)];
        if (value !== undefined) return value;
      }
      return "";
    };
    const putIfDefined = (key, value) => {
      if (value === null || value === undefined || value === "") return;
      out[key] = value;
    };
    const modeRaw = normalizeText(pick(["scan_mode", "mode"])).toLowerCase();
    if (modeRaw) out.mode = modeRaw === "manual" ? "manual" : "auto";
    const allowPkgRaw = pick([
      "scan_allow_pkg_inventory_rows",
      "allow_pkg_inventory_rows",
      "scan_allow_pkg_rows",
      "allow_pkg_rows"
    ]);
    if (normalizeText(allowPkgRaw)) {
      out.allowPkgInventoryRows = parseBooleanFlag(allowPkgRaw, DEFAULT_SCAN_CONFIG.allowPkgInventoryRows === true);
    }

    putIfDefined("dateRow", parseOptionalPositiveInt(pick(["scan_date_row", "date_row"])));
    putIfDefined("weekdayRow", parseOptionalPositiveInt(pick(["scan_weekday_row", "weekday_row"])));
    putIfDefined("dateStartCol", parseColumnRefToOneBased(pick(["scan_date_start_col", "date_start_col"])));
    putIfDefined("dateEndCol", parseColumnRefToOneBased(pick(["scan_date_end_col", "date_end_col"])));
    putIfDefined("roomStartRow", parseOptionalPositiveInt(pick(["scan_room_start_row", "room_start_row"])));
    putIfDefined("urbanStartRow", parseOptionalPositiveInt(pick(["scan_urban_start_row", "urban_start_row"])));
    putIfDefined("urbanEndRow", parseOptionalPositiveInt(pick(["scan_urban_end_row", "urban_end_row"])));
    putIfDefined("doubleTwinStartRow", parseOptionalPositiveInt(pick(["scan_double_twin_start_row", "double_twin_start_row"])));
    putIfDefined("doubleTwinEndRow", parseOptionalPositiveInt(pick(["scan_double_twin_end_row", "double_twin_end_row"])));
    putIfDefined("grandStartRow", parseOptionalPositiveInt(pick(["scan_grand_start_row", "grand_start_row"])));
    putIfDefined("grandEndRow", parseOptionalPositiveInt(pick(["scan_grand_end_row", "grand_end_row"])));
    putIfDefined(
      "inventorySearchStartRow",
      parseOptionalPositiveInt(pick(["scan_inventory_search_start_row", "inventory_search_start_row"]))
    );
    putIfDefined("stationInventoryRow", parseOptionalPositiveInt(pick(["scan_station_inventory_row", "station_inventory_row"])));
    putIfDefined("naverInventoryRow", parseOptionalPositiveInt(pick(["scan_naver_inventory_row", "naver_inventory_row"])));

    putIfDefined("stationUrbanStartRow", parseOptionalPositiveInt(pick(["scan_station_urban_start_row", "station_urban_start_row"])));
    putIfDefined("stationUrbanEndRow", parseOptionalPositiveInt(pick(["scan_station_urban_end_row", "station_urban_end_row"])));
    putIfDefined(
      "stationDoubleTwinStartRow",
      parseOptionalPositiveInt(pick(["scan_station_double_twin_start_row", "station_double_twin_start_row"]))
    );
    putIfDefined(
      "stationDoubleTwinEndRow",
      parseOptionalPositiveInt(pick(["scan_station_double_twin_end_row", "station_double_twin_end_row"]))
    );
    putIfDefined("stationGrandStartRow", parseOptionalPositiveInt(pick(["scan_station_grand_start_row", "station_grand_start_row"])));
    putIfDefined("stationGrandEndRow", parseOptionalPositiveInt(pick(["scan_station_grand_end_row", "station_grand_end_row"])));
    putIfDefined("naverUrbanStartRow", parseOptionalPositiveInt(pick(["scan_naver_urban_start_row", "naver_urban_start_row"])));
    putIfDefined("naverUrbanEndRow", parseOptionalPositiveInt(pick(["scan_naver_urban_end_row", "naver_urban_end_row"])));
    putIfDefined(
      "naverDoubleTwinStartRow",
      parseOptionalPositiveInt(pick(["scan_naver_double_twin_start_row", "naver_double_twin_start_row"]))
    );
    putIfDefined(
      "naverDoubleTwinEndRow",
      parseOptionalPositiveInt(pick(["scan_naver_double_twin_end_row", "naver_double_twin_end_row"]))
    );
    putIfDefined("naverGrandStartRow", parseOptionalPositiveInt(pick(["scan_naver_grand_start_row", "naver_grand_start_row"])));
    putIfDefined("naverGrandEndRow", parseOptionalPositiveInt(pick(["scan_naver_grand_end_row", "naver_grand_end_row"])));
    putIfDefined(
      "roomSoldVacScanStartRow",
      parseOptionalPositiveInt(pick(["scan_room_sold_vac_scan_start_row", "room_sold_vac_scan_start_row"]))
    );
    putIfDefined(
      "roomSoldVacScanEndRow",
      parseOptionalPositiveInt(pick(["scan_room_sold_vac_scan_end_row", "room_sold_vac_scan_end_row"]))
    );
    return out;
  }

  async function loadSheetReadHints(spreadsheetId, sheetName, accessToken) {
    let anchors;
    try {
      anchors = await fetchSheetMetadataAnchors(spreadsheetId, sheetName, accessToken);
    } catch (error) {
      const reason = normalizeText(error?.message || error || "unknown");
      throw new Error(`Failed to load sheet metadata hints: ${reason}`);
    }
    const safeTitle = quoteSheetTitleForA1(sheetName);
    const scanRange = anchors.namedRanges?.SCAN_CONFIG || `${safeTitle}!${SHEET_HINTS_SCAN_RANGE}`;
    const roomMapRange = anchors.namedRanges?.ROOM_MAP || `${safeTitle}!${SHEET_HINTS_ROOM_MAP_RANGE}`;
    let valueRanges;
    try {
      valueRanges = await fetchSheetValuesBatch(spreadsheetId, accessToken, [scanRange, roomMapRange]);
    } catch (error) {
      const reason = normalizeText(error?.message || error || "unknown");
      throw new Error(`Failed to load sheet value hints: ${reason}`);
    }
    const scanValues = Array.isArray(valueRanges[0]?.values) ? valueRanges[0].values : [];
    const roomValues = Array.isArray(valueRanges[1]?.values) ? valueRanges[1].values : [];
    const metadataScan = scanConfigFromMetadata(anchors.metadata || {});
    const gridScan = parseScanConfigFromValuesGrid(scanValues);
    const hasGridOverrides = Boolean(
      gridScan.dateRow ||
        gridScan.weekdayRow ||
        gridScan.roomStartRow ||
        gridScan.urbanStartRow ||
        gridScan.urbanEndRow ||
        gridScan.doubleTwinStartRow ||
        gridScan.doubleTwinEndRow ||
        gridScan.grandStartRow ||
        gridScan.grandEndRow ||
        gridScan.inventorySearchStartRow ||
        gridScan.stationInventoryRow ||
        gridScan.naverInventoryRow ||
        gridScan.stationUrbanStartRow ||
        gridScan.stationUrbanEndRow ||
        gridScan.stationDoubleTwinStartRow ||
        gridScan.stationDoubleTwinEndRow ||
        gridScan.stationGrandStartRow ||
        gridScan.stationGrandEndRow ||
        gridScan.naverUrbanStartRow ||
        gridScan.naverUrbanEndRow ||
        gridScan.naverDoubleTwinStartRow ||
        gridScan.naverDoubleTwinEndRow ||
        gridScan.naverGrandStartRow ||
        gridScan.naverGrandEndRow ||
        gridScan.roomSoldVacScanStartRow ||
        gridScan.roomSoldVacScanEndRow
    );
    const merged = { ...gridScan, ...metadataScan };
    if (normalizeText(metadataScan.mode).toLowerCase() === "manual" || hasGridOverrides) merged.mode = "manual";
    const scan = sanitizeScanConfig(merged);
    return {
      scan,
      roomTypeByRoomNo: parseRoomTypeMapFromValuesGrid(roomValues),
      fingerprint: digestValueRanges(valueRanges)
    };
  }


  function getCachedSheetSnapshot(cacheKey, bypassCache = false) {
    if (bypassCache || !cacheKey) return null;
    const cached = sheetSnapshotCache.get(cacheKey);
    if (!cached) return null;
    if (Date.now() - cached.ts > SHEET_SNAPSHOT_CACHE_TTL_MS) return null;
    return cached.snapshot;
  }

  function cacheSheetSnapshotResult(snapshotCacheKey, quickCacheKey, snapshot) {
    const cachedEntry = { ts: Date.now(), snapshot };
    sheetSnapshotCache.set(snapshotCacheKey, cachedEntry);
    sheetSnapshotCache.set(quickCacheKey, cachedEntry);
    while (sheetSnapshotCache.size > SHEET_SNAPSHOT_CACHE_MAX) {
      const firstKey = sheetSnapshotCache.keys().next().value;
      if (firstKey === undefined) break;
      sheetSnapshotCache.delete(firstKey);
    }
    return snapshot;
  }

  async function resolveSheetSnapshotFetchPlan(syncConfig, query, forceRefreshToken = false, useFullRange = false, options = null) {
    const opts = options && typeof options === "object" ? options : {};
    const blockDetailMode = normalizeText(opts.blockDetailMode || "light").toLowerCase() === "full" ? "full" : "light";
    const bypassCache = opts.bypassCache === true;
    const legacyFieldMask = opts.legacyFieldMask === true;
    const spreadsheetRaw = normalizeText(syncConfig?.spreadsheet || "");
    const spreadsheetId = extractSpreadsheetId(spreadsheetRaw);
    if (!spreadsheetId) {
      if (!spreadsheetRaw) throw new Error(TEXT.statusSyncNeedSheet);
      throw new Error(`Invalid spreadsheet ID/URL: ${spreadsheetRaw.slice(0, 120)}`);
    }
    const scanCfg = sanitizeScanConfig(syncConfig.scan || {});
    const accessToken = await ensureGoogleAccessToken(syncConfig, forceRefreshToken);
    const safeTitle = quoteSheetTitleForA1(syncConfig.sheetName);
    const sheetHints = await loadSheetReadHints(spreadsheetId, syncConfig.sheetName, accessToken);
    const effectiveScanCfg = resolveEffectiveScanConfig(scanCfg, sheetHints.scan || {});
    const enforceFixedReadRange = normalizeText(effectiveScanCfg?.mode || "").toLowerCase() === "manual";
    const effectiveUseFullRange = Boolean(useFullRange || enforceFixedReadRange);
    const quickCacheKeyBase = buildSnapshotQuickCacheKey(
      spreadsheetId,
      syncConfig.sheetName,
      query,
      scanCfg,
      effectiveUseFullRange
    );
    const quickCacheKey = `${quickCacheKeyBase}::block:${blockDetailMode}`;
    const effectiveRoomTypeByRoomNo = mergeRoomTypeMap(ROOM_TYPE_BY_ROOM_NO, sheetHints.roomTypeByRoomNo || {});
    const snapshotCacheKeyBase = buildSnapshotCacheKey(
      spreadsheetId,
      syncConfig.sheetName,
      query,
      effectiveScanCfg,
      sheetHints.fingerprint,
      effectiveUseFullRange
    );
    const snapshotCacheKey = `${snapshotCacheKeyBase}::block:${blockDetailMode}`;
    const configuredStartRow = Math.max(1, Number(syncConfig.startRow) || DEFAULT_START_ROW);
    const manualDateRow = effectiveScanCfg.mode === "manual" ? parseOptionalPositiveInt(effectiveScanCfg.dateRow) : null;
    const rangeAnchorRow = manualDateRow || configuredStartRow;
    const scanStartRow = effectiveUseFullRange ? 1 : Math.max(1, rangeAnchorRow - SHEET_GRID_FAST_ROW_LIMIT);
    const fastEndRow = scanStartRow + SHEET_GRID_FAST_ROW_LIMIT - 1;
    const configuredEndColOneBased = parseOptionalPositiveInt(effectiveScanCfg.dateEndCol);
    const defaultEndColOneBased = parseOptionalPositiveInt(DEFAULT_SCAN_CONFIG?.dateEndCol) || 702;
    const hasCustomDateEndCol = Number.isInteger(configuredEndColOneBased) && configuredEndColOneBased !== defaultEndColOneBased;
    const configuredEndCol = hasCustomDateEndCol ? oneBasedToZeroBased(configuredEndColOneBased) : null;
    const endColZeroDefault = effectiveUseFullRange ? 701 : 389;
    const endColZero = Number.isInteger(configuredEndCol) ? Math.max(2, configuredEndCol) : endColZeroDefault;
    const endColA1 = colZeroToA1(endColZero);
    const rangeA1 = effectiveUseFullRange ? `${safeTitle}!A1:${endColA1}` : `${safeTitle}!A${scanStartRow}:${endColA1}${fastEndRow}`;
    const fieldsAdvanced =
      "sheets(properties(sheetId,title),merges(startRowIndex,endRowIndex,startColumnIndex,endColumnIndex)," +
      "data(startRow,startColumn,rowMetadata(hiddenByUser,hiddenByFilter)," +
      "rowData(values(formattedValue,note," +
      "userEnteredValue(formulaValue,stringValue,numberValue,boolValue,errorValue)," +
      "effectiveValue(stringValue,numberValue,boolValue,errorValue)," +
      "userEnteredFormat(backgroundColor,backgroundColorStyle(rgbColor,themeColor))," +
      "effectiveFormat(backgroundColor,backgroundColorStyle(rgbColor,themeColor))" +
      "))))";
    const fieldsLegacy =
      "sheets(properties(sheetId,title),merges(startRowIndex,endRowIndex,startColumnIndex,endColumnIndex)," +
      "data(startRow,startColumn,rowMetadata(hiddenByUser,hiddenByFilter)," +
      "rowData(values(formattedValue,note," +
      "userEnteredValue(formulaValue,stringValue,numberValue,boolValue,errorValue)," +
      "effectiveValue(stringValue,numberValue,boolValue,errorValue)," +
      "effectiveFormat(backgroundColor)" +
      "))))";
    return {
      opts,
      blockDetailMode,
      bypassCache,
      legacyFieldMask,
      spreadsheetId,
      scanCfg,
      accessToken,
      sheetHints,
      effectiveScanCfg,
      effectiveUseFullRange,
      quickCacheKey,
      snapshotCacheKey,
      configuredStartRow,
      scanStartRow,
      endColA1,
      rangeA1,
      effectiveRoomTypeByRoomNo,
      fields: legacyFieldMask ? fieldsLegacy : fieldsAdvanced
    };
  }

  async function fetchSheetSnapshotPayload(plan, syncConfig, query, forceRefreshToken = false, useFullRange = false, options = null) {
    const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${plan.spreadsheetId}`);
    url.searchParams.set("ranges", plan.rangeA1);
    url.searchParams.set("includeGridData", "true");
    url.searchParams.set("fields", plan.fields);

    const method = "GET";
    assertReadonlySheetsRequest(method, url);
    const response = await fetch(url, {
      method,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${plan.accessToken}`
      }
    });

    if (response.status === 401 || response.status === 403) {
      if (!forceRefreshToken && hasGoogleRefreshCredentials(syncConfig)) {
        return fetchSheetSnapshot(syncConfig, query, true, useFullRange, options);
      }
      const text = await response.text();
      throw new Error(`Google Sheets auth failed (${response.status}): ${text.slice(0, 280)}`);
    }
    if (!response.ok) {
      const text = await response.text();
      if (
        response.status === 400 &&
        !plan.legacyFieldMask &&
        /invalid field|invalid value at 'fields'|cannot find matching fields|error expanding 'fields' parameter/i.test(text || "")
      ) {
        return fetchSheetSnapshot(syncConfig, query, forceRefreshToken, useFullRange, {
          ...plan.opts,
          legacyFieldMask: true
        });
      }
      const violationSummary = summarizeSheetsFieldViolations(text);
      if (violationSummary) {
        throw new Error(`Google Sheets request failed (${response.status}): ${violationSummary}`);
      }
      throw new Error(`Google Sheets request failed (${response.status}): ${text.slice(0, 280)}`);
    }

    const payload = await response.json();
    const firstSheet = Array.isArray(payload?.sheets) ? payload.sheets[0] : null;
    const firstGrid = Array.isArray(firstSheet?.data) ? firstSheet.data[0] : null;
    if (!firstGrid) {
      if (!plan.effectiveUseFullRange && plan.effectiveScanCfg.mode !== "manual") {
        return fetchSheetSnapshot(syncConfig, query, forceRefreshToken, true, options);
      }
      throw new Error("Google Sheets grid data is empty in the selected range.");
    }
    return { payload, firstSheet, firstGrid };
  }

  async function fetchSheetSnapshot(syncConfig, query, forceRefreshToken = false, useFullRange = false, options = null) {
    const plan = await resolveSheetSnapshotFetchPlan(syncConfig, query, forceRefreshToken, useFullRange, options);
    const quickCached = getCachedSheetSnapshot(plan.quickCacheKey, plan.bypassCache);
    if (quickCached) return quickCached;
    const cachedSnapshot = getCachedSheetSnapshot(plan.snapshotCacheKey, plan.bypassCache);
    if (cachedSnapshot) return cachedSnapshot;
    const payloadResult = await fetchSheetSnapshotPayload(plan, syncConfig, query, forceRefreshToken, useFullRange, options);
    if (payloadResult && !payloadResult.payload) return payloadResult;
    const { payload, firstSheet, firstGrid } = payloadResult;

    try {
      const matrix = buildSheetMatrix(
        firstGrid,
        plan.scanStartRow,
        firstSheet?.merges || [],
        { spreadsheetTheme: payload?.spreadsheetTheme || null }
      );
      const { dateRow, dateCols } = findDateColumns(matrix, matrix.startRow, syncConfig.year, plan.effectiveScanCfg);
      const filteredDateCols = dateCols.filter((dc) => dc.dateKey >= query.startDate && dc.dateKey <= query.endDate);
      if (!filteredDateCols.length) throw new Error("No date columns found for the selected period.");
      const roomStartRow = oneBasedToZeroBased(plan.effectiveScanCfg.roomStartRow) ?? (dateRow + 2);
      const manualRoomTypeRanges = buildManualRoomTypeRanges(plan.effectiveScanCfg);
      const formulaScanRange = buildRoomSoldVacFormulaScanRange(plan.effectiveScanCfg);
      const formulaHints = detectRoomTypeFormulaHints(matrix, filteredDateCols, formulaScanRange);
      const rawFormulaRanges = formulaHints?.roomTypeRanges || {};
      const isFormulaRangeSane = (() => {
        if (!hasCompleteManualRoomTypeRanges(rawFormulaRanges)) return false;
        const urban = rawFormulaRanges.urban;
        const doubleTwin = rawFormulaRanges.doubleTwin;
        const grand = rawFormulaRanges.grand;
        const rows = [urban, doubleTwin, grand];
        if (
          rows.some(
            (r) =>
              !Number.isInteger(r?.start) ||
              !Number.isInteger(r?.end) ||
              r.start < roomStartRow ||
              r.end < r.start
          )
        ) {
          return false;
        }
        return urban.end < doubleTwin.start && doubleTwin.end < grand.start;
      })();
      const formulaRoomTypeRanges = isFormulaRangeSane
        ? rawFormulaRanges
        : { urban: null, doubleTwin: null, grand: null };
      const effectiveRoomTypeRanges = {
        urban: manualRoomTypeRanges?.urban || formulaRoomTypeRanges?.urban || null,
        doubleTwin: manualRoomTypeRanges?.doubleTwin || formulaRoomTypeRanges?.doubleTwin || null,
        grand: manualRoomTypeRanges?.grand || formulaRoomTypeRanges?.grand || null
      };
      const expectedTypeTotalsByKey = {};
      if (isFormulaRangeSane) {
        Object.entries(formulaHints?.expectedTypeTotalsByKey || {}).forEach(([k, v]) => {
          const n = toPositiveIntOrNull(v);
          if (!k || n === null) return;
          expectedTypeTotalsByKey[k] = n;
        });
      }
      const inventorySearchStartRow = oneBasedToZeroBased(plan.effectiveScanCfg.inventorySearchStartRow) ?? (dateRow + 2);
      const stationRow = oneBasedToZeroBased(plan.effectiveScanCfg.stationInventoryRow);
      const naverRow = oneBasedToZeroBased(plan.effectiveScanCfg.naverInventoryRow);
      const manualStationTypeRanges = buildProviderInventoryTypeRanges(plan.effectiveScanCfg, "STATION");
      const manualNaverTypeRanges = buildProviderInventoryTypeRanges(plan.effectiveScanCfg, "NAVER");
      const hasManualStationTypeRanges = hasCompleteProviderInventoryTypeRanges(manualStationTypeRanges);
      const hasManualNaverTypeRanges = hasCompleteProviderInventoryTypeRanges(manualNaverTypeRanges);
      const hasAnyManualStationTypeRanges = hasAnyProviderInventoryTypeRanges(manualStationTypeRanges);
      const hasAnyManualNaverTypeRanges = hasAnyProviderInventoryTypeRanges(manualNaverTypeRanges);
      const shouldSkipInventoryScan =
        plan.effectiveScanCfg.mode === "manual" &&
        (
          Number.isInteger(stationRow) ||
          Number.isInteger(naverRow) ||
          hasManualStationTypeRanges ||
          hasManualNaverTypeRanges
        );
      const inventoryRows = shouldSkipInventoryScan ? {} : findInventoryRows(matrix, inventorySearchStartRow);
      if (Number.isInteger(stationRow)) inventoryRows.STATION = stationRow;
      if (Number.isInteger(naverRow)) inventoryRows.NAVER = naverRow;
      const manualRangeEnds = [manualRoomTypeRanges?.urban?.end, manualRoomTypeRanges?.doubleTwin?.end, manualRoomTypeRanges?.grand?.end]
        .filter((v) => Number.isInteger(v));
      const inventoryBoundaryRows = [inventoryRows.NAVER, inventoryRows.STATION].filter((v) => Number.isInteger(v));
      const inventoryRowOptions = {
        allowPkgInventoryRows: plan.effectiveScanCfg.allowPkgInventoryRows === true
      };
      const naverInventoryRowOptions = {
        ...inventoryRowOptions,
        providerKey: "NAVER"
      };
      const stationInventoryRowOptions = {
        ...inventoryRowOptions,
        providerKey: "STATION"
      };
      let roomScanEndRow = matrix.maxRow;
      if (manualRangeEnds.length > 0) roomScanEndRow = Math.max(...manualRangeEnds);
      else if (inventoryBoundaryRows.length > 0) roomScanEndRow = Math.min(...inventoryBoundaryRows) - 1;
      else roomScanEndRow = Math.min(matrix.maxRow, roomStartRow + 180);
      roomScanEndRow = Math.max(roomStartRow, roomScanEndRow);
      const naverDataRows = hasManualNaverTypeRanges
        ? collectProviderInventoryDataRowsByTypeRanges(matrix, filteredDateCols, manualNaverTypeRanges, naverInventoryRowOptions)
        : collectProviderInventoryDataRows(matrix, inventoryRows.NAVER, filteredDateCols, 3, naverInventoryRowOptions);
      const stationDataRows = hasManualStationTypeRanges
        ? collectProviderInventoryDataRowsByTypeRanges(matrix, filteredDateCols, manualStationTypeRanges, stationInventoryRowOptions)
        : collectProviderInventoryDataRows(matrix, inventoryRows.STATION, filteredDateCols, 3, stationInventoryRowOptions);
      const naverRoomValues = extractInventoryRoomValuesByDate(
        matrix,
        naverDataRows,
        filteredDateCols,
        ROOM_PRESETS["naver-partner"] || [],
        "NAVER"
      );
      const stationRoomValues = extractInventoryRoomValuesByDate(
        matrix,
        stationDataRows,
        filteredDateCols,
        ROOM_PRESETS["admin-station"] || [],
        "STATION"
      );
      const naverValueSource = pickProviderInventoryValueSource(
        matrix,
        filteredDateCols,
        "NAVER",
        inventoryRows.NAVER,
        naverDataRows
      );
      const stationValueSource = pickProviderInventoryValueSource(
        matrix,
        filteredDateCols,
        "STATION",
        inventoryRows.STATION,
        stationDataRows
      );
      const traceSafeSyncConfig = {
        spreadsheet: plan.spreadsheetId,
        sheetName: syncConfig.sheetName,
        startRow: plan.configuredStartRow,
        year: Number(syncConfig.year) || DEFAULT_YEAR,
        stockMode: normalizeText(syncConfig.stockMode || "available"),
        scanMode: normalizeText(plan.effectiveScanCfg?.mode || "auto"),
        allowPkgInventoryRows: plan.effectiveScanCfg.allowPkgInventoryRows === true,
        useFullRange: Boolean(plan.effectiveUseFullRange),
        blockDetailMode: plan.blockDetailMode,
        readRangeA1: plan.rangeA1
      };
      const naverProviderRowValues = Number.isInteger(inventoryRows.NAVER)
        ? extractInventoryValuesByDate(matrix, inventoryRows.NAVER, filteredDateCols, "NAVER")
        : {};
      const stationProviderRowValues = Number.isInteger(inventoryRows.STATION)
        ? extractInventoryValuesByDate(matrix, inventoryRows.STATION, filteredDateCols, "STATION")
        : {};
      const naverDerived = buildDerivedRoomValuesFromSheetState(
        matrix,
        dateRow,
        filteredDateCols,
        ROOM_PRESETS["naver-partner"] || [],
        naverRoomValues,
        roomStartRow,
        plan.effectiveRoomTypeByRoomNo,
        "NAVER",
        effectiveRoomTypeRanges,
        roomScanEndRow,
        expectedTypeTotalsByKey
      );
      const stationDerived = buildDerivedRoomValuesFromSheetState(
        matrix,
        dateRow,
        filteredDateCols,
        ROOM_PRESETS["admin-station"] || [],
        stationRoomValues,
        roomStartRow,
        plan.effectiveRoomTypeByRoomNo,
        "STATION",
        effectiveRoomTypeRanges,
        roomScanEndRow,
        expectedTypeTotalsByKey
      );
      const reservationBlockScan = extractReservationBlocksByDate(
        matrix,
        filteredDateCols,
        naverDerived.roomRows || stationDerived.roomRows || [],
        blockDetailMode === "full"
          ? { mode: "full", includeBlocked: true }
          : { mode: "provider", providerChannels: ["NAVER", "STATION"], includeBlocked: true }
      );
      const reservationBlocks = Array.isArray(reservationBlockScan?.blocks) ? reservationBlockScan.blocks : [];
      const reservationBlockCellMap = reservationBlockScan?.cellMap && typeof reservationBlockScan.cellMap === "object"
        ? reservationBlockScan.cellMap
        : {};
      const reservationBlockStats = reservationBlocks.reduce((acc, row) => {
        const key = normalizeText(row?.channel || "UNKNOWN") || "UNKNOWN";
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});
      const reservationBlockSummary = summarizeReservationBlocksDetailed(reservationBlocks);
      const providerKey = context.providerType === "admin-station" ? "STATION" : "NAVER";
      const hostDiagnostics = providerKey === "STATION" ? stationDerived.diagnostics : naverDerived.diagnostics;
      const formulaTypeCounts = isFormulaRangeSane ? (formulaHints?.expectedTypeCounts || {}) : {};
      const fallbackTypeCounts = countExpectedRoomTypesFromMap(plan.effectiveRoomTypeByRoomNo);
      const expectedTypeCounts = {
        urban: toPositiveIntOrNull(formulaTypeCounts.urban) ?? Number(fallbackTypeCounts.urban || 0),
        doubleTwin: toPositiveIntOrNull(formulaTypeCounts.doubleTwin) ?? Number(fallbackTypeCounts.doubleTwin || 0),
        grand: toPositiveIntOrNull(formulaTypeCounts.grand) ?? Number(fallbackTypeCounts.grand || 0)
      };
      const detectedTypeCounts = summarizeDetectedRoomTypeCounts(hostDiagnostics?.roomTypeCounts || {});
      const expectedPartitionCounts = countExpectedPartitionRooms(plan.effectiveRoomTypeByRoomNo);
      const detectedPartitionCounts = summarizeDetectedPartitionCounts(hostDiagnostics?.partitionCounts || {});
      const hasPartitionExpectation = hasCompleteManualRoomTypeRanges(effectiveRoomTypeRanges);
      const totalExpectedPartition =
        Number(expectedPartitionCounts.urban_num || 0) +
        Number(expectedPartitionCounts.urban_alpha || 0) +
        Number(expectedPartitionCounts.double_num || 0) +
        Number(expectedPartitionCounts.double_alpha || 0) +
        Number(expectedPartitionCounts.grand || 0);
      const totalDetectedPartition =
        Number(detectedPartitionCounts.urban_num || 0) +
        Number(detectedPartitionCounts.urban_alpha || 0) +
        Number(detectedPartitionCounts.double_num || 0) +
        Number(detectedPartitionCounts.double_alpha || 0) +
        Number(detectedPartitionCounts.grand || 0);
      const hasPartitionMismatch =
        hasPartitionExpectation &&
        (
          detectedPartitionCounts.urban_num !== expectedPartitionCounts.urban_num ||
          detectedPartitionCounts.urban_alpha !== expectedPartitionCounts.urban_alpha ||
          detectedPartitionCounts.double_num !== expectedPartitionCounts.double_num ||
          detectedPartitionCounts.double_alpha !== expectedPartitionCounts.double_alpha ||
          detectedPartitionCounts.grand !== expectedPartitionCounts.grand
        );
      const expectedRoomCount = Number(expectedTypeCounts.urban || 0) + Number(expectedTypeCounts.doubleTwin || 0) + Number(expectedTypeCounts.grand || 0);
      const detectedRoomCount = Number(hostDiagnostics?.roomRows || 0);
      const hasTypeMismatch =
        detectedTypeCounts.urban !== expectedTypeCounts.urban ||
        detectedTypeCounts.doubleTwin !== expectedTypeCounts.doubleTwin ||
        detectedTypeCounts.grand !== expectedTypeCounts.grand;
      const hasInsufficientRows =
        detectedRoomCount <= 0 ||
        (expectedRoomCount > 0 && detectedRoomCount < Math.max(3, Math.floor(expectedRoomCount * 0.8)));
      const hostRawRoomValues = providerKey === "STATION" ? stationRoomValues : naverRoomValues;
      const hostDerivedRoomValues = providerKey === "STATION" ? stationDerived.roomValues : naverDerived.roomValues;
      const rawDerivedAudit = buildRawDerivedMismatchIssues(
        providerKey,
        filteredDateCols,
        hostRawRoomValues,
        hostDerivedRoomValues
      );
      const naverProviderValueRowAudit = buildProviderValueRowMismatchIssues(
        "NAVER",
        filteredDateCols,
        naverProviderRowValues,
        naverValueSource.values,
        inventoryRows.NAVER,
        naverValueSource.row
      );
      const stationProviderValueRowAudit = buildProviderValueRowMismatchIssues(
        "STATION",
        filteredDateCols,
        stationProviderRowValues,
        stationValueSource.values,
        inventoryRows.STATION,
        stationValueSource.row
      );
      const hostProviderValueRowAudit = providerKey === "STATION" ? stationProviderValueRowAudit : naverProviderValueRowAudit;
      const hostProviderCoverageAudit = providerKey === "STATION"
        ? buildProviderValueSourceCoverageIssues("STATION", filteredDateCols, stationValueSource.values, stationValueSource.row)
        : buildProviderValueSourceCoverageIssues("NAVER", filteredDateCols, naverValueSource.values, naverValueSource.row);
      const hostInventoryDataRows = providerKey === "STATION" ? stationDataRows : naverDataRows;
      const hostManualTypeRanges = providerKey === "STATION" ? manualStationTypeRanges : manualNaverTypeRanges;
      const hostHasAnyManualTypeRanges = providerKey === "STATION" ? hasAnyManualStationTypeRanges : hasAnyManualNaverTypeRanges;
      const hostHasCompleteManualTypeRanges =
        providerKey === "STATION" ? hasManualStationTypeRanges : hasManualNaverTypeRanges;
      const hostDataRowSlotIssues = buildInventoryDataRowSlotIssues(
        providerKey,
        hostInventoryDataRows,
        hostManualTypeRanges,
        {
          mode: plan.effectiveScanCfg?.mode,
          hasCompleteManualTypeRanges: hostHasCompleteManualTypeRanges
        }
      );
      const formulaRangeMismatchIssues = buildFormulaSoldVacRangeMismatchIssues(formulaHints);
      const extraValidationIssues = [
        ...rawDerivedAudit.issues,
        ...formulaRangeMismatchIssues,
        ...hostProviderValueRowAudit.issues,
        ...hostProviderCoverageAudit.issues,
        ...hostDataRowSlotIssues
      ];
      if (hostHasAnyManualTypeRanges && !hostHasCompleteManualTypeRanges) {
        extraValidationIssues.push({
          code: "MANUAL_PROVIDER_TYPE_RANGE_INCOMPLETE",
          severity: "warn",
          message: `${providerKey} manual type ranges are partially set. Set Urban/DoubleTwin/Grand start/end together.`
        });
      }
      if (!Array.isArray(hostInventoryDataRows) || hostInventoryDataRows.filter((row) => Number.isInteger(row)).length <= 0) {
        extraValidationIssues.push({
          code: "INVENTORY_DATA_ROWS_MISSING",
          severity: "warn",
          message: `${providerKey} inventory data rows are not detected. Using derived room values only.`
        });
      }
      if (hasPartitionExpectation && totalExpectedPartition > 0 && totalDetectedPartition <= 0) {
        extraValidationIssues.push({
          code: "ROOM_PARTITION_UNDETECTED",
          severity: "error",
          message:
            "Room partition detection failed (detected 0 while expected > 0). Check room type ranges (Urban/DoubleTwin/Grand)."
        });
      } else if (hasPartitionMismatch) {
        extraValidationIssues.push({
          code: "ROOM_PARTITION_MISMATCH",
          severity: "warn",
          message: "Detected room partitions mismatch expected partitions."
        });
      }
      const validationIssues = buildScanValidationIssues(
        expectedTypeCounts,
        detectedRoomCount,
        hasTypeMismatch,
        hasInsufficientRows,
        extraValidationIssues
      );
      const validationErrorMessage = buildValidationErrorMessage(validationIssues);
      if (validationErrorMessage) {
        throw new Error(validationErrorMessage);
      }

      if (!plan.effectiveUseFullRange && plan.effectiveScanCfg.mode !== "manual" && (hasTypeMismatch || hasInsufficientRows)) {
        return fetchSheetSnapshot(syncConfig, query, forceRefreshToken, true, options);
      }

      const snapshot = {
        spreadsheetId: plan.spreadsheetId,
        sheetName: firstSheet?.properties?.title || syncConfig.sheetName,
        dateCols: filteredDateCols,
        inventoryRows,
        inventoryDataRows: {
          NAVER: naverDataRows,
          STATION: stationDataRows
        },
        naverValues: naverValueSource.values,
        stationValues: stationValueSource.values,
        naverRoomValues: naverRoomValues,
        stationRoomValues: stationRoomValues,
        naverDerivedRoomValues: naverDerived.roomValues,
        stationDerivedRoomValues: stationDerived.roomValues,
        reservationBlocks,
        reservationBlockCellMap,
        derivedCorrections: {
          NAVER: {
            count: naverDerived.correctionCount,
            roomTypeMap: naverDerived.roomTypeMap,
            diagnostics: naverDerived.diagnostics,
            expectedTypeTotalsByKey: naverDerived.expectedTypeTotalsByKey || {}
          },
          STATION: {
            count: stationDerived.correctionCount,
            roomTypeMap: stationDerived.roomTypeMap,
            diagnostics: stationDerived.diagnostics,
            expectedTypeTotalsByKey: stationDerived.expectedTypeTotalsByKey || {}
          }
        },
        trace: {
          generatedAt: new Date().toISOString(),
          range: {
            spreadsheetId: plan.spreadsheetId,
            sheetName: firstSheet?.properties?.title || syncConfig.sheetName,
            queryStartDate: query.startDate,
            queryEndDate: query.endDate,
            readRangeA1: plan.rangeA1,
            dateRow: dateRow + 1,
            dateStartCol: filteredDateCols.length > 0 ? colZeroToA1(filteredDateCols[0].col) : null,
            dateEndCol: filteredDateCols.length > 0 ? colZeroToA1(filteredDateCols[filteredDateCols.length - 1].col) : null
          },
          settingsSnapshot: traceSafeSyncConfig,
          providerValueSources: {
            NAVER: {
              providerRow: Number.isInteger(naverValueSource.providerRow) ? naverValueSource.providerRow + 1 : null,
              selectedRow: Number.isInteger(naverValueSource.row) ? naverValueSource.row + 1 : null,
              selectedReason: normalizeText(naverValueSource.selectedReason || ""),
              selectedScore: Number.isFinite(naverValueSource.selectedScore) ? Number(naverValueSource.selectedScore) : null,
              selectedParsedCount: Number.isFinite(naverValueSource.selectedParsedCount) ? Number(naverValueSource.selectedParsedCount) : null,
              selectedRawCount: Number.isFinite(naverValueSource.selectedRawCount) ? Number(naverValueSource.selectedRawCount) : null,
              candidates: Array.isArray(naverValueSource.candidates)
                ? naverValueSource.candidates.map((row) => ({
                    row: Number.isInteger(row?.row) ? row.row + 1 : null,
                    score: Number.isFinite(row?.score) ? Number(row.score) : null,
                    parsedCount: Number.isFinite(row?.parsedCount) ? Number(row.parsedCount) : null,
                    rawCount: Number.isFinite(row?.rawCount) ? Number(row.rawCount) : null
                  }))
                : [],
              cellTraceByDate: { ...(naverValueSource.cellTraceByDate || {}) }
            },
            STATION: {
              providerRow: Number.isInteger(stationValueSource.providerRow) ? stationValueSource.providerRow + 1 : null,
              selectedRow: Number.isInteger(stationValueSource.row) ? stationValueSource.row + 1 : null,
              selectedReason: normalizeText(stationValueSource.selectedReason || ""),
              selectedScore: Number.isFinite(stationValueSource.selectedScore) ? Number(stationValueSource.selectedScore) : null,
              selectedParsedCount: Number.isFinite(stationValueSource.selectedParsedCount) ? Number(stationValueSource.selectedParsedCount) : null,
              selectedRawCount: Number.isFinite(stationValueSource.selectedRawCount) ? Number(stationValueSource.selectedRawCount) : null,
              candidates: Array.isArray(stationValueSource.candidates)
                ? stationValueSource.candidates.map((row) => ({
                    row: Number.isInteger(row?.row) ? row.row + 1 : null,
                    score: Number.isFinite(row?.score) ? Number(row.score) : null,
                    parsedCount: Number.isFinite(row?.parsedCount) ? Number(row.parsedCount) : null,
                    rawCount: Number.isFinite(row?.rawCount) ? Number(row.rawCount) : null
                  }))
                : [],
              cellTraceByDate: { ...(stationValueSource.cellTraceByDate || {}) }
            }
          }
        },
        scan: {
          mode: plan.effectiveScanCfg.mode,
          allowPkgInventoryRows: plan.effectiveScanCfg.allowPkgInventoryRows === true,
          blockDetailMode: plan.blockDetailMode,
          dateRow: dateRow + 1,
          dateStartCol: filteredDateCols.length > 0 ? colZeroToA1(filteredDateCols[0].col) : null,
          dateEndCol: filteredDateCols.length > 0 ? colZeroToA1(filteredDateCols[filteredDateCols.length - 1].col) : null,
          dateCount: filteredDateCols.length,
          reservationBlockCount: reservationBlocks.length,
          reservationBlockChannels: reservationBlockStats,
          reservationBlockSummary,
          roomStartRow: roomStartRow + 1,
          roomEndRow: roomScanEndRow + 1,
          roomTypeRanges: {
            urban: {
              startRow: Number.isInteger(effectiveRoomTypeRanges?.urban?.start) ? effectiveRoomTypeRanges.urban.start + 1 : null,
              endRow: Number.isInteger(effectiveRoomTypeRanges?.urban?.end) ? effectiveRoomTypeRanges.urban.end + 1 : null
            },
            doubleTwin: {
              startRow: Number.isInteger(effectiveRoomTypeRanges?.doubleTwin?.start) ? effectiveRoomTypeRanges.doubleTwin.start + 1 : null,
              endRow: Number.isInteger(effectiveRoomTypeRanges?.doubleTwin?.end) ? effectiveRoomTypeRanges.doubleTwin.end + 1 : null
            },
            grand: {
              startRow: Number.isInteger(effectiveRoomTypeRanges?.grand?.start) ? effectiveRoomTypeRanges.grand.start + 1 : null,
              endRow: Number.isInteger(effectiveRoomTypeRanges?.grand?.end) ? effectiveRoomTypeRanges.grand.end + 1 : null
            }
          },
          formulaHints: {
            matches: isFormulaRangeSane && Array.isArray(formulaHints?.matches) ? formulaHints.matches : [],
            expectedTypeCounts: isFormulaRangeSane
              ? (formulaHints?.expectedTypeCounts || { urban: null, doubleTwin: null, grand: null })
              : { urban: null, doubleTwin: null, grand: null },
            soldRanges: toOneBasedTypeRanges(formulaHints?.soldRanges || {}),
            vacRanges: toOneBasedTypeRanges(formulaHints?.vacRanges || {})
          },
          roomSoldVacScanRange: toOneBasedRangeObject(formulaScanRange),
          inventorySearchStartRow: inventorySearchStartRow + 1,
          inventoryRows: {
            NAVER: Number.isInteger(inventoryRows.NAVER) ? inventoryRows.NAVER + 1 : null,
            STATION: Number.isInteger(inventoryRows.STATION) ? inventoryRows.STATION + 1 : null
          },
          inventoryValueRows: {
            NAVER: Number.isInteger(naverValueSource.row) ? naverValueSource.row + 1 : null,
            STATION: Number.isInteger(stationValueSource.row) ? stationValueSource.row + 1 : null
          },
          inventoryDataRows: {
            NAVER: Array.isArray(naverDataRows)
              ? naverDataRows.filter((row) => Number.isInteger(row)).map((row) => row + 1)
              : [],
            STATION: Array.isArray(stationDataRows)
              ? stationDataRows.filter((row) => Number.isInteger(row)).map((row) => row + 1)
              : []
          },
          inventoryTypeRanges: {
            NAVER: {
              ...toOneBasedTypeRanges(manualNaverTypeRanges || {})
            },
            STATION: {
              ...toOneBasedTypeRanges(manualStationTypeRanges || {})
            }
          },
          fetchMode: plan.effectiveUseFullRange ? "full" : "fast",
          validation: {
            providerKey,
            expectedTypeCounts,
            detectedTypeCounts,
            expectedPartitionCounts,
            detectedPartitionCounts,
            expectedRoomCount,
            detectedRoomCount,
            hasTypeMismatch,
            hasPartitionMismatch,
            hasInsufficientRows,
            rawDerivedComparedCount: rawDerivedAudit.comparedCount,
            rawDerivedMismatchCount: rawDerivedAudit.mismatchCount,
            providerValueRowComparedCount: hostProviderValueRowAudit.comparedCount,
            providerValueRowMismatchCount: hostProviderValueRowAudit.mismatchCount,
            providerValueRawCount: hostProviderCoverageAudit.rawCount,
            providerValueParsedCount: hostProviderCoverageAudit.parsedCount,
            issues: validationIssues
          }
        },
        readHints: {
          fingerprint: plan.sheetHints.fingerprint || "",
          roomMapCount: Object.keys(plan.sheetHints.roomTypeByRoomNo || {}).length,
          roomTypeByRoomNo: { ...(plan.sheetHints.roomTypeByRoomNo || {}) }
        }
      };

      const hasProviderRow = snapshot.inventoryRows?.[providerKey] !== undefined;
      const providerValues = providerKey === "STATION" ? snapshot.stationValues : snapshot.naverValues;
      const hasProviderValues = Object.values(providerValues || {}).some((inv) => normalizeText(inv?.raw || ""));
      if (!plan.effectiveUseFullRange && plan.effectiveScanCfg.mode !== "manual" && (!hasProviderRow && !hasProviderValues)) {
        return fetchSheetSnapshot(syncConfig, query, forceRefreshToken, true, options);
      }
      return cacheSheetSnapshotResult(plan.snapshotCacheKey, plan.quickCacheKey, snapshot);
    } catch (error) {
      if (!plan.effectiveUseFullRange && plan.effectiveScanCfg.mode !== "manual") {
        return fetchSheetSnapshot(syncConfig, query, forceRefreshToken, true, options);
      }
      throw error;
    }
  }

  Object.assign(ns, {
    assertReadonlySheetsRequest,
    fetchSheetMetadataAnchors,
    fetchSheetValuesBatch,
    scanConfigFromMetadata,
    loadSheetReadHints,
    fetchSheetSnapshot,
  });
})();

