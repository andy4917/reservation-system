(() => {
  "use strict";

  const root = globalThis;
  const App = (root.App = root.App || {});
  App.ui = App.ui || {};
  const ns = (App.ui.productFlow = App.ui.productFlow || {});
  if (ns.__ready) return;

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
      label: "WINGS\/PMS",
      hostPatterns: Object.freeze([
        /(?:^|\.)pms\.sanhait\.com$/i,
        /(?:^|\.)sanhait\.com$/i,
        /(?:^|\.)wings\.co\.kr$/i
      ])
    })
  });

  const INTEGRATIONS = Object.freeze({
    "provider-session": Object.freeze({
      key: "provider-session",
      label: "Provider Session",
      directEntry: true
    }),
    sheets: Object.freeze({
      key: "sheets",
      label: "Google Sheets",
      directEntry: false
    }),
    wings: Object.freeze({
      key: "wings",
      label: "WINGS\/PMS",
      directEntry: false
    })
  });

  const TASKS = Object.freeze({
    NAVER_STATION_SYNC: Object.freeze({
      id: "NAVER_STATION_SYNC",
      label: "Inventory",
      requiredCapability: "provider-session",
      supportedHosts: Object.freeze(["naver-partner", "admin-station"]),
      guardUtilityTab: "scope"
    }),
    PMS_RESERVATION_VALIDATION: Object.freeze({
      id: "PMS_RESERVATION_VALIDATION",
      label: "Reservation Validation",
      requiredCapability: "wings",
      supportedHosts: Object.freeze(["naver-partner", "admin-station"]),
      guardUtilityTab: "settings"
    }),
    SHEET_MAPPING_REVIEW: Object.freeze({
      id: "SHEET_MAPPING_REVIEW",
      label: "Sheet Mapping",
      requiredCapability: "sheets",
      supportedHosts: Object.freeze(["naver-partner", "admin-station"]),
      guardUtilityTab: "settings"
    }),
    OTA_PMS_COMPARISON: Object.freeze({
      id: "OTA_PMS_COMPARISON",
      label: "OTA/PMS Audit",
      requiredCapability: "wings",
      supportedHosts: Object.freeze(["naver-partner", "admin-station"]),
      guardUtilityTab: "settings"
    })
  });

  function normalizeText(value) {
    return String(value ?? "").trim();
  }

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
    const entry = Object.values(ENTRY_HOSTS).find((policy) =>
      (policy.hostnames || []).some((hostname) => normalizedHost === hostname)
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
      // Invalid URLs are handled as unsupported.
    }
    return {
      supported: false,
      directEntry: false,
      reason: "unsupported",
      providerType: "",
      integrationKey: ""
    };
  }

  function buildCapabilitySnapshot(input = {}) {
    const providerSessionReady = input.providerSessionReady === true;
    const sheetConfigured = input.sheetConfigured === true;
    const sheetAuthReady = input.sheetAuthReady === true;
    const pmsConfigured = input.pmsConfigured === true;
    const pmsAuthReady = input.pmsAuthReady === true;

    return {
      "provider-session": {
        key: "provider-session",
        label: INTEGRATIONS["provider-session"].label,
        directEntry: true,
        configured: true,
        authenticated: providerSessionReady,
        ready: providerSessionReady
      },
      sheets: {
        key: "sheets",
        label: INTEGRATIONS.sheets.label,
        directEntry: false,
        configured: sheetConfigured,
        authenticated: sheetAuthReady,
        ready: sheetConfigured && sheetAuthReady
      },
      wings: {
        key: "wings",
        label: INTEGRATIONS.wings.label,
        directEntry: false,
        configured: pmsConfigured,
        authenticated: pmsAuthReady,
        ready: pmsConfigured && pmsAuthReady
      }
    };
  }

  function evaluateTaskAccess(taskId, capabilities, workspaceAccess, providerType) {
    const task = TASKS[normalizeText(taskId).toUpperCase()] || TASKS.NAVER_STATION_SYNC;
    if (!workspaceAccess) {
      return {
        blocked: true,
        reason: "provider-session",
        requiredCapability: task.requiredCapability,
        utilityTab: "scope",
        label: task.label
      };
    }

    if (Array.isArray(task.supportedHosts) && !task.supportedHosts.includes(providerType)) {
      return {
        blocked: true,
        reason: "host-scope",
        requiredCapability: task.requiredCapability,
        utilityTab: "settings",
        label: task.label
      };
    }

    const capabilityKey = task.requiredCapability;
    if (capabilityKey === "provider-session") {
      return {
        blocked: false,
        reason: "",
        requiredCapability: capabilityKey,
        utilityTab: task.guardUtilityTab,
        label: task.label
      };
    }

    const capability = capabilities?.[capabilityKey];
    if (capability?.ready === true) {
      return {
        blocked: false,
        reason: "",
        requiredCapability: capabilityKey,
        utilityTab: task.guardUtilityTab,
        label: task.label
      };
    }

    return {
      blocked: true,
      reason: capabilityKey,
      requiredCapability: capabilityKey,
      utilityTab: task.guardUtilityTab,
      integrationLabel: capability?.label || capabilityKey,
      label: task.label
    };
  }

  function evaluateProductFlow(input = {}) {
    const providerType = normalizeProviderType(input.providerType);
    const entryHost = getEntryHostPolicy(providerType);
    const capabilities = buildCapabilitySnapshot(input);
    const workspaceAccess = Boolean(entryHost) && capabilities["provider-session"].ready === true;
    const tasks = Object.fromEntries(
      Object.keys(TASKS).map((taskId) => [taskId, evaluateTaskAccess(taskId, capabilities, workspaceAccess, providerType)])
    );

    return {
      entryHost,
      capabilities,
      directEntryHosts: Object.values(ENTRY_HOSTS).map((policy) => ({
        providerType: policy.providerType,
        providerLabel: policy.providerLabel,
        directEntryLabel: policy.directEntryLabel
      })),
      integrations: INTEGRATIONS,
      tasks,
      workspaceAccess,
      gate: workspaceAccess
        ? {
            blocked: false,
            reason: "",
            utilityTab: "scope"
          }
        : {
            blocked: true,
            reason: entryHost ? "provider-session" : "unsupported-host",
            utilityTab: "scope"
          }
    };
  }

  ns.__ready = true;
  ns.ENTRY_HOSTS = ENTRY_HOSTS;
  ns.INDIRECT_HOST_RULES = INDIRECT_HOST_RULES;
  ns.INTEGRATIONS = INTEGRATIONS;
  ns.TASKS = TASKS;
  ns.normalizeProviderType = normalizeProviderType;
  ns.getEntryHostPolicy = getEntryHostPolicy;
  ns.detectProviderTypeFromHost = detectProviderTypeFromHost;
  ns.detectEntrySupportByUrl = detectEntrySupportByUrl;
  ns.evaluateProductFlow = evaluateProductFlow;
})();
