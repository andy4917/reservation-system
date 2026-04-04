import type {
  AppAuthRequirement,
  AppPreflightSnapshot,
  AppProviderOperatingSnapshot,
  AppSettingsSnapshot,
  AppSheetReadinessSnapshot,
} from "../../src/desktop/app-v2-contracts.js";
import { evaluateSheetReadiness } from "./sheetReadiness.js";
import { loadSettingsSnapshot } from "./settingsStore.js";
import { runPreflight } from "./preflight.js";

function buildSheetNextAction(settings: AppSettingsSnapshot, sheet: AppSheetReadinessSnapshot) {
  if (sheet.status === "ready") {
    return "설정과 환경 인증이 준비되어 있습니다.";
  }
  if (sheet.status === "needs-settings" || sheet.status === "invalid-settings" || sheet.status === "missing-sheet") {
    const missing = settings.missingRequired.length > 0 ? settings.missingRequired.join(", ") : "spreadsheet, sheetName";
    return `설정에서 ${missing} 값을 먼저 저장해야 합니다.`;
  }
  if (sheet.status === "needs-auth") {
    return "Google Sheets는 .env 기반 인증이 필요합니다.";
  }
  return "Google Sheets 설정과 인증 오류를 먼저 해결해야 합니다.";
}

function buildSheetHints(settings: AppSettingsSnapshot, sheet: AppSheetReadinessSnapshot) {
  const hints = [
    "settings: spreadsheet",
    "settings: sheetName",
    "env: UHS_GOOGLE_ACCESS_TOKEN or GOOGLE_ACCESS_TOKEN",
    "env: UHS_GOOGLE_REFRESH_TOKEN + UHS_GOOGLE_CLIENT_ID + UHS_GOOGLE_CLIENT_SECRET",
  ];
  if (sheet.accessMode !== "none") {
    hints.push(`accessMode:${sheet.accessMode}`);
  }
  return hints;
}

function buildSheetRequirement(settings: AppSettingsSnapshot, sheet: AppSheetReadinessSnapshot): AppAuthRequirement {
  return {
    target: "google-sheets",
    label: "Google Sheets",
    authMode: "config-auth",
    ready: sheet.status === "ready",
    status: sheet.status,
    summary: sheet.summary,
    nextAction: buildSheetNextAction(settings, sheet),
    hints: buildSheetHints(settings, sheet),
    evidence: [
      `spreadsheet:${sheet.spreadsheetId ?? "-"}`,
      `sheetName:${sheet.sheetName ?? "-"}`,
      `accessMode:${sheet.accessMode}`,
      `settingsConfigured:${settings.isConfigured ? "yes" : "no"}`,
    ],
  };
}

function buildProviderNextAction(provider: AppPreflightSnapshot["providers"][number]) {
  if (provider.operatingStatus === "ready") {
    return "브라우저 세션이 준비되어 바로 read 경로에 사용할 수 있습니다.";
  }
  if (provider.operatingStatus === "needs-login") {
    return "Provider 창을 열고 해당 서비스에 직접 로그인해야 합니다.";
  }
  if (provider.operatingStatus === "attention") {
    return "Provider 창을 열어 운영 대상 화면까지 이동한 뒤 readiness를 다시 확인해야 합니다.";
  }
  return "Provider 창을 다시 열거나 새로고침해서 런타임 오류를 먼저 해소해야 합니다.";
}

function buildProviderHints(provider: AppProviderOperatingSnapshot) {
  return [
    `startUrl:${provider.startUrl}`,
    `partition:${provider.partition}`,
    `windowState:${provider.windowState}`,
  ];
}

function buildProviderEvidence(provider: AppProviderOperatingSnapshot) {
  return [
    `host:${provider.currentHost ?? "-"}`,
    `path:${provider.currentPath ?? "-"}`,
    `pageState:${provider.pageState}`,
    `providerCookies:${provider.providerCookieCount}`,
  ];
}

function buildProviderRequirement(provider: AppProviderOperatingSnapshot): AppAuthRequirement {
  return {
    target: provider.provider,
    label: provider.label,
    authMode: "session-auth",
    ready: provider.operatingStatus === "ready",
    status: provider.operatingStatus,
    summary: provider.operatingSummary,
    nextAction: buildProviderNextAction(provider),
    hints: buildProviderHints(provider),
    evidence: buildProviderEvidence(provider),
  };
}

export async function listAuthRequirements(): Promise<AppAuthRequirement[]> {
  const settings = await loadSettingsSnapshot();
  const [sheet, preflight] = await Promise.all([evaluateSheetReadiness(settings), runPreflight()]);
  return [buildSheetRequirement(settings, sheet), ...preflight.providers.map((provider) => buildProviderRequirement(provider))];
}
