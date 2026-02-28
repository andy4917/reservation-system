(() => {
  "use strict";

  const root = globalThis;
  const App = (root.App = root.App || {});
  App.report = App.report || {};
  const ns = (App.report.reservationVerification = App.report.reservationVerification || {});

  const N = App.scan?.normalize || {};
  const K = App.engine?.noteKey || {};
  const V = App.report?.validator || {};
  const P = App.domain?.reservationPolicy || {};
  const { normalizeText, isDate, toDateKey, fromDateKey, addDays, quickTextHash } = N;
  const { buildReservationIdentity, calculateTokenOverlapRatio, calculateNameSimilarity, hasStrongGuestNameMatch } = K;
  const { addVerificationPass, addVerificationWarn, addVerificationFail, makeVerificationIssue } = V;
  const {
    normalizeReservationNoFromText,
    classifyReservationStatusBucket,
  } = P;
  const normalizeReservationStatusBucket = classifyReservationStatusBucket;

  function toNormalizedSet(values, mapper = (value) => normalizeText(value)) {
    const out = new Set();
    const items = values instanceof Set ? [...values] : Array.isArray(values) ? values : [];
    items.forEach((value) => {
      const mapped = mapper(value);
      if (mapped) out.add(mapped);
    });
    return out;
  }

  function normalizedIntersectionCount(leftValues, rightValues, mapper = (value) => normalizeText(value)) {
    const left = toNormalizedSet(leftValues, mapper);
    const right = toNormalizedSet(rightValues, mapper);
    let count = 0;
    left.forEach((value) => {
      if (right.has(value)) count += 1;
    });
    return count;
  }

  function knownReservationChannels(values) {
    return toNormalizedSet(values, (value) => {
      const text = normalizeText(value).toUpperCase();
      return text && text !== "UNKNOWN" ? text : "";
    });
  }

  function reservationSummaryStatusBucket(summary) {
    const buckets = toNormalizedSet(summary?.statusBuckets || [], (value) => normalizeReservationStatusBucket(value));
    if (buckets.has("CANCELED")) return "CANCELED";
    return "ACTIVE";
  }

  function createReservationSummary(summaryKey, reservationNo = "") {
    return {
      summaryKey,
      reservationNo: normalizeReservationNoFromText(reservationNo),
      reservationRefs: new Set(),
      checkin: "",
      checkout: "",
      nights: 0,
      roomNos: new Set(),
      roomNames: new Set(),
      channels: new Set(),
      statuses: new Set(),
      statusBuckets: new Set(),
      dateSet: new Set(),
      noteHeads: new Set(),
      guestNames: new Set(),
      phoneTails: new Set(),
      identitySoftKeys: new Set(),
      identityTokenHashes: new Set(),
      prices: new Set(),
      sourceCount: 0,
      auditAnomaly: false
    };
  }

  function mergeReservationIdentity(summary, identity) {
    if (!summary || !identity) return;
    if (normalizeText(identity?.guestName || "")) summary.guestNames.add(normalizeText(identity.guestName));
    if (normalizeText(identity?.phoneTail || "")) summary.phoneTails.add(normalizeText(identity.phoneTail));
    if (normalizeText(identity?.softKey || "")) summary.identitySoftKeys.add(normalizeText(identity.softKey));
    (Array.isArray(identity?.tokenHashes) ? identity.tokenHashes : []).forEach((value) => {
      const normalized = normalizeText(value || "");
      if (normalized) summary.identityTokenHashes.add(normalized);
    });
  }

  function summarizeReservationChannelList(summary) {
    return [...knownReservationChannels(summary?.channels || [])].sort();
  }

  function buildReservationSummaryHandle(summary) {
    const reservationNo = normalizeReservationNoFromText(summary?.reservationNo || "");
    if (reservationNo) return reservationNo;
    const guestName = [...toNormalizedSet(summary?.guestNames || [], (value) => normalizeText(value))][0] || "";
    if (guestName) return guestName;
    const roomNo = [...toNormalizedSet(summary?.roomNos || [], (value) => normalizeText(value))][0] || "-";
    const checkin = normalizeText(summary?.checkin || "");
    return `${roomNo}/${checkin || "-"}`;
  }

  function buildReservationSummaryDetail(summary) {
    const channels = summarizeReservationChannelList(summary);
    const rooms = [...toNormalizedSet(summary?.roomNos || [], (value) => normalizeText(value))].sort();
    const guestNames = [...toNormalizedSet(summary?.guestNames || [], (value) => normalizeText(value))];
    return [
      `예약번호 ${normalizeReservationNoFromText(summary?.reservationNo || "") || "-"}`,
      `체크인 ${normalizeText(summary?.checkin || "-")}`,
      `체크아웃 ${normalizeText(summary?.checkout || "-")}`,
      `객실 ${rooms.join(",") || "-"}`,
      `OTA ${channels.join("/") || "-"}`,
      `이름 ${guestNames.join("/") || "-"}`
    ].join(" / ");
  }

  function buildReservationMatchReasonText(reasons = []) {
    const labels = [];
    if (reasons.includes("reservation_no")) labels.push("예약번호");
    if (reasons.includes("reservation_ref")) labels.push("예약참조번호");
    if (reasons.includes("soft_key")) labels.push("보조식별자");
    if (reasons.includes("channel")) labels.push("OTA");
    if (reasons.includes("checkin")) labels.push("체크인");
    if (reasons.includes("checkout")) labels.push("체크아웃");
    if (reasons.includes("nights")) labels.push("박수");
    if (reasons.includes("room")) labels.push("객실");
    if (reasons.includes("guest")) labels.push("이름");
    if (reasons.includes("phone")) labels.push("전화끝자리");
    if (reasons.includes("remark")) labels.push("remark");
    if (reasons.includes("date_overlap")) labels.push("기간겹침");
    return labels.join("+") || "기타";
  }

  function hasReservationDateOverlap(leftSummary, rightSummary) {
    return normalizedIntersectionCount(leftSummary?.dateSet || [], rightSummary?.dateSet || [], (value) => normalizeText(value)) > 0;
  }

  function hasReservationRoomOverlap(leftSummary, rightSummary) {
    return !reservationRoomSetsConflict([...(leftSummary?.roomNos || [])], [...(rightSummary?.roomNos || [])]);
  }

  function hasReservationChannelOverlap(leftSummary, rightSummary) {
    return normalizedIntersectionCount(
      leftSummary?.channels || [],
      rightSummary?.channels || [],
      (value) => normalizeText(value)
    ) > 0;
  }

  function summaryHasAuditAnomaly(summary) {
    return summary?.auditAnomaly === true || [...toNormalizedSet(summary?.statuses || [], (value) => normalizeText(value).toUpperCase())].includes("NOSHOW");
  }

  function isManualOtaSummary(summary) {
    const channels = summarizeReservationChannelList(summary);
    return channels.length > 0 && channels.every((channel) => channel === "STATION" || channel === "NAVER");
  }

  function firstKnownValue(setLike) {
    return [...toNormalizedSet(setLike || [], (value) => normalizeText(value))][0] || "";
  }

  function dateKeyDistance(left, right) {
    if (!left || !right) return Infinity;
    const leftDate = fromDateKey(left);
    const rightDate = fromDateKey(right);
    if (!leftDate || !rightDate) return Infinity;
    return Math.abs(Math.round((leftDate.getTime() - rightDate.getTime()) / 86400000));
  }

  function splitReservationRoomTokens(value) {
    const text = normalizeText(value || "");
    if (!text) return [];
    const out = [];
    const seen = new Set();
    text.split(/[,;/|]+/).forEach((raw) => {
      let token = normalizeText(raw).toUpperCase().replace(/\s+/g, "").replace(/-/g, "");
      if (!token) return;
      if (/^\d+$/.test(token)) token = String(Number(token));
      if (seen.has(token)) return;
      seen.add(token);
      out.push(token);
    });
    return out;
  }

  function reservationRoomAliasKeys(roomNo) {
    const normalized = normalizeText(roomNo || "").toUpperCase().replace(/\s+/g, "").replace(/-/g, "");
    if (!normalized) return [];
    const out = new Set([normalized]);
    const compact = normalized.replace(/^0+/, "");
    if (compact) out.add(compact);
    if (/^\d+$/.test(compact)) out.add(String(Number(compact)));
    const alphaMatch = compact.match(/^([A-Z]+)0*(\d+)$/);
    if (alphaMatch) {
      out.add(`${alphaMatch[1]}${Number(alphaMatch[2])}`);
      out.add(alphaMatch[1] + alphaMatch[2]);
    }
    return [...out];
  }

  function reservationRoomSetsConflict(leftRooms, rightRooms) {
    const left = new Set();
    const right = new Set();
    (leftRooms || []).forEach((roomNo) => reservationRoomAliasKeys(roomNo).forEach((alias) => left.add(alias)));
    (rightRooms || []).forEach((roomNo) => reservationRoomAliasKeys(roomNo).forEach((alias) => right.add(alias)));
    if (left.size <= 0 || right.size <= 0) return false;
    for (const alias of left) {
      if (right.has(alias)) return false;
    }
    return true;
  }

  function buildExclusiveStayDateKeys(checkin, checkout) {
    const checkinDate = fromDateKey(checkin || "");
    const checkoutDate = fromDateKey(checkout || "");
    if (!checkinDate || !checkoutDate || checkoutDate <= checkinDate) return [];
    const out = [];
    let cursor = checkinDate;
    while (cursor < checkoutDate) {
      out.push(toDateKey(cursor));
      cursor = addDays(cursor, 1);
    }
    return out;
  }

  function summarizeReservationDateDiff(leftDates, rightDates) {
    const left = toNormalizedSet(leftDates || [], (value) => normalizeText(value));
    const right = toNormalizedSet(rightDates || [], (value) => normalizeText(value));
    const leftOnly = [...left].filter((day) => !right.has(day)).sort();
    const rightOnly = [...right].filter((day) => !left.has(day)).sort();
    return { leftOnly, rightOnly };
  }

  function collectReservationPrice(summary, value) {
    if (!summary) return;
    const n = Number(value);
    if (Number.isFinite(n)) summary.prices.add(Math.round(n));
  }

  function reservationPriceSetsConflict(leftPrices, rightPrices) {
    const left = new Set((leftPrices || []).filter((value) => Number.isFinite(Number(value))).map((value) => Math.round(Number(value))));
    const right = new Set((rightPrices || []).filter((value) => Number.isFinite(Number(value))).map((value) => Math.round(Number(value))));
    if (left.size <= 0 || right.size <= 0) return false;
    for (const value of left) {
      if (right.has(value)) return false;
    }
    return true;
  }

  function formatReservationPriceSet(values) {
    const list = [...new Set((values || []).filter((value) => Number.isFinite(Number(value))).map((value) => Math.round(Number(value))))].sort((a, b) => a - b);
    if (list.length <= 0) return "-";
    return list.map((value) => `${value.toLocaleString("ko-KR")}원`).join(", ");
  }

  function buildSheetReservationVerificationSource(snapshot, providerKey) {
    void providerKey;
    const blocks = Array.isArray(snapshot?.reservationBlocks) ? snapshot.reservationBlocks : [];
    const summaries = new Map();
    const missingIdIssues = [];

    blocks.forEach((block) => {
      if (normalizeText(block?.kind || "").toUpperCase() !== "RESERVATION") return;
      const dateKeys = Array.isArray(block?.dateKeys) ? block.dateKeys.filter((day) => isDate(day)) : [];
      if (dateKeys.length <= 0) return;
      const note = normalizeText(block?.note || "");
      const blockChannel = normalizeText(block?.channel || "").toUpperCase();
      const blockCheckoutDate = fromDateKey(dateKeys[dateKeys.length - 1]);
      const blockCheckout = blockCheckoutDate ? toDateKey(addDays(blockCheckoutDate, 1)) : "";
      const identity =
        typeof buildReservationIdentity === "function"
          ? buildReservationIdentity(note, {
              reservationNo: block?.reservationNo || "",
              checkin: dateKeys[0],
              checkout: blockCheckout,
              nights: dateKeys.length,
              channel: blockChannel
            })
          : {
              reservationNo: normalizeReservationNoFromText(note),
              guestName: "",
              phoneTail: "",
              softKey: "",
              tokenHashes: []
            };
      const reservationNo = normalizeReservationNoFromText(identity?.reservationNo || block?.reservationNo || "");
      const summaryKey =
        reservationNo
          ? `res:${reservationNo}`
          : normalizeText(identity?.softKey || "")
            ? `soft:${identity.softKey}`
            : `block:${normalizeText(block?.blockId || quickTextHash(`${block?.row || ""}:${dateKeys[0] || ""}:${note}`))}`;
      const roomNo = normalizeText(block?.roomNo || "");
      if (!reservationNo && !normalizeText(identity?.softKey || "") && !(Array.isArray(identity?.tokenHashes) && identity.tokenHashes.length > 0)) {
        missingIdIssues.push({
          date: dateKeys[0] || "-",
          room: roomNo || normalizeText(block?.roomType || "") || "-",
          detail: "시트 note에서 예약번호를 찾지 못했고 리마크 기반 보조식별자도 부족합니다."
        });
      }
      const roomNos = splitReservationRoomTokens(roomNo);
      const summary = summaries.get(summaryKey) || createReservationSummary(summaryKey, reservationNo);
      summary.reservationNo = summary.reservationNo || reservationNo;
      summary.checkin = !summary.checkin || dateKeys[0] < summary.checkin ? dateKeys[0] : summary.checkin;
      summary.checkout = !summary.checkout || blockCheckout > summary.checkout ? blockCheckout : summary.checkout;
      summary.nights = Math.max(Number(summary.nights || 0), dateKeys.length);
      roomNos.forEach((token) => summary.roomNos.add(token));
      if (normalizeText(block?.roomType || "")) summary.roomNames.add(normalizeText(block.roomType));
      dateKeys.forEach((day) => summary.dateSet.add(day));
      if (blockChannel) summary.channels.add(blockChannel);
      summary.statusBuckets.add("ACTIVE");
      if (note) summary.noteHeads.add(note.slice(0, 120));
      collectReservationPrice(summary, block?.price);
      mergeReservationIdentity(summary, identity);
      summary.sourceCount += 1;
      summaries.set(summaryKey, summary);
    });

    return { summaries: [...summaries.values()], missingIdIssues };
  }

  function buildPmsReservationVerificationSource(records, query) {
    const summaries = new Map();
    (records || []).forEach((record, index) => {
      const reservationNo = normalizeReservationNoFromText(record?.reservationNo || record?.reservationRef || "");
      const stayDates = buildExclusiveStayDateKeys(record?.checkin, record?.checkout).filter((day) => {
        return !query || (day >= query.startDate && day <= query.endDate);
      });
      if (stayDates.length <= 0) return;
      const recordChannel = normalizeText(record?.channel || "").toUpperCase();
      const identity =
        typeof buildReservationIdentity === "function"
          ? buildReservationIdentity(record?.remarkHead || "", {
              reservationNo,
              guestName: record?.guestName || "",
              phoneTail: record?.phoneTail || "",
              checkin: record?.checkin || "",
              checkout: record?.checkout || "",
              nights: record?.nights || stayDates.length,
              channel: recordChannel
            })
          : {
              guestName: normalizeText(record?.guestName || ""),
              phoneTail: normalizeText(record?.phoneTail || ""),
              softKey: normalizeText(record?.identitySoftKey || ""),
              tokenHashes: Array.isArray(record?.identityTokenHashes) ? record.identityTokenHashes : []
            };
      const summaryKey =
        reservationNo
          ? `res:${reservationNo}`
          : normalizeText(identity?.softKey || record?.identitySoftKey || "")
            ? `soft:${identity?.softKey || record?.identitySoftKey}`
            : `rec:${index}`;
      const summary = summaries.get(summaryKey) || createReservationSummary(summaryKey, reservationNo);
      summary.reservationNo = summary.reservationNo || reservationNo;
      if (normalizeText(record?.reservationRef || "")) summary.reservationRefs.add(normalizeText(record.reservationRef));
      const roomNos = splitReservationRoomTokens(record?.roomNo || "");
      const checkin = normalizeText(record?.checkin || "");
      const checkout = normalizeText(record?.checkout || "");
      summary.checkin = !summary.checkin || (checkin && checkin < summary.checkin) ? checkin : summary.checkin;
      summary.checkout = !summary.checkout || (checkout && checkout > summary.checkout) ? checkout : summary.checkout;
      summary.nights = Math.max(Number(summary.nights || 0), Number(record?.nights || stayDates.length || 0));
      roomNos.forEach((token) => summary.roomNos.add(token));
      if (normalizeText(record?.roomName || "")) summary.roomNames.add(normalizeText(record.roomName));
      stayDates.forEach((day) => summary.dateSet.add(day));
      if (recordChannel) summary.channels.add(recordChannel);
      if (normalizeText(record?.status || "")) summary.statuses.add(normalizeText(record.status).toUpperCase());
      summary.statusBuckets.add(normalizeReservationStatusBucket(record?.statusBucket || record?.status || "ACTIVE"));
      summary.auditAnomaly = summary.auditAnomaly || record?.auditAnomaly === true;
      if (normalizeText(record?.remarkHead || "")) summary.noteHeads.add(normalizeText(record.remarkHead));
      collectReservationPrice(summary, record?.price);
      mergeReservationIdentity(summary, {
        guestName: identity?.guestName || record?.guestName || "",
        phoneTail: identity?.phoneTail || record?.phoneTail || "",
        softKey: identity?.softKey || record?.identitySoftKey || "",
        tokenHashes: Array.isArray(record?.identityTokenHashes) && record.identityTokenHashes.length > 0
          ? record.identityTokenHashes
          : identity?.tokenHashes || []
      });
      summary.sourceCount += 1;
      summaries.set(summaryKey, summary);
    });
    return { summaries: [...summaries.values()] };
  }

  function hasStrongGuestNameOverlap(sheetSummary, pmsSummary) {
    const sheetNames = [...toNormalizedSet(sheetSummary?.guestNames || [], (value) => normalizeText(value))];
    const pmsNames = [...toNormalizedSet(pmsSummary?.guestNames || [], (value) => normalizeText(value))];
    for (const left of sheetNames) {
      for (const right of pmsNames) {
        if (typeof hasStrongGuestNameMatch === "function" && hasStrongGuestNameMatch(left, right, 0.8)) return true;
        if (typeof calculateNameSimilarity === "function" && calculateNameSimilarity(left, right) >= 0.8) return true;
        if (normalizeText(left).toLowerCase() === normalizeText(right).toLowerCase()) return true;
      }
    }
    return false;
  }

  function evaluateReservationSoftMatch(sheet, pms) {
    const reasons = [];
    const channelOverlap = hasReservationChannelOverlap(sheet, pms);
    const checkinSame = Boolean(sheet?.checkin && pms?.checkin && sheet.checkin === pms.checkin);
    const checkoutSame = Boolean(sheet?.checkout && pms?.checkout && sheet.checkout === pms.checkout);
    const nightsSame = Number(sheet?.nights || 0) > 0 && Number(pms?.nights || 0) > 0 && Number(sheet.nights) === Number(pms.nights);
    const dateOverlap = hasReservationDateOverlap(sheet, pms);
    const roomOverlap = hasReservationRoomOverlap(sheet, pms);
    const guestOverlap = hasStrongGuestNameOverlap(sheet, pms);
    const phoneOverlap = normalizedIntersectionCount(sheet?.phoneTails || [], pms?.phoneTails || [], (value) => normalizeText(value)) > 0;
    const softKeyOverlap = normalizedIntersectionCount(sheet?.identitySoftKeys || [], pms?.identitySoftKeys || [], (value) => normalizeText(value)) > 0;
    const tokenOverlap =
      typeof calculateTokenOverlapRatio === "function"
        ? calculateTokenOverlapRatio([...(sheet?.identityTokenHashes || [])], [...(pms?.identityTokenHashes || [])])
        : 0;
    const remarkOverlap = tokenOverlap >= 0.35;

    if (channelOverlap) reasons.push("channel");
    if (checkinSame) reasons.push("checkin");
    if (checkoutSame) reasons.push("checkout");
    else if (nightsSame) reasons.push("nights");
    if (roomOverlap) reasons.push("room");
    if (guestOverlap) reasons.push("guest");
    if (phoneOverlap) reasons.push("phone");
    if (softKeyOverlap) reasons.push("soft_key");
    if (remarkOverlap) reasons.push("remark");
    if (dateOverlap && !reasons.includes("date_overlap")) reasons.push("date_overlap");

    const hasDateEvidence = checkinSame || dateOverlap;
    const hasOtaOrRoomEvidence = channelOverlap || roomOverlap;
    const matched = reasons.length >= 3 && hasDateEvidence && hasOtaOrRoomEvidence;
    const score =
      reasons.length * 100 +
      (checkinSame ? 40 : 0) +
      (guestOverlap ? 30 : 0) +
      (phoneOverlap ? 20 : 0) +
      Math.round(tokenOverlap * 10);

    return {
      matched,
      reasons,
      tokenOverlap,
      conditionCount: reasons.length,
      hasDateEvidence,
      hasOtaOrRoomEvidence,
      score
    };
  }

  function passesReservationBlocking(sheet, pms) {
    const sheetChannels = summarizeReservationChannelList(sheet);
    const pmsChannels = summarizeReservationChannelList(pms);
    if (sheetChannels.length > 0 && pmsChannels.length > 0 && !hasReservationChannelOverlap(sheet, pms)) {
      return false;
    }
    const checkinDiff = dateKeyDistance(sheet?.checkin, pms?.checkin);
    const hasDateEvidence = hasReservationDateOverlap(sheet, pms) || (Number.isFinite(checkinDiff) && checkinDiff <= 1);
    if (!hasDateEvidence) return false;
    if ((sheet?.roomNos?.size || 0) > 0 && (pms?.roomNos?.size || 0) > 0 && reservationRoomSetsConflict([...(sheet?.roomNos || [])], [...(pms?.roomNos || [])])) {
      return false;
    }
    return true;
  }

  function selectBestExactCandidate(sheet, candidates, reasonCode) {
    const available = (Array.isArray(candidates) ? candidates : []).slice();
    available.sort((left, right) => {
      const rightEval = evaluateReservationSoftMatch(sheet, right);
      const leftEval = evaluateReservationSoftMatch(sheet, left);
      return rightEval.score - leftEval.score;
    });
    const selected = available[0] || null;
    if (!selected) return null;
    return {
      sheet,
      pms: selected,
      matchType: "exact",
      score: 1000,
      reasons: [reasonCode],
      conditionCount: 1,
      tokenOverlap: 0
    };
  }

  function pairReservationSummaries(sheetSummaries, pmsSummaries, options = {}) {
    const activeOnly = options?.activeOnly === true;
    const availablePms = (Array.isArray(pmsSummaries) ? pmsSummaries : []).filter((summary) => {
      return !activeOnly || reservationSummaryStatusBucket(summary) === "ACTIVE";
    });
    const usedSheetKeys = new Set();
    const usedPmsKeys = new Set();
    const pairs = [];
    const pmsByReservationNo = new Map();
    const pmsByReservationRef = new Map();
    const pmsBySoftKey = new Map();

    const registerToMap = (map, key, value) => {
      const normalized = normalizeText(key || "");
      if (!normalized) return;
      if (!map.has(normalized)) map.set(normalized, []);
      map.get(normalized).push(value);
    };

    availablePms.forEach((summary) => {
      registerToMap(pmsByReservationNo, normalizeReservationNoFromText(summary?.reservationNo || ""), summary);
      [...toNormalizedSet(summary?.reservationRefs || [], (value) => normalizeText(value))].forEach((value) => {
        registerToMap(pmsByReservationRef, value, summary);
      });
      [...toNormalizedSet(summary?.identitySoftKeys || [], (value) => normalizeText(value))].forEach((value) => {
        registerToMap(pmsBySoftKey, value, summary);
      });
    });

    const tryExactPair = (sheet, map, key, reasonCode) => {
      const normalized = normalizeText(key || "");
      if (!normalized) return false;
      const candidates = (map.get(normalized) || []).filter((summary) => !usedPmsKeys.has(summary.summaryKey));
      const selected = selectBestExactCandidate(sheet, candidates, reasonCode);
      if (!selected) return false;
      usedSheetKeys.add(sheet.summaryKey);
      usedPmsKeys.add(selected.pms.summaryKey);
      pairs.push(selected);
      return true;
    };

    (Array.isArray(sheetSummaries) ? sheetSummaries : []).forEach((sheet) => {
      if (usedSheetKeys.has(sheet.summaryKey)) return;
      if (tryExactPair(sheet, pmsByReservationNo, sheet?.reservationNo || "", "reservation_no")) return;
      const sheetRef = [...toNormalizedSet(sheet?.reservationRefs || [], (value) => normalizeText(value))][0] || "";
      if (tryExactPair(sheet, pmsByReservationRef, sheetRef, "reservation_ref")) return;
      const softKey = [...toNormalizedSet(sheet?.identitySoftKeys || [], (value) => normalizeText(value))][0] || "";
      tryExactPair(sheet, pmsBySoftKey, softKey, "soft_key");
    });

    const candidates = [];
    (Array.isArray(sheetSummaries) ? sheetSummaries : [])
      .filter((sheet) => !usedSheetKeys.has(sheet.summaryKey))
      .forEach((sheet) => {
        availablePms
          .filter((pms) => !usedPmsKeys.has(pms.summaryKey))
          .forEach((pms) => {
            if (!passesReservationBlocking(sheet, pms)) return;
            const evaluated = evaluateReservationSoftMatch(sheet, pms);
            if (!evaluated.matched) return;
            candidates.push({
              sheet,
              pms,
              matchType: "soft",
              score: evaluated.score,
              reasons: evaluated.reasons,
              conditionCount: evaluated.conditionCount,
              tokenOverlap: evaluated.tokenOverlap
            });
          });
      });

    candidates.sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return (right.conditionCount || 0) - (left.conditionCount || 0);
    });

    candidates.forEach((candidate) => {
      if (usedSheetKeys.has(candidate.sheet.summaryKey) || usedPmsKeys.has(candidate.pms.summaryKey)) return;
      usedSheetKeys.add(candidate.sheet.summaryKey);
      usedPmsKeys.add(candidate.pms.summaryKey);
      pairs.push(candidate);
    });

    return { pairs, usedSheetKeys, usedPmsKeys };
  }

  function verifyProviderReservationsAgainstSheet(options = {}) {
    const {
      report,
      query,
      sheetSnapshot,
      sheetQuery,
      providerKey,
      providerReservationMeta,
      providerReservations,
      isSameQuery,
    } = options;
    if (!query || !sheetSnapshot || !sheetQuery || typeof isSameQuery !== "function" || !isSameQuery(query, sheetQuery)) return;
    const scope = "PMS";
    const meta = providerReservationMeta || {};
    const sheetSource = buildSheetReservationVerificationSource(sheetSnapshot, providerKey);
    const pmsSource = buildPmsReservationVerificationSource(providerReservations, query);
    report.reservationPairs = [];
    report.reservationMismatches = [];

    const appendReservationIssue = (severity, code, summary, detail, issueOptions = {}) => {
      const base = summary || issueOptions.fallbackSummary || null;
      const issue = makeVerificationIssue(
        scope,
        normalizeText(base?.checkin || issueOptions?.date || query.startDate) || query.startDate,
        buildReservationSummaryHandle(base),
        code,
        detail
      );
      const ota = summarizeReservationChannelList(base).join("/") || "-";
      const roomId = [...toNormalizedSet(base?.roomNos || [], (value) => normalizeText(value))].join(",") || "-";
      report.reservationMismatches.push({
        issueCode: code,
        severity,
        ota,
        checkin: normalizeText(base?.checkin || ""),
        checkout: normalizeText(base?.checkout || ""),
        nights: Number(base?.nights || 0),
        roomId,
        roomName: [...toNormalizedSet(base?.roomNames || [], (value) => normalizeText(value))].join(",") || roomId,
        pmsStatusBucket: issueOptions?.pmsStatusBucket || "",
        sheetStatusGuess: issueOptions?.sheetStatusGuess || "",
        guestNameDisplay: firstKnownValue(base?.guestNames || []),
        phoneTail: firstKnownValue(base?.phoneTails || []),
        detail
      });
      if (severity === "warn") addVerificationWarn(report, issue);
      else addVerificationFail(report, issue);
    };

    if (normalizeText(meta?.error || "")) {
      addVerificationWarn(
        report,
        makeVerificationIssue(scope, query.startDate, "-", "PMS_FETCH_ERROR", String(meta.error))
      );
    } else if (normalizeText(meta?.source || "").toLowerCase() === "pms-unconfigured") {
      addVerificationWarn(
        report,
        makeVerificationIssue(scope, query.startDate, "-", "PMS_LIST_UNAVAILABLE", "WINGS/PMS 예약목록 API URL 또는 인증 번들이 설정되지 않았습니다.")
      );
    } else if (
      normalizeText(meta?.source || "").toLowerCase() === "pms-empty" ||
      normalizeText(meta?.source || "").toLowerCase() === "unavailable"
    ) {
      addVerificationWarn(
        report,
        makeVerificationIssue(scope, query.startDate, "-", "PMS_LIST_UNAVAILABLE", "WINGS/PMS 예약목록 결과가 비어 있습니다.")
      );
    } else {
      addVerificationPass(report);
    }

    (sheetSource.missingIdIssues || []).slice(0, 20).forEach((issue) => {
      addVerificationWarn(
        report,
        makeVerificationIssue(scope, issue.date, issue.room, "SHEET_RESERVATION_ID_MISSING", issue.detail)
      );
    });
    if ((sheetSource.missingIdIssues || []).length <= 0) addVerificationPass(report);

    const sheetSummaries = Array.isArray(sheetSource.summaries) ? sheetSource.summaries : [];
    const pmsSummaries = Array.isArray(pmsSource.summaries) ? pmsSource.summaries : [];
    const activePmsSummaries = pmsSummaries.filter((summary) => reservationSummaryStatusBucket(summary) === "ACTIVE");
    const canceledPmsSummaries = pmsSummaries.filter((summary) => reservationSummaryStatusBucket(summary) === "CANCELED");
    const sheetCount = sheetSummaries.length;
    const pmsCount = pmsSummaries.length;
    if (sheetCount <= 0 && pmsCount <= 0) return;

    let mismatchFound = false;
    const activePairing = pairReservationSummaries(sheetSummaries, activePmsSummaries, { activeOnly: true, minScore: 50 });
    const unmatchedAfterActive = sheetSummaries.filter((summary) => !activePairing.usedSheetKeys.has(summary.summaryKey));
    const canceledPairing = pairReservationSummaries(unmatchedAfterActive, canceledPmsSummaries, { minScore: 60 });
    const matchedSheetKeys = new Set([
      ...activePairing.usedSheetKeys,
      ...canceledPairing.usedSheetKeys
    ]);
    const matchedActivePmsKeys = new Set(activePairing.usedPmsKeys);
    const matchedCanceledPmsKeys = new Set(canceledPairing.usedPmsKeys);
    const matchedPairs = [
      ...activePairing.pairs,
      ...canceledPairing.pairs.map((pair) => ({ ...pair, canceledMatch: true }))
    ];

    matchedPairs.forEach((pair) => {
      const sheet = pair.sheet;
      const pms = pair.pms;
      report.reservationPairs.push({
        pairStatus: pair.matchType === "soft" ? "SOFT" : "EXACT",
        exactMatchUsed: pair.matchType !== "soft",
        softMatchUsed: pair.matchType === "soft",
        matchedBy: buildReservationMatchReasonText(pair.reasons),
        matchedConditionCount: Number(pair.conditionCount || pair.reasons?.length || 0),
        matchedConditions: Array.isArray(pair.reasons) ? pair.reasons.join("|") : "",
        pmsReservationKey: normalizeText(pms?.summaryKey || ""),
        sheetReservationKey: normalizeText(sheet?.summaryKey || "")
      });

      if (pair.matchType === "soft") {
        appendReservationIssue(
          "warn",
          "SOFT_MATCH_USED",
          sheet,
          `정확 ID 없이 ${buildReservationMatchReasonText(pair.reasons)} 기준으로 PMS 예약과 매칭했습니다.`,
          {
            pmsStatusBucket: reservationSummaryStatusBucket(pms),
            sheetStatusGuess: "ACTIVE"
          }
        );
      } else {
        addVerificationPass(report);
      }

      if (reservationSummaryStatusBucket(pms) === "CANCELED") {
        mismatchFound = true;
        appendReservationIssue(
          "fail",
          "CANCELED_STILL_IN_SHEET",
          sheet,
          `${buildReservationSummaryDetail(sheet)} / PMS 상태 ${[...(pms?.statuses || [])].join(",") || "CANCELED"} / 매칭근거 ${buildReservationMatchReasonText(pair.reasons)}`,
          {
            pmsStatusBucket: "CANCELED",
            sheetStatusGuess: "ACTIVE"
          }
        );
        return;
      }

      if (summaryHasAuditAnomaly(pms)) {
        appendReservationIssue(
          "warn",
          "ACTIVE_EXPECTED_BUT_PMS_AUDIT_ANOMALY",
          sheet,
          `${buildReservationSummaryDetail(sheet)} / PMS raw 상태 ${[...(pms?.statuses || [])].join(",") || "NOSHOW"} / 운영상 ACTIVE로 취급`,
          {
            pmsStatusBucket: "ACTIVE",
            sheetStatusGuess: "ACTIVE"
          }
        );
      } else {
        addVerificationPass(report);
      }

      const sheetChannels = summarizeReservationChannelList(sheet);
      const pmsChannels = summarizeReservationChannelList(pms);
      if (sheetChannels.length > 0 && pmsChannels.length > 0 && !hasReservationChannelOverlap(sheet, pms)) {
        mismatchFound = true;
        appendReservationIssue(
          "fail",
          "OTA_MISMATCH",
          sheet,
          `시트 OTA ${sheetChannels.join("/") || "-"} / PMS OTA ${pmsChannels.join("/") || "-"}`,
          {
            pmsStatusBucket: "ACTIVE",
            sheetStatusGuess: "ACTIVE"
          }
        );
      } else {
        addVerificationPass(report);
      }

      if (Number(sheet.nights || 0) > 0 && Number(pms.nights || 0) > 0 && Number(sheet.nights) !== Number(pms.nights)) {
        mismatchFound = true;
        appendReservationIssue(
          "fail",
          "NIGHTS_MISMATCH",
          sheet,
          `시트 ${sheet.nights}박 / PMS ${pms.nights}박`,
          {
            pmsStatusBucket: "ACTIVE",
            sheetStatusGuess: "ACTIVE"
          }
        );
      } else {
        addVerificationPass(report);
      }

      const dateDiff = summarizeReservationDateDiff(sheet.dateSet, pms.dateSet);
      if (dateDiff.leftOnly.length > 0 || dateDiff.rightOnly.length > 0) {
        mismatchFound = true;
        appendReservationIssue(
          "fail",
          "DATE_MISMATCH",
          sheet,
          `시트만 ${dateDiff.leftOnly.join(",") || "-"} / PMS만 ${dateDiff.rightOnly.join(",") || "-"}`,
          {
            pmsStatusBucket: "ACTIVE",
            sheetStatusGuess: "ACTIVE"
          }
        );
      } else {
        addVerificationPass(report);
      }

      const sheetRooms = [...(sheet.roomNos || [])];
      const pmsRooms = [...(pms.roomNos || [])];
      if (reservationRoomSetsConflict(sheetRooms, pmsRooms)) {
        mismatchFound = true;
        appendReservationIssue(
          "fail",
          "ROOM_MISMATCH",
          sheet,
          `시트 객실 ${sheetRooms.join(",") || "-"} / PMS 객실 ${pmsRooms.join(",") || "-"}`,
          {
            pmsStatusBucket: "ACTIVE",
            sheetStatusGuess: "ACTIVE"
          }
        );
      } else {
        addVerificationPass(report);
      }
    });

    sheetSummaries
      .filter((summary) => !matchedSheetKeys.has(summary.summaryKey))
      .forEach((sheet) => {
        if (isManualOtaSummary(sheet)) {
          appendReservationIssue(
            "warn",
            "EXPECTED_MANUAL_OTA_ON_SHEET",
            sheet,
            `시트 수기 OTA 예약으로 분류했습니다. ${buildReservationSummaryDetail(sheet)}`,
            {
              pmsStatusBucket: "",
              sheetStatusGuess: "ACTIVE"
            }
          );
          return;
        }
        mismatchFound = true;
        appendReservationIssue(
          "fail",
          "MISSING_ACTIVE_IN_PMS",
          sheet,
          `시트 ACTIVE 예약블록은 있으나 Wings/PMS 일반 예약과 매칭되지 않습니다. ${buildReservationSummaryDetail(sheet)}`,
          {
            pmsStatusBucket: "",
            sheetStatusGuess: "ACTIVE"
          }
        );
      });

    activePmsSummaries
      .filter((summary) => !matchedActivePmsKeys.has(summary.summaryKey))
      .forEach((pms) => {
        mismatchFound = true;
        appendReservationIssue(
          "fail",
          "MISSING_ACTIVE_IN_SHEET",
          pms,
          `Wings/PMS ACTIVE 예약은 있으나 시트 예약블록이 없습니다. ${buildReservationSummaryDetail(pms)}`,
          {
            pmsStatusBucket: "ACTIVE",
            sheetStatusGuess: ""
          }
        );
      });

    canceledPmsSummaries
      .filter((summary) => !matchedCanceledPmsKeys.has(summary.summaryKey))
      .forEach(() => {
        addVerificationPass(report);
      });

    if (!mismatchFound && sheetCount > 0 && activePmsSummaries.length > 0) addVerificationPass(report);
  }

  Object.assign(ns, {
    toNormalizedSet,
    normalizedIntersectionCount,
    knownReservationChannels,
    reservationSummaryStatusBucket,
    createReservationSummary,
    mergeReservationIdentity,
    summarizeReservationChannelList,
    buildReservationSummaryHandle,
    buildReservationSummaryDetail,
    buildReservationMatchReasonText,
    hasReservationDateOverlap,
    hasReservationRoomOverlap,
    hasReservationChannelOverlap,
    summaryHasAuditAnomaly,
    isManualOtaSummary,
    firstKnownValue,
    dateKeyDistance,
    splitReservationRoomTokens,
    reservationRoomAliasKeys,
    reservationRoomSetsConflict,
    buildExclusiveStayDateKeys,
    summarizeReservationDateDiff,
    collectReservationPrice,
    reservationPriceSetsConflict,
    formatReservationPriceSet,
    buildSheetReservationVerificationSource,
    buildPmsReservationVerificationSource,
    hasStrongGuestNameOverlap,
    evaluateReservationSoftMatch,
    passesReservationBlocking,
    selectBestExactCandidate,
    pairReservationSummaries,
    verifyProviderReservationsAgainstSheet,
    normalizeReservationStatusBucket,
  });
})();
