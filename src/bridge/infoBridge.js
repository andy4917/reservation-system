"use strict";

(() => {
  const InfoBridge = (globalThis.InventoryInfoBridge = globalThis.InventoryInfoBridge || {});
  const ENTRY_POLICY = globalThis.InventoryEntryPolicy || {};

  function normalizeText(value) {
    if (typeof ENTRY_POLICY.normalizeText === "function") {
      return ENTRY_POLICY.normalizeText(value);
    }
    return String(value ?? "").trim();
  }

  function detectContext(host, href, title) {
    const providerType =
      typeof ENTRY_POLICY.detectProviderTypeFromHost === "function"
        ? ENTRY_POLICY.detectProviderTypeFromHost(host)
        : "";
    return {
      providerType: providerType || null,
      host: normalizeText(host || "") || null,
      url: String(href || ""),
      title: normalizeText(title || "") || null
    };
  }

  function summarizeRows(rows) {
    const list = Array.isArray(rows) ? rows : [];
    return {
      count: list.length,
      channels: [...new Set(list.map((row) => normalizeText(row?.channel || "")).filter(Boolean))].slice(0, 8),
      dates: [...new Set(list.map((row) => normalizeText(row?.date || "")).filter(Boolean))].slice(0, 8)
    };
  }

  InfoBridge.normalizeText = normalizeText;
  InfoBridge.detectContext = detectContext;
  InfoBridge.summarizeRows = summarizeRows;
})();
