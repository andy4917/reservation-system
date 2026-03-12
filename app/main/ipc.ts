import { ipcMain } from "electron";
import type { ProviderType } from "../contracts";
import type {
  FetchSheetSnapshotRequest,
  FetchProviderRowsRequest,
  FetchReservationsRequest,
  FetchWingsLiveContractRequest,
  ProviderInventoryCompareRow,
  ProviderReservationRow
} from "../contracts";
import type { RecommendationScoreRequest, RecommendationSettings } from "../contracts";
import { getBridgePort, getBridgeRuntimeStatus, getLatestBridgeContext, getLatestBridgeSummary, getProviderRowsFromBridge } from "./bridgeServer";
import {
  getRecommendationRuntimeDiagnostics,
  getRecommendationRuntimeStatus,
  sampleRecommendationEmbed,
  scoreRecommendationCandidates,
  warmRecommendationRuntime
} from "./recommendationRuntime";
import { fetchWingsLiveContract, fetchWingsReservations, getWingsRuntimeDiagnostics } from "./wingsRuntime";
import { fetchSheetSnapshot } from "./sheetRuntime";
import { fetchProviderRowsLive, getProviderRuntimeDiagnostics } from "./providerRuntime";
import { captureWingsSession, openWingsLoginWindow } from "./wingsSession";

function normalizeProviderType(value: string | undefined): ProviderType | null {
  if (value === "naver-partner" || value === "admin-station" || value === "wings-pms") {
    return value;
  }
  return null;
}

function normalizeBridgeRow(
  value: unknown,
  index: number
): (ProviderInventoryCompareRow & { provider?: ProviderType | null }) | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const provider = normalizeProviderType(typeof row.provider === "string" ? row.provider : undefined);
  const branch = typeof row.branch === "string" ? row.branch.trim() : undefined;
  const date = typeof row.date === "string" ? row.date.trim() : "";
  const roomType = typeof row.roomType === "string" ? row.roomType.trim() : "";
  const channel = typeof row.channel === "string" ? row.channel.trim() : "";
  const siteRaw = typeof row.siteRaw === "string" ? row.siteRaw.trim() : "";
  const sheetRaw = typeof row.sheetRaw === "string" ? row.sheetRaw.trim() : "";
  const diff = typeof row.diff === "string" ? row.diff.trim() : undefined;
  const status =
    row.status === "match" || row.status === "mismatch" || row.status === "warning" ? row.status : undefined;
  const reason = typeof row.reason === "string" ? row.reason.trim() : undefined;
  const action = typeof row.action === "string" ? row.action.trim() : undefined;
  if (!date || !roomType || !channel || !siteRaw || !sheetRaw) return null;
  return {
    provider: provider || undefined,
    branch,
    date,
    roomType,
    channel,
    siteRaw,
    sheetRaw,
    diff,
    status,
    reason,
    action
  };
}

function parseBridgeRowsEnv() {
  const raw = process.env.UHS_BRIDGE_PROVIDER_ROWS_JSON?.trim();
  if (!raw) return [] as Array<ProviderInventoryCompareRow & { provider?: ProviderType | null }>;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item, index) => normalizeBridgeRow(item, index))
      .filter((item): item is ProviderInventoryCompareRow & { provider?: ProviderType | null } => Boolean(item));
  } catch (_error) {
    return [];
  }
}

