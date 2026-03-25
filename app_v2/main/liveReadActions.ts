import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  AppBranch,
  AppLiveReadInput,
  AppLiveReadPreviewItem,
  AppLiveReadSnapshot,
  AppProvider,
} from "../../src/desktop/app-v2-contracts.js";
import { describeEmbeddingAvailability, scoreTextPairs } from "./embeddingRuntime.js";
import { fetchProviderRowsLive } from "./providerDataRuntime.js";
import { evaluateProviderOperatingState } from "./providerOperatingAdapter.js";
import { ensureProviderBrowser, getProviderBrowserState } from "./providerWorkspaceManager.js";
import { buildLiveReadRuntimeErrorSnapshot } from "./runtimeSafety.js";
import { loadSettingsSnapshot } from "./settingsStore.js";
import { fetchWingsReservations } from "./wingsReservationRuntime.js";

const PYTHON_COMMAND = process.env.PYTHON_BIN || "python3";
const currentDir = path.dirname(fileURLToPath(import.meta.url));

function detectRuntimeAssetRoot() {
  // Resolve scripts from module-relative root first, then packaged resources root for WSL/installer layouts.
  const candidateRoots = [path.resolve(currentDir, "..", "..", "..")];
  if (process.resourcesPath) candidateRoots.push(path.resolve(process.resourcesPath));
  for (const root of candidateRoots) {
    if (
      fs.existsSync(path.join(root, "scripts", "app_v2_live_sheet_bridge.py")) &&
      fs.existsSync(path.join(root, "src", "constants.js"))
    ) {
      return root;
    }
  }
  return candidateRoots[0];
}

function resolvePythonScript(scriptName: "app_v2_live_sheet_bridge.py") {
  const root = detectRuntimeAssetRoot();
  return {
    scriptPath: path.join(root, "scripts", scriptName),
    runtimeCwd: root,
  };
}

interface LiveSheetBridgePayload {
  branch: AppBranch;
  checkedAt: string;
  recordsImported: number;
  summary: string;
  items: AppLiveReadPreviewItem[];
  reviewCandidates?: SheetReviewCandidate[];
  evidence: string[];
  error?: string;
}

interface SheetReviewCandidate {
  id: string;
  roomNo: string;
  date: string;
  basis: string;
  leftText: string;
  rightText: string;
  leftSummary: string;
  rightSummary: string;
}

function nowIso() {
  return new Date().toISOString();
}

function buildError(
  source: AppLiveReadSnapshot["source"],
  branch: AppBranch,
  blockedReason: string,
  evidence: string[],
): AppLiveReadSnapshot {
  return {
    source,
    branch,
    checkedAt: nowIso(),
    status: "error",
    summary: blockedReason,
    recordsImported: 0,
    blockedReason,
    items: [],
    evidence,
  };
}

async function ensureProviderReadable(provider: AppProvider, summaryLabel: string, branchHint?: AppBranch) {
  await ensureProviderBrowser(provider, branchHint);
  const providerState = await getProviderBrowserState(provider);
  const operatingState = evaluateProviderOperatingState(providerState);
  if (operatingState.operatingStatus !== "ready") {
    return {
      ok: false as const,
      reason: `${summaryLabel} 세션이 아직 준비되지 않았습니다.`,
      evidence: [
        "authMode:provider-session-only",
        `pageState:${providerState.pageState}`,
        `operatingHost:${providerState.currentHost ?? "-"}`,
        `providerCookies:${providerState.providerCookieCount}`,
        `operatingStatus:${operatingState.operatingStatus}`,
        ...operatingState.operatingEvidence.reasons.map((reason) => `operatingReason:${reason}`),
      ],
    };
  }
  return {
    ok: true as const,
    evidence: [
      "authMode:provider-session-only",
      `pageState:${providerState.pageState}`,
      `operatingHost:${providerState.currentHost ?? "-"}`,
      `providerCookies:${providerState.providerCookieCount}`,
      `operatingStatus:${operatingState.operatingStatus}`,
    ],
  };
}

function runPythonJson(args: string[], cwd: string) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(PYTHON_COMMAND, args, {
      cwd,
      env: {
        ...process.env,
        PYTHONUTF8: "1",
        PYTHONIOENCODING: "utf-8",
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }
      reject(new Error(stderr.trim() || stdout.trim() || `python exited with ${code}`));
    });
  });
}

