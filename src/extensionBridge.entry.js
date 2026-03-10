(() => {
  "use strict";

  const App = (globalThis.App = globalThis.App || {});
  App.bridge = App.bridge || {};

  const ENTRY_POLICY = globalThis.InventoryEntryPolicy || {};

  function normalizeText(value) {
    if (typeof ENTRY_POLICY.normalizeText === "function") {
      return ENTRY_POLICY.normalizeText(value);
    }
    return String(value ?? "").trim();
  }

  function detectContext() {
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

  function buildDomSnapshot() {
    return {
      url: String(location.href || ""),
      title: normalizeText(document.title || ""),
      bodyTextSample: normalizeText(document.body?.innerText || "").slice(0, 2000)
    };
  }

  chrome.runtime?.onMessage?.addListener((message, _sender, sendResponse) => {
    const type = normalizeText(message?.type || "");
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

  App.bridge.getContext = detectContext;
  App.bridge.getDomSnapshot = buildDomSnapshot;
})();
