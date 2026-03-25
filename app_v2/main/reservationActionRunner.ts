import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  AppBranch,
  AppReservationActionInput,
  AppReservationActionRow,
  AppReservationActionSnapshot,
  AppSettingsSnapshot,
} from "../../src/desktop/app-v2-contracts.js";
import { describeEmbeddingAvailability, scoreTextPairs } from "./embeddingRuntime.js";
import { buildPendingSourceActionSnapshot } from "./runtimeSafety.js";
import { loadSettingsSnapshot } from "./settingsStore.js";
import { buildSourceReservationsFromPmsRecords, writeSourceReservationsFixture } from "./sourceReservationRuntime.js";
import { fetchWingsReservations } from "./wingsReservationRuntime.js";

const PYTHON_COMMAND = process.env.PYTHON_BIN || "python3";
const currentDir = path.dirname(fileURLToPath(import.meta.url));

interface ContinuationCandidate {
  id: string;
  date: string;
  roomNo: string;
  basis: string;
  departureText: string;
  arrivalText: string;
  noteHead: string;
}

interface OpsBridgePayload {
  branch: AppBranch;
  checkedAt: string;
  reservationBlocks: number;
  orderlistRows: number;
  arrivalRows: number;
  continuationCandidates: ContinuationCandidate[];
  items: Array<{ id: string; title: string; subtitle: string; statusLabel: string }>;
  evidence: string[];
  error?: string;
}

function detectRuntimeAssetRoot() {
  // Resolve scripts from module-relative root first, then packaged resources root for Windows artifact layouts.
  const candidateRoots = [path.resolve(currentDir, "..", "..", "..")];
  if (process.resourcesPath) candidateRoots.push(path.resolve(process.resourcesPath));
  for (const root of candidateRoots) {
    if (
      fsSync.existsSync(path.join(root, "scripts", "app_v2_reservation_management_bridge.py")) &&
      fsSync.existsSync(path.join(root, "src", "io", "pms.fetch.js"))
    ) {
      return root;
    }
  }
  return candidateRoots[0];
}

function resolvePythonScript(scriptName: "app_v2_live_sheet_bridge.py" | "app_v2_reservation_management_bridge.py") {
  const root = detectRuntimeAssetRoot();
  return {
    scriptPath: path.join(root, "scripts", scriptName),
    runtimeCwd: root,
  };
}

interface ManagementBridgePayload {
  mode: "compare" | "reconcile" | "apply";
  branch: AppBranch;
  checkedAt: string;
  engineStatus: "pending-source" | "planned" | "applied";
  summary: string;
  issueCount: number;
  rows: AppReservationActionRow[];
  evidence: string[];
  planToken?: string;
  requiresApproval?: boolean;
  applyAllowed?: boolean;
  error?: string;
}

function nowIso() {
  return new Date().toISOString();
}

function makeEvidence(settingsSummary: AppSettingsSnapshot, excludeRoomMakeup: boolean) {
  const bge = settingsSummary.config?.bgeM3;
  return [
    `windowDays:${settingsSummary.config?.reportWindowDays ?? "-"}`,
    `sheetTabs:${settingsSummary.config?.sheetTabs ? "set" : "missing"}`,
    `excludeRoomMakeup:${excludeRoomMakeup ? "on" : "off"}`,
    `bgeM3:${bge?.enabled ? "on" : "off"}`,
    `bgeRuntime:${bge?.runtime ?? "local-path"}`,
    `bgeModelPath:${bge?.modelPath ? "set" : "missing"}`,
    `bgeTopK:${bge?.topK ?? "-"}`,
    `bgeThreshold:${bge?.scoreThreshold ?? "-"}`,
  ];
}

