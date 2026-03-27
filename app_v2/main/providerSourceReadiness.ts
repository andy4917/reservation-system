import type { AppProviderOperatingSnapshot } from "../../src/desktop/app-v2-contracts.js";
import type { AppProvider } from "../../src/desktop/app-v2-contracts.js";

export type ProviderSourceAccessProvider = Extract<AppProvider, "naver-partner" | "admin-station">;

export interface ProviderSourceAccessState {
  provider: ProviderSourceAccessProvider;
  sessionAvailable: boolean;
  source: string;
  sessionSignals: string[];
}

function summarizeBlockedSourceAccess(provider: ProviderSourceAccessProvider) {
  return provider === "admin-station"
    ? "Station 앱 세션 토큰 확인이 필요합니다."
    : "네이버 API 세션 확인이 필요합니다.";
}

export function applyProviderSourceAccessToOperatingSnapshot(
  snapshot: AppProviderOperatingSnapshot,
  sourceAccess: ProviderSourceAccessState,
): AppProviderOperatingSnapshot {
  if (snapshot.provider !== sourceAccess.provider) return snapshot;
  if (snapshot.operatingStatus !== "ready") return snapshot;
  if (sourceAccess.sessionAvailable) return snapshot;

  const reasons = [...snapshot.operatingEvidence.reasons, ...(sourceAccess.sessionSignals || [])];
  return {
    ...snapshot,
    operatingStatus: "needs-login",
    operatingSummary: summarizeBlockedSourceAccess(sourceAccess.provider),
    operatingEvidence: {
      ...snapshot.operatingEvidence,
      derivedStatus: "needs-login",
      reasons: reasons.length > 0 ? reasons : ["provider-session-unavailable"],
    },
  };
}
