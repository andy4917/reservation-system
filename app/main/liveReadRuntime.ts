import type { FetchSheetSnapshotSummary, ProviderInventoryCompareRow, ProviderReservationRow, ProviderType } from "../contracts/index.js";
import { fetchSheetSnapshot } from "./sheetRuntime.js";
import { fetchProviderRowsLive, getProviderRuntimeDiagnostics } from "./providerRuntime.js";
import { fetchWingsReservations, getWingsRuntimeDiagnostics } from "./wingsRuntime.js";

type ReadOnly = true;

export type LiveReadSupportLevel = "preview-only" | "offline-preview" | "partial-live" | "read-live";

export interface LiveReadQuery {
  branch: string;
  startDate: string;
  endDate: string;
}

export type LiveReadProviderKey = Exclude<ProviderType, "wings-pms">;

export interface LiveReadBundleRequest extends LiveReadQuery {
  providers?: LiveReadProviderKey[];
  includeWings?: boolean;
  runId?: string;
}

export interface LiveReadComponentBase {
  source: string;
  supportLevel: LiveReadSupportLevel;
  elapsedMs: number;
  error: string;
  sourceLabel: string;
}

export interface LiveReadSheetComponent extends LiveReadComponentBase {
  source: string;
  sheetRunId: string | null;
  branch: string;
  snapshot: Record<string, unknown> | null;
  summary: FetchSheetSnapshotSummary | null;
}

export interface LiveReadProviderRowsComponent extends LiveReadComponentBase {
  provider: LiveReadProviderKey;
  branchMatchedRows: number;
  dateRangeMatchedRows: number;
  dateRangeDroppedRows: number;
  rows: ProviderInventoryCompareRow[];
  authConfigured: boolean;
}

export interface LiveReadWingsReservationsComponent extends LiveReadComponentBase {
  provider: "wings-pms";
  branchMatchedRows: number;
  dateRangeMatchedRows: number;
  dateRangeDroppedRows: number;
  endpointCapability: string;
  recordsStatus: "available" | "empty" | "unavailable";
  rows: ProviderReservationRow[];
}

export interface LiveReadBundle {
  runId: string;
  fingerprint: string;
  readOnly: ReadOnly;
  requestedAt: string;
  finishedAt: string;
  elapsedMs: number;
  branch: string;
  startDate: string;
  endDate: string;
  sheet: LiveReadSheetComponent;
  providerRows: Record<LiveReadProviderKey, LiveReadProviderRowsComponent>;
  wingsReservations: LiveReadWingsReservationsComponent;
  coverage: {
    totalProviderRows: number;
    totalReservationRows: number;
    providerSummary: Array<{ provider: LiveReadProviderKey; rows: number; branchMatchedRows: number; dateRangeMatchedRows: number }>;
    wingsSummary: {
      rows: number;
      branchMatchedRows: number;
      dateRangeMatchedRows: number;
    };
  };
  bundleSupportLevel: LiveReadSupportLevel;
}

export interface LiveReadRunOptions {
  now?: () => string;
}

type UnknownRecord = Record<string, unknown>;

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeBranch(value: unknown) {
  return normalizeText(value).toUpperCase();
}

function normalizeDate(value: unknown) {
  const trimmed = normalizeText(value);
  if (!trimmed) return "";
  return trimmed.slice(0, 10);
}

function isDateInRange(dateValue: string, startDate: string, endDate: string) {
  if (!dateValue || !startDate || !endDate) return false;
  return dateValue >= startDate && dateValue <= endDate;
}

function isReservationInRange(
  row: UnknownRecord,
  startDate: string,
  endDate: string
) {
  const checkin = normalizeDate(row?.checkin);
  const checkout = normalizeDate(row?.checkout);

  if (checkin && checkout) {
    return !(
      (checkout < startDate && checkout !== "") ||
      (checkin > endDate && checkin !== "")
    );
  }

  if (checkin) return isDateInRange(checkin, startDate, endDate);
  if (checkout) return isDateInRange(checkout, startDate, endDate);

  return true;
}

function buildRunFingerprint(query: LiveReadQuery, providers: LiveReadProviderKey[], includeWings: boolean) {
  const normalizedBranch = normalizeBranch(query.branch);
  const normalizedProviders = [...providers].sort().join("|");
  return `live-read:${normalizedBranch}:${query.startDate}:${query.endDate}:p=${normalizedProviders}:w=${includeWings ? 1 : 0}`;
}

