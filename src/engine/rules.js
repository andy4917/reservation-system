(() => {
  "use strict";

  const root = globalThis;
  const App = (root.App = root.App || {});
  App.engine = App.engine || {};
  const ns = (App.engine.rules = App.engine.rules || {});
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
    IGNORED_COLOR_HEX,
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
  const F = App.report?.reportFormat || {};
  const { normalizeText, normalizeRoomNoKey, safeInt, oneBasedToZeroBased, toIntOrNull, normalizeOpenStatus } = N;
  const { normalizeDisplayInventoryValue, parseStockFraction } = F;

  function resolveRgbColorObject(color) {
    if (!color || typeof color !== "object") return null;
    if (color.rgbColor && typeof color.rgbColor === "object") return color.rgbColor;
    if (color.color && typeof color.color === "object") {
      if (color.color.rgbColor && typeof color.color.rgbColor === "object") return color.color.rgbColor;
      if (
        Object.prototype.hasOwnProperty.call(color.color, "red") ||
        Object.prototype.hasOwnProperty.call(color.color, "green") ||
        Object.prototype.hasOwnProperty.call(color.color, "blue")
      ) {
        return color.color;
      }
    }
    if (
      Object.prototype.hasOwnProperty.call(color, "red") ||
      Object.prototype.hasOwnProperty.call(color, "green") ||
      Object.prototype.hasOwnProperty.call(color, "blue")
    ) {
      return color;
    }
    return null;
  }

  function colorObjToHex(color) {
    const rgb = resolveRgbColorObject(color);
    if (!rgb) return "";
    const alpha = Number(rgb.alpha ?? color?.alpha);
    if (Number.isFinite(alpha) && alpha <= 0) return "";
    const norm = (value) => {
      const n = Number(value);
      const safe = Number.isFinite(n) ? n : 1;
      const scaled = Math.max(0, Math.min(255, Math.round(safe * 255)));
      return scaled.toString(16).toUpperCase().padStart(2, "0");
    };
    return `#${norm(rgb.red)}${norm(rgb.green)}${norm(rgb.blue)}`;
  }

  function hexToRgb(hex) {
    const text = normalizeText(hex).toUpperCase();
    const match = text.match(/^#([0-9A-F]{6})$/);
    if (!match) return null;
    return {
      r: Number.parseInt(match[1].slice(0, 2), 16),
      g: Number.parseInt(match[1].slice(2, 4), 16),
      b: Number.parseInt(match[1].slice(4, 6), 16)
    };
  }

  function resolveClosestMappedColorHex(hex) {
    const rgb = hexToRgb(hex);
    if (!rgb) return "";
    const MAX_CHANNEL_DELTA = 3;
    const MAX_DISTANCE_SQ = 18;
    let bestHex = "";
    let bestDistance = Infinity;
    Object.keys(V2_COLOR_STATUS_CHANNEL_MAP || {}).forEach((candidateHex) => {
      const candidate = hexToRgb(candidateHex);
      if (!candidate) return;
      const dr = Math.abs(rgb.r - candidate.r);
      const dg = Math.abs(rgb.g - candidate.g);
      const db = Math.abs(rgb.b - candidate.b);
      if (dr > MAX_CHANNEL_DELTA || dg > MAX_CHANNEL_DELTA || db > MAX_CHANNEL_DELTA) return;
      const distance = dr * dr + dg * dg + db * db;
      if (distance > MAX_DISTANCE_SQ) return;
      if (distance < bestDistance) {
        bestDistance = distance;
        bestHex = candidateHex;
      }
    });
    return bestHex;
  }


  function isLikelyReservationColor(color) {
    if (!color || typeof color !== "object") return false;
    const hex = normalizeText(colorObjToHex(color)).toUpperCase();
    if (!hex) return false;
    if (IGNORED_COLOR_HEX && IGNORED_COLOR_HEX.has(hex)) return false;
    return RESERVATION_BLOCK_COLOR_HEX.has(hex);
  }


  function classifySheetCellColorStatus(cell) {
    const hex = normalizeText(colorObjToHex(cell?.backgroundColor || null)).toUpperCase();
    if (!hex) return { status: "VACANT", channel: "", errorCode: "" };
    const mappedHex = Object.prototype.hasOwnProperty.call(V2_COLOR_STATUS_CHANNEL_MAP, hex)
      ? hex
      : resolveClosestMappedColorHex(hex);
    const mapped = mappedHex ? V2_COLOR_STATUS_CHANNEL_MAP[mappedHex] : null;
    if (mapped) return { status: mapped.status, channel: mapped.channel, errorCode: "" };

    // Keep explicit text markers above note-based occupied fallback.
    const note = normalizeText(cell?.note || "");
    const text = normalizeText(cell?.formattedValue || "");
    const textUpper = text.toUpperCase();
    const noteUpper = note.toUpperCase();
    const oooTokenPattern = /(^|[^A-Z0-9])O[\s.\-_/]*O[\s.\-_/]*O([^A-Z0-9]|$)/i;
    const hasVipToken = textUpper === "VIP" || noteUpper === "VIP";
    const hasOooToken =
      textUpper === "OOO" ||
      noteUpper === "OOO" ||
      oooTokenPattern.test(text) ||
      oooTokenPattern.test(note);
    const hasMarketingToken =
      textUpper === "MARKETING" ||
      textUpper === "마케팅" ||
      noteUpper === "MARKETING" ||
      noteUpper.includes("마케팅");
    if (hasVipToken) return { status: "BLOCKED", channel: "VIP", errorCode: `UNKNOWN_COLOR(${hex})` };
    if (hasOooToken) {
      return { status: "BLOCKED", channel: "OOO", errorCode: `UNKNOWN_COLOR(${hex})` };
    }
    if (hasMarketingToken) {
      return { status: "BLOCKED", channel: "MARKETING", errorCode: `UNKNOWN_COLOR(${hex})` };
    }
    if (note) return { status: "OCCUPIED", channel: "UNKNOWN", errorCode: `UNKNOWN_COLOR(${hex})` };
    return { status: "UNKNOWN", channel: "", errorCode: `UNKNOWN_COLOR(${hex})` };
  }


  function classifySheetCellStatus(cell) {
    const hex = normalizeText(colorObjToHex(cell?.backgroundColor || null)).toUpperCase();
    if (hex && IGNORED_COLOR_HEX && IGNORED_COLOR_HEX.has(hex)) return "EMPTY";
    const text = normalizeText(cell?.formattedValue || "");
    const note = normalizeText(cell?.note || "");
    const textUpper = text.toUpperCase();
    const noteUpper = note.toUpperCase();
    const oooTokenPattern = /(^|[^A-Z0-9])O[\s.\-_/]*O[\s.\-_/]*O([^A-Z0-9]|$)/i;
    const colorStatus = classifySheetCellColorStatus(cell);
    if (colorStatus.status === "BLOCKED") {
      if (colorStatus.channel === "VIP") return "VIP";
      if (colorStatus.channel === "MARKETING") return "MARKETING";
      return "OOO";
    }
    if (colorStatus.status === "OCCUPIED") return "OTHER";

    // Legacy text fallback for no-fill cells.
    if (textUpper === "VAC") return "VAC";
    if (textUpper === "VIP" || noteUpper === "VIP") return "VIP";
    if (
      textUpper === "OOO" ||
      noteUpper === "OOO" ||
      oooTokenPattern.test(text) ||
      oooTokenPattern.test(note)
    ) {
      return "OOO";
    }
    if (
      textUpper === "MARKETING" ||
      textUpper === "마케팅" ||
      noteUpper === "MARKETING" ||
      noteUpper.includes("마케팅")
    ) {
      return "MARKETING";
    }
    if (note) return "OTHER";
    if (isLikelyReservationColor(cell?.backgroundColor)) return "OTHER";
    if (text) return "EMPTY";
    return "VAC";
  }


  function createCellStatusResolver(matrix) {
    const cache = new Map();
    return (row, col) => {
      const key = `${row}:${col}`;
      if (cache.has(key)) return cache.get(key);
      const status = classifySheetCellStatus(matrix.get(row, col));
      cache.set(key, status);
      return status;
    };
  }


  function isLikelyRoomNo(value) {
    const text = normalizeText(value);
    if (!text) return false;
    return /[0-9]/.test(text);
  }


  function buildManualRoomTypeRanges(scanConfig = {}) {
    const parseRange = (startOneBased, endOneBased) => {
      const start = oneBasedToZeroBased(startOneBased);
      const end = oneBasedToZeroBased(endOneBased);
      if (!Number.isInteger(start) && !Number.isInteger(end)) return null;
      const s = Number.isInteger(start) ? start : end;
      const e = Number.isInteger(end) ? end : start;
      if (!Number.isInteger(s) || !Number.isInteger(e)) return null;
      return { start: Math.min(s, e), end: Math.max(s, e) };
    };
    return {
      urban: parseRange(scanConfig.urbanStartRow, scanConfig.urbanEndRow),
      doubleTwin: parseRange(scanConfig.doubleTwinStartRow, scanConfig.doubleTwinEndRow),
      grand: parseRange(scanConfig.grandStartRow, scanConfig.grandEndRow)
    };
  }


  function resolveManualRoomTypeByRow(row, roomTypeRanges) {
    const isInRange = (range) =>
      Boolean(range && Number.isInteger(range.start) && Number.isInteger(range.end) && row >= range.start && row <= range.end);
    if (isInRange(roomTypeRanges?.grand)) return ROOM_TYPE_LABELS.grand;
    if (isInRange(roomTypeRanges?.doubleTwin)) return ROOM_TYPE_LABELS.doubleTwin;
    if (isInRange(roomTypeRanges?.urban)) return ROOM_TYPE_LABELS.urban;
    return "";
  }


  function hasCompleteManualRoomTypeRanges(roomTypeRanges) {
    return Boolean(roomTypeRanges?.urban && roomTypeRanges?.doubleTwin && roomTypeRanges?.grand);
  }


  function buildRoomPartitions(roomTypeRanges) {
    if (!hasCompleteManualRoomTypeRanges(roomTypeRanges)) return [];
    return [
      { key: "urban_num", roomType: ROOM_TYPE_LABELS.urban, range: roomTypeRanges.urban, roomNoPattern: /^[0-9]/ },
      { key: "urban_alpha", roomType: ROOM_TYPE_LABELS.urban, range: roomTypeRanges.urban, roomNoPattern: /^A/i },
      { key: "double_num", roomType: ROOM_TYPE_LABELS.doubleTwin, range: roomTypeRanges.doubleTwin, roomNoPattern: /^[0-9]/ },
      { key: "double_alpha", roomType: ROOM_TYPE_LABELS.doubleTwin, range: roomTypeRanges.doubleTwin, roomNoPattern: /^A/i },
      { key: "grand", roomType: ROOM_TYPE_LABELS.grand, range: roomTypeRanges.grand, roomNoPattern: /^A/i }
    ];
  }


  function scoreRoomTypeMatch(presetName, sheetRoomType) {
    const presetKey = roomNameKey(presetName);
    const sheetKey = roomNameKey(sheetRoomType);
    if (!presetKey || !sheetKey) return 0;
    if (presetKey === sheetKey) return 1;
    if (presetKey.includes(sheetKey) || sheetKey.includes(presetKey)) {
      const ratio = Math.min(presetKey.length, sheetKey.length) / Math.max(presetKey.length, sheetKey.length);
      return 0.78 + ratio * 0.2;
    }
    return 0;
  }


  function mapPresetRoomTypeKeys(roomPreset, roomTypeKeys) {
    const keys = (roomTypeKeys || []).filter(Boolean);
    const remained = [...keys];
    const mapping = new Map();

    (roomPreset || []).forEach((room) => {
      let bestIdx = -1;
      let bestScore = -1;
      remained.forEach((typeKey, idx) => {
        const score = scoreRoomTypeMatch(room?.name || "", typeKey);
        if (score > bestScore) {
          bestScore = score;
          bestIdx = idx;
        }
      });
      if (bestIdx >= 0 && bestScore >= 0.5) {
        const matched = remained.splice(bestIdx, 1)[0];
        mapping.set(String(room.id), matched);
      }
    });

    (roomPreset || []).forEach((room) => {
      const roomId = String(room.id);
      if (mapping.has(roomId)) return;
      const fallback = remained.shift();
      if (fallback) mapping.set(roomId, fallback);
    });

    return mapping;
  }


  function resolveExpectedCountsFromStat(stat, providerKey, day, currentInv = null) {
    if (!stat) return null;
    const fixedMax = resolveProviderFixedMaximum(providerKey, day);
    const provider = String(providerKey || "").toUpperCase();
    const rawTotal = safeInt(stat.expectedTotal ?? stat.total);
    if (!Number.isInteger(rawTotal) || rawTotal <= 0) return null;
    const rawSold = Math.max(0, Math.min(safeInt(stat.sold), rawTotal));

    let effectiveMax = fixedMax;
    let stationVacQualified = false;
    if (provider === "NAVER" && Number.isInteger(fixedMax)) {
      // NAVER row values are normalized against the provider fixed maximum
      // (weekday 4 / Fri-Sat 3), and "닫음" is canonicalized to that closed cap.
      // Do not shrink total to local vacancy here, or fully closed days become 0/0
      // and no longer match the raw provider row.
      effectiveMax = fixedMax;
    } else if (provider === "STATION" && Number.isInteger(fixedMax)) {
      const vacCap = safeInt(stat.vacancy ?? stat.vac);
      const sourceMaximum = safeInt(currentInv?.maximum);
      if (Number.isInteger(vacCap) && vacCap >= 7 && Number.isInteger(sourceMaximum) && sourceMaximum > 1) {
        effectiveMax = sourceMaximum;
        stationVacQualified = true;
      } else {
        effectiveMax = fixedMax;
      }
    }

    if (Number.isInteger(effectiveMax) && effectiveMax === 0) {
      return {
        total: 0,
        sold: 0,
        available: 0,
        sourceTotal: rawTotal,
        stationVacQualified
      };
    }

    if (Number.isInteger(effectiveMax) && effectiveMax > 0) {
      let soldScaled = 0;
      if (rawSold >= rawTotal) soldScaled = effectiveMax;
      else if (rawSold <= 0) soldScaled = 0;
      else if (provider === "STATION" && effectiveMax === 1) soldScaled = 0;
      else soldScaled = Math.round((rawSold / rawTotal) * effectiveMax);
      const sold = Math.max(0, Math.min(soldScaled, effectiveMax));
      return {
        total: effectiveMax,
        sold,
        available: Math.max(effectiveMax - sold, 0),
        sourceTotal: rawTotal,
        stationVacQualified
      };
    }

    const sold = rawSold;
    return {
      total: rawTotal,
      sold,
      available: Math.max(rawTotal - sold, 0),
      sourceTotal: rawTotal,
      stationVacQualified
    };
  }


  function inferRoomValueFormat(valuesByDate, roomStatsByDate, providerKey = "") {
    const daySet = new Set([
      ...Object.keys(valuesByDate || {}),
      ...Object.keys(roomStatsByDate || {})
    ]);
    let fractionCount = 0;
    let numericCount = 0;
    let scoreCurrent = 0;
    let scoreAvailable = 0;

    daySet.forEach((day) => {
      const raw = normalizeText(valuesByDate?.[day]?.raw || "");
      if (!raw) return;
      const low = raw.toLowerCase();
      if (CLOSED_TEXTS.has(low)) return;
      if (parseStockFraction(raw)) {
        fractionCount += 1;
        return;
      }
      if (!/^\d+$/.test(raw)) return;
      const stat = roomStatsByDate?.[day];
      if (!stat) return;
      const expected = resolveExpectedCountsFromStat(stat, providerKey, day, valuesByDate?.[day] || null);
      if (!expected) return;
      const num = Number(raw);
      numericCount += 1;
      scoreCurrent += Math.abs(num - expected.sold);
      scoreAvailable += Math.abs(num - expected.available);
    });

    if (fractionCount > 0) return "fraction";
    if (numericCount > 0) return scoreAvailable < scoreCurrent ? "numeric-available" : "numeric-current";
    return "fraction";
  }


  function formatExpectedInventoryRaw(
    formatKind,
    stat,
    providerKey = "",
    day = "",
    currentInv = null,
    expectedResolved = null
  ) {
    const expected = expectedResolved || resolveExpectedCountsFromStat(stat, providerKey, day, currentInv);
    if (!expected) return "";
    if (formatKind === "numeric-available") return String(expected.available);
    if (formatKind === "numeric-current") return String(expected.sold);
    return `${expected.sold}/${expected.total}`;
  }


  function canonicalizeInventoryRaw(raw, providerKey = "", dateKey = "") {
    const display = normalizeDisplayInventoryValue(raw);
    if (!display) return "";
    if (display === TEXT.closed) {
      const fixedMax = resolveProviderFixedMaximum(providerKey, dateKey);
      if (Number.isInteger(fixedMax) && fixedMax > 0) return `${fixedMax}/${fixedMax}`;
      return TEXT.closed;
    }
    const parsed = parseStockValue(display);
    const normalized = applyProviderMaximumRule(parsed, providerKey, dateKey);
    const current = Number.isInteger(normalized?.current) ? Number(normalized.current) : null;
    const maximum = Number.isInteger(normalized?.maximum) ? Number(normalized.maximum) : null;
    if (Number.isInteger(current) && Number.isInteger(maximum)) return `${current}/${maximum}`;
    if (Number.isInteger(current)) return String(current);
    return display;
  }


  function areInventoryRawsEquivalent(leftRaw, rightRaw, providerKey = "", dateKey = "") {
    const left = canonicalizeInventoryRaw(leftRaw, providerKey, dateKey);
    const right = canonicalizeInventoryRaw(rightRaw, providerKey, dateKey);
    return left === right;
  }


  function parseStockValue(raw) {
    const text = normalizeText(raw);
    if (!text) return { raw: "", current: null, maximum: null };
    const looseFraction = text.match(/(\d+)\s*\/\s*(\d+)/);
    if (looseFraction) return { raw: text, current: Number(looseFraction[1]), maximum: Number(looseFraction[2]) };
    if (/^\d+$/.test(text)) return { raw: text, current: Number(text), maximum: null };
    return { raw: text, current: null, maximum: null };
  }


  function weekdayFromDateKey(dateKey) {
    const text = normalizeText(dateKey);
    const m = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (!Number.isInteger(y) || !Number.isInteger(mo) || !Number.isInteger(d)) return null;
    const dt = new Date(Date.UTC(y, mo - 1, d));
    if (
      dt.getUTCFullYear() !== y ||
      dt.getUTCMonth() !== mo - 1 ||
      dt.getUTCDate() !== d
    ) {
      return null;
    }
    return dt.getUTCDay(); // 0:Sun ... 6:Sat
  }


  function resolveProviderFixedMaximum(providerKey, dateKey = "") {
    const provider = String(providerKey || "").toUpperCase();
    if (provider === "STATION") return 1;
    if (provider === "NAVER") {
      const weekday = weekdayFromDateKey(dateKey);
      if (weekday === 5 || weekday === 6) return 3; // Fri/Sat
      return 4; // Sun/Mon/Tue/Wed/Thu
    }
    return null;
  }

  function resolveCappedProviderMaximum(fixedMax, parsedMaximum) {
    if (!Number.isInteger(fixedMax)) return Number.isInteger(parsedMaximum) ? Math.max(0, Number(parsedMaximum)) : null;
    if (!Number.isInteger(parsedMaximum)) return fixedMax;
    return Math.max(0, Math.min(fixedMax, Number(parsedMaximum)));
  }


  function applyProviderMaximumRule(inv, providerKey, dateKey = "") {
    const fixedMax = resolveProviderFixedMaximum(providerKey, dateKey);
    if (!Number.isInteger(fixedMax)) return inv;
    const provider = String(providerKey || "").toUpperCase();
    const raw = normalizeText(inv?.raw || "");
    const low = raw.toLowerCase();
    const current = Number.isInteger(inv?.current) ? Number(inv.current) : null;
    const maximum = Number.isInteger(inv?.maximum) ? Number(inv.maximum) : null;
    if (provider === "STATION") {
      // Preserve source maximum from sheet; STATION exceptional >1 is decided later with VAC>=7 gate.
      if (raw && CLOSED_TEXTS.has(low)) return { ...inv, current: 1, maximum: 1 };
      return { ...inv, current, maximum };
    }
    const effectiveMax = resolveCappedProviderMaximum(fixedMax, maximum);
    if (raw && CLOSED_TEXTS.has(low)) {
      return { ...inv, current: effectiveMax, maximum: effectiveMax };
    }
    if (Number.isInteger(current)) {
      return { ...inv, current, maximum: effectiveMax };
    }
    if (Number.isInteger(maximum)) {
      return { ...inv, current: null, maximum: effectiveMax };
    }
    // Keep blank/unparseable cells unparsed so they do not become synthetic values.
    return { ...inv, current: null, maximum: null };
  }


  function resolveInventoryMaximum(inv, providerKey = "", dateKey = "") {
    const provider = String(providerKey || "").toUpperCase();
    if (provider === "STATION") {
      if (inv?.stationVacQualified === true) {
        const mx = Number.isInteger(inv?.maximum) ? Number(inv.maximum) : null;
        if (Number.isInteger(mx) && mx > 1) return mx;
      }
      const raw = normalizeText(inv?.raw || "");
      const low = raw.toLowerCase();
      const hasCurrent = Number.isInteger(inv?.current);
      const hasMaximum = Number.isInteger(inv?.maximum);
      const parsed = parseStockValue(raw);
      const hasParsedRaw = raw && (CLOSED_TEXTS.has(low) || Number.isInteger(parsed?.current) || Number.isInteger(parsed?.maximum));
      if (hasCurrent || hasMaximum || hasParsedRaw) return 1;
      return null;
    }

    const fixedMax = resolveProviderFixedMaximum(providerKey, dateKey);
    if (Number.isInteger(fixedMax)) {
      const raw = normalizeText(inv?.raw || "");
      const low = raw.toLowerCase();
      const hasCurrent = Number.isInteger(inv?.current);
      const hasMaximum = Number.isInteger(inv?.maximum);
      const parsed = parseStockValue(raw);
      const hasParsedRaw = raw && (CLOSED_TEXTS.has(low) || Number.isInteger(parsed?.current) || Number.isInteger(parsed?.maximum));
      if (hasCurrent || hasMaximum || hasParsedRaw) {
        return resolveCappedProviderMaximum(fixedMax, Number.isInteger(inv?.maximum) ? Number(inv.maximum) : null);
      }
    }
    const maximum = Number.isInteger(inv?.maximum) ? Number(inv.maximum) : null;
    if (maximum !== null) return Math.max(0, maximum);
    return null;
  }


  function inventoryValueToTargetUnits(inv, mode, providerKey, dateKey = "") {
    const raw = normalizeText(inv?.raw || "");
    const current = Number.isInteger(inv?.current) ? Number(inv.current) : null;
    const maximum = resolveInventoryMaximum(inv, providerKey, dateKey);

    if (raw) {
      const low = raw.toLowerCase();
      if (CLOSED_TEXTS.has(low)) return 0;
    }

    if (mode === "available") {
      if (Number.isInteger(current) && Number.isInteger(maximum)) return Math.max(maximum - current, 0);
      if (Number.isInteger(current)) return Math.max(current, 0);
      if (Number.isInteger(maximum)) return Math.max(maximum, 0);
    } else {
      if (Number.isInteger(current) && Number.isInteger(maximum)) {
        return Math.max(Math.min(current, maximum), 0);
      }
      if (Number.isInteger(current)) return Math.max(current, 0);
      if (Number.isInteger(maximum)) return Math.max(maximum, 0);
    }

    if (raw) {
      const nums = (raw.match(/\d+/g) || []).map((v) => Number(v));
      if (nums.length) return Math.max(nums[0], 0);
    }
    return null;
  }


  function buildTargetMap(valuesByDate, mode, providerKey) {
    const out = {};
    Object.entries(valuesByDate || {}).forEach(([day, inv]) => {
      const target = inventoryValueToTargetUnits(inv, mode, providerKey, day);
      if (target === null || target === undefined) return;
      out[day] = Math.max(0, Number(target) || 0);
    });
    return out;
  }


  function analyzeTargetMap(valuesByDate, targets, providerKey) {
    const issues = [];
    const details = [];

    Object.keys(valuesByDate || {})
      .sort()
      .forEach((day) => {
        const inv = valuesByDate[day] || { raw: "", current: null, maximum: null };
        const target = Object.prototype.hasOwnProperty.call(targets, day) ? targets[day] : null;
        const parsed = target !== null && target !== undefined;
        const current = Number.isInteger(inv?.current) ? Number(inv.current) : null;
        const maximum = resolveInventoryMaximum(inv, providerKey, day);

        details.push({
          date: day,
          raw: inv.raw,
          current,
          maximum,
          parsed,
          target
        });

        if (!parsed) {
          issues.push({
            level: "error",
            code: "UNPARSEABLE_CELL",
            date: day,
            message: `Cannot parse sheet cell value: '${inv.raw}'`
          });
          return;
        }

        if (target < 0) {
          issues.push({
            level: "error",
            code: "NEGATIVE_TARGET",
            date: day,
            message: `Parsed target is negative: ${target}`
          });
        }

        if (Number.isInteger(current) && Number.isInteger(maximum) && current > maximum) {
          issues.push({
            level: "warn",
            code: "CURRENT_EXCEEDS_MAXIMUM",
            date: day,
            message: `Current reservation exceeds maximum (${current}/${maximum}). Forced close applies.`
          });
        }

      });

    return {
      issues,
      details,
      errorCount: issues.filter((x) => x.level === "error").length,
      warnCount: issues.filter((x) => x.level === "warn").length
    };
  }


  function allocateRoomUnits(roomIds, currentStockByRoom, targetUnits) {
    const ordered = (roomIds || []).filter(Boolean);
    const limit = Math.max(0, Math.min(Number(targetUnits) || 0, ordered.length));
    const selected = [];

    ordered.forEach((rid) => {
      if (selected.length < limit && (Number(currentStockByRoom[rid]) || 0) > 0) selected.push(rid);
    });
    ordered.forEach((rid) => {
      if (selected.length >= limit) return;
      if (!selected.includes(rid)) selected.push(rid);
    });

    const selectedSet = new Set(selected);
    const out = {};
    ordered.forEach((rid) => {
      out[rid] = selectedSet.has(rid) ? 1 : 0;
    });
    return out;
  }


  function allocateRoomUnitsFlexible(roomIds, currentStockByRoom, targetUnits) {
    const ordered = (roomIds || []).filter(Boolean);
    if (!ordered.length) return {};

    const out = {};
    ordered.forEach((rid) => {
      out[rid] = 0;
    });

    let remaining = Math.max(0, Number(targetUnits) || 0);

    // Keep existing open stock first so we minimize unnecessary churn.
    ordered.forEach((rid) => {
      if (remaining <= 0) return;
      const current = safeInt(currentStockByRoom[rid] ?? 0);
      if (current <= 0) return;
      const keep = Math.min(current, remaining);
      out[rid] = keep;
      remaining -= keep;
    });

    let idx = 0;
    while (remaining > 0 && ordered.length > 0) {
      const rid = ordered[idx % ordered.length];
      out[rid] = safeInt(out[rid] ?? 0) + 1;
      remaining -= 1;
      idx += 1;
    }

    return out;
  }


  function normalizeTargetByRoom(desired, roomIds) {
    if (!desired || typeof desired !== "object" || Array.isArray(desired)) return null;
    const ordered = (roomIds || []).map((rid) => String(rid || "")).filter(Boolean);
    if (!ordered.length) return null;
    const out = {};
    let hasAny = false;
    ordered.forEach((rid) => {
      if (!Object.prototype.hasOwnProperty.call(desired, rid)) return;
      const raw = desired[rid];
      const n = Number(raw);
      if (!Number.isFinite(n)) return;
      out[rid] = Math.max(0, Math.trunc(n));
      hasAny = true;
    });
    if (!hasAny) return null;
    ordered.forEach((rid) => {
      if (!Object.prototype.hasOwnProperty.call(out, rid)) out[rid] = 0;
    });
    return out;
  }


  function planStationActions(targets, stationRows, roomIds, branchId) {
    const rowsByDate = new Map();
    (stationRows || []).forEach((row) => {
      const day = normalizeText(row.date);
      const rid = normalizeText(row.roomId);
      if (!day || !rid) return;
      if (!rowsByDate.has(day)) rowsByDate.set(day, []);
      rowsByDate.get(day).push(row);
    });

    const actions = [];
    const warnings = [];

    Object.keys(targets || {})
      .sort()
      .forEach((day) => {
        const desiredRaw = targets[day];
        const dayRows = rowsByDate.get(day) || [];
        if (!dayRows.length) {
          warnings.push({
            provider: "STATION",
            code: "STATION_NO_CALENDAR_ROWS",
            date: day,
            message: `[station] no calendar rows for ${day}`
          });
          return;
        }

        let presentIds = (roomIds || []).filter((rid) => dayRows.some((r) => String(r.roomId) === rid));
        if (!presentIds.length) {
          presentIds = [...new Set(dayRows.map((r) => String(r.roomId || "")).filter(Boolean))].sort();
        }
        if (!presentIds.length) return;
        const desiredByRoom = normalizeTargetByRoom(desiredRaw, presentIds);
        const desired = desiredByRoom
          ? presentIds.reduce((acc, rid) => acc + Number(desiredByRoom[rid] || 0), 0)
          : Math.max(0, Number(desiredRaw) || 0);

        const currentStockByRoom = {};
        const priceSetCandidates = [];
        presentIds.forEach((rid) => {
          const row = dayRows.find((r) => String(r.roomId) === rid);
          if (!row) return;
          currentStockByRoom[rid] = safeInt(row.settingStock ?? row.stockCount ?? 0);
          const psid = toIntOrNull(row.priceSetId);
          if (psid !== null) priceSetCandidates.push(psid);
        });

        if (!priceSetCandidates.length) {
          warnings.push({
            provider: "STATION",
            code: "STATION_NO_PRICE_SET_ID",
            date: day,
            message: `[station] no priceSetId for ${day}`
          });
          return;
        }

        const allocation = desiredByRoom || allocateRoomUnits(presentIds, currentStockByRoom, desired);
        let hasChange = false;
        let mismatchCount = 0;
        const adjustedAllocation = {};
        const roomChanges = presentIds.map((rid) => {
          const row = dayRows.find((r) => String(r.roomId) === rid) || {};
          const currentStock = Number(currentStockByRoom[rid] || 0);
          const normalizedOpen = normalizeOpenStatus(row.openStatus);
          const currentOpen =
            normalizedOpen === "OPEN" || (normalizedOpen !== "CLOSED" && currentStock > 0);
          const requestedTargetStock = Number(allocation[rid] || 0);
          const targetOpen = requestedTargetStock > 0;
          const shouldAdjustStock = currentOpen || targetOpen;
          const targetStock = shouldAdjustStock ? requestedTargetStock : currentStock;
          const stockChanged = currentStock !== targetStock;
          const countAsMismatch = stockChanged && (currentOpen || targetOpen);

          adjustedAllocation[rid] = targetStock;
          if (stockChanged) hasChange = true;
          if (countAsMismatch) mismatchCount += 1;

          return {
            roomId: rid,
            from: currentStock,
            to: targetStock,
            currentOpen,
            targetOpen,
            countAsMismatch
          };
        });
        const payload = {
          branchId: Number(branchId),
          priceSetId: Number(priceSetCandidates[0]),
          applyDates: [day],
          roomSettingStocks: presentIds.map((rid) => ({
            roomId: Number(rid),
            settingStock: Number(adjustedAllocation[rid] || 0)
          }))
        };

        actions.push({
          date: day,
          targetUnits: desired,
          targetByRoom: desiredByRoom ? { ...allocation } : null,
          currentUnits: presentIds.reduce((acc, rid) => acc + Number(currentStockByRoom[rid] || 0), 0),
          hasChange,
          mismatchCount,
          roomChanges,
          payload
        });
      });

    return { actions, warnings };
  }


  function planNaverActions(targets, roomIds, naverRows, desc) {
    const mapByRoom = new Map();
    (roomIds || []).forEach((rid) => mapByRoom.set(rid, new Map()));

    (naverRows || []).forEach((row) => {
      const rid = String(row.roomId || "");
      const day = String(row.date || "");
      if (!rid || !day || !mapByRoom.has(rid)) return;
      mapByRoom.get(rid).set(day, {
        stock: safeInt(row.availableStock ?? row.stock ?? 0),
        isSaleDay: normalizeOpenStatus(row.openStatus) === "OPEN"
      });
    });

    const actions = [];
    Object.keys(targets || {})
      .sort()
      .forEach((day) => {
        const desiredRaw = targets[day];
        const currentStockByRoom = {};
        const currentSaleByRoom = {};

        (roomIds || []).forEach((rid) => {
          const row = mapByRoom.get(rid)?.get(day) || {};
          const stock = safeInt(row.stock ?? 0);
          const isSale = typeof row.isSaleDay === "boolean" ? row.isSaleDay : stock > 0;
          currentStockByRoom[rid] = stock;
          currentSaleByRoom[rid] = isSale;
        });

        const desiredByRoom = normalizeTargetByRoom(desiredRaw, roomIds);
        const desired = desiredByRoom
          ? (roomIds || []).reduce((acc, rid) => acc + Number(desiredByRoom[rid] || 0), 0)
          : Math.max(0, Number(desiredRaw) || 0);
        const allocation = desiredByRoom || allocateRoomUnitsFlexible(roomIds, currentStockByRoom, desired);
        (roomIds || []).forEach((rid) => {
          const requestedTargetStock = Number(allocation[rid] || 0);
          const currentStock = Number(currentStockByRoom[rid] || 0);
          const targetSale = requestedTargetStock > 0;
          const currentSale = Boolean(currentSaleByRoom[rid]);
          const shouldAdjustStock = currentSale || targetSale;
          const targetStock = shouldAdjustStock ? requestedTargetStock : currentStock;

          if (shouldAdjustStock && currentStock !== targetStock) {
            actions.push({
              provider: "NAVER",
              type: "stock",
              bizItemId: rid,
              date: day,
              currentStock,
              targetStock,
              targetUnits: desired,
              countAsMismatch: currentSale && targetSale,
              payload: { startDate: day, endDate: day, stock: targetStock, desc }
            });
          }
          if (currentSale !== targetSale) {
            actions.push({
              provider: "NAVER",
              type: "sale-day",
              bizItemId: rid,
              date: day,
              currentSaleDay: currentSale,
              targetSaleDay: targetSale,
              targetUnits: desired,
              countAsMismatch: true,
              payload: { day, isSaleDay: targetSale }
            });
          }
        });
      });
    return actions;
  }


  function roomNameKey(value) {
    return normalizeText(value).toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  }

  Object.assign(ns, {
    colorObjToHex,
    isLikelyReservationColor,
    classifySheetCellColorStatus,
    classifySheetCellStatus,
    createCellStatusResolver,
    isLikelyRoomNo,
    buildManualRoomTypeRanges,
    resolveManualRoomTypeByRow,
    hasCompleteManualRoomTypeRanges,
    buildRoomPartitions,
    scoreRoomTypeMatch,
    mapPresetRoomTypeKeys,
    resolveExpectedCountsFromStat,
    inferRoomValueFormat,
    formatExpectedInventoryRaw,
    canonicalizeInventoryRaw,
    areInventoryRawsEquivalent,
    parseStockValue,
    weekdayFromDateKey,
    resolveProviderFixedMaximum,
    applyProviderMaximumRule,
    resolveInventoryMaximum,
    inventoryValueToTargetUnits,
    buildTargetMap,
    analyzeTargetMap,
    allocateRoomUnits,
    allocateRoomUnitsFlexible,
    planStationActions,
    planNaverActions,
    roomNameKey,
  });
})();