function parseTabularRows(raw: string, action: AppReservationActionInput["action"]): AppReservationActionRow[] {
  const lines = raw.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split("\t");
  return lines.slice(1, 11).map((line, index) => {
    const values = line.split("\t");
    const row = Object.fromEntries(headers.map((header, headerIndex) => [header, values[headerIndex] ?? ""]));
    if (action === "order-list") {
      return {
        id: `order-${index}`,
        primary: `${row.room_no || "-"} / ${row.task_label || "작업"}`,
        secondary: [row.date, row.note_heads || row.note_head, row.arrival_reservation_nos].filter(Boolean).join(" · ") || "오더리스트",
        statusLabel: row.task_rule_id || "OPS",
        detail: row.continuation_candidate === "Y" ? `연박 후보 · ${row.continuation_basis || "basis-unknown"}` : "",
      };
    }
    return {
      id: `arrival-${index}`,
      primary: `${row.room_no || "-"} / ${row.section || "ARRIVAL"}`,
      secondary: [row.date, row.arrival_text || row.note_head, row.arrival_reservation_nos].filter(Boolean).join(" · ") || "어라이벌",
      statusLabel: row.section || "ARRIVAL",
      detail: row.continuation_candidate === "Y" ? `연박 후보 · ${row.continuation_basis || "basis-unknown"}` : "",
    };
  });
}

function runPythonScript(args: string[], cwd: string) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
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
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(stderr.trim() || stdout.trim() || `python exited with ${code}`));
    });
  });
}

function resolveSheetNames(branch: AppBranch, settingsSnapshot: AppSettingsSnapshot) {
  const tabs = settingsSnapshot.config?.sheetTabs;
  if (tabs) {
    return branch === "COEX" ? [tabs.coexMain, tabs.coexAnnex].filter(Boolean) : [tabs.gangnam].filter(Boolean);
  }
  return settingsSnapshot.config?.sheetName ? [settingsSnapshot.config.sheetName] : [];
}

async function runLiveOpsBridge(
  input: AppReservationActionInput,
  settingsSnapshot: AppSettingsSnapshot,
  outDir: string,
): Promise<OpsBridgePayload> {
  const spreadsheet = settingsSnapshot.config?.spreadsheet?.trim() ?? "";
  const sheetNames = resolveSheetNames(input.branch, settingsSnapshot);
  if (!spreadsheet || sheetNames.length === 0) {
    throw new Error("예약 시트 설정이 비어 있습니다.");
  }
  const { scriptPath, runtimeCwd } = resolvePythonScript("app_v2_live_sheet_bridge.py");
  const excludeRoomMakeup = input.excludeRoomMakeup ?? settingsSnapshot.config?.opsView?.excludeRoomMakeup ?? false;
  const args = [
    scriptPath,
    "ops-preview",
    "--spreadsheet",
    spreadsheet,
    "--branch",
    input.branch,
    "--start-date",
    input.startDate,
    "--end-date",
    input.endDate,
    "--out-dir",
    outDir,
  ];
  for (const sheetName of sheetNames) {
    args.push("--sheet-name", sheetName);
  }
  if (excludeRoomMakeup) {
    args.push("--exclude-room-makeup");
  }
  if (input.flagContinuationCandidates !== false) {
    args.push("--flag-continuation-candidates");
  }
  const { stdout } = await runPythonScript(args, runtimeCwd);
  const payload = JSON.parse(stdout) as OpsBridgePayload;
  if (payload.error) throw new Error(payload.error);
  return payload;
}

async function runManagementBridge(
  input: AppReservationActionInput,
  settingsSnapshot: AppSettingsSnapshot,
  sourceFixturePath: string,
  runtimeEvidence: string[],
): Promise<{ payload: ManagementBridgePayload; runtimeEvidence: string[] }> {
  const spreadsheet = settingsSnapshot.config?.spreadsheet?.trim() ?? "";
  const sheetNames = resolveSheetNames(input.branch, settingsSnapshot);
  const { scriptPath, runtimeCwd } = resolvePythonScript("app_v2_reservation_management_bridge.py");
  const args = [
    scriptPath,
    input.action,
    "--branch",
    input.branch,
    "--start-date",
    input.startDate,
    "--end-date",
    input.endDate,
  ];
  if (spreadsheet) {
    args.push("--spreadsheet", spreadsheet);
  }
  for (const sheetName of sheetNames) {
    args.push("--sheet-name", sheetName);
  }
  if (sourceFixturePath) {
    args.push("--source-fixture", sourceFixturePath);
  }
  if (input.approvePlanToken?.trim()) {
    args.push("--approve-plan-token", input.approvePlanToken.trim());
  }
  if (input.executeApply === true) {
    args.push("--execute-apply");
  }
  const { stdout } = await runPythonScript(args, runtimeCwd);
  const payload = JSON.parse(stdout) as ManagementBridgePayload;
  if (payload.error) throw new Error(payload.error);
  return {
    payload,
    runtimeEvidence,
  };
}

