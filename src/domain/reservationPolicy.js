(() => {
  "use strict";

  const root = globalThis;
  const App = (root.App = root.App || {});
  App.domain = App.domain || {};
  const ns = (App.domain.reservationPolicy = App.domain.reservationPolicy || {});

  const N = App.scan?.normalize || {};
  const K = App.engine?.noteKey || {};
  const { normalizeText } = N;
  const { extractReservationNoFromText } = K;

  function normalizeReservationNoFromText(value) {
    if (typeof extractReservationNoFromText === "function") {
      const parsed = extractReservationNoFromText(value);
      if (parsed) return parsed;
    }
    const text = normalizeText(value || "");
    if (!text) return "";
    const match = text.match(/[0-9A-Za-z_-]{6,}/);
    return match ? match[0] : "";
  }

  function normalizeReservationStatus(value) {
    const text = normalizeText(value || "").toUpperCase();
    if (!text) return "";
    const compact = text.replace(/[^A-Z0-9]+/g, "");
    if (!compact) return text;
    if (compact.includes("NOSHOW")) return "NOSHOW";
    if (["CANCEL", "CANCELED", "CANCELLED", "CNCL", "CNX", "CXL"].some((token) => compact.includes(token))) {
      return "CANCELED";
    }
    return compact;
  }

  function isInactiveReservationStatus(status) {
    const text = normalizeReservationStatus(status);
    if (!text) return false;
    return text === "CANCELED" || /^CXL|^CNCL|^CANC|^CX$|^CN$/.test(text);
  }

  function hasReservationAuditAnomaly(status) {
    const text = normalizeReservationStatus(status);
    return text === "NOSHOW" || /^NS$/.test(text);
  }

  function classifyReservationStatusBucket(status) {
    return isInactiveReservationStatus(status) ? "CANCELED" : "ACTIVE";
  }

  function normalizeReservationChannel(value, sourceSystem = "", fallback = "") {
    const low = normalizeText(value || fallback || "").toLowerCase();
    if (low.includes("station") || low.includes("uh suite")) return "STATION";
    if (low.includes("naver")) return "NAVER";
    if (low.includes("trip")) return "TRIP";
    if (low.includes("agoda")) return "AGODA";
    if (low.includes("booking")) return "BOOKING";
    if (low.includes("airbnb")) return "AIRBNB";
    if (low.includes("yanolja")) return "YANOLJA";
    if (low.includes("here")) return "HERE";
    if (low.includes("coupang")) return "COUPANG_TRAVEL";
    const src = normalizeText(sourceSystem || "").toUpperCase();
    if (src === "NAVER" || src === "STATION") return src;
    return normalizeText(value || fallback || "").toUpperCase() || "UNKNOWN";
  }

  Object.assign(ns, {
    normalizeReservationNoFromText,
    normalizeReservationStatus,
    isInactiveReservationStatus,
    hasReservationAuditAnomaly,
    classifyReservationStatusBucket,
    normalizeReservationChannel,
  });
})();
