import type {
  AppProviderBrowserState,
  AppProviderOperatingEvidence,
  AppProviderOperatingSnapshot,
  AppProviderRawRuntimeSignals,
  AppProviderOperatingStatus
} from "../../src/desktop/app-v2-contracts.js";
import { getAppProviderOption } from "../../src/desktop/app-v2-contracts.js";

const LOGIN_RE = /login|signin|auth|로그인/i;

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function hasAllowedHost(host: string, provider: AppProviderBrowserState["provider"]) {
  const config = getAppProviderOption(provider);
  return config.allowedHostSuffixes.some((suffix) => host.endsWith(suffix));
}

function isReadyHost(host: string, provider: AppProviderBrowserState["provider"]) {
  const config = getAppProviderOption(provider);
  return config.readyHosts.includes(host);
}

function hasProviderLoginHint(url: string, provider: AppProviderBrowserState["provider"]) {
  const config = getAppProviderOption(provider);
  return config.loginUrlHints.some((hint) => url.includes(hint));
}

function buildRawSignals(state: AppProviderBrowserState): AppProviderRawRuntimeSignals {
  return {
    pageState: state.pageState,
    currentUrl: state.currentUrl,
    currentPath: state.currentPath,
    currentHost: state.currentHost,
    title: state.title,
    cookieCount: state.cookieCount,
    providerCookieCount: state.providerCookieCount,
    lastError: state.lastError,
    lastLoadedAt: state.lastLoadedAt,
    lastLoadStartedAt: state.lastLoadStartedAt,
    lastLoadFinishedAt: state.lastLoadFinishedAt,
    lastLoadFailedAt: state.lastLoadFailedAt
  };
}

function buildOperatingEvidence(
  state: AppProviderBrowserState,
  derivedStatus: AppProviderOperatingStatus,
  reasons: string[]
): AppProviderOperatingEvidence {
  return {
    provider: state.provider,
    derivedStatus,
    rawSignals: buildRawSignals(state),
    sourceError: state.lastError,
    reasons
  };
}

function buildSnapshot(
  state: AppProviderBrowserState,
  operatingStatus: AppProviderOperatingStatus,
  operatingSummary: string,
  reasons: string[]
): AppProviderOperatingSnapshot {
  const rawSignals = buildRawSignals(state);
  return {
    ...state,
    operatingStatus,
    operatingSummary,
    rawSignals,
    operatingEvidence: buildOperatingEvidence(state, operatingStatus, reasons)
  };
}

function classifyWingsOperatingState(state: AppProviderBrowserState): AppProviderOperatingSnapshot {
  const config = getAppProviderOption("wings-pms");
  const url = normalizeText(state.currentUrl).toLowerCase();
  const title = normalizeText(state.title).toLowerCase();
  const host = normalizeText(state.currentHost).toLowerCase();
  if (!url) return buildSnapshot(state, "attention", "작업 창 주소를 아직 읽지 못했습니다.", ["url-missing"]);
  if (!hasAllowedHost(host, state.provider)) {
    return buildSnapshot(state, "error", `예상한 ${config.label} 도메인이 아닙니다.`, ["unexpected-host"]);
  }
  if (hasProviderLoginHint(url, state.provider) || LOGIN_RE.test(url) || LOGIN_RE.test(title)) {
    return buildSnapshot(state, "needs-login", `${config.label} 로그인 확인이 필요합니다.`, ["login-route"]);
  }
  if (state.providerCookieCount === 0) return buildSnapshot(state, "needs-login", `${config.label} 세션 쿠키가 없습니다.`, ["provider-cookie-missing"]);
  if (!isReadyHost(host, state.provider)) {
    return buildSnapshot(state, "attention", `${config.label} 운영 화면을 다시 확인해야 합니다.`, ["surface-unrecognized"]);
  }
  return buildSnapshot(state, "ready", `${config.label} read 작업 준비가 확인되었습니다.`, ["host-matched", "provider-cookie-present"]);
}

function classifyNaverOperatingState(state: AppProviderBrowserState): AppProviderOperatingSnapshot {
  const config = getAppProviderOption("naver-partner");
  const url = normalizeText(state.currentUrl).toLowerCase();
  const title = normalizeText(state.title).toLowerCase();
  const host = normalizeText(state.currentHost).toLowerCase();
  if (!url) return buildSnapshot(state, "attention", `${config.label} 작업 창 주소를 아직 읽지 못했습니다.`, ["url-missing"]);
  if (!hasAllowedHost(host, state.provider)) return buildSnapshot(state, "error", `예상한 ${config.label} 도메인이 아닙니다.`, ["unexpected-host"]);
  if (LOGIN_RE.test(url) || LOGIN_RE.test(title)) {
    return buildSnapshot(state, "needs-login", `${config.label} 로그인 확인이 필요합니다.`, ["login-route"]);
  }
  if (isReadyHost(host, state.provider)) {
    return buildSnapshot(state, "ready", `${config.label} read 작업 준비가 확인되었습니다.`, ["host-matched", "surface-recognized"]);
  }
  if (state.providerCookieCount > 0) {
    return buildSnapshot(state, "attention", `${config.label} 세션은 있으나 운영 대상 화면이 아닙니다.`, ["provider-cookie-present", "surface-unrecognized"]);
  }
  return buildSnapshot(state, "needs-login", `${config.label} 세션 쿠키가 없습니다.`, ["provider-cookie-missing"]);
}

function classifyStationOperatingState(state: AppProviderBrowserState): AppProviderOperatingSnapshot {
  const config = getAppProviderOption("admin-station");
  const url = normalizeText(state.currentUrl).toLowerCase();
  const title = normalizeText(state.title).toLowerCase();
  const host = normalizeText(state.currentHost).toLowerCase();
  if (!url) return buildSnapshot(state, "attention", `${config.label} 작업 창 주소를 아직 읽지 못했습니다.`, ["url-missing"]);
  if (!hasAllowedHost(host, state.provider)) return buildSnapshot(state, "error", `예상한 ${config.label} 도메인이 아닙니다.`, ["unexpected-host"]);
  if (LOGIN_RE.test(url) || LOGIN_RE.test(title)) {
    return buildSnapshot(state, "needs-login", `${config.label} 로그인 확인이 필요합니다.`, ["login-route"]);
  }
  if (isReadyHost(host, state.provider)) {
    return buildSnapshot(state, "ready", `${config.label} read 작업 준비가 확인되었습니다.`, ["host-matched"]);
  }
  return buildSnapshot(state, "attention", `${config.label} 운영 화면을 다시 확인해야 합니다.`, ["surface-unrecognized"]);
}

export function evaluateProviderOperatingState(state: AppProviderBrowserState): AppProviderOperatingSnapshot {
  if (state.pageState === "error" || normalizeText(state.lastError)) {
    return buildSnapshot(state, "error", state.lastError || "provider 작업 창 로딩 중 오류가 발생했습니다.", ["runtime-error"]);
  }
  if (state.pageState !== "loaded") {
    const summary = state.pageState === "loading" ? "provider 작업 창이 아직 로딩 중입니다." : "provider 작업 창을 먼저 준비해야 합니다.";
    return buildSnapshot(state, "attention", summary, [`page-state:${state.pageState}`]);
  }
  if (state.provider === "wings-pms") return classifyWingsOperatingState(state);
  if (state.provider === "naver-partner") return classifyNaverOperatingState(state);
  return classifyStationOperatingState(state);
}