async function prepareManagementSourceFixture(input: AppReservationActionInput) {
  try {
    const live = await fetchWingsReservations({
      branch: input.branch,
      startDate: input.startDate,
      endDate: input.endDate,
    });
    const liveRecords = Array.isArray(live?.records) ? live.records : [];
    const sourceRows = buildSourceReservationsFromPmsRecords(liveRecords, "PMS");
    if (sourceRows.length === 0) {
      return {
        ok: false as const,
        reason: `${input.action} 엔진은 준비되었지만 source bundle이 아직 없습니다.`,
        evidence: [
          `pmsSource:${String(live?.source || "-")}`,
          `pmsEndpoint:${String(live?.endpointCapability || "-")}`,
          `pmsUrl:${String(live?.url || "-")}`,
          `pmsError:${String(live?.error || "-")}`,
          `pmsAttempts:${Array.isArray(live?.attempts) ? live.attempts.length : 0}`,
          "sourceFixture:live:0",
        ],
      };
    }
    const sourceDir = await fs.mkdtemp(path.join(os.tmpdir(), "uhs-app-v2-source-live-"));
    const written = await writeSourceReservationsFixture(sourceRows, sourceDir);
    return {
      ok: true as const,
      sourceFixturePath: written.path,
      runtimeEvidence: [
        `sourceFixture:live:${written.count}`,
        `pmsSource:${String(live?.source || "-")}`,
        `pmsEndpoint:${String(live?.endpointCapability || "-")}`,
      ],
    };
  } catch (error) {
    return {
      ok: false as const,
      reason: `${input.action} 엔진은 준비되었지만 source bundle을 아직 만들 수 없습니다.`,
      evidence: [`sourceFixture:error:${error instanceof Error ? error.message : String(error)}`],
    };
  }
}

async function runLiveOpsPreview(
  input: AppReservationActionInput,
  settingsSnapshot: AppSettingsSnapshot,
): Promise<AppReservationActionSnapshot> {
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), "uhs-app-v2-ops-live-"));
  const payload = await runLiveOpsBridge(input, settingsSnapshot, outDir);
  const tsvPath = path.join(outDir, input.action === "order-list" ? "orderlist_report.tsv" : "arrival_report.tsv");
  const tableRaw = await fs.readFile(tsvPath, "utf8");
  const total = input.action === "order-list" ? payload.orderlistRows : payload.arrivalRows;
  const excludeRoomMakeup = input.excludeRoomMakeup ?? settingsSnapshot.config?.opsView?.excludeRoomMakeup ?? false;
  const scores = await buildEmbeddingScores(settingsSnapshot, payload);
  const availability = describeEmbeddingAvailability(settingsSnapshot);
  const aiReview = buildOpsAiReviewRows(parseTabularRows(tableRaw, input.action), payload, scores);
  return {
    action: input.action,
    branch: input.branch,
    startDate: input.startDate,
    endDate: input.endDate,
    checkedAt: payload.checkedAt,
    status: "done",
    summary:
      input.action === "order-list"
        ? `${input.branch} 오더리스트 라이브 미리보기를 생성했습니다. 검토 후보 ${aiReview.scoredRows}건을 정렬했습니다.`
        : `${input.branch} 어라이벌 라이브 미리보기를 생성했습니다. 검토 후보 ${aiReview.scoredRows}건을 정렬했습니다.`,
    evidence: [
      `python:${PYTHON_COMMAND}`,
      `window:${input.startDate}..${input.endDate}`,
      `rows:${total}`,
      `embedding:${availability.reason}`,
      `scoredRows:${aiReview.scoredRows}`,
      ...payload.evidence,
      ...makeEvidence(settingsSnapshot, excludeRoomMakeup),
    ],
    rows: aiReview.rows,
    outputPath: outDir,
  };
}

