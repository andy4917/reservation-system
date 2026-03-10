(() => {
  "use strict";

  const root = globalThis;
  const policy = (root.InventoryEntryPolicy = root.InventoryEntryPolicy || {});
  if (policy.__ready) return;

  function normalizeText(value) {
    return String(value ?? "").trim();
  }

  const ENTRY_HOSTS = Object.freeze({
    "naver-partner": Object.freeze({
      providerType: "naver-partner",
      providerLabel: "NAVER",
      directEntryLabel: "Naver Partner",
      hostnames: Object.freeze(["partner.booking.naver.com"])
    }),
    "admin-station": Object.freeze({
      providerType: "admin-station",
      providerLabel: "STATION",
      directEntryLabel: "Station Admin",
      hostnames: Object.freeze(["admin.admin-stationbyuhc.com"])
    }),
    "wings-pms": Object.freeze({
      providerType: "wings-pms",
      providerLabel: "WINGS",
      directEntryLabel: "WINGS PMS",
      hostnames: Object.freeze(["pms.sanhait.com"])
    })
  });

  const INDIRECT_HOST_RULES = Object.freeze({
    sheets: Object.freeze({
      integrationKey: "sheets",
      label: "Google Sheets",
      hostPatterns: Object.freeze([
        /(?:^|\.)docs\.google\.com$/i,
        /(?:^|\.)sheets\.google\.com$/i,
        /(?:^|\.)sheets\.googleapis\.com$/i
      ])
    }),
    wings: Object.freeze({
      integrationKey: "wings",
      label: "WINGS/PMS",
      hostPatterns: Object.freeze([
        /(?:^|\.)pms\.sanhait\.com$/i,
        /(?:^|\.)sanhait\.com$/i,
        /(?:^|\.)wings\.co\.kr$/i
      ])
    })
  });

  function normalizeProviderType(value) {
    const text = normalizeText(value).toLowerCase();
    if (Object.prototype.hasOwnProperty.call(ENTRY_HOSTS, text)) return text;
    return "";
  }

  function getEntryHostPolicy(providerType) {
    const normalized = normalizeProviderType(providerType);
    return normalized ? ENTRY_HOSTS[normalized] : null;
  }

  function detectProviderTypeFromHost(host) {
    const normalizedHost = normalizeText(host).toLowerCase();
    if (!normalizedHost) return "";
    const entry = Object.values(ENTRY_HOSTS).find((item) =>
      (item.hostnames || []).some((hostname) => normalizedHost === hostname)
    );
    return entry?.providerType || "";
  }

  function detectIndirectIntegrationFromHost(host) {
    const normalizedHost = normalizeText(host).toLowerCase();
    if (!normalizedHost) return null;
    return (
      Object.values(INDIRECT_HOST_RULES).find((rule) =>
        (rule.hostPatterns || []).some((pattern) => pattern.test(normalizedHost))
      ) || null
    );
  }

  function detectEntrySupportByUrl(urlRaw) {
    try {
      const parsed = new URL(String(urlRaw || ""));
      const providerType = detectProviderTypeFromHost(parsed.hostname);
      if (providerType) {
        return {
          supported: true,
          directEntry: true,
          reason: "direct-entry",
          providerType,
          integrationKey: ""
        };
      }
      const indirectRule = detectIndirectIntegrationFromHost(parsed.hostname);
      if (indirectRule) {
        return {
          supported: false,
          directEntry: false,
          reason: "indirect-integration",
          providerType: "",
          integrationKey: indirectRule.integrationKey
        };
      }
    } catch (_error) {
      // Invalid URLs are treated as unsupported.
    }
    return {
      supported: false,
      directEntry: false,
      reason: "unsupported",
      providerType: "",
      integrationKey: ""
    };
  }

  policy.__ready = true;
  Object.assign(policy, {
    ENTRY_HOSTS,
    INDIRECT_HOST_RULES,
    normalizeText,
    normalizeProviderType,
    getEntryHostPolicy,
    detectProviderTypeFromHost,
    detectIndirectIntegrationFromHost,
    detectEntrySupportByUrl
  });
})();
