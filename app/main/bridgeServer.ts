import http from "node:http";
import type { AddressInfo } from "node:net";
import type { BridgeRuntimeStatus, ProviderInventoryCompareRow, ProviderType } from "../contracts";
import type { BridgeErrorCode } from "../contracts";

interface BridgePayload {
  provider: ProviderType | null;
  host: string | null;
  url: string | null;
  title: string | null;
  rows: ProviderInventoryCompareRow[];
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
  bodyTextSample: string;
  updatedAt: string;
}

interface BridgePreviewRow {
  date: string;
  roomType: string;
  channel: string;
  reason?: string;
  rawLine?: string;
  sourceLineIndex?: number | null;
  candidateBasis?: string[];
}

interface BridgeRecord extends BridgePayload {
  receivedAt: number;
}

type RateLimitState = {
  windowStartedAt: number;
  count: number;
};

type FailureResponse = {
  ok: false;
  failure: {
    code: BridgeErrorCode;
    message: string;
    retryable: boolean;
    detail?: string;
  };
};

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = Number(process.env.UHS_BRIDGE_PORT || 45123);
const BRIDGE_UPDATE_PATH = process.env.UHS_BRIDGE_UPDATE_PATH?.trim() || "/bridge/update";
const BRIDGE_STATE_PATH = process.env.UHS_BRIDGE_STATE_PATH?.trim() || "/bridge/state";
const BRIDGE_TTL_MS = 20_000;
const BRIDGE_MAX_BODY_BYTES = Number(process.env.UHS_BRIDGE_MAX_BODY_BYTES || 128 * 1024);
const BRIDGE_RATE_LIMIT_WINDOW_MS = Number(process.env.UHS_BRIDGE_RATE_LIMIT_WINDOW_MS || 10_000);
const BRIDGE_RATE_LIMIT_MAX_REQUESTS = Number(process.env.UHS_BRIDGE_RATE_LIMIT_MAX_REQUESTS || 20);
const BRIDGE_REQUEST_TIMEOUT_MS = Number(process.env.UHS_BRIDGE_REQUEST_TIMEOUT_MS || 3_000);
const BRIDGE_SHARED_SECRET = process.env.UHS_BRIDGE_SHARED_SECRET?.trim() || "";

let bridgeServer: http.Server | null = null;
let bridgePort = DEFAULT_PORT;
const bridgeState = new Map<ProviderType, BridgeRecord>();
const requestRateState = new Map<string, RateLimitState>();
let bridgeRuntimeStatus: BridgeRuntimeStatus = {
  ok: true,
  connected: false,
  capability: "degraded",
  host: DEFAULT_HOST,
  port: DEFAULT_PORT,
  updatePath: BRIDGE_UPDATE_PATH,
  statePath: BRIDGE_STATE_PATH,
  authConfigured: Boolean(BRIDGE_SHARED_SECRET),
  code: BRIDGE_SHARED_SECRET ? "BRIDGE_UNAVAILABLE" : "BRIDGE_AUTH_REQUIRED",
  message: BRIDGE_SHARED_SECRET
    ? "Bridge server is not started yet."
    : "Bridge shared secret is not configured. Bridge capability starts in degraded mode.",
  recoveryAction: BRIDGE_SHARED_SECRET
    ? "Start the bridge server or attach the extension session."
    : "Set the same bridge secret in app env (UHS_BRIDGE_SHARED_SECRET) and extension sync policy.",
  rateLimitWindowMs: BRIDGE_RATE_LIMIT_WINDOW_MS,
  rateLimitMaxRequests: BRIDGE_RATE_LIMIT_MAX_REQUESTS,
  maxBodyBytes: BRIDGE_MAX_BODY_BYTES,
  requestTimeoutMs: BRIDGE_REQUEST_TIMEOUT_MS
};

function normalizeProviderType(value: unknown): ProviderType | null {
  return value === "naver-partner" || value === "admin-station" || value === "wings-pms" ? value : null;
}

function normalizeString(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}

function normalizeStatus(value: unknown): ProviderInventoryCompareRow["status"] | undefined {
  return value === "match" || value === "mismatch" || value === "warning" ? value : undefined;
}

