import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { BrowserWindow, clipboard, dialog, ipcMain } from "electron";
import type { ProviderType } from "../contracts/index.js";
import type {
  DeleteBindingDecisionRequest,
  DeleteManualScanAnchorsRequest,
  FetchLiveReadBundleRequest,
  FetchSheetSnapshotRequest,
  FetchProviderRowsRequest,
  FetchReservationsRequest,
  FetchWingsLiveContractRequest,
  LoadBindingDecisionsRequest,
  LoadRecommendationTracesRequest,
  LoadManualScanAnchorsRequest,
  BuildOperatorExportRequest,
  ExportOperatorHandoffRequest,
  RepeatOperatorHandoffRequest,
  UpdateOperatorHandoffStatusRequest,
  ProviderInventoryCompareRow,
  ProviderReservationRow,
  SaveRecommendationTraceRequest,
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
import { loadOperatorHandoffById, saveOperatorHandoffHistory, updateOperatorHandoffStatus } from "./operatorHandoffStore.js";
import { loadRecommendationTraces, saveRecommendationTrace } from "./recommendationStore.js";
import { deleteManualScanAnchor, loadManualScanAnchor, saveManualScanAnchor } from "./scanAnchorStore.js";
import { getSheetArtifactVisibleSlice, storeSheetRunArtifact } from "./runArtifactStore.js";
import { fetchSheetSnapshot } from "./sheetRuntime.js";
import { fetchProviderRowsLive, getProviderRuntimeDiagnostics } from "./providerRuntime.js";
import { fetchLiveReadBundle } from "./liveReadRuntime.js";
import { applyMappingAutoBindings } from "./mappingAutoBindingRuntime.js";
import { enrichMappingArtifactsWithTruthData } from "./mappingTruthRuntime.js";
import { captureWingsSession, openWingsLoginWindow } from "./wingsSession.js";
import { buildGeneratedBindingDraftFromSnapshot } from "../services/bindingArtifacts.js";
import { indexWorkspaceSearch, queryWorkspaceSearch } from "./searchRuntime.js";
import { buildOperatorExport, resolveOperatorExportHandoffPayload } from "./operatorExportRuntime.js";

function normalizeBranch(value: unknown) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

function filterRowsByBranch<T extends { branch?: string }>(rows: T[], branch: string) {
  const normalizedBranch = normalizeBranch(branch);
  if (!normalizedBranch) return rows;
  return rows.filter((row) => {
    const rowBranch = normalizeBranch(row?.branch);
    return rowBranch === normalizedBranch;
  });
}

function buildSheetSnapshotBridgeResponse(
  result: {
    source?: string;
    error?: string;
    summary: Awaited<ReturnType<typeof fetchSheetSnapshot>>["summary"] | null;
    snapshot: Awaited<ReturnType<typeof fetchSheetSnapshot>>["snapshot"] | null;
  },
  branch: string,
  providerReservations: ProviderReservationRow[] = []
) {
  const bindingDraft = buildGeneratedBindingDraftFromSnapshot(result.snapshot, result.summary, branch);
  const autoBoundMappingArtifacts = applyMappingAutoBindings({
    mappingArtifacts: bindingDraft.mappingArtifacts,
    snapshot: result.snapshot,
    summary: result.summary,
    providerReservations
  });
  const mappingArtifacts = enrichMappingArtifactsWithTruthData(autoBoundMappingArtifacts);
  const artifact = storeSheetRunArtifact({
    source: typeof result.source === "string" ? result.source : "",
    error: typeof result.error === "string" ? result.error : "",
    summary: result.summary,
    snapshot: result.snapshot,
    mappingArtifacts
  });
  return {
    ok: true as const,
    payload: {
      runId: artifact.runId,
      summary: artifact.summary,
      visibleSlice: getSheetArtifactVisibleSlice(artifact.runId),
      mappingArtifacts: artifact.mappingArtifacts
    },
    source: typeof result.source === "string" ? result.source : "",
    error: typeof result.error === "string" ? result.error : ""
  };
}

function classifyOperatorHandoffImpact(bundle: NonNullable<Awaited<ReturnType<typeof buildOperatorExport>>>) {
  const reasons: string[] = [];
  const hasOperationalImpact = bundle.verifyEvidence.classification === "live-success";
  const hasImplementationImpact =
    bundle.verifyEvidence.classification !== "live-success" || bundle.metrics.unresolvedCount > 0 || bundle.metrics.triageCoverage < 1;

  if (bundle.verifyEvidence.classification !== "live-success") reasons.push("verify-not-live-success");
  if (bundle.metrics.unresolvedCount > 0) reasons.push("unresolved-bindings-present");
  if (bundle.metrics.triageCoverage < 1) reasons.push("triage-incomplete");
  if (bundle.verifyEvidence.classification === "live-success") reasons.push("live-verified-delivery");

  return {
    impactScope: hasOperationalImpact && hasImplementationImpact ? "mixed" : hasOperationalImpact ? "operations" : "implementation",
    impactReasons: reasons
  } as const;
}

function normalizeProviderType(value: string | undefined): ProviderType | null {
  if (value === "naver-partner" || value === "admin-station" || value === "wings-pms") {
    return value;
  }
  return null;
}

async function exportOperatorHandoff(event: Electron.IpcMainInvokeEvent, request: ExportOperatorHandoffRequest) {
  const bundle = await buildOperatorExport({
    runId: typeof request?.runId === "string" ? request.runId : "",
    branch: typeof request?.branch === "string" ? request.branch : ""
  });
  if (!bundle) {
    return {
      ok: true,
      exported: false,
      target: request?.target === "file" ? "file" : "clipboard",
      format: request?.format === "json" || request?.format === "csv" ? request.format : "copy-text",
      filePath: null,
      fileName: null,
      bytes: 0
    };
  }
  const format = request?.format === "json" || request?.format === "csv" ? request.format : "copy-text";
  const payload = resolveOperatorExportHandoffPayload(bundle, format);
  const impact = classifyOperatorHandoffImpact(bundle);
  if (!payload) {
    return {
      ok: true,
      exported: false,
      target: request?.target === "file" ? "file" : "clipboard",
      format,
      filePath: null,
      fileName: null,
      bytes: 0
    };
  }
  if (request?.target === "file") {
    const ownerWindow = BrowserWindow.fromWebContents(event.sender);
    const dialogOptions = {
      defaultPath: path.join(os.homedir(), "Downloads", payload.fileName),
      filters: [
        {
          name: format === "json" ? "JSON" : format === "csv" ? "CSV" : "Text",
          extensions: [payload.fileName.split(".").pop() || "txt"]
        }
      ]
    };
    const saveResult = ownerWindow
      ? await dialog.showSaveDialog(ownerWindow, dialogOptions)
      : await dialog.showSaveDialog(dialogOptions);
    if (saveResult.canceled || !saveResult.filePath) {
      return {
        ok: true,
        exported: false,
        target: "file" as const,
        format,
        filePath: null,
        fileName: payload.fileName,
        bytes: 0
      };
    }
    await fs.writeFile(saveResult.filePath, payload.content, "utf8");
    await saveOperatorHandoffHistory({
      runId: bundle.runId,
      branch: bundle.branch,
      sheetRef: bundle.sheetRef,
      target: "file",
      format,
      fileName: path.basename(saveResult.filePath),
      filePath: saveResult.filePath,
      bytes: Buffer.byteLength(payload.content, "utf8"),
      verifyClassification: bundle.verifyEvidence.classification,
      source: bundle.verifyEvidence.source,
      startDate: bundle.dateRange.startDate,
      endDate: bundle.dateRange.endDate,
      evidenceLineage: bundle.evidenceLineage,
      impactScope: impact.impactScope,
      impactReasons: impact.impactReasons,
      payload
    });
    return {
      ok: true,
      exported: true,
      target: "file" as const,
      format,
      filePath: saveResult.filePath,
      fileName: path.basename(saveResult.filePath),
      bytes: Buffer.byteLength(payload.content, "utf8")
    };
  }

  clipboard.writeText(payload.content);
  await saveOperatorHandoffHistory({
    runId: bundle.runId,
    branch: bundle.branch,
    sheetRef: bundle.sheetRef,
    target: "clipboard",
    format,
    fileName: payload.fileName,
    filePath: null,
    bytes: Buffer.byteLength(payload.content, "utf8"),
    verifyClassification: bundle.verifyEvidence.classification,
    source: bundle.verifyEvidence.source,
    startDate: bundle.dateRange.startDate,
    endDate: bundle.dateRange.endDate,
    evidenceLineage: bundle.evidenceLineage,
    impactScope: impact.impactScope,
    impactReasons: impact.impactReasons,
    payload
  });
  return {
    ok: true,
    exported: true,
    target: "clipboard" as const,
    format,
    filePath: null,
    fileName: payload.fileName,
    bytes: Buffer.byteLength(payload.content, "utf8")
  };
}

async function repeatOperatorHandoff(event: Electron.IpcMainInvokeEvent, request: RepeatOperatorHandoffRequest) {
  const handoff = await loadOperatorHandoffById(typeof request?.handoffId === "string" ? request.handoffId : "");
  if (!handoff) {
    return {
      ok: true,
      repeated: false,
      handoff: null,
      filePath: null
    };
  }
  if (request?.target === "file") {
    const ownerWindow = BrowserWindow.fromWebContents(event.sender);
    const dialogOptions = {
      defaultPath: path.join(os.homedir(), "Downloads", handoff.payload.fileName),
      filters: [
        {
          name: handoff.payload.format === "json" ? "JSON" : handoff.payload.format === "csv" ? "CSV" : "Text",
          extensions: [handoff.payload.fileName.split(".").pop() || "txt"]
        }
      ]
    };
    const saveResult = ownerWindow
      ? await dialog.showSaveDialog(ownerWindow, dialogOptions)
      : await dialog.showSaveDialog(dialogOptions);
    if (saveResult.canceled || !saveResult.filePath) {
      return {
        ok: true,
        repeated: false,
        handoff: null,
        filePath: null
      };
    }
    await fs.writeFile(saveResult.filePath, handoff.payload.content, "utf8");
    const repeated = await saveOperatorHandoffHistory({
      runId: handoff.runId,
      branch: handoff.branch,
      sheetRef: handoff.sheetRef,
      target: "file",
      format: handoff.format,
      fileName: path.basename(saveResult.filePath),
      filePath: saveResult.filePath,
      bytes: Buffer.byteLength(handoff.payload.content, "utf8"),
      verifyClassification: handoff.verifyClassification,
      source: handoff.source,
      startDate: handoff.startDate,
      endDate: handoff.endDate,
      evidenceLineage: handoff.evidenceLineage,
      impactScope: handoff.impactScope,
      impactReasons: handoff.impactReasons,
      payload: {
        ...handoff.payload,
        fileName: path.basename(saveResult.filePath)
      },
      repeatedFromHandoffId: handoff.handoffId
    });
    return {
      ok: true,
      repeated: true,
      handoff: repeated,
      filePath: saveResult.filePath
    };
  }

  clipboard.writeText(handoff.payload.content);
  const repeated = await saveOperatorHandoffHistory({
    runId: handoff.runId,
    branch: handoff.branch,
    sheetRef: handoff.sheetRef,
    target: "clipboard",
    format: handoff.format,
    fileName: handoff.payload.fileName,
    filePath: null,
    bytes: Buffer.byteLength(handoff.payload.content, "utf8"),
    verifyClassification: handoff.verifyClassification,
    source: handoff.source,
    startDate: handoff.startDate,
    endDate: handoff.endDate,
    evidenceLineage: handoff.evidenceLineage,
    impactScope: handoff.impactScope,
    impactReasons: handoff.impactReasons,
    payload: handoff.payload,
    repeatedFromHandoffId: handoff.handoffId
  });
  return {
    ok: true,
    repeated: true,
    handoff: repeated,
    filePath: null
  };
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

  ipcMain.handle("desktop:load-recommendation-traces", async (_event, request: LoadRecommendationTracesRequest) => ({
    ok: true,
    traces: await loadRecommendationTraces({
      branch: typeof request?.branch === "string" ? request.branch : "",
      sheetRef: {
        spreadsheetId: typeof request?.sheetRef?.spreadsheetId === "string" ? request.sheetRef.spreadsheetId : "",
        sheetName: typeof request?.sheetRef?.sheetName === "string" ? request.sheetRef.sheetName : "",
        sheetId: typeof request?.sheetRef?.sheetId === "string" ? request.sheetRef.sheetId : null,
        timezone: typeof request?.sheetRef?.timezone === "string" ? request.sheetRef.timezone : null
      }
    })
  }));

  ipcMain.handle("desktop:save-recommendation-trace", async (_event, request: SaveRecommendationTraceRequest) => ({
    ok: true,
    trace: await saveRecommendationTrace((() => {
      if (!request?.trace) {
        throw new Error("Missing recommendation trace payload.");
      }
      return request.trace;
    })())
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
    return buildSheetSnapshotBridgeResponse(result, typeof request?.query?.branch === "string" ? request.query.branch : "");
  });

  ipcMain.handle("desktop:fetch-live-read-bundle", async (_event, request: FetchLiveReadBundleRequest) => {
    const context = {
      runId: typeof request?.context?.runId === "string" ? request.context.runId : "",
      branch: typeof request?.context?.branch === "string" ? request.context.branch : "",
      startDate: typeof request?.context?.startDate === "string" ? request.context.startDate : "",
      endDate: typeof request?.context?.endDate === "string" ? request.context.endDate : "",
      requestedAt:
        typeof request?.context?.requestedAt === "string" && request.context.requestedAt
          ? request.context.requestedAt
          : new Date().toISOString(),
      runtimeMode: typeof request?.context?.runtimeMode === "string" ? request.context.runtimeMode : undefined,
      sourceProvider: typeof request?.context?.sourceProvider === "string" ? request.context.sourceProvider : null
    };
    const bundle = await fetchLiveReadBundle(context);
    const sheet = buildSheetSnapshotBridgeResponse(
      {
        source: bundle.sheet.source,
        error: bundle.sheet.error,
        summary: bundle.sheet.summary,
        snapshot: bundle.sheet.snapshot
      },
      context.branch,
      bundle.wingsReservations.rows
    );
    return {
      ok: true,
      payload: {
        context,
        sheet,
        providerRows: {
          "naver-partner": {
            ok: true,
            provider: "naver-partner" as const,
            payload: bundle.providerRows["naver-partner"].rows,
            usedDomFallback: false,
            source: bundle.providerRows["naver-partner"].source
          },
          "admin-station": {
            ok: true,
            provider: "admin-station" as const,
            payload: bundle.providerRows["admin-station"].rows,
            usedDomFallback: false,
            source: bundle.providerRows["admin-station"].source
          }
        },
        reservations: {
          ok: true,
          provider: "wings-pms" as const,
          payload: bundle.wingsReservations.rows,
          usedDomFallback: false,
          source: bundle.wingsReservations.source,
          endpointCapability: bundle.wingsReservations.endpointCapability
        },
        coverage: {
          runId: context.runId,
          branch: context.branch,
          startDate: context.startDate,
          endDate: context.endDate,
          requestedAt: context.requestedAt,
          overallStatus:
            bundle.bundleSupportLevel === "read-live"
              ? "read-live"
              : bundle.bundleSupportLevel === "partial-live"
                ? "partial-live"
                : "offline-preview",
          sources: {
            sheet: {
              provider: "sheet",
              status:
                bundle.sheet.source === "sheet-api"
                  ? "read-live"
                  : bundle.sheet.source === "sheet-unconfigured"
                    ? "unconfigured"
                    : bundle.sheet.error
                      ? "error"
                      : "partial-live",
              source: bundle.sheet.source,
              rowCount: sheet.payload.mappingArtifacts.length,
              branchScoped: Boolean(context.branch),
              readOnly: true,
              usedFallback: false,
              error: bundle.sheet.error
            },
            naverPartner: {
              provider: "naver-partner",
              status:
                bundle.providerRows["naver-partner"].rows.length > 0
                  ? "read-live"
                  : bundle.providerRows["naver-partner"].authConfigured
                    ? "empty"
                    : "unavailable",
              source: bundle.providerRows["naver-partner"].source,
              rowCount: bundle.providerRows["naver-partner"].rows.length,
              branchScoped: Boolean(context.branch),
              readOnly: true,
              usedFallback: false,
              error: bundle.providerRows["naver-partner"].error
            },
            adminStation: {
              provider: "admin-station",
              status:
                bundle.providerRows["admin-station"].rows.length > 0
                  ? "read-live"
                  : bundle.providerRows["admin-station"].authConfigured
                    ? "empty"
                    : "unavailable",
              source: bundle.providerRows["admin-station"].source,
              rowCount: bundle.providerRows["admin-station"].rows.length,
              branchScoped: Boolean(context.branch),
              readOnly: true,
              usedFallback: false,
              error: bundle.providerRows["admin-station"].error
            },
            wingsPms: {
              provider: "wings-pms",
              status:
                bundle.wingsReservations.rows.length > 0
                  ? "read-live"
                  : bundle.wingsReservations.recordsStatus === "empty"
                    ? "empty"
                    : bundle.wingsReservations.source === "unsupported-provider"
                      ? "unsupported"
                      : bundle.wingsReservations.error
                        ? "error"
                        : "unavailable",
              source: bundle.wingsReservations.source,
              rowCount: bundle.wingsReservations.rows.length,
              branchScoped: Boolean(context.branch),
              readOnly: true,
              usedFallback: false,
              error: bundle.wingsReservations.error,
              endpointCapability: bundle.wingsReservations.endpointCapability
            }
          }
        }
      }
    };
  });

  ipcMain.handle("desktop:index-workspace-search", async (_event, request) => indexWorkspaceSearch(request));
  ipcMain.handle("desktop:query-workspace-search", async (_event, request) => queryWorkspaceSearch(request));
  ipcMain.handle("desktop:build-operator-export", async (_event, request: BuildOperatorExportRequest) => ({
    ok: true,
    exportBundle: await buildOperatorExport({
      runId: typeof request?.runId === "string" ? request.runId : "",
      branch: typeof request?.branch === "string" ? request.branch : ""
    })
  }));
  ipcMain.handle("desktop:export-operator-handoff", async (event, request: ExportOperatorHandoffRequest) =>
    exportOperatorHandoff(event, request)
  );
  ipcMain.handle("desktop:repeat-operator-handoff", async (event, request: RepeatOperatorHandoffRequest) =>
    repeatOperatorHandoff(event, request)
  );
  ipcMain.handle("desktop:update-operator-handoff-status", async (_event, request: UpdateOperatorHandoffStatusRequest) => ({
    ok: true,
    handoff: await updateOperatorHandoffStatus({
      handoffId: typeof request?.handoffId === "string" ? request.handoffId : "",
      status:
        request?.status === "confirmed" || request?.status === "needs-follow-up" || request?.status === "sent"
          ? request.status
          : "sent"
    })
  }));

  ipcMain.handle("desktop:fetch-provider-rows", async (_event, request: FetchProviderRowsRequest) => {
    if (request.provider === "naver-partner" || request.provider === "admin-station") {
      try {
        const live = await fetchProviderRowsLive(request.provider, request.query);
        const payload = filterRowsByBranch(live.rows, request.query.branch || "").map((row) => ({
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
      payload: Array.isArray(result.records)
        ? filterRowsByBranch(result.records as ProviderReservationRow[], request.query.branch || "")
        : [],
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
