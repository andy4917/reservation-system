import type {
  BridgeContextResponse,
  BridgePingResponse,
  FetchProviderRowsRequest,
  FetchProviderRowsResponse,
  ProviderInventoryCompareRow,
  RecommendationScoreRequest,
  RecommendationScoreResponse,
  RecommendationSampleEmbedResult,
  BridgeRuntimeStatus,
  RecommendationRuntimeDiagnostics,
  RecommendationRuntimeStatus,
  RecommendationSettings
} from "../contracts/index.js";

declare global {
  interface Window {
    desktopBridge?: {
      ping: () => Promise<{ ok: true; runtime: string; ts: string }>;
      getContext: () => Promise<BridgeContextResponse>;
      fetchProviderRows: (
        request: FetchProviderRowsRequest
      ) => Promise<FetchProviderRowsResponse<ProviderInventoryCompareRow>>;
      getBridgeMeta: () => Promise<{ ok: true; port: number }>;
      getBridgeRuntime: () => Promise<BridgeRuntimeStatus>;
      getBridgeSummary: (
        provider?: string | null
      ) => Promise<{
        ok: true;
        authSummary: {
          cookieCount: number;
          domains: string[];
          hasBearer: boolean;
          hasCsrf: boolean;
          hasRole: boolean;
        } | null;
        infoSummary: {
          count: number;
          channels: string[];
          dates: string[];
        } | null;
        preview: {
          title: string | null;
          url: string | null;
          updatedAt: string;
          bodyTextSample: string;
          rows: Array<{
            date: string;
            roomType: string;
            channel: string;
            reason?: string;
            rawLine?: string;
            sourceLineIndex?: number | null;
            candidateBasis?: string[];
          }>;
        } | null;
      }>;
      getRecommendationRuntime: (settings?: RecommendationSettings) => Promise<RecommendationRuntimeStatus>;
      getRecommendationRuntimeDiagnostics: (settings?: RecommendationSettings) => Promise<RecommendationRuntimeDiagnostics>;
      warmRecommendationRuntime: (settings?: RecommendationSettings) => Promise<RecommendationRuntimeDiagnostics>;
      sampleRecommendationEmbed: (settings?: RecommendationSettings, text?: string) => Promise<RecommendationSampleEmbedResult>;
      scoreRecommendationCandidates: (
        request: RecommendationScoreRequest
      ) => Promise<RecommendationScoreResponse>;
    };
  }
}

export async function pingDesktopRuntime(): Promise<BridgePingResponse | null> {
  if (!window.desktopBridge?.ping) return null;
  const result = await window.desktopBridge.ping();
  return {
    ok: true,
    connected: result.ok === true,
    bridgeVersion: `${result.runtime}@${result.ts}`
  };
}

export async function getBridgeContext(): Promise<BridgeContextResponse> {
  if (window.desktopBridge?.getContext) {
    return window.desktopBridge.getContext();
  }

  return {
    ok: true,
    provider: null,
    host: null,
    url: null,
    sessionAvailable: false
  };
}

export async function fetchProviderRows(
  request: FetchProviderRowsRequest
): Promise<FetchProviderRowsResponse<ProviderInventoryCompareRow>> {
  if (window.desktopBridge?.fetchProviderRows) {
    return window.desktopBridge.fetchProviderRows(request);
  }

  return {
    ok: true,
    provider: request.provider,
    payload: [],
    usedDomFallback: false
  };
}

export async function getBridgeMeta(): Promise<{ ok: true; port: number } | null> {
  if (!window.desktopBridge?.getBridgeMeta) return null;
  return window.desktopBridge.getBridgeMeta();
}

export async function getBridgeRuntime(): Promise<BridgeRuntimeStatus | null> {
  if (!window.desktopBridge?.getBridgeRuntime) return null;
  return window.desktopBridge.getBridgeRuntime();
}

export async function getBridgeSummary(provider?: string | null) {
  if (!window.desktopBridge?.getBridgeSummary) return null;
  return window.desktopBridge.getBridgeSummary(provider);
}

export async function getRecommendationRuntime(settings?: RecommendationSettings): Promise<RecommendationRuntimeStatus | null> {
  if (!window.desktopBridge?.getRecommendationRuntime) return null;
  return window.desktopBridge.getRecommendationRuntime(settings);
}

export async function getRecommendationRuntimeDiagnostics(
  settings?: RecommendationSettings
): Promise<RecommendationRuntimeDiagnostics | null> {
  if (!window.desktopBridge?.getRecommendationRuntimeDiagnostics) return null;
  return window.desktopBridge.getRecommendationRuntimeDiagnostics(settings);
}

export async function warmRecommendationRuntime(
  settings?: RecommendationSettings
): Promise<RecommendationRuntimeDiagnostics | null> {
  if (!window.desktopBridge?.warmRecommendationRuntime) return null;
  return window.desktopBridge.warmRecommendationRuntime(settings);
}

export async function sampleRecommendationEmbed(
  settings?: RecommendationSettings,
  text?: string
): Promise<RecommendationSampleEmbedResult | null> {
  if (!window.desktopBridge?.sampleRecommendationEmbed) return null;
  return window.desktopBridge.sampleRecommendationEmbed(settings, text);
}

export async function scoreRecommendationCandidates(
  request: RecommendationScoreRequest
): Promise<RecommendationScoreResponse | null> {
  if (!window.desktopBridge?.scoreRecommendationCandidates) return null;
  return window.desktopBridge.scoreRecommendationCandidates(request);
}