function isLoopbackAddress(address: string | undefined) {
  const value = String(address || "").trim();
  return value === "127.0.0.1" || value === "::1" || value === "::ffff:127.0.0.1";
}

function buildFailure(
  code: BridgeErrorCode,
  message: string,
  retryable: boolean,
  detail?: string
): FailureResponse {
  return {
    ok: false,
    failure: {
      code,
      message,
      retryable,
      detail
    }
  };
}

function writeJson(res: http.ServerResponse, statusCode: number, body: unknown) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8"
  });
  res.end(JSON.stringify(body));
}

function writeFailure(
  res: http.ServerResponse,
  statusCode: number,
  code: BridgeErrorCode,
  message: string,
  retryable: boolean,
  detail?: string
) {
  writeJson(res, statusCode, buildFailure(code, message, retryable, detail));
}

function normalizeRows(value: unknown): ProviderInventoryCompareRow[] {
  if (!Array.isArray(value)) return [];
  const rows: ProviderInventoryCompareRow[] = [];
  value.forEach((row) => {
    if (!row || typeof row !== "object") return;
    const item = row as Record<string, unknown>;
    const branch = normalizeString(item.branch) || undefined;
    const date = normalizeString(item.date);
    const roomType = normalizeString(item.roomType);
    const channel = normalizeString(item.channel);
    const siteRaw = normalizeString(item.siteRaw);
    const sheetRaw = normalizeString(item.sheetRaw);
    const reservationRef = normalizeString(item.reservationRef) || undefined;
    const roomNo = normalizeString(item.roomNo) || undefined;
    const rawLine = normalizeString(item.rawLine) || undefined;
    const sourceLineIndex = typeof item.sourceLineIndex === "number" ? item.sourceLineIndex : null;
    const candidateBasis = Array.isArray(item.candidateBasis)
      ? item.candidateBasis.filter((entry): entry is string => typeof entry === "string" && Boolean(entry.trim()))
      : undefined;
    const signals = Array.isArray(item.signals)
      ? item.signals
          .filter((entry): entry is { kind: string; value: string; source: "line" | "context" } => {
            if (!entry || typeof entry !== "object") return false;
            const signal = entry as Record<string, unknown>;
            return (
              typeof signal.kind === "string" &&
              typeof signal.value === "string" &&
              (signal.source === "line" || signal.source === "context")
            );
          })
          .map((entry) => ({ kind: entry.kind.trim(), value: entry.value.trim(), source: entry.source }))
      : undefined;
    const tags = Array.isArray(item.tags)
      ? item.tags
          .filter((entry): entry is { kind: string; value: string } => {
            if (!entry || typeof entry !== "object") return false;
            const tag = entry as Record<string, unknown>;
            return typeof tag.kind === "string" && typeof tag.value === "string";
          })
          .map((entry) => ({ kind: entry.kind.trim(), value: entry.value.trim() }))
      : undefined;
    if (!date || !roomType || !channel || !siteRaw || !sheetRaw) return;
    rows.push({
      branch,
      reservationRef,
      roomNo,
      date,
      roomType,
      channel,
      siteRaw,
      sheetRaw,
      diff: normalizeString(item.diff) || undefined,
      status: normalizeStatus(item.status),
      reason: normalizeString(item.reason) || undefined,
      action: normalizeString(item.action) || undefined,
      rawLine,
      sourceLineIndex,
      candidateBasis,
      signals,
      tags
    });
  });
  return rows;
}

function normalizeAuthSummary(value: unknown): BridgePayload["authSummary"] {
  if (!value || typeof value !== "object") return null;
  const auth = value as Record<string, unknown>;
  return {
    cookieCount: typeof auth.cookieCount === "number" ? auth.cookieCount : 0,
    domains: Array.isArray(auth.domains) ? auth.domains.filter((entry): entry is string => typeof entry === "string") : [],
    hasBearer: auth.hasBearer === true,
    hasCsrf: auth.hasCsrf === true,
    hasRole: auth.hasRole === true
  };
}

function normalizeInfoSummary(value: unknown): BridgePayload["infoSummary"] {
  if (!value || typeof value !== "object") return null;
  const info = value as Record<string, unknown>;
  return {
    count: typeof info.count === "number" ? info.count : 0,
    channels: Array.isArray(info.channels) ? info.channels.filter((entry): entry is string => typeof entry === "string") : [],
    dates: Array.isArray(info.dates) ? info.dates.filter((entry): entry is string => typeof entry === "string") : []
  };
}