function buildContinuationRows(
  input: AppReservationActionInput,
  payload: OpsBridgePayload,
  scores: Array<{ id: string; score: number }>,
): AppReservationActionRow[] {
  const scoreMap = new Map(scores.map((item) => [item.id, item.score]));
  return payload.continuationCandidates.slice(0, 8).map((candidate, index) => {
    const similarity = scoreMap.get(candidate.id);
    const similarityLabel = typeof similarity === "number" ? ` / sim ${similarity.toFixed(2)}` : "";
    const statusLabel =
      input.action === "edit"
        ? typeof similarity === "number" && similarity >= 0.9
          ? "AI 추천"
          : "AI 검토"
        : typeof similarity === "number" && similarity >= 0.9
          ? "추천"
          : "검토";
    return {
      id: `${input.action}-${index}`,
      primary: `${candidate.roomNo} / ${candidate.date}`,
      secondary: [candidate.basis || "continuation", candidate.departureText, candidate.arrivalText]
        .filter(Boolean)
        .join(" · "),
      statusLabel,
      detail: `${candidate.noteHead || "note-missing"}${similarityLabel}`,
    };
  });
}

async function buildEmbeddingScores(
  settingsSnapshot: AppSettingsSnapshot,
  payload: OpsBridgePayload,
) {
  if (payload.continuationCandidates.length === 0) return [];
  return scoreTextPairs(
    settingsSnapshot,
    payload.continuationCandidates.map((candidate) => ({
      id: candidate.id,
      left: candidate.departureText || candidate.noteHead || candidate.roomNo,
      right: candidate.arrivalText || candidate.noteHead || candidate.roomNo,
    })),
  );
}

function buildOpsAiReviewRows(
  rows: AppReservationActionRow[],
  payload: OpsBridgePayload,
  scores: Array<{ id: string; score: number }>,
) {
  const scoreMap = new Map(scores.map((item) => [item.id, item.score]));
  const continuationByRoomDate = new Map(
    payload.continuationCandidates.map((candidate) => [`${candidate.roomNo.trim()}::${candidate.date.trim()}`, candidate]),
  );
  let scoredRows = 0;
  const nextRows = rows.map((row) => {
    const [roomNo = ""] = row.primary.split(" / ");
    const [date = ""] = row.secondary.split(" · ");
    const candidate = continuationByRoomDate.get(`${roomNo.trim()}::${date.trim()}`);
    if (!candidate) return row;
    const similarity = scoreMap.get(candidate.id);
    const detailParts = [row.detail, `연박 후보 · ${candidate.basis || "continuation"}`];
    if (typeof similarity === "number") {
      detailParts.push(`sim ${similarity.toFixed(2)}`);
      scoredRows += 1;
    }
    return {
      ...row,
      detail: detailParts.filter(Boolean).join(" / "),
    };
  });
  return {
    rows: nextRows,
    scoredRows,
  };
}

