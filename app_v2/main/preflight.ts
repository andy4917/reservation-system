import type { AppPreflightSnapshot } from "../../src/desktop/app-v2-contracts.js";
import { APP_PROVIDERS } from "../../src/desktop/app-v2-contracts.js";
import { evaluateProviderOperatingState } from "./providerOperatingAdapter.js";
import { ensureProviderBrowser } from "./providerWorkspaceManager.js";
import { loadSettingsSnapshot } from "./settingsStore.js";

function buildProviderSummaryLine(snapshot: AppPreflightSnapshot["providers"][number]) {
  return `${snapshot.provider}:${snapshot.operatingStatus}`;
}

export function buildPreflightSummary(
  isConfigured: boolean,
  providers: AppPreflightSnapshot["providers"]
): string {
  const providerSummary = providers.map((provider) => buildProviderSummaryLine(provider)).join(", ");
  if (!isConfigured) {
    return providerSummary
      ? `스프레드시트와 시트명을 먼저 저장해야 합니다. provider summary: ${providerSummary}`
      : "스프레드시트와 시트명을 먼저 저장해야 합니다.";
  }
  return `provider summary: ${providerSummary}`;
}

export function normalizePreflightSnapshot(snapshot: AppPreflightSnapshot): AppPreflightSnapshot {
  return {
    ...snapshot,
    canRun: snapshot.settings.isConfigured && snapshot.overallStatus === "ready",
    summary: buildPreflightSummary(snapshot.settings.isConfigured, snapshot.providers)
  };
}

export async function runPreflight(): Promise<AppPreflightSnapshot> {
  const settings = await loadSettingsSnapshot();
  const browserStates = await Promise.all(APP_PROVIDERS.map((provider) => ensureProviderBrowser(provider)));
  const providers = browserStates.map((provider) => evaluateProviderOperatingState(provider));
  const readyCount = providers.filter((provider) => provider.operatingStatus === "ready").length;
  const overallStatus = !settings.isConfigured ? "needs-settings" : readyCount === providers.length ? "ready" : "attention";
  return normalizePreflightSnapshot({
    checkedAt: new Date().toISOString(),
    overallStatus,
    canRun: settings.isConfigured && overallStatus === "ready",
    summary: buildPreflightSummary(settings.isConfigured, providers),
    settings,
    providers
  });
}
