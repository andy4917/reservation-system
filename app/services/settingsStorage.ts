import { DEFAULT_RECOMMENDATION_SETTINGS, type RecommendationSettings } from "../contracts";
import type { BridgeSummary } from "../renderer/types";

const AUTH_BUNDLE_SETTINGS_KEY = "uhs.app.settings.authBundleSnapshot.v1";
const RECOMMENDATION_SETTINGS_KEY = "uhs.app.settings.recommendation.v1";

export interface AuthBundleSettingsSnapshot {
  provider: string;
  host: string;
  updatedAt: string;
  bridgeSummary: BridgeSummary;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeBridgeSummary(value: unknown): BridgeSummary {
  const record = isPlainObject(value) ? value : {};
  const authSummary = isPlainObject(record.authSummary)
    ? {
        cookieCount: typeof record.authSummary.cookieCount === "number" ? record.authSummary.cookieCount : 0,
        domains: Array.isArray(record.authSummary.domains) ? record.authSummary.domains.filter((item): item is string => typeof item === "string") : [],
        hasBearer: record.authSummary.hasBearer === true,
        hasCsrf: record.authSummary.hasCsrf === true,
        hasRole: record.authSummary.hasRole === true
      }
    : null;
  const infoSummary = isPlainObject(record.infoSummary)
    ? {
        count: typeof record.infoSummary.count === "number" ? record.infoSummary.count : 0,
        channels: Array.isArray(record.infoSummary.channels)
          ? record.infoSummary.channels.filter((item): item is string => typeof item === "string")
          : [],
        dates: Array.isArray(record.infoSummary.dates) ? record.infoSummary.dates.filter((item): item is string => typeof item === "string") : []
      }
    : null;
  const preview = isPlainObject(record.preview)
    ? {
        title: normalizeText(record.preview.title) || null,
        url: normalizeText(record.preview.url) || null,
        updatedAt: normalizeText(record.preview.updatedAt),
        bodyTextSample: normalizeText(record.preview.bodyTextSample),
        rows: Array.isArray(record.preview.rows)
          ? record.preview.rows
              .filter((item): item is Record<string, unknown> => isPlainObject(item))
              .map((item) => ({
                date: normalizeText(item.date),
                roomType: normalizeText(item.roomType),
                channel: normalizeText(item.channel),
                reason: normalizeText(item.reason) || undefined,
                rawLine: normalizeText(item.rawLine) || undefined,
                sourceLineIndex: typeof item.sourceLineIndex === "number" ? item.sourceLineIndex : null,
                candidateBasis: Array.isArray(item.candidateBasis)
                  ? item.candidateBasis.filter((entry): entry is string => typeof entry === "string")
                  : undefined
              }))
          : []
      }
    : null;

  return { authSummary, infoSummary, preview };
}

export function normalizeRecommendationSettings(value: unknown): RecommendationSettings {
  const parsed = isPlainObject(value) ? value : {};
  const scoreThreshold =
    typeof parsed.scoreThreshold === "number" && Number.isFinite(parsed.scoreThreshold)
      ? Math.max(0, Math.min(1, parsed.scoreThreshold))
      : DEFAULT_RECOMMENDATION_SETTINGS.scoreThreshold;

  return {
    ...DEFAULT_RECOMMENDATION_SETTINGS,
    enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : DEFAULT_RECOMMENDATION_SETTINGS.enabled,
    modelId: normalizeText(parsed.modelId) || DEFAULT_RECOMMENDATION_SETTINGS.modelId,
    runtimePreference:
      parsed.runtimePreference === "transformers-js-local" || parsed.runtimePreference === "lexical-fallback"
        ? parsed.runtimePreference
        : DEFAULT_RECOMMENDATION_SETTINGS.runtimePreference,
    localModelPath: normalizeText(parsed.localModelPath),
    cacheDir: normalizeText(parsed.cacheDir),
    scoreThreshold
  };
}

export function loadAuthBundleSettingsSnapshot(): AuthBundleSettingsSnapshot | null {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(AUTH_BUNDLE_SETTINGS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!isPlainObject(parsed)) return null;
    const provider = normalizeText(parsed.provider);
    const host = normalizeText(parsed.host);
    const updatedAt = normalizeText(parsed.updatedAt);
    if (!provider) return null;
    return {
      provider,
      host,
      updatedAt,
      bridgeSummary: normalizeBridgeSummary(parsed.bridgeSummary)
    };
  } catch (_error) {
    return null;
  }
}

export function saveAuthBundleSettingsSnapshot(snapshot: AuthBundleSettingsSnapshot) {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(
      AUTH_BUNDLE_SETTINGS_KEY,
      JSON.stringify({
        provider: normalizeText(snapshot.provider),
        host: normalizeText(snapshot.host),
        updatedAt: normalizeText(snapshot.updatedAt),
        bridgeSummary: normalizeBridgeSummary(snapshot.bridgeSummary)
      })
    );
  } catch (_error) {
    return;
  }
}

export function loadRecommendationSettings(): RecommendationSettings {
  if (typeof window === "undefined" || !window.localStorage) return { ...DEFAULT_RECOMMENDATION_SETTINGS };
  try {
    const raw = window.localStorage.getItem(RECOMMENDATION_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_RECOMMENDATION_SETTINGS };
    const parsed = JSON.parse(raw);
    return normalizeRecommendationSettings(parsed);
  } catch (_error) {
    return { ...DEFAULT_RECOMMENDATION_SETTINGS };
  }
}

export function saveRecommendationSettings(settings: RecommendationSettings) {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(RECOMMENDATION_SETTINGS_KEY, JSON.stringify(normalizeRecommendationSettings(settings)));
  } catch (_error) {
    return;
  }
}