function buildRunId(query: LiveReadQuery, providers: LiveReadProviderKey[], includeWings: boolean, nowValue: string) {
  return `live-read:${buildRunFingerprint(query, providers, includeWings)}:${nowValue}`;
}

function providerRowsSupport(
  filteredCount: number,
  source: string,
  authConfigured: boolean
): LiveReadSupportLevel {
  if (filteredCount > 0) return "read-live";
  if (!authConfigured) return "offline-preview";
  return source === "unsupported-provider" ? "preview-only" : "partial-live";
}

function wingsReservationsSupport(
  filteredCount: number,
  source: string,
  sourceConfigured: boolean,
  branchConfigured: boolean
): LiveReadSupportLevel {
  if (filteredCount > 0) return "read-live";
  if (!sourceConfigured || !branchConfigured) return "offline-preview";
  if (source === "pms-empty") return "partial-live";
  return source === "pms-api" ? "partial-live" : "preview-only";
}

function normalizeProviderRow(row: UnknownRecord, provider: LiveReadProviderKey): ProviderInventoryCompareRow {
  return {
    ...row,
    provider
  } as ProviderInventoryCompareRow;
}

function buildProviderRows(query: LiveReadQuery, provider: LiveReadProviderKey, rows: UnknownRecord[]) {
  const normalizedBranch = normalizeBranch(query.branch);
  const normalizedStart = normalizeDate(query.startDate);
  const normalizedEnd = normalizeDate(query.endDate);
  const response: ProviderInventoryCompareRow[] = [];
  let branchMatchedRows = 0;
  let dateRangeMatchedRows = 0;
  let dateRangeDroppedRows = 0;

  for (const row of rows) {
    const branch = normalizeBranch(row?.branch);
    if (normalizedBranch && branch !== normalizedBranch) {
      continue;
    }
    if (normalizedBranch) {
      branchMatchedRows += 1;
    }
    const rowDate = normalizeDate(row?.date);
    if (rowDate) {
      if (isDateInRange(rowDate, normalizedStart, normalizedEnd)) {
        dateRangeMatchedRows += 1;
      } else {
        dateRangeDroppedRows += 1;
        continue;
      }
    }
    response.push(normalizeProviderRow(row, provider));
  }

  return {
    rows: response,
    branchMatchedRows,
    dateRangeMatchedRows,
    dateRangeDroppedRows
  };
}

function buildWingsRows(query: LiveReadQuery, rows: UnknownRecord[]) {
  const normalizedBranch = normalizeBranch(query.branch);
  const normalizedStart = normalizeDate(query.startDate);
  const normalizedEnd = normalizeDate(query.endDate);
  const response: ProviderReservationRow[] = [];
  let branchMatchedRows = 0;
  let dateRangeMatchedRows = 0;
  let dateRangeDroppedRows = 0;

  for (const row of rows) {
    const branch = normalizeBranch(row?.branch);
    if (normalizedBranch && branch !== normalizedBranch) {
      continue;
    }
    if (normalizedBranch) {
      branchMatchedRows += 1;
    }

    if (!isReservationInRange(row, normalizedStart, normalizedEnd)) {
      dateRangeDroppedRows += 1;
      continue;
    }

    dateRangeMatchedRows += 1;
    response.push({
      reservationNo: normalizeText(row?.reservationNo),
      checkin: normalizeText(row?.checkin),
      checkout: normalizeText(row?.checkout),
      ...row
    } as ProviderReservationRow);
  }

  return {
    rows: response,
    branchMatchedRows,
    dateRangeMatchedRows,
    dateRangeDroppedRows
  };
}

function pickWorstSupportLevel(values: LiveReadSupportLevel[]) {
  if (values.some((value) => value === "offline-preview")) return "offline-preview";
  if (values.some((value) => value === "partial-live")) return "partial-live";
  if (values.some((value) => value === "preview-only")) return "preview-only";
  return "read-live";
}

function mapSheetSupport(source: string): LiveReadSupportLevel {
  if (source === "sheet-api") return "read-live";
  if (source === "sheet-unconfigured") return "offline-preview";
  if (source === "sheet-api-error") return "partial-live";
  return "partial-live";
}