export async function runReservationAction(input: AppReservationActionInput): Promise<AppReservationActionSnapshot> {
  const settingsSnapshot = await loadSettingsSnapshot();
  if (input.action === "order-list" || input.action === "arrival") {
    return runLiveOpsPreview(input, settingsSnapshot);
  }

  if (input.action === "compare" || input.action === "reconcile" || input.action === "apply") {
    const sourcePreparation = await prepareManagementSourceFixture(input);
    if (!sourcePreparation.ok) {
      return buildPendingSourceActionSnapshot({
        action: input.action,
        branch: input.branch,
        startDate: input.startDate,
        endDate: input.endDate,
        reason: sourcePreparation.reason,
        evidence: [
          ...sourcePreparation.evidence,
          ...makeEvidence(settingsSnapshot, input.excludeRoomMakeup ?? settingsSnapshot.config?.opsView?.excludeRoomMakeup ?? false),
        ],
      });
    }
    try {
      const { payload, runtimeEvidence } = await runManagementBridge(
        input,
        settingsSnapshot,
        sourcePreparation.sourceFixturePath,
        sourcePreparation.runtimeEvidence,
      );
      return {
        action: input.action,
        branch: input.branch,
        startDate: input.startDate,
        endDate: input.endDate,
        checkedAt: payload.checkedAt,
        status: "done",
        summary: payload.summary,
        evidence: [
          ...runtimeEvidence,
          ...payload.evidence,
          `engineStatus:${payload.engineStatus}`,
          ...makeEvidence(settingsSnapshot, input.excludeRoomMakeup ?? settingsSnapshot.config?.opsView?.excludeRoomMakeup ?? false),
        ],
        rows: payload.rows,
        outputPath: null,
        engineStatus: payload.engineStatus,
        issueCount: payload.issueCount,
        planToken: payload.planToken ?? "",
        requiresApproval: payload.requiresApproval ?? false,
        applyAllowed: payload.applyAllowed ?? false,
      };
    } catch (error) {
      return {
        action: input.action,
        branch: input.branch,
        startDate: input.startDate,
        endDate: input.endDate,
        checkedAt: nowIso(),
        status: "error",
        summary: `${input.branch} ${input.action} 엔진 실행에 실패했습니다.`,
        evidence: [`error:${error instanceof Error ? error.message : String(error)}`],
        rows: [],
        outputPath: null,
        engineStatus: "fallback",
        issueCount: 0,
        planToken: "",
        requiresApproval: false,
        applyAllowed: false,
      };
    }
  }

  if (input.action === "validate" || input.action === "edit") {
    try {
      const outDir = await fs.mkdtemp(path.join(os.tmpdir(), "uhs-app-v2-ops-validate-"));
      const payload = await runLiveOpsBridge(input, settingsSnapshot, outDir);
      const scores = await buildEmbeddingScores(settingsSnapshot, payload);
      const availability = describeEmbeddingAvailability(settingsSnapshot);
      const rows = buildContinuationRows(input, payload, scores);
      if (rows.length > 0) {
        return {
          action: input.action,
          branch: input.branch,
          startDate: input.startDate,
          endDate: input.endDate,
          checkedAt: payload.checkedAt,
          status: "done",
          summary:
            input.action === "validate"
              ? `${input.branch} 연박 후보 ${rows.length}건을 검토했습니다.`
              : `${input.branch} read-only 수정 추천 ${rows.length}건을 정리했습니다.`,
          evidence: [
            ...payload.evidence,
            `embedding:${availability.reason}`,
            `continuationCandidates:${payload.continuationCandidates.length}`,
            ...makeEvidence(settingsSnapshot, input.excludeRoomMakeup ?? settingsSnapshot.config?.opsView?.excludeRoomMakeup ?? false),
          ],
          rows,
          outputPath: outDir,
        };
      }
    } catch (error) {
      return {
        action: input.action,
        branch: input.branch,
        startDate: input.startDate,
        endDate: input.endDate,
        checkedAt: nowIso(),
        status: "error",
        summary: `${input.branch} ${input.action} 라이브 검토에 실패했습니다.`,
        evidence: [`error:${error instanceof Error ? error.message : String(error)}`],
        rows: [],
        outputPath: null,
      };
    }
  }

  return {
    action: input.action,
    branch: input.branch,
    startDate: input.startDate,
    endDate: input.endDate,
    checkedAt: nowIso(),
    status: "error",
    summary: `${input.branch} ${input.action} 작업은 현재 지원되지 않습니다.`,
    evidence: [
      `window:${input.startDate}..${input.endDate}`,
      "error:unsupported-action",
      ...makeEvidence(settingsSnapshot, input.excludeRoomMakeup ?? settingsSnapshot.config?.opsView?.excludeRoomMakeup ?? false),
    ],
    rows: [],
    outputPath: null,
  };
}