function isFresh(record: BridgeRecord | undefined) {
  return Boolean(record) && Date.now() - (record?.receivedAt || 0) <= BRIDGE_TTL_MS;
}

function assertRateLimit(clientKey: string) {
  const now = Date.now();
  const current = requestRateState.get(clientKey);
  if (!current || now - current.windowStartedAt > BRIDGE_RATE_LIMIT_WINDOW_MS) {
    requestRateState.set(clientKey, { windowStartedAt: now, count: 1 });
    return true;
  }
  if (current.count >= BRIDGE_RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }
  current.count += 1;
  requestRateState.set(clientKey, current);
  return true;
}

function readJson(req: http.IncomingMessage) {
  return new Promise<unknown>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let settled = false;

    req.setTimeout(BRIDGE_REQUEST_TIMEOUT_MS, () => {
      if (settled) return;
      settled = true;
      reject(Object.assign(new Error("Bridge request timed out."), { bridgeCode: "BRIDGE_TIMEOUT" satisfies BridgeErrorCode }));
    });

    req.on("data", (chunk) => {
      if (settled) return;
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buffer.length;
      if (total > BRIDGE_MAX_BODY_BYTES) {
        settled = true;
        reject(
          Object.assign(new Error("Bridge payload exceeds the configured size limit."), {
            bridgeCode: "BRIDGE_PAYLOAD_TOO_LARGE" satisfies BridgeErrorCode
          })
        );
        return;
      }
      chunks.push(buffer);
    });
    req.on("end", () => {
      if (settled) return;
      settled = true;
      try {
        const raw = Buffer.concat(chunks).toString("utf8").trim();
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(
          Object.assign(new Error(error instanceof Error ? error.message : String(error)), {
            bridgeCode: "BRIDGE_SCHEMA_INVALID" satisfies BridgeErrorCode
          })
        );
      }
    });
    req.on("error", (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
  });
}

function selectLatestRecord(provider?: ProviderType | null) {
  if (provider) return isFresh(bridgeState.get(provider)) ? bridgeState.get(provider) || null : null;
  const freshRecords = [...bridgeState.values()].filter(isFresh);
  if (freshRecords.length === 0) return null;
  freshRecords.sort((left, right) => right.receivedAt - left.receivedAt);
  return freshRecords[0] || null;
}

function normalizePayload(value: unknown): BridgePayload | null {
  if (!value || typeof value !== "object") return null;
  const payload = value as Record<string, unknown>;
  const provider = normalizeProviderType(payload.provider);
  const rows = normalizeRows(payload.rows);
  if (!provider || !Array.isArray(payload.rows)) return null;
  return {
    provider,
    host: normalizeString(payload.host),
    url: normalizeString(payload.url),
    title: normalizeString(payload.title),
    rows,
    authSummary: normalizeAuthSummary(payload.authSummary),
    infoSummary: normalizeInfoSummary(payload.infoSummary),
    bodyTextSample: normalizeString(payload.bodyTextSample) || "",
    updatedAt: normalizeString(payload.updatedAt) || new Date().toISOString()
  };
}

function handleBridgeUpdate(payload: BridgePayload) {
  bridgeState.set(payload.provider as ProviderType, {
    ...payload,
    receivedAt: Date.now()
  });
}

function updateRuntimeStatus(patch: Partial<BridgeRuntimeStatus>) {
  bridgeRuntimeStatus = {
    ...bridgeRuntimeStatus,
    ...patch
  };
}

function requireAuthorizedRequest(req: http.IncomingMessage) {
  const remoteAddress = req.socket.remoteAddress || "";
  if (!isLoopbackAddress(remoteAddress)) {
    return buildFailure("BRIDGE_AUTH_INVALID", "Bridge only accepts loopback requests.", false, remoteAddress);
  }
  if (!BRIDGE_SHARED_SECRET) {
    return buildFailure(
      "BRIDGE_AUTH_REQUIRED",
      "Bridge shared secret is not configured.",
      false,
      "Set UHS_BRIDGE_SHARED_SECRET in the app environment and bridge.secret in the extension sync policy."
    );
  }
  const receivedSecret = String(req.headers["x-uhs-bridge-secret"] || "").trim();
  if (!receivedSecret || receivedSecret !== BRIDGE_SHARED_SECRET) {
    return buildFailure("BRIDGE_AUTH_INVALID", "Bridge secret is missing or invalid.", false);
  }
  return null;
}