export function buildLiveReadRunIdFromQuery(query: LiveReadQuery, options?: { providers?: LiveReadProviderKey[]; includeWings?: boolean }) {
  const providers = options?.providers?.length
    ? [...options.providers]
    : (["naver-partner", "admin-station"] as LiveReadProviderKey[]);
  const includeWings = options?.includeWings !== false;
  const nowValue = new Date().toISOString();
  return buildRunId(query, providers, includeWings, nowValue);
}

export async function buildLiveReadBundle(
  request: LiveReadBundleRequest,
  options: LiveReadRunOptions = {}
): Promise<LiveReadBundle> {
  const requestedAt = options.now ? options.now() : new Date().toISOString();
  const nowIso = requestedAt || new Date().toISOString();
  const providers: LiveReadProviderKey[] = request.providers?.length
    ? [...request.providers]
    : (["naver-partner", "admin-station"] as LiveReadProviderKey[]);
  const includeWings = request.includeWings !== false;
  const normalizedBranch = normalizeBranch(request.branch);
  const normalizedQuery: LiveReadQuery = {
    branch: request.branch,
    startDate: normalizeDate(request.startDate),
    endDate: normalizeDate(request.endDate)
  };
  const fingerprint = buildRunFingerprint(normalizedQuery, providers, includeWings);
  const runId =
    request.runId && request.runId.trim()
      ? request.runId.trim()
      : buildRunId(normalizedQuery, providers, includeWings, nowIso);

  const sheetStart = Date.now();
  const sheetResult = await fetchSheetSnapshot({
    branch: request.branch,
    startDate: request.startDate,
    endDate: request.endDate
  });
  const sheetElapsed = Date.now() - sheetStart;
  const sheetSupport = mapSheetSupport(sheetResult.source);

  const providerDiagnostics = getProviderRuntimeDiagnostics();
  const providerRowsResult: Record<LiveReadProviderKey, LiveReadProviderRowsComponent> = {} as Record<
    LiveReadProviderKey,
    LiveReadProviderRowsComponent
  >;
  const providerTasks = providers.map(async (provider) => {
    const providerStart = Date.now();
    let source = "unsupported-provider";
    let rows: UnknownRecord[] = [];
    let error = "";
    try {
      const providerResp = await fetchProviderRowsLive(provider, {
        startDate: request.startDate,
        endDate: request.endDate
      });
      source = normalizeText(providerResp.source) || source;
      rows = Array.isArray(providerResp.rows) ? providerResp.rows : [];
    } catch (exception) {
      error = exception instanceof Error ? exception.message : String(exception || "");
      source = "unavailable";
    }
    const filtered = buildProviderRows(normalizedQuery, provider, rows);
    const authConfigured = providerDiagnostics.availableProviders.includes(provider);
    const supportLevel = providerRowsSupport(filtered.rows.length, source, authConfigured);
    const componentElapsed = Date.now() - providerStart;
    return {
      provider,
      source,
      supportLevel,
      elapsedMs: componentElapsed,
      error,
      sourceLabel: source,
      branchMatchedRows: filtered.branchMatchedRows,
      dateRangeMatchedRows: filtered.dateRangeMatchedRows,
      dateRangeDroppedRows: filtered.dateRangeDroppedRows,
      rows: filtered.rows,
      authConfigured
    };
  });
  const providerValues = await Promise.all(providerTasks);
  providerValues.forEach((value) => {
    providerRowsResult[value.provider] = value;
  });

  const wingsDiagnostics = getWingsRuntimeDiagnostics();
  const configuredWingsBranches = new Set(wingsDiagnostics.configuredBranches.map(normalizeBranch));
  const targetBranchConfigured =
    !normalizedBranch || configuredWingsBranches.has(normalizedBranch) || configuredWingsBranches.size === 0;

  const wingsStart = Date.now();
  let wingsSource = "unsupported-provider";
  let wingsRows: UnknownRecord[] = [];
  let wingsError = "";
  let wingsEndpointCapability = "";
  let wingsRecordStatus: LiveReadWingsReservationsComponent["recordsStatus"] = "unavailable";

  if (includeWings) {
    try {
      const wingsResp = await fetchWingsReservations({
        startDate: request.startDate,
        endDate: request.endDate
      });
      const records = Array.isArray(wingsResp?.records) ? wingsResp?.records : [];
      wingsRows = records;
      wingsSource = normalizeText(wingsResp?.source) || "pms-unconfigured";
      wingsEndpointCapability = normalizeText(wingsResp?.endpointCapability);
      wingsError = normalizeText(wingsResp?.error);
      if (wingsSource === "pms-api") wingsRecordStatus = "available";
      else if (wingsSource === "pms-empty") wingsRecordStatus = "empty";
      else wingsRecordStatus = "unavailable";
    } catch (exception) {
      wingsError = exception instanceof Error ? exception.message : String(exception || "");
      wingsSource = "unavailable";
      wingsEndpointCapability = "";
      wingsRecordStatus = "unavailable";
    }
  } else {
    wingsSource = "unsupported-provider";
    wingsError = "";
    wingsEndpointCapability = "";
    wingsRecordStatus = "unavailable";
  }
  const filteredWings = buildWingsRows(normalizedQuery, includeWings ? wingsRows : []);
  const wingsSupport = includeWings
    ? wingsReservationsSupport(
        filteredWings.rows.length,
        wingsSource,
        wingsDiagnostics.source !== "unconfigured",
        targetBranchConfigured
      )
    : "preview-only";
  const wingsElapsed = Date.now() - wingsStart;

  const wingsComponent: LiveReadWingsReservationsComponent = {
    provider: "wings-pms",
    source: wingsSource,
    supportLevel: includeWings ? wingsSupport : "preview-only",
    elapsedMs: wingsElapsed,
    error: includeWings ? wingsError : "",
    sourceLabel: wingsSource,
    endpointCapability: wingsEndpointCapability,
    recordsStatus: wingsRecordStatus,
    branchMatchedRows: filteredWings.branchMatchedRows,
    dateRangeMatchedRows: filteredWings.dateRangeMatchedRows,
    dateRangeDroppedRows: filteredWings.dateRangeDroppedRows,
    rows: filteredWings.rows
  };

  const providerSupportLevels = providers
    .map((provider) => providerRowsResult[provider].supportLevel)
    .concat(includeWings ? wingsComponent.supportLevel : []);

  const bundleSupportLevel = pickWorstSupportLevel([
    sheetSupport,
    ...providerSupportLevels,
    includeWings ? wingsComponent.supportLevel : "preview-only"
  ]);

  const finishedAt = options.now ? options.now() : new Date().toISOString();
  const elapsedMs = Math.max(0, new Date(finishedAt).getTime() - new Date(requestedAt).getTime());
  const sheetComponent: LiveReadSheetComponent = {
    source: normalizeText(sheetResult.source),
    supportLevel: sheetSupport,
    elapsedMs: sheetElapsed,
    error: normalizeText(sheetResult.error),
    sourceLabel: sheetResult.source || "sheet-unknown",
    sheetRunId: null,
    branch: normalizeBranch(request.branch),
    snapshot: sheetResult.snapshot ?? null,
    summary: sheetResult.summary
  };

  const providerSummary = providers.map((provider) => ({
    provider,
    rows: providerRowsResult[provider].rows.length,
    branchMatchedRows: providerRowsResult[provider].branchMatchedRows,
    dateRangeMatchedRows: providerRowsResult[provider].dateRangeMatchedRows
  }));

  const totalProviderRows = providerSummary.reduce((sum, item) => sum + item.rows, 0);
  const totalReservationRows = wingsComponent.rows.length;

  return {
    runId,
    fingerprint,
    readOnly: true,
    requestedAt,
    finishedAt,
    elapsedMs,
    branch: request.branch,
    startDate: request.startDate,
    endDate: request.endDate,
    sheet: sheetComponent,
    providerRows: providerRowsResult,
    wingsReservations: wingsComponent,
    coverage: {
      totalProviderRows,
      totalReservationRows,
      providerSummary,
      wingsSummary: {
        rows: wingsComponent.rows.length,
        branchMatchedRows: wingsComponent.branchMatchedRows,
        dateRangeMatchedRows: wingsComponent.dateRangeMatchedRows
      }
    },
    bundleSupportLevel
  };
}

export async function fetchLiveReadBundle(
  request: LiveReadBundleRequest,
  options?: LiveReadRunOptions
): Promise<LiveReadBundle> {
  return buildLiveReadBundle(request, options);
}