function resolveSheetNames(branch: AppBranch, settings: Awaited<ReturnType<typeof loadSettingsSnapshot>>) {
  const tabs = settings.config?.sheetTabs;
  if (tabs) {
    if (branch === "COEX") {
      return [tabs.coexMain, tabs.coexAnnex].filter(Boolean);
    }
    return [tabs.gangnam].filter(Boolean);
  }
  return settings.config?.sheetName ? [settings.config.sheetName] : [];
}

async function buildSettingsEvidence() {
  const settings = await loadSettingsSnapshot();
  return [
    `spreadsheet:${settings.config?.spreadsheet ? "set" : "missing"}`,
    `sheetName:${settings.config?.sheetName ? "set" : "missing"}`,
    `sheetTabs:${settings.config?.sheetTabs ? "set" : "missing"}`,
    `windowDays:${settings.config?.reportWindowDays ?? "-"}`,
    `bgeM3:${settings.config?.bgeM3?.enabled ? "on" : "off"}`,
    `bgeModelPath:${settings.config?.bgeM3?.modelPath ? "set" : "missing"}`,
    `bgeRuntime:${settings.config?.bgeM3?.runtime ?? "local-path"}`,
  ];
}

async function runLiveSheetBridge(input: AppLiveReadInput): Promise<LiveSheetBridgePayload> {
  const settings = await loadSettingsSnapshot();
  const spreadsheet = settings.config?.spreadsheet?.trim() ?? "";
  const sheetNames = resolveSheetNames(input.branch, settings);
  if (!spreadsheet || sheetNames.length === 0) {
    throw new Error("예약 시트 설정이 비어 있습니다.");
  }
  const { scriptPath, runtimeCwd } = resolvePythonScript("app_v2_live_sheet_bridge.py");
  const args = [
    scriptPath,
    "sheet-read",
    "--spreadsheet",
    spreadsheet,
    "--branch",
    input.branch,
    "--start-date",
    input.startDate,
    "--end-date",
    input.endDate,
  ];
  for (const sheetName of sheetNames) {
    args.push("--sheet-name", sheetName);
  }
  const stdout = await runPythonJson(args, runtimeCwd);
  const payload = JSON.parse(stdout) as LiveSheetBridgePayload;
  if (payload.error) throw new Error(payload.error);
  return payload;
}