function createBridgeServer(port: number) {
  const server = http.createServer(async (req, res) => {
    const clientKey = req.socket.remoteAddress || "unknown";
    if (!assertRateLimit(clientKey)) {
      writeFailure(
        res,
        429,
        "BRIDGE_RATE_LIMITED",
        "Bridge rate limit exceeded.",
        true,
        `${BRIDGE_RATE_LIMIT_MAX_REQUESTS} requests per ${BRIDGE_RATE_LIMIT_WINDOW_MS}ms`
      );
      return;
    }

    if (req.method === "OPTIONS") {
      writeJson(res, 204, {});
      return;
    }

    const authFailure = requireAuthorizedRequest(req);
    if (authFailure) {
      writeJson(res, authFailure.failure.code === "BRIDGE_RATE_LIMITED" ? 429 : 401, authFailure);
      return;
    }

    if (req.method === "POST" && req.url === BRIDGE_UPDATE_PATH) {
      try {
        const body = await readJson(req);
        const payload = normalizePayload(body);
        if (!payload) {
          writeFailure(res, 400, "BRIDGE_SCHEMA_INVALID", "Bridge payload does not match the required schema.", false);
          return;
        }
        handleBridgeUpdate(payload);
        writeJson(res, 200, { ok: true, port });
      } catch (error) {
        const errorCode = (error as { bridgeCode?: BridgeErrorCode })?.bridgeCode;
        if (errorCode === "BRIDGE_PAYLOAD_TOO_LARGE") {
          writeFailure(res, 413, errorCode, "Bridge payload exceeds the configured size limit.", false);
          return;
        }
        if (errorCode === "BRIDGE_TIMEOUT") {
          writeFailure(res, 408, errorCode, "Bridge request timed out.", true);
          return;
        }
        if (errorCode === "BRIDGE_SCHEMA_INVALID") {
          writeFailure(res, 400, errorCode, "Bridge payload is not valid JSON.", false);
          return;
        }
        writeFailure(
          res,
          400,
          "UNKNOWN_ERROR",
          error instanceof Error ? error.message : String(error),
          true
        );
      }
      return;
    }

    if (req.method === "GET" && req.url?.startsWith(BRIDGE_STATE_PATH)) {
      const url = new URL(req.url, `http://${DEFAULT_HOST}:${port}`);
      const provider = normalizeProviderType(url.searchParams.get("provider"));
      const record = selectLatestRecord(provider);
      writeJson(res, 200, { ok: true, record });
      return;
    }

    writeFailure(res, 404, "UNKNOWN_ERROR", "Bridge route not found.", false);
  });

  server.requestTimeout = BRIDGE_REQUEST_TIMEOUT_MS;
  server.headersTimeout = BRIDGE_REQUEST_TIMEOUT_MS + 1_000;
  return server;
}

export async function startBridgeServer(port = DEFAULT_PORT) {
  if (bridgeServer) return bridgeRuntimeStatus;
  const server = createBridgeServer(port);

  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, DEFAULT_HOST, () => resolve());
    });
    bridgeServer = server;
    bridgePort = (server.address() as AddressInfo).port;
    updateRuntimeStatus({
      connected: true,
      capability: BRIDGE_SHARED_SECRET ? "ready" : "degraded",
      host: DEFAULT_HOST,
      port: bridgePort,
      authConfigured: Boolean(BRIDGE_SHARED_SECRET),
      code: BRIDGE_SHARED_SECRET ? null : "BRIDGE_AUTH_REQUIRED",
      message: BRIDGE_SHARED_SECRET
        ? "Bridge server listening on loopback."
        : "Bridge server listening, but shared secret is not configured.",
      recoveryAction: BRIDGE_SHARED_SECRET
        ? null
        : "Set the same bridge secret in app env (UHS_BRIDGE_SHARED_SECRET) and extension sync policy."
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    updateRuntimeStatus({
      connected: false,
      capability: "degraded",
      code: "BRIDGE_PORT_BIND_FAILED",
      message: `Bridge server failed to bind on ${DEFAULT_HOST}:${port}.`,
      recoveryAction: "Free the configured port or change UHS_BRIDGE_PORT, then retry the app."
    });
    if (server.listening) {
      server.close();
    }
    return {
      ...bridgeRuntimeStatus,
      message: bridgeRuntimeStatus.message,
      recoveryAction: bridgeRuntimeStatus.recoveryAction,
      code: "BRIDGE_PORT_BIND_FAILED" as const,
      connected: false,
      capability: "degraded" as const,
      authConfigured: Boolean(BRIDGE_SHARED_SECRET)
    };
  }

  return bridgeRuntimeStatus;
}