export function registerAppIpc() {
  ipcMain.handle("desktop:ping", async () => ({
    ok: true,
    runtime: "electron-main",
    ts: new Date().toISOString()
  }));

  ipcMain.handle("desktop:get-context", async () => {
    const liveContext = getLatestBridgeContext();
    const provider = liveContext.provider || normalizeProviderType(process.env.UHS_BRIDGE_PROVIDER);
    const host = liveContext.host || null;
    const url = liveContext.url || null;

    return {
      ok: true,
      provider,
      host,
      url,
      sessionAvailable: Boolean(provider && host)
    };
  });

  ipcMain.handle("desktop:fetch-sheet-snapshot", async (_event, request: FetchSheetSnapshotRequest) => {
    const result = await fetchSheetSnapshot(request.query);
    return {
      ok: true,
      payload: result.summary,
      source: result.source,
      error: typeof result.error === "string" ? result.error : ""
    };
  });

  ipcMain.handle("desktop:fetch-provider-rows", async (_event, request: FetchProviderRowsRequest) => {
    if (request.provider === "naver-partner" || request.provider === "admin-station") {
      try {
        const live = await fetchProviderRowsLive(request.provider, request.query);
        const payload = live.rows.map((row) => ({
          provider: request.provider,
          ...row
        })) as ProviderInventoryCompareRow[];
        return {
          ok: true,
          provider: request.provider,
          payload,
          usedDomFallback: false,
          source: live.source
        };
      } catch (_error) {
        const diagnostics = getProviderRuntimeDiagnostics();
        const bridgePayload = getProviderRowsFromBridge(request.provider, request.query);
        const envPayload =
          bridgePayload.length > 0
            ? bridgePayload
            : parseBridgeRowsEnv()
                .filter((row) => !row.provider || row.provider === request.provider)
                .filter((row) => (!request?.query?.startDate || row.date >= request.query.startDate) && (!request?.query?.endDate || row.date <= request.query.endDate))
                .map(({ provider: _provider, ...row }) => row);

        return {
          ok: true,
          provider: request.provider,
          payload: envPayload,
          usedDomFallback: bridgePayload.length > 0,
          source: bridgePayload.length > 0 ? "bridge-dom-fallback" : diagnostics.source
        };
      }
    }

    const bridgePayload = getProviderRowsFromBridge(request.provider, request.query);
    const envPayload =
      bridgePayload.length > 0
        ? bridgePayload
        : parseBridgeRowsEnv()
            .filter((row) => !row.provider || row.provider === request.provider)
            .filter((row) => (!request?.query?.startDate || row.date >= request.query.startDate) && (!request?.query?.endDate || row.date <= request.query.endDate))
            .map(({ provider: _provider, ...row }) => row);

    return {
      ok: true,
      provider: request.provider,
      payload: envPayload,
      usedDomFallback: bridgePayload.length > 0,
      source: bridgePayload.length > 0 ? "bridge-dom-fallback" : "unsupported-provider"
    };
  });

  ipcMain.handle("desktop:fetch-provider-reservations", async (_event, request: FetchReservationsRequest) => {
    if (request.provider !== "wings-pms") {
      return {
        ok: true,
        provider: request.provider,
        payload: [] as ProviderReservationRow[],
        usedDomFallback: false,
        source: "unsupported-provider"
      };
    }

    const result = await fetchWingsReservations(request.query);
    return {
      ok: true,
      provider: request.provider,
      payload: Array.isArray(result.records) ? (result.records as ProviderReservationRow[]) : [],
      usedDomFallback: false,
      source: typeof result.source === "string" ? result.source : "unknown",
      endpointCapability: typeof result.endpointCapability === "string" ? result.endpointCapability : "",
      profilesFetched: Array.isArray(result.profilesFetched) ? result.profilesFetched : []
    };
  });

  ipcMain.handle("desktop:open-wings-login", async () => openWingsLoginWindow());
  ipcMain.handle("desktop:capture-wings-session", async () => captureWingsSession());

  ipcMain.handle("desktop:fetch-wings-live-contract", async (_event, request: FetchWingsLiveContractRequest) => {
    const runtime = getWingsRuntimeDiagnostics();
    if (request.provider !== "wings-pms") {
      return {
        ok: true,
        provider: "wings-pms" as const,
        capability: request.capability,
        payload: [],
        usedDomFallback: false,
        source: "unsupported-provider"
      };
    }

    const result = await fetchWingsLiveContract({
      capability: request.capability,
      ...(request.request || {})
    });
    const payload = Array.isArray(result.records) && result.records.length > 0
      ? result.records
      : Array.isArray(result.items)
        ? result.items
        : [];

    return {
      ok: true,
      provider: "wings-pms" as const,
      capability: request.capability,
      payload,
      usedDomFallback: false,
      source: typeof result.source === "string" ? result.source : runtime.source,
      endpointCapability:
        typeof result.endpointCapability === "string" && result.endpointCapability
          ? result.endpointCapability
          : request.capability,
      profilesFetched: Array.isArray(result.profilesFetched) ? result.profilesFetched : []
    };
  });

  ipcMain.handle("desktop:get-bridge-meta", async () => ({
    ok: true,
    port: getBridgePort()
  }));

  ipcMain.handle("desktop:get-bridge-runtime", async () => getBridgeRuntimeStatus());

  ipcMain.handle("desktop:get-bridge-summary", async (_event, provider?: ProviderType | null) => ({
    ok: true,
    ...getLatestBridgeSummary(provider)
  }));

  ipcMain.handle("desktop:get-recommendation-runtime", async (_event, settings?: RecommendationSettings) =>
    getRecommendationRuntimeStatus(settings)
  );

  ipcMain.handle("desktop:get-recommendation-runtime-diagnostics", async (_event, settings?: RecommendationSettings) =>
    getRecommendationRuntimeDiagnostics(settings)
  );

  ipcMain.handle("desktop:warm-recommendation-runtime", async (_event, settings?: RecommendationSettings) =>
    warmRecommendationRuntime(settings)
  );

  ipcMain.handle("desktop:sample-recommendation-embed", async (_event, settings?: RecommendationSettings, text?: string) =>
    sampleRecommendationEmbed(settings, text)
  );

  ipcMain.handle("desktop:score-recommendation-candidates", async (_event, request: RecommendationScoreRequest) =>
    scoreRecommendationCandidates(request)
  );
}
