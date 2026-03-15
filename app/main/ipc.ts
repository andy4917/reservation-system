import { ipcMain } from "electron";
import type { ProviderType } from "../contracts/index.js";
import type {
  DeleteBindingDecisionRequest,
  DeleteManualScanAnchorsRequest,
  FetchSheetSnapshotRequest,
  FetchProviderRowsRequest,
  FetchReservationsRequest,
  FetchWingsLiveContractRequest,
  LoadBindingDecisionsRequest,
  LoadManualScanAnchorsRequest,
  ProviderInventoryCompareRow,
  ProviderReservationRow,
  SaveManualScanAnchorsRequest,
  SaveBindingDecisionRequest
} from "../contracts/index.js";
import {
  getBridgePort,
  getBridgeRuntimeStatus,
  getLatestBridgeContext,
  getLatestBridgeSummary,
  getProviderRowsFromBridge
} from "./bridgeServer.js";
import { fetchWingsLiveContract, fetchWingsReservations, getWingsRuntimeDiagnostics } from "./wingsRuntime.js";
import { deleteBindingDecision, loadBindingDecisions, saveBindingDecision } from "./bindingStore.js";
import { deleteManualScanAnchor, loadManualScanAnchor, saveManualScanAnchor } from "./scanAnchorStore.js";
import { getSheetArtifactVisibleSlice, storeSheetRunArtifact } from "./runArtifactStore.js";
import { fetchSheetSnapshot } from "./sheetRuntime.js";
import { fetchProviderRowsLive, getProviderRuntimeDiagnostics } from "./providerRuntime.js";
import { captureWingsSession, openWingsLoginWindow } from "./wingsSession.js";

function normalizeProviderType(value: string | undefined): ProviderType | null {
  if (value === "naver-partner" || value === "admin-station" || value === "wings-pms") {
    return value;
  }
  return null;
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

  ipcMain.handle("desktop:load-binding-decisions", async (_event, request: LoadBindingDecisionsRequest) => ({
    ok: true,
    decisions: await loadBindingDecisions({
      branch: typeof request?.branch === "string" ? request.branch : "",
      sheetRef: {
        spreadsheetId: typeof request?.sheetRef?.spreadsheetId === "string" ? request.sheetRef.spreadsheetId : "",
        sheetName: typeof request?.sheetRef?.sheetName === "string" ? request.sheetRef.sheetName : "",
        sheetId: typeof request?.sheetRef?.sheetId === "string" ? request.sheetRef.sheetId : null,
        timezone: typeof request?.sheetRef?.timezone === "string" ? request.sheetRef.timezone : null
      }
    })
  }));

  ipcMain.handle("desktop:save-binding-decision", async (_event, request: SaveBindingDecisionRequest) => ({
    ok: true,
    decision: await saveBindingDecision((() => {
      if (!request?.decision) {
        throw new Error("Missing binding decision payload.");
      }
      return request.decision;
    })())
  }));

  ipcMain.handle("desktop:delete-binding-decision", async (_event, request: DeleteBindingDecisionRequest) => ({
    ok: true,
    deleted: await deleteBindingDecision(typeof request?.decisionKey === "string" ? request.decisionKey : "")
  }));

  ipcMain.handle("desktop:load-manual-scan-anchor", async (_event, request: LoadManualScanAnchorsRequest) => ({
    ok: true,
    anchor: await loadManualScanAnchor({
      branch: typeof request?.branch === "string" ? request.branch : "",
      sheetRef: {
        spreadsheetId: typeof request?.sheetRef?.spreadsheetId === "string" ? request.sheetRef.spreadsheetId : "",
        sheetName: typeof request?.sheetRef?.sheetName === "string" ? request.sheetRef.sheetName : "",
        sheetId: typeof request?.sheetRef?.sheetId === "string" ? request.sheetRef.sheetId : null,
        timezone: typeof request?.sheetRef?.timezone === "string" ? request.sheetRef.timezone : null
      }
    })
  }));

  ipcMain.handle("desktop:save-manual-scan-anchor", async (_event, request: SaveManualScanAnchorsRequest) => ({
    ok: true,
    anchor: await saveManualScanAnchor((() => {
      if (!request?.sheetRef || !request?.scan) {
        throw new Error("Missing manual scan anchor payload.");
      }
      return {
        branch: typeof request.branch === "string" ? request.branch : "",
        sheetRef: {
          spreadsheetId: typeof request.sheetRef.spreadsheetId === "string" ? request.sheetRef.spreadsheetId : "",
          sheetName: typeof request.sheetRef.sheetName === "string" ? request.sheetRef.sheetName : "",
          sheetId: typeof request.sheetRef.sheetId === "string" ? request.sheetRef.sheetId : null,
          timezone: typeof request.sheetRef.timezone === "string" ? request.sheetRef.timezone : null
        },
        scan: request.scan
      };
    })())
  }));

  ipcMain.handle("desktop:delete-manual-scan-anchor", async (_event, request: DeleteManualScanAnchorsRequest) => ({
    ok: true,
    deleted: await deleteManualScanAnchor({
      branch: typeof request?.branch === "string" ? request.branch : "",
      sheetRef: {
        spreadsheetId: typeof request?.sheetRef?.spreadsheetId === "string" ? request.sheetRef.spreadsheetId : "",
        sheetName: typeof request?.sheetRef?.sheetName === "string" ? request.sheetRef.sheetName : "",
        sheetId: typeof request?.sheetRef?.sheetId === "string" ? request.sheetRef.sheetId : null,
        timezone: typeof request?.sheetRef?.timezone === "string" ? request.sheetRef.timezone : null
      }
    })
  }));

  ipcMain.handle("desktop:fetch-sheet-snapshot", async (_event, request: FetchSheetSnapshotRequest) => {
    const result = await fetchSheetSnapshot(request.query);
    const artifact = storeSheetRunArtifact({
      source: result.source,
      error: typeof result.error === "string" ? result.error : "",
      summary: result.summary,
      snapshot: result.snapshot
    });
    return {
      ok: true,
      payload: {
        runId: artifact.runId,
        summary: artifact.summary,
        visibleSlice: getSheetArtifactVisibleSlice(artifact.runId)
      },
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
        return {
          ok: true,
          provider: request.provider,
          payload: [],
          usedDomFallback: false,
          source: diagnostics.source
        };
      }
    }

    return {
      ok: true,
      provider: request.provider,
      payload: [],
      usedDomFallback: false,
      source: "unsupported-provider"
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
}