export async function stopBridgeServer() {
  if (!bridgeServer) return;
  const server = bridgeServer;
  bridgeServer = null;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
  updateRuntimeStatus({
    connected: false,
    capability: "degraded",
    code: "BRIDGE_UNAVAILABLE",
    message: "Bridge server stopped.",
    recoveryAction: "Restart the desktop app to reopen the bridge capability."
  });
}

export function getBridgePort() {
  return bridgePort;
}

export function getBridgeRuntimeStatus() {
  return bridgeRuntimeStatus;
}

export function getLatestBridgeContext(provider?: ProviderType | null) {
  const record = selectLatestRecord(provider);
  if (!record) {
    return {
      provider: null,
      host: null,
      url: null,
      sessionAvailable: false
    };
  }
  return {
    provider: record.provider,
    host: record.host,
    url: record.url,
    sessionAvailable: true
  };
}

export function getProviderRowsFromBridge(provider: ProviderType, query?: { startDate?: string; endDate?: string }) {
  const record = selectLatestRecord(provider);
  if (!record) return [];
  const startDate = query?.startDate || "";
  const endDate = query?.endDate || "";
  return record.rows.filter((row) => (!startDate || row.date >= startDate) && (!endDate || row.date <= endDate));
}

export function getLatestBridgeSummary(provider?: ProviderType | null) {
  const record = selectLatestRecord(provider);
  const previewRows: BridgePreviewRow[] =
    record?.rows.slice(0, 3).map((row) => ({
      date: row.date,
      roomType: row.roomType,
      channel: row.channel,
      reason: row.reason,
      rawLine: row.rawLine,
      sourceLineIndex: row.sourceLineIndex,
      candidateBasis: row.candidateBasis
    })) || [];
  return {
    authSummary: record?.authSummary || null,
    infoSummary: record?.infoSummary || null,
    preview: record
      ? {
          title: record.title,
          url: record.url,
          updatedAt: record.updatedAt,
          bodyTextSample: record.bodyTextSample,
          rows: previewRows
        }
      : null
  };
}

export function __resetBridgeStateForTests() {
  bridgeState.clear();
  requestRateState.clear();
  bridgePort = DEFAULT_PORT;
  bridgeRuntimeStatus = {
    ok: true,
    connected: false,
    capability: "degraded",
    host: DEFAULT_HOST,
    port: DEFAULT_PORT,
    updatePath: BRIDGE_UPDATE_PATH,
    statePath: BRIDGE_STATE_PATH,
    authConfigured: Boolean(BRIDGE_SHARED_SECRET),
    code: BRIDGE_SHARED_SECRET ? "BRIDGE_UNAVAILABLE" : "BRIDGE_AUTH_REQUIRED",
    message: BRIDGE_SHARED_SECRET
      ? "Bridge server is not started yet."
      : "Bridge shared secret is not configured. Bridge capability starts in degraded mode.",
    recoveryAction: BRIDGE_SHARED_SECRET
      ? "Start the bridge server or attach the extension session."
      : "Set the same bridge secret in app env (UHS_BRIDGE_SHARED_SECRET) and extension sync policy.",
    rateLimitWindowMs: BRIDGE_RATE_LIMIT_WINDOW_MS,
    rateLimitMaxRequests: BRIDGE_RATE_LIMIT_MAX_REQUESTS,
    maxBodyBytes: BRIDGE_MAX_BODY_BYTES,
    requestTimeoutMs: BRIDGE_REQUEST_TIMEOUT_MS
  };
}