function formatAiStatus(score: number | undefined) {
  if (typeof score !== "number") return "검토";
  if (score >= 0.9) return "AI추천";
  if (score >= 0.82) return "AI검토";
  return "검토";
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function buildPmsPreviewItems(records: Array<Record<string, unknown>>): AppLiveReadPreviewItem[] {
  return records.slice(0, 6).map((record, index) => ({
    id: `pms-live:${normalizeText(record.reservationNo) || index}`,
    title: `${normalizeText(record.reservationNo) || "-"} / ${normalizeText(record.roomNo) || "-"}`,
    subtitle: [
      normalizeText(record.checkin),
      normalizeText(record.checkout),
      normalizeText(record.sourceCode) || normalizeText(record.channel),
    ]
      .filter(Boolean)
      .join(" · "),
    statusLabel: normalizeText(record.statusBucket) || "LIVE",
  }));
}

function buildProviderPreviewItems(
  provider: "naver-partner" | "admin-station",
  rows: Array<Record<string, unknown>>,
): AppLiveReadPreviewItem[] {
  const providerLabel = provider === "naver-partner" ? "NAVER" : "STATION";
  return rows.slice(0, 4).map((row, index) => ({
    id: `${providerLabel}:${normalizeText(row.date) || index}:${normalizeText(row.roomId) || normalizeText(row.roomName) || index}`,
    title: `${providerLabel} / ${normalizeText(row.roomName) || normalizeText(row.roomId) || "-"}`,
    subtitle: [normalizeText(row.date), normalizeText(row.channel), normalizeText(row.status)]
      .filter(Boolean)
      .join(" · "),
    statusLabel: normalizeText(row.openStatus) || normalizeText(row.status) || "LIVE",
  }));
}

async function scoreSheetReviewCandidates(payload: LiveSheetBridgePayload) {
  const settings = await loadSettingsSnapshot();
  const availability = describeEmbeddingAvailability(settings);
  const candidates = payload.reviewCandidates ?? [];
  if (candidates.length === 0) {
    return {
      items: payload.items,
      evidence: [...payload.evidence, `embedding:${availability.reason}`, "reviewCandidates:0"],
      summary: payload.summary,
    };
  }

  let scores: Array<{ id: string; score: number }> = [];
  try {
    scores = await scoreTextPairs(
      settings,
      candidates.map((candidate) => ({
        id: candidate.id,
        left: candidate.leftText || candidate.leftSummary || candidate.roomNo,
        right: candidate.rightText || candidate.rightSummary || candidate.roomNo,
      })),
    );
  } catch (error) {
    return {
      items: payload.items,
      evidence: [
        ...payload.evidence,
        `embedding:error:${error instanceof Error ? error.message : String(error)}`,
        `reviewCandidates:${candidates.length}`,
      ],
      summary: `${payload.summary} 검토 후보 점수화는 건너뛰었습니다.`,
    };
  }

  const scoreMap = new Map(scores.map((item) => [item.id, item.score]));
  const reviewItems = candidates
    .map((candidate) => {
      const score = scoreMap.get(candidate.id);
      return {
        id: `sheet-review:${candidate.id}`,
        title: `${candidate.roomNo || "-"} 검토 후보`,
        subtitle: [candidate.basis || "sheet-review", candidate.leftSummary, candidate.rightSummary].filter(Boolean).join(" · "),
        statusLabel: formatAiStatus(score),
        score: typeof score === "number" ? score : -1,
      };
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, 4)
    .map(({ score: _score, ...item }) => item);

  return {
    items: [...payload.items, ...reviewItems].slice(0, 8),
    evidence: [
      ...payload.evidence,
      `embedding:${availability.reason}`,
      `reviewCandidates:${candidates.length}`,
      `reviewScores:${scores.length}`,
    ],
    summary: reviewItems.length > 0 ? `${payload.summary} 검토 후보 ${reviewItems.length}건을 정리했습니다.` : payload.summary,
  };
}

export async function runPmsRead(input: AppLiveReadInput): Promise<AppLiveReadSnapshot> {
  const readiness = await ensureProviderReadable("wings-pms", "PMS", input.branch);
  const settingsEvidence = await buildSettingsEvidence();
  if (!readiness.ok) {
    return buildError("pms", input.branch, readiness.reason, [...readiness.evidence, ...settingsEvidence]);
  }
  try {
    const live = await fetchWingsReservations({
      branch: input.branch,
      startDate: input.startDate,
      endDate: input.endDate,
    });
    const records = Array.isArray(live?.records) ? (live.records as Array<Record<string, unknown>>) : [];
    const source = normalizeText(live?.source);
    if (source === "unavailable" || source === "pms-unconfigured") {
      return buildLiveReadRuntimeErrorSnapshot({
        source: "pms",
        branch: input.branch,
        blockedReason: `${input.branch} PMS live read에 실패했습니다.`,
        evidence: [
          ...readiness.evidence,
          `window:${input.startDate}..${input.endDate}`,
          `pmsSource:${source || "-"}`,
          `pmsEndpoint:${normalizeText(live?.endpointCapability) || "-"}`,
          `pmsError:${normalizeText(live?.error) || "-"}`,
          ...settingsEvidence,
        ],
        error: normalizeText(live?.error) || `pmsSource:${source || "-"}`,
      });
    }
    return {
      source: "pms",
      branch: input.branch,
      checkedAt: nowIso(),
      status: "done",
      summary:
        records.length > 0
          ? `${input.branch} PMS live reservations ${records.length}건을 읽었습니다.`
          : `${input.branch} PMS live reservations 결과가 비어 있습니다.`,
      recordsImported: records.length,
      blockedReason: null,
      items: buildPmsPreviewItems(records),
      evidence: [
        ...readiness.evidence,
        `window:${input.startDate}..${input.endDate}`,
        `pmsSource:${normalizeText(live?.source) || "-"}`,
        `pmsEndpoint:${normalizeText(live?.endpointCapability) || "-"}`,
        `pmsRecords:${records.length}`,
        ...settingsEvidence,
      ],
    };
  } catch (error) {
    return buildLiveReadRuntimeErrorSnapshot({
      source: "pms",
      branch: input.branch,
      blockedReason: `${input.branch} PMS live read에 실패했습니다.`,
      evidence: [...readiness.evidence, `window:${input.startDate}..${input.endDate}`, ...settingsEvidence],
      error,
    });
  }
}

export async function runOtaRead(input: AppLiveReadInput): Promise<AppLiveReadSnapshot> {
  const naver = await ensureProviderReadable("naver-partner", "OTA", input.branch);
  const station = await ensureProviderReadable("admin-station", "OTA", input.branch);
  if (!naver.ok && !station.ok) {
    return buildError("ota", input.branch, "OTA 세션이 준비되지 않았습니다.", [...naver.evidence, ...station.evidence]);
  }
  const settingsEvidence = await buildSettingsEvidence();
  const results: Array<{
    provider: "naver-partner" | "admin-station";
    source: string;
    rows: Array<Record<string, unknown>>;
  }> = [];
  const providerErrors: string[] = [];
  if (naver.ok) {
    try {
      const response = await fetchProviderRowsLive("naver-partner", {
        startDate: input.startDate,
        endDate: input.endDate,
        branch: input.branch,
      });
      results.push({
        provider: "naver-partner",
        source: normalizeText(response.source),
        rows: Array.isArray(response.rows) ? (response.rows as Array<Record<string, unknown>>) : [],
      });
    } catch (error) {
      providerErrors.push(`naver-partner:${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (station.ok) {
    try {
      const response = await fetchProviderRowsLive("admin-station", {
        startDate: input.startDate,
        endDate: input.endDate,
        branch: input.branch,
      });
      results.push({
        provider: "admin-station",
        source: normalizeText(response.source),
        rows: Array.isArray(response.rows) ? (response.rows as Array<Record<string, unknown>>) : [],
      });
    } catch (error) {
      providerErrors.push(`admin-station:${error instanceof Error ? error.message : String(error)}`);
    }
  }
  try {
    if (results.length === 0) {
      throw new Error(providerErrors.join(" | ") || "ota-source-unavailable");
    }
    const recordsImported = results.reduce((sum, result) => sum + result.rows.length, 0);
    return {
      source: "ota",
      branch: input.branch,
      checkedAt: nowIso(),
      status: "done",
      summary:
        recordsImported > 0
          ? `${input.branch} OTA live rows ${recordsImported}건을 읽었습니다.`
          : `${input.branch} OTA live rows 결과가 비어 있습니다.`,
      recordsImported,
      blockedReason: null,
      items: results.flatMap((result) => buildProviderPreviewItems(result.provider, result.rows)).slice(0, 8),
      evidence: [
        ...naver.evidence,
        ...station.evidence,
        `window:${input.startDate}..${input.endDate}`,
        ...results.map((result) => `${result.provider}:${result.source || "-"}/${result.rows.length}`),
        ...providerErrors.map((entry) => `providerError:${entry}`),
        ...settingsEvidence,
      ],
    };
  } catch (error) {
    return buildLiveReadRuntimeErrorSnapshot({
      source: "ota",
      branch: input.branch,
      blockedReason: `${input.branch} OTA live read에 실패했습니다.`,
      evidence: [
        ...naver.evidence,
        ...station.evidence,
        `window:${input.startDate}..${input.endDate}`,
        ...providerErrors.map((entry) => `providerError:${entry}`),
        ...settingsEvidence
      ],
      error,
    });
  }
}

export async function runSheetRead(input: AppLiveReadInput): Promise<AppLiveReadSnapshot> {
  const settings = await loadSettingsSnapshot();
  if (!settings.isConfigured) {
    return buildError("sheet", input.branch, "예약 시트 설정을 먼저 저장해 주세요.", [
      `spreadsheet:${settings.config?.spreadsheet ? "set" : "missing"}`,
      `sheetName:${settings.config?.sheetName ? "set" : "missing"}`,
      `sheetTabs:${settings.config?.sheetTabs ? "set" : "missing"}`,
    ]);
  }
  try {
    const payload = await runLiveSheetBridge(input);
    const settingsEvidence = await buildSettingsEvidence();
    const scored = await scoreSheetReviewCandidates(payload);
    return {
      source: "sheet",
      branch: input.branch,
      checkedAt: payload.checkedAt,
      status: "done",
      summary: `${scored.summary} (${input.startDate} ~ ${input.endDate})`,
      recordsImported: payload.recordsImported,
      blockedReason: null,
      items: scored.items,
      evidence: [...scored.evidence, `window:${input.startDate}..${input.endDate}`, ...settingsEvidence],
    };
  } catch (error) {
    return buildError("sheet", input.branch, "예약 시트 라이브 조회에 실패했습니다.", [
      `error:${error instanceof Error ? error.message : String(error)}`,
    ]);
  }
}
