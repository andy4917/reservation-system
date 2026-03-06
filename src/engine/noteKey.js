(() => {
  "use strict";

  const root = globalThis;
  const App = (root.App = root.App || {});
  App.engine = App.engine || {};
  const ns = (App.engine.noteKey = App.engine.noteKey || {});

  const N = App.scan?.normalize || {};
  const { normalizeText, sanitizeScanConfig } = N;
  const RESERVATION_NO_RE =
    /(?:예약번호|reservation(?:_|\s*)number|reservation(?:_|\s*)no|rsvn(?:_|\s*)no|global(?:_|\s*)rsvn(?:_|\s*)no|guest(?:_|\s*)rsvn(?:_|\s*)no)\s*[:#：]?\s*([0-9A-Za-z_-]+)/gi;
  const NAME_LABEL_PATTERNS = [
    /(?:예약자|guest|booker|customer|cust(?:omer)?|투숙객|성함|이름|guest[_\s-]*name|booker[_\s-]*name)\s*[:：]?\s*([^\n\r,|/()]+?)(?=(?:\s{2,}|[,|/]|$))/i
  ];
  const PHONE_LABEL_PATTERNS = [
    /(?:연락처|phone|mobile|tel|hp|핸드폰|휴대폰|전화)\s*[:：]?\s*([0-9+\-() ]{7,})/i
  ];
  const IDENTITY_STOPWORDS = new Set([
    "reservation",
    "reservations",
    "reservationno",
    "reservationnumber",
    "guest",
    "guests",
    "booker",
    "customer",
    "phone",
    "mobile",
    "checkin",
    "checkout",
    "remark",
    "remarks",
    "memo",
    "note",
    "request",
    "requests",
    "room",
    "rooms",
    "ota",
    "channel",
    "status",
    "예약",
    "예약자",
    "연락처",
    "객실",
    "메모",
    "비고",
    "상태",
    "투숙객",
    "고객",
    "이름"
  ]);

  function quickTextHash(value) {
    const text = String(value ?? "");
    let h = 0;
    for (let i = 0; i < text.length; i += 1) {
      h = (h * 31 + text.charCodeAt(i)) >>> 0;
    }
    return h.toString(36);
  }


  function digestValueRanges(valueRanges) {
    const rows = (valueRanges || []).map((vr) => {
      const range = normalizeText(vr?.range || "");
      const values = Array.isArray(vr?.values) ? vr.values : [];
      return `${range}:${JSON.stringify(values)}`;
    });
    return quickTextHash(rows.join("|"));
  }


  function buildSnapshotCacheKey(spreadsheetId, sheetName, query, scanCfg, hintsFingerprint, useFullRange) {
    const q = query || {};
    return JSON.stringify({
      spreadsheetId,
      sheetName,
      startDate: q.startDate || "",
      endDate: q.endDate || "",
      scan: sanitizeScanConfig(scanCfg || {}),
      hintsFingerprint: normalizeText(hintsFingerprint || ""),
      useFullRange: Boolean(useFullRange)
    });
  }


  function buildSnapshotQuickCacheKey(spreadsheetId, sheetName, query, scanCfg, useFullRange) {
    const q = query || {};
    return JSON.stringify({
      spreadsheetId,
      sheetName,
      startDate: q.startDate || "",
      endDate: q.endDate || "",
      scan: sanitizeScanConfig(scanCfg || {}),
      quick: true,
      useFullRange: Boolean(useFullRange)
    });
  }

  function normalizePhoneDigits(value) {
    return String(value ?? "").replace(/\D+/g, "");
  }

  function normalizeGuestNameKey(value) {
    return normalizeText(value || "")
      .toLowerCase()
      .replace(/[^0-9a-z\u3131-\u318e\uac00-\ud7a3]+/g, "");
  }

  function normalizeReservationNoCandidate(value) {
    const text = normalizeText(value || "");
    return normalizeReservationNoCandidateWithOptions(text, {});
  }

  function normalizeReservationNoCandidateWithOptions(value, options = {}) {
    const text = normalizeText(value || "");
    if (!text) return "";
    const tagged = options.tagged === true;
    const phoneDigits = normalizePhoneDigits(options.phone || options.phoneDigits || "");
    const digits = text.replace(/\D+/g, "");
    if (tagged) {
      if (/[A-Za-z]/.test(text)) {
        const compact = text.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
        return compact.length >= 4 ? compact : "";
      }
      return digits.length >= 4 ? digits : "";
    }
    if (!digits) return "";
    if (phoneDigits && digits === phoneDigits) return "";
    return digits.length >= 6 ? digits : "";
  }

  function extractPhoneDigitsFromText(value) {
    const text = normalizeText(value || "");
    if (!text) return "";
    for (const pattern of PHONE_LABEL_PATTERNS) {
      const match = text.match(pattern);
      const digits = normalizePhoneDigits(match?.[1] || "");
      if (digits.length >= 8) return digits;
    }
    const anyDigits = normalizePhoneDigits(text);
    return anyDigits.length >= 8 ? anyDigits : "";
  }

  function extractReservationNoFromText(value, options = {}) {
    const text = normalizeText(value || "");
    if (!text) return "";
    const phoneDigits = normalizePhoneDigits(options.phone || options.phoneDigits || "") || extractPhoneDigitsFromText(text);
    const tagged = [];
    for (const match of text.matchAll(RESERVATION_NO_RE)) {
      if (match?.[1]) tagged.push(match[1]);
    }
    for (const candidate of tagged) {
      const normalized = normalizeReservationNoCandidateWithOptions(candidate, { tagged: true, phoneDigits });
      if (normalized) return normalized;
    }
    const loose = text.match(/\b\d{6,}\b/g) || [];
    for (const candidate of loose) {
      const normalized = normalizeReservationNoCandidateWithOptions(candidate, { tagged: false, phoneDigits });
      if (normalized) return normalized;
    }
    return "";
  }

  function extractGuestNameFromText(value) {
    const text = normalizeText(value || "");
    if (!text) return "";
    for (const pattern of NAME_LABEL_PATTERNS) {
      const match = text.match(pattern);
      if (!match?.[1]) continue;
      const cleaned = normalizeText(match[1])
        .replace(/(?:연락처|phone|mobile|tel|checkin|checkout|객실|room|ota|channel|status).*$/i, "")
        .trim();
      if (cleaned && cleaned.length <= 40) return cleaned;
    }
    return "";
  }

  function extractPhoneTailFromText(value) {
    const text = normalizeText(value || "");
    if (!text) return "";
    for (const pattern of PHONE_LABEL_PATTERNS) {
      const match = text.match(pattern);
      const digits = normalizePhoneDigits(match?.[1] || "");
      if (digits.length >= 4) return digits.slice(-4);
    }
    const anyDigits = normalizePhoneDigits(text);
    return anyDigits.length >= 8 ? anyDigits.slice(-4) : "";
  }

  function tokenizeIdentityText(value) {
    const text = normalizeText(value || "").toLowerCase();
    if (!text) return [];
    const rawTokens = text
      .replace(/[\r\n]+/g, " ")
      .replace(/[()[\]{}.,:;|/\\#@!?*"'`~]/g, " ")
      .split(/\s+/)
      .map((token) => token.trim())
      .filter(Boolean)
      .map((token) =>
        token.replace(/^[^0-9a-z\u3131-\u318e\uac00-\ud7a3]+|[^0-9a-z\u3131-\u318e\uac00-\ud7a3]+$/g, "")
      )
      .filter(Boolean);
    const out = [];
    const seen = new Set();
    rawTokens.forEach((token) => {
      if (!token) return;
      if (/^\d+$/.test(token)) return;
      if (token.length <= 1) return;
      if (IDENTITY_STOPWORDS.has(token)) return;
      if (seen.has(token)) return;
      seen.add(token);
      out.push(token);
    });
    return out;
  }

  function calculateTokenOverlapRatio(leftValues, rightValues) {
    const left = new Set(Array.isArray(leftValues) ? leftValues.filter(Boolean) : []);
    const right = new Set(Array.isArray(rightValues) ? rightValues.filter(Boolean) : []);
    if (left.size <= 0 || right.size <= 0) return 0;
    let overlap = 0;
    left.forEach((value) => {
      if (right.has(value)) overlap += 1;
    });
    return overlap / Math.max(left.size, right.size);
  }

  function buildStringGramSet(value, size = 2) {
    const normalized = normalizeGuestNameKey(value);
    if (!normalized) return new Set();
    if (normalized.length <= size) return new Set([normalized]);
    const out = new Set();
    for (let i = 0; i <= normalized.length - size; i += 1) {
      out.add(normalized.slice(i, i + size));
    }
    return out;
  }

  function calculateNameSimilarity(leftValue, rightValue) {
    const left = normalizeGuestNameKey(leftValue);
    const right = normalizeGuestNameKey(rightValue);
    if (!left || !right) return 0;
    if (left === right) return 1;
    const leftGrams = buildStringGramSet(left);
    const rightGrams = buildStringGramSet(right);
    if (leftGrams.size <= 0 || rightGrams.size <= 0) return 0;
    let overlap = 0;
    leftGrams.forEach((value) => {
      if (rightGrams.has(value)) overlap += 1;
    });
    return overlap / Math.max(leftGrams.size, rightGrams.size);
  }

  function hasStrongGuestNameMatch(leftValue, rightValue, threshold = 0.8) {
    return calculateNameSimilarity(leftValue, rightValue) >= Math.max(0, Number(threshold) || 0.8);
  }

  function buildReservationIdentity(text, options = {}) {
    const rawText = normalizeText(text || "");
    const optionPhoneDigits = normalizePhoneDigits(options.phone || options.phoneTail || "");
    const reservationNo =
      normalizeReservationNoCandidateWithOptions(options.reservationNo || "", { tagged: true, phoneDigits: optionPhoneDigits }) ||
      extractReservationNoFromText(rawText, { phoneDigits: optionPhoneDigits });
    const guestName = normalizeText(options.guestName || "") || extractGuestNameFromText(rawText);
    const phoneTail = optionPhoneDigits.length >= 4 ? optionPhoneDigits.slice(-4) : extractPhoneTailFromText(rawText);
    const checkin = normalizeText(options.checkin || "");
    const checkout = normalizeText(options.checkout || "");
    const nights = Number.isFinite(Number(options.nights)) ? Math.max(0, Math.trunc(Number(options.nights))) : 0;
    const channel = normalizeText(options.channel || "").toUpperCase();
    const tokens = tokenizeIdentityText([rawText, guestName].filter(Boolean).join(" "));
    const tokenHashes = tokens.map((token) => quickTextHash(token));
    const softKeyParts = [];
    if (guestName) softKeyParts.push(`g:${quickTextHash(guestName.toLowerCase())}`);
    if (phoneTail) softKeyParts.push(`p:${phoneTail}`);
    if (checkin) softKeyParts.push(`ci:${checkin}`);
    if (checkout) softKeyParts.push(`co:${checkout}`);
    else if (nights > 0) softKeyParts.push(`n:${nights}`);
    if (channel) softKeyParts.push(`ch:${channel}`);
    if (softKeyParts.length <= 0 && tokenHashes.length > 0) {
      softKeyParts.push(`t:${tokenHashes.slice(0, 3).join(",")}`);
    }
    return {
      rawTextHead: rawText.slice(0, 120),
      reservationNo,
      guestName,
      phoneTail,
      checkin,
      checkout,
      nights,
      channel,
      tokenHashes,
      softKey: softKeyParts.length >= 2 ? `soft:${quickTextHash(softKeyParts.join("|"))}` : ""
    };
  }

  Object.assign(ns, {
    quickTextHash,
    digestValueRanges,
    buildSnapshotCacheKey,
    buildSnapshotQuickCacheKey,
    normalizePhoneDigits,
    normalizeGuestNameKey,
    normalizeReservationNoCandidate,
    normalizeReservationNoCandidateWithOptions,
    extractReservationNoFromText,
    extractGuestNameFromText,
    extractPhoneTailFromText,
    tokenizeIdentityText,
    calculateTokenOverlapRatio,
    calculateNameSimilarity,
    hasStrongGuestNameMatch,
    buildReservationIdentity,
  });
})();
