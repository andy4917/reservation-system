import type {
  AppReadinessBlockingSource,
  AppRuntimeVerifyFocus,
  AppRuntimeVerifySnapshot
} from "../../src/desktop/app-v2-contracts.js";
import { normalizePreflightSnapshot, runPreflight } from "./preflight.js";
import { evaluateSheetReadiness } from "./sheetReadiness.js";
import { loadSettingsSnapshot } from "./settingsStore.js";

function sheetBlockingSource(sheet: AppRuntimeVerifySnapshot["sheet"]): AppReadinessBlockingSource {
  if (sheet.status === "needs-auth") return "sheet-auth";
  return "sheet";
}

function dedupe(values: AppReadinessBlockingSource[]) {
  return Array.from(new Set(values));
}

function buildSnapshot(
  focus: AppRuntimeVerifyFocus,
  options: Omit<AppRuntimeVerifySnapshot, "checkedAt" | "focus">
): AppRuntimeVerifySnapshot {
  return {
    checkedAt: new Date().toISOString(),
    focus,
    ...options,
    blockingSources: dedupe(options.blockingSources)
  };
}

function buildSheetOnlySnapshot(
  focus: AppRuntimeVerifyFocus,
  settings: AppRuntimeVerifySnapshot["settings"],
  sheet: AppRuntimeVerifySnapshot["sheet"]
): AppRuntimeVerifySnapshot {
  const overallReady = sheet.status === "ready";
  return buildSnapshot(focus, {
    preflightStatus: settings.isConfigured ? (overallReady ? "ready" : "attention") : "needs-settings",
    overallReady,
    blockingSources: overallReady ? [] : [sheetBlockingSource(sheet)],
    supportLevel: overallReady ? "sheet-live" : "offline-preview",
    v2Gate: overallReady && focus === "sheet-live" ? "open" : "locked",
    settings,
    sheet,
    preflight: null
  });
}

export function summarizeRuntimeReadiness(
  focus: AppRuntimeVerifyFocus,
  settings: AppRuntimeVerifySnapshot["settings"],
  sheet: AppRuntimeVerifySnapshot["sheet"],
  preflight: AppRuntimeVerifySnapshot["preflight"]
): AppRuntimeVerifySnapshot {
  if (focus === "sheet-live" || !settings.isConfigured) {
    return buildSheetOnlySnapshot(focus, settings, sheet);
  }

  if (!preflight) {
    return buildSheetOnlySnapshot(focus, settings, sheet);
  }

  const normalizedPreflight = normalizePreflightSnapshot(preflight);
  const blockingSources: AppReadinessBlockingSource[] = normalizedPreflight.providers
    .filter((provider) => provider.operatingStatus !== "ready")
    .map((provider) => provider.provider);

  if (sheet.status !== "ready") {
    blockingSources.unshift(sheetBlockingSource(sheet));
  }

  const overallReady = sheet.status === "ready" && normalizedPreflight.overallStatus === "ready";
  return buildSnapshot(focus, {
    preflightStatus: normalizedPreflight.overallStatus,
    overallReady,
    blockingSources,
    supportLevel: overallReady ? "read-live" : "offline-preview",
    v2Gate: overallReady ? "open" : "locked",
    settings,
    sheet,
    preflight: normalizedPreflight
  });
}

export async function evaluateRuntimeReadiness(focus: AppRuntimeVerifyFocus): Promise<AppRuntimeVerifySnapshot> {
  const settings = await loadSettingsSnapshot();
  const sheet = await evaluateSheetReadiness(settings);
  const preflight = focus === "sheet-live" || !settings.isConfigured ? null : await runPreflight();
  return summarizeRuntimeReadiness(focus, settings, sheet, preflight);
}
