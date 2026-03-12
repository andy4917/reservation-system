// @ts-check

(() => {
  "use strict";

  /** @typedef {import("./contracts/extension-contracts").AuthSummary} AuthSummary */
  /** @typedef {import("./contracts/extension-contracts").BridgeAppGlobal} BridgeAppGlobal */
  /** @typedef {import("./contracts/extension-contracts").BridgeContext} BridgeContext */
  /** @typedef {import("./contracts/extension-contracts").BridgeInfoSnapshot} BridgeInfoSnapshot */
  /** @typedef {import("./contracts/extension-contracts").BridgePolicy} BridgePolicy */
  /** @typedef {import("./contracts/extension-contracts").BridgePayload} BridgePayload */
  /** @typedef {import("./contracts/extension-contracts").DomSnapshot} DomSnapshot */
  /** @typedef {import("./contracts/extension-contracts").ExtractedCandidateRow} ExtractedCandidateRow */
  /** @typedef {import("./contracts/extension-contracts").ExtractedCandidateSignal} ExtractedCandidateSignal */
  /** @typedef {import("./contracts/extension-contracts").InfoSummary} InfoSummary */
  /** @typedef {import("./contracts/extension-contracts").InventoryEntryPolicyGlobal} InventoryEntryPolicyGlobal */
  /** @typedef {import("./contracts/extension-contracts").InventoryInfoBridgeGlobal} InventoryInfoBridgeGlobal */
  /** @typedef {import("./contracts/extension-contracts").InventoryProviderAuthCaptureGlobal} InventoryProviderAuthCaptureGlobal */
  /** @typedef {import("./contracts/extension-contracts").InventorySyncPolicyGlobal} InventorySyncPolicyGlobal */

  /** @type {BridgeAppGlobal} */
  const App = (globalThis.App = globalThis.App || {});
  App.bridge = App.bridge || {};

  /** @type {InventoryEntryPolicyGlobal} */
  const ENTRY_POLICY = globalThis.InventoryEntryPolicy || {};
  /** @type {InventoryInfoBridgeGlobal} */
  const INFO_BRIDGE = globalThis.InventoryInfoBridge || {};
  /** @type {InventoryProviderAuthCaptureGlobal} */
  const AUTH_CAPTURE = globalThis.InventoryProviderAuthCapture || {};
  /** @type {InventorySyncPolicyGlobal} */
  const SYNC_POLICY = globalThis.InventorySyncPolicy || {};
  /** @type {Partial<BridgePolicy>} */
  const bridgePolicy = SYNC_POLICY.bridge || {};
  const bridgeHost = String(bridgePolicy.host || "127.0.0.1");
  const bridgePort = Number(bridgePolicy.port || 45123);
  const bridgeUpdatePath = String(bridgePolicy.updatePath || "/bridge/update");
  const bridgeSecret = String(bridgePolicy.secret || "");
  const bridgeTimeoutMs = Number(bridgePolicy.timeoutMs || 3000);
  const BRIDGE_ENDPOINT = `http://${bridgeHost}:${bridgePort}${bridgeUpdatePath}`;
  const BRIDGE_PUSH_INTERVAL_MS = 5000;
  const AUTH_CAPTURE_REFRESH_MS = 15000;
  const BRIDGE_REQUEST_TIMEOUT_MS = Number.isFinite(bridgeTimeoutMs) && bridgeTimeoutMs > 0 ? bridgeTimeoutMs : 3000;
  const DOM_EXTRACT_PROVIDERS = new Set(["naver-partner", "admin-station"]);
  /** @type {ReturnType<typeof setInterval> | null} */
  let bridgePushTimer = null;
  /** @type {AuthSummary | null} */
  let latestAuthSummary = null;
  /** @type {BridgeContext["providerType"]} */
  let latestAuthProvider = null;
  let lastAuthCaptureAt = 0;
  let lastBridgePayloadKey = "";

  /**
   * @param {unknown} value
   */
  function normalizeText(value) {
    if (typeof INFO_BRIDGE.normalizeText === "function") {
      return INFO_BRIDGE.normalizeText(value);
    }
    if (typeof ENTRY_POLICY.normalizeText === "function") {
      return ENTRY_POLICY.normalizeText(value);
    }
    return String(value ?? "").trim();
  }

  /**
   * @returns {BridgeContext}
   */
  function detectContext() {
    if (typeof INFO_BRIDGE.detectContext === "function") {
      return INFO_BRIDGE.detectContext(location.host, location.href, document.title);
    }
    const providerType =
      typeof ENTRY_POLICY.detectProviderTypeFromHost === "function"
        ? ENTRY_POLICY.detectProviderTypeFromHost(location.host)
        : "";
    return {
      providerType: providerType || null,
      host: normalizeText(location.host || "") || null,
      url: String(location.href || ""),
      title: normalizeText(document.title || "") || null
    };
  }

  /**
   * @returns {DomSnapshot}
   */
  function buildDomSnapshot() {
    const bodyText = normalizeText(document.body?.textContent || document.body?.innerText || "");
    return {
      url: String(location.href || ""),
      title: normalizeText(document.title || ""),
      bodyTextSample: bodyText.slice(0, 2000)
    };
  }

  function todayIsoDate() {
    return new Date().toISOString().slice(0, 10);
  }

  /**
   * @param {string} value
   * @returns {string}
   */
  function normalizeCandidateLine(value) {
    return normalizeText(value)
      .replace(/[|,;]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * @param {string} value
   * @returns {string | null}
   */
  function extractDateToken(value) {
    const match = value.match(/20\d{2}[-./]\d{1,2}[-./]\d{1,2}|\d{1,2}[-./]\d{1,2}/);
    return match ? match[0].replace(/[./]/g, "-") : null;
  }

  /**
   * @param {string} value
   * @returns {string | null}
   */
  function extractRatioToken(value) {
    const match = value.match(/\b\d+\s*\/\s*\d+\b|\bclosed\b|\bsold\s*\d+\b/i);
    return match ? match[0].replace(/\s+/g, "") : null;
  }

  /**
   * @param {string} value
   * @param {BridgeContext} context
   * @returns {string}
   */
  function inferChannelToken(value, context) {
    const normalized = normalizeText(value).toLowerCase();
    if (/naver|네이버/.test(normalized)) return "NAVER";
    if (/station|스테이션/.test(normalized)) return "STATION";
    return context?.providerType === "admin-station" ? "STATION" : "NAVER";
  }

  /**
   * @param {string} line
   * @returns {string | null}
   */
  function extractReservationRef(line) {
    const labeled =
      line.match(/(?:reservation(?:\s*(?:ref|no|number))?|예약(?:번호|참조)?|ref)\s*[:#-]?\s*([A-Z0-9][A-Z0-9-]{5,})/i) || [];
    if (labeled[1]) return labeled[1].trim();
    const generic = line.match(/\b([A-Z]{2,}\d{6,}(?:-\d{3,})?|\d{8,}(?:-\d{3,})?)\b/i) || [];
    return generic[1] ? generic[1].trim() : null;
  }

  /**
   * @param {string} line
   * @returns {string | null}
   */
  function extractRoomNo(line) {
    const labeled = line.match(/(?:room(?:\s*no)?|객실(?:번호)?)\s*[:#-]?\s*([A-Z]?\d{3,4})\b/i) || [];
    if (labeled[1]) return labeled[1].trim().toUpperCase();
    const generic = line.match(/\b([AB]?\d{3,4})\b/) || [];
    return generic[1] ? generic[1].trim().toUpperCase() : null;
  }

  /**
   * @param {string} text
   * @returns {string | null}
   */
  function extractBranch(text) {
    const normalized = normalizeText(text).toLowerCase();
    if (!normalized) return null;
    if (/branch_the_seolleung|the\s+seolleung|선릉/.test(normalized)) return "BRANCH_THE_SEOLLEUNG";
    if (/gangnam|강남/.test(normalized)) return "GANGNAM";
    if (/coex|코엑스|삼성/.test(normalized)) return "COEX";
    return null;
  }

  /**
   * @param {string} line
   * @param {BridgeContext} context
   * @param {DomSnapshot} snapshot
   * @returns {{
   *   reservationRef: string | null,
   *   roomNo: string | null,
   *   branch: string | null,
   *   tags: import("./contracts/extension-contracts").ExtractedCandidateTag[],
   *   signals: ExtractedCandidateSignal[],
   *   candidateBasis: string[]
   * }}
   */
  function extractCandidateMetadata(line, context, snapshot) {
    const dateToken = extractDateToken(line);
    const ratioToken = extractRatioToken(line);
    const channelToken = inferChannelToken(line, context);
    const reservationRef = extractReservationRef(line);
    const roomNo = extractRoomNo(line);
    const branch = extractBranch([line, snapshot?.title || "", context?.title || "", context?.host || ""].join(" "));
    /** @type {import("./contracts/extension-contracts").ExtractedCandidateTag[]} */
    const tags = [];
    /** @type {ExtractedCandidateSignal[]} */
    const signals = [];
    /** @type {string[]} */
    const candidateBasis = [];
    if (dateToken) {
      tags.push({ kind: "date", value: dateToken });
      signals.push({ kind: "date", value: dateToken, source: "line" });
      candidateBasis.push("date");
    }
    if (ratioToken) {
      tags.push({ kind: "ratio", value: ratioToken });
      signals.push({ kind: "ratio", value: ratioToken, source: "line" });
      candidateBasis.push("ratio");
    }
    if (channelToken) {
      tags.push({ kind: "channel", value: channelToken });
      signals.push({ kind: "channel", value: channelToken, source: context?.providerType ? "context" : "line" });
      candidateBasis.push("channel");
    }
    if (reservationRef) tags.push({ kind: "reservation_ref", value: reservationRef });
    if (reservationRef) {
      signals.push({ kind: "reservation_ref", value: reservationRef, source: "line" });
      candidateBasis.push("reservation_ref");
    }
    if (roomNo) {
      tags.push({ kind: "room_no", value: roomNo });
      signals.push({ kind: "room_no", value: roomNo, source: "line" });
      candidateBasis.push("room_no");
    }
    if (branch) {
      tags.push({ kind: "branch", value: branch });
      signals.push({ kind: "branch", value: branch, source: "context" });
      candidateBasis.push("branch");
    }
    return { reservationRef, roomNo, branch, tags, signals, candidateBasis };
  }

  /**
   * @param {ExtractedCandidateRow} row
   */
  function buildRowKey(row) {
    return [row?.date || "", row?.roomType || "", row?.channel || "", row?.siteRaw || "", row?.sheetRaw || ""].join("|");
  }

  /**
   * @param {DomSnapshot} snapshot
   * @param {ExtractedCandidateRow[]} rows
   * @param {BridgeContext} context
   */
  function buildPayloadFingerprint(snapshot, rows, context) {
    const firstKey = rows.length > 0 ? buildRowKey(rows[0]) : "";
    const lastKey = rows.length > 1 ? buildRowKey(rows[rows.length - 1]) : firstKey;
    return [
      context?.providerType || "",
      context?.host || "",
      snapshot?.bodyTextSample || "",
      rows.length,
      firstKey,
      lastKey
    ].join("::");
  }

  /**
   * @param {DomSnapshot} snapshot
   * @param {BridgeContext} context
   * @returns {ExtractedCandidateRow[]}
   */
  function extractNaverRows(snapshot, context) {
    const sample = normalizeText(snapshot?.bodyTextSample || "");
    const lines = sample
      .split(/\n+/)
      .map((line) => normalizeText(line))
      .filter(Boolean)
      .slice(0, 60);
    /** @type {ExtractedCandidateRow[]} */
    const rows = [];
    const ratioRe = /\b\d+\s*\/\s*\d+\b/;

    lines.forEach((line, index) => {
      if (rows.length >= 5) return;
      const ratioMatch = line.match(ratioRe);
      if (!ratioMatch) return;
      const normalizedLine = normalizeCandidateLine(line);
      const dateToken = extractDateToken(normalizedLine);
      const date = dateToken || todayIsoDate();
      const roomType = normalizedLine.replace(ratioMatch[0], "").replace(dateToken || "", "").trim() || `Live DOM ${index + 1}`;
      const metadata = extractCandidateMetadata(normalizedLine, context, snapshot);
      rows.push({
        date,
        roomType,
        channel: "NAVER",
        siteRaw: ratioMatch[0].replace(/\s+/g, ""),
        sheetRaw: "live-dom",
        diff: "warn",
        status: "warning",
        reason: "naver DOM row candidate extracted",
        action: "replace with naver structured mapper",
        reservationRef: metadata.reservationRef,
        roomNo: metadata.roomNo,
        branch: metadata.branch,
        rawLine: normalizedLine,
        sourceLineIndex: index,
        candidateBasis: metadata.candidateBasis,
        signals: metadata.signals,
        tags: metadata.tags
      });
    });

    return rows;
  }

  /**
   * @param {DomSnapshot} snapshot
   * @param {BridgeContext} context
   * @returns {ExtractedCandidateRow[]}
   */
  function extractStationRows(snapshot, context) {
    const sample = normalizeText(snapshot?.bodyTextSample || "");
    const lines = sample
      .split(/\n+/)
      .map((line) => normalizeText(line))
      .filter(Boolean)
      .slice(0, 80);
    /** @type {ExtractedCandidateRow[]} */
    const rows = [];
    const countRe = /\b\d+\s*\/\s*\d+\b|\bclosed\b|\bsold\s*\d+\b/i;

    lines.forEach((line, index) => {
      if (rows.length >= 5) return;
      const countMatch = line.match(countRe);
      if (!countMatch) return;
      const normalizedLine = normalizeCandidateLine(line);
      const dateToken = extractDateToken(normalizedLine);
      const date = dateToken || todayIsoDate();
      const roomType = normalizedLine.replace(countMatch[0], "").replace(dateToken || "", "").trim() || `Station DOM ${index + 1}`;
      const metadata = extractCandidateMetadata(normalizedLine, context, snapshot);
      rows.push({
        date,
        roomType,
        channel: "STATION",
        siteRaw: countMatch[0].replace(/\s+/g, ""),
        sheetRaw: "live-dom",
        diff: "warn",
        status: "warning",
        reason: "station DOM row candidate extracted",
        action: "replace with station structured mapper",
        reservationRef: metadata.reservationRef,
        roomNo: metadata.roomNo,
        branch: metadata.branch,
        rawLine: normalizedLine,
        sourceLineIndex: index,
        candidateBasis: metadata.candidateBasis,
        signals: metadata.signals,
        tags: metadata.tags
      });
    });

    return rows;
  }

  /**
   * @param {DomSnapshot} snapshot
   * @param {BridgeContext} context
   * @returns {ExtractedCandidateRow[]}
   */
  function extractLiveRows(snapshot, context) {
    if (!DOM_EXTRACT_PROVIDERS.has(String(context?.providerType || ""))) return [];
    const providerType = String(context?.providerType || "");
    const rows =
      providerType === "naver-partner"
        ? extractNaverRows(snapshot, context)
        : providerType === "admin-station"
          ? extractStationRows(snapshot, context)
          : [];

    if (rows.length > 0) return rows;

    const metadata = extractCandidateMetadata(
      [snapshot?.title || "", snapshot?.bodyTextSample || "", context?.title || ""].join(" "),
      context,
      snapshot
    );
    return [
      {
        date: todayIsoDate(),
        roomType: snapshot?.title || "Live Bridge Connected",
        channel: providerType === "naver-partner" ? "NAVER" : "STATION",
        siteRaw: context?.host || "connected",
        sheetRaw: "bridge-live",
        diff: "warn",
        status: "warning",
        reason: `${providerType} bridge connected; provider-specific DOM reader found no structured rows`,
        action: "refine provider-specific DOM selectors",
        reservationRef: metadata.reservationRef,
        roomNo: metadata.roomNo,
        branch: metadata.branch,
        rawLine: normalizeCandidateLine(snapshot?.title || ""),
        sourceLineIndex: null,
        candidateBasis: metadata.candidateBasis,
        signals: metadata.signals,
        tags: metadata.tags
      }
    ];
  }

  /**
   * @param {BridgeContext} context
   * @returns {Promise<AuthSummary | null>}
   */
  function requestAuthCapture(context) {
    return new Promise((resolve) => {
      const runtime = chrome?.runtime;
      if (!runtime?.sendMessage || !context?.providerType) {
        resolve(null);
        return;
      }
      if (
        latestAuthSummary &&
        latestAuthProvider === context.providerType &&
        Date.now() - lastAuthCaptureAt < AUTH_CAPTURE_REFRESH_MS
      ) {
        resolve(latestAuthSummary);
        return;
      }
      const hints =
        typeof AUTH_CAPTURE.collectHints === "function" ? AUTH_CAPTURE.collectHints(context.providerType) : {};
      runtime.sendMessage(
        {
          type: "inventory.bridge.authCapture",
          provider: context.providerType,
          sourceHost: context.host,
          urls: [String(location.origin || `${location.protocol}//${location.host}/`)],
          ...hints
        },
        (response) => {
          if (runtime.lastError) {
            resolve(null);
            return;
          }
          latestAuthProvider = context.providerType;
          lastAuthCaptureAt = Date.now();
          resolve(response?.summary || null);
        }
      );
    });
  }

  async function pushBridgeState() {
    const context = detectContext();
    if (!context?.providerType) return;
    if (document.visibilityState === "hidden") return;
    const snapshot = buildDomSnapshot();
    const rows = extractLiveRows(snapshot, context);
    /** @type {InfoSummary | null} */
    const infoSummary = typeof INFO_BRIDGE.summarizeRows === "function" ? INFO_BRIDGE.summarizeRows(rows) : null;
    latestAuthSummary = await requestAuthCapture(context);
    /** @type {BridgePayload} */
    const payload = {
      provider: context.providerType,
      host: context.host,
      url: context.url,
      title: context.title,
      bodyTextSample: snapshot.bodyTextSample,
      rows,
      infoSummary,
      authSummary: latestAuthSummary,
      updatedAt: new Date().toISOString()
    };
    const payloadKey = buildPayloadFingerprint(snapshot, rows, context);
    if (payloadKey === lastBridgePayloadKey) return;
    let timeoutId = null;
    try {
      const controller = typeof AbortController === "function" ? new AbortController() : null;
      timeoutId =
        controller && typeof setTimeout === "function"
          ? setTimeout(() => controller.abort(), BRIDGE_REQUEST_TIMEOUT_MS)
          : null;
      await fetch(BRIDGE_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(bridgeSecret ? { "X-UHS-Bridge-Secret": bridgeSecret } : {})
        },
        body: JSON.stringify(payload),
        signal: controller?.signal
      });
      lastBridgePayloadKey = payloadKey;
    } catch (_error) {
      // App bridge may be unavailable while the desktop process is not running.
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  function startBridgeHeartbeat() {
    void pushBridgeState();
    if (bridgePushTimer) clearInterval(bridgePushTimer);
    bridgePushTimer = setInterval(() => {
      void pushBridgeState();
    }, BRIDGE_PUSH_INTERVAL_MS);
  }

  const runtime = chrome?.runtime;
  if (runtime?.onMessage?.addListener) {
    runtime.onMessage.addListener((message, _sender, sendResponse) => {
      const runtimeMessage = message && typeof message === "object" ? /** @type {{ type?: unknown }} */ (message) : {};
      const type = normalizeText(runtimeMessage.type || "");
      if (!type) return false;

      if (type === "inventory.bridge.getContext") {
        sendResponse({ ok: true, context: detectContext() });
        return false;
      }

      if (type === "inventory.bridge.domSnapshot") {
        sendResponse({ ok: true, snapshot: buildDomSnapshot() });
        return false;
      }

      return false;
    });
  }

  App.bridge.getContext = detectContext;
  App.bridge.getDomSnapshot = buildDomSnapshot;
  App.bridge.pushBridgeState = pushBridgeState;
  /** @returns {BridgeInfoSnapshot} */
  App.bridge.getInfoSummary = () => ({
    context: detectContext(),
    rowSummary: (() => {
      const context = detectContext();
      const rows = extractLiveRows(buildDomSnapshot(), context);
      return typeof INFO_BRIDGE.summarizeRows === "function" ? INFO_BRIDGE.summarizeRows(rows) : null;
    })(),
    authSummary: latestAuthSummary
  });

  startBridgeHeartbeat();
  globalThis.addEventListener?.("focus", () => {
    void pushBridgeState();
  });
  document.addEventListener?.("visibilitychange", () => {
    if (document.visibilityState === "visible") void pushBridgeState();
  });
})();
