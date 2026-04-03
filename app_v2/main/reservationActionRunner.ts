import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type {
  AppBranch,
  AppReservationActionInput,
  AppReservationActionRow,
  AppReservationActionSnapshot,
  AppSettingsSnapshot,
} from "../../src/desktop/app-v2-contracts.js";
import { getAppBranchOption } from "../../src/desktop/app-v2-contracts.js";
import { describeEmbeddingAvailability } from "./embeddingRuntime.js";
import {
  buildHybridCandidateDecisions,
  type HybridCandidatePair,
  type HybridDecision,
  type HybridSearchBundle,
} from "./hybridCandidateEngine.js";
import { loadSettingsSnapshot } from "./settingsStore.js";

const PYTHON_COMMAND = process.env.PYTHON_BIN || "python3";

interface ContinuationCandidate {
  id: string;
  date: string;
  roomNo: string;
  basis: string;
  departureText: string;
  arrivalText: string;
  noteHead: string;
  departureReservationNo?: string;
  arrivalReservationNo?: string;
  sameReservationNo?: boolean;
  sameGuestName?: boolean;
  samePhone?: boolean;
  departureChannel?: string;
  arrivalChannel?: string;
  noteSignature?: string;
  packageMarkers?: string[];
  roomChangeBlocker?: boolean;
  candidateFeatures?: string[];
  contradictionFlags?: string[];
}

interface OpsBridgePayload {
  branch: AppBranch;
  checkedAt: string;
  reservationBlocks: number;
  windowReservationBlocks?: number;
  orderlistRows: number;
  arrivalRows: number;
  continuationCandidates: ContinuationCandidate[];
  searchBundles?: HybridSearchBundle[];
  items: Array<{ id: string; title: string; subtitle: string; statusLabel: string }>;
  evidence: string[];
  error?: string;
}

interface ManagementBridgePayload {
  mode: "compare" | "reconcile" | "apply";
  branch: AppBranch;
  checkedAt: string;
  engineStatus: "pending-source" | "planned";
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

function buildStatusRow(
  id: string,
  primary: string,
  secondary: string,
  statusLabel: string,
  detail?: string,
): AppReservationActionRow {
  return { id, primary, secondary, statusLabel, detail };
}

function buildErrorRows(input: AppReservationActionInput, message: string): AppReservationActionRow[] {
  return [
    buildStatusRow(
      `${input.action}-error`,
      `${input.branch} ${input.action} 실행 실패`,
      message,
      "ERROR",
      "runtime-error",
    ),
  ];
}

function buildWaitingRows(input: AppReservationActionInput): AppReservationActionRow[] {
  return [
    buildStatusRow(
      `${input.action}-waiting`,
      `${input.branch} ${input.action} 실행 대기`,
      `${input.startDate} ~ ${input.endDate}`,
      "WAIT",
      "실제 실행 결과만 표시합니다.",
    ),
  ];
}

function makeEvidence(settingsSummary: AppSettingsSnapshot, excludeRoomMakeup: boolean) {
  const bge = settingsSummary.config?.bgeM3;
  return [
    `windowDays:${settingsSummary.config?.reportWindowDays ?? 5}`,
    `sheetTabs:${settingsSummary.config?.sheetTabs ? "set" : "missing"}`,
    `excludeRoomMakeup:${excludeRoomMakeup ? "on" : "off"}`,
    `bgeM3:${bge?.enabled ? "on" : "off"}`,
    `bgeRuntime:${bge?.runtime ?? "local-path"}`,
    `bgeModelPath:${bge?.modelPath ? "set" : "missing"}`,
    `bgeTopK:${bge?.topK ?? 5}`,
    `bgeThreshold:${bge?.scoreThreshold ?? 0.72}`,
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
    const child = spawn(PYTHON_COMMAND, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
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
    if (branch === "COEX") return [tabs.coexMain, tabs.coexAnnex].filter(Boolean);
    if (branch === "GANGNAM") return [tabs.gangnam].filter(Boolean);
    if (branch === "SEOLLEUNG") return [tabs.seolleung].filter(Boolean);
    return [tabs.samsung].filter(Boolean);
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
  const cwd = process.cwd();
  const scriptPath = path.join(cwd, "scripts", "app_v2_live_sheet_bridge.py");
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
  const { stdout } = await runPythonScript(args, cwd);
  const payload = JSON.parse(stdout) as OpsBridgePayload;
  if (payload.error) throw new Error(payload.error);
  return payload;
}

async function runManagementBridge(
  input: AppReservationActionInput,
  settingsSnapshot: AppSettingsSnapshot,
): Promise<ManagementBridgePayload> {
  const spreadsheet = settingsSnapshot.config?.spreadsheet?.trim() ?? "";
  const sheetNames = resolveSheetNames(input.branch, settingsSnapshot);
  const cwd = process.cwd();
  const scriptPath = path.join(cwd, "scripts", "app_v2_reservation_management_bridge.py");
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
  if (input.approvePlanToken?.trim()) {
    args.push("--approve-plan-token", input.approvePlanToken.trim());
  }
  if (input.executeApply === true) {
    args.push("--execute-apply");
  }
  const { stdout } = await runPythonScript(args, cwd);
  const payload = JSON.parse(stdout) as ManagementBridgePayload;
  if (payload.error) throw new Error(payload.error);
  return payload;
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
  const decisions = await buildHybridDecisionsForOps(settingsSnapshot, payload);
  const availability = describeEmbeddingAvailability(settingsSnapshot);
  const aiReview = buildOpsAiReviewRows(parseTabularRows(tableRaw, input.action), decisions);
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
      `recommendEdit:${aiReview.recommendEditRows}`,
      `abstain:${aiReview.abstainRows}`,
      ...payload.evidence,
      ...makeEvidence(settingsSnapshot, excludeRoomMakeup),
    ],
    rows: aiReview.rows,
    outputPath: outDir,
  };
}

function buildOpsBundle(branch: AppBranch, candidate: ContinuationCandidate, side: "left" | "right"): HybridSearchBundle {
  const reservationNo = side === "left" ? candidate.departureReservationNo || candidate.departureText : candidate.arrivalReservationNo || candidate.arrivalText;
  const channel = side === "left" ? candidate.departureChannel || "" : candidate.arrivalChannel || "";
  return {
    id: `${candidate.id}:${side}`,
    branch,
    roomNo: candidate.roomNo,
    reservationNo,
    reservationKey: reservationNo,
    guestName: "",
    phone: "",
    channel,
    checkin: side === "left" ? candidate.date : candidate.date,
    checkout: side === "left" ? candidate.date : candidate.date,
    noteHead: candidate.noteHead || "",
    noteSignature: candidate.noteSignature || candidate.noteHead || "",
    packageMarkers: candidate.packageMarkers ?? [],
    roomChangeBlocker: candidate.roomChangeBlocker === true,
  };
}

function buildOpsAiReviewRows(
  rows: AppReservationActionRow[],
  decisions: HybridDecision[],
) {
  const decisionMap = new Map(decisions.map((item) => [item.pair.left.roomNo + ":" + item.pair.left.checkin, item]));
  let scoredRows = 0;
  let recommendEditRows = 0;
  let abstainRows = 0;
  const nextRows = rows.map((row) => {
    const [roomNo = ""] = row.primary.split(" / ");
    const [date = ""] = row.secondary.split(" · ");
    const decision = decisionMap.get(`${roomNo.trim()}:${date.trim()}`);
    if (!decision) return row;
    const detailParts = [row.detail, `연박 후보 · ${decision.reason}`];
    if (typeof decision.score === "number") {
      detailParts.push(`sim ${decision.score.toFixed(2)}`);
      scoredRows += 1;
    }
    if (decision.state === "recommend-edit") recommendEditRows += 1;
    if (decision.state === "abstain") abstainRows += 1;
    return {
      ...row,
      statusLabel:
        decision.state === "confirm"
          ? "확정"
          : decision.state === "recommend-edit"
            ? "수정 추천"
            : decision.state === "review"
              ? "검토"
              : "보류",
      detail: detailParts.filter(Boolean).join(" / "),
    };
  });
  return {
    rows: nextRows,
    scoredRows,
    recommendEditRows,
    abstainRows,
  };
}

async function buildHybridDecisionsForOps(settingsSnapshot: AppSettingsSnapshot, payload: OpsBridgePayload) {
  const pairs: HybridCandidatePair[] = payload.continuationCandidates.map((candidate) => ({
    id: candidate.id,
    basis: [candidate.basis || "continuation"],
    left: buildOpsBundle(payload.branch, candidate, "left"),
    right: buildOpsBundle(payload.branch, candidate, "right"),
  }));
  return buildHybridCandidateDecisions(settingsSnapshot, pairs);
}

function buildContinuationRows(input: AppReservationActionInput, decisions: HybridDecision[]): AppReservationActionRow[] {
  return decisions.slice(0, 8).map((decision, index) => ({
    id: `${input.action}-${index}`,
    primary: `${decision.pair.left.roomNo} / ${decision.pair.left.checkin || decision.pair.right.checkin}`,
    secondary: [decision.reason, decision.pair.left.reservationNo, decision.pair.right.reservationNo].filter(Boolean).join(" · "),
    statusLabel:
      decision.state === "confirm"
        ? "확정"
        : decision.state === "recommend-edit"
          ? "수정 추천"
          : decision.state === "review"
            ? "검토"
            : "보류",
    detail: [...decision.features.contradictionFlags, decision.pair.left.noteHead].filter(Boolean).join(" / "),
  }));
}

export async function runReservationAction(input: AppReservationActionInput): Promise<AppReservationActionSnapshot> {
  const branchOption = getAppBranchOption(input.branch);
  if (branchOption.availability !== "active") {
    return {
      action: input.action,
      branch: input.branch,
      startDate: input.startDate,
      endDate: input.endDate,
      checkedAt: nowIso(),
      status: "error",
      summary: `${branchOption.label} 지점은 아직 운영 경로가 열리지 않았습니다.`,
      evidence: [`branch:${input.branch}`, `branchAvailability:${branchOption.availability}`, `branchReason:${branchOption.reason}`],
      rows: buildErrorRows(input, `${branchOption.label} 지점은 아직 운영 경로가 열리지 않았습니다.`),
      outputPath: null,
    };
  }
  const settingsSnapshot = await loadSettingsSnapshot();
  if (input.action === "order-list" || input.action === "arrival") {
    return runLiveOpsPreview(input, settingsSnapshot);
  }

  if (input.action === "compare" || input.action === "reconcile" || input.action === "apply") {
    try {
      const payload = await runManagementBridge(input, settingsSnapshot);
      return {
        action: input.action,
        branch: input.branch,
        startDate: input.startDate,
        endDate: input.endDate,
        checkedAt: payload.checkedAt,
        status: "done",
        summary: payload.summary,
        evidence: [
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
      const message = error instanceof Error ? error.message : String(error);
      return {
        action: input.action,
        branch: input.branch,
        startDate: input.startDate,
        endDate: input.endDate,
        checkedAt: nowIso(),
        status: "error",
        summary: `${input.branch} ${input.action} 엔진 실행에 실패했습니다.`,
        evidence: [`error:${message}`],
        rows: buildErrorRows(input, message),
        outputPath: null,
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
      const decisions = await buildHybridDecisionsForOps(settingsSnapshot, payload);
      const availability = describeEmbeddingAvailability(settingsSnapshot);
      const rows = buildContinuationRows(input, decisions);
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
            `recommendEdit:${decisions.filter((item) => item.state === "recommend-edit").length}`,
            `abstain:${decisions.filter((item) => item.state === "abstain").length}`,
            ...makeEvidence(settingsSnapshot, input.excludeRoomMakeup ?? settingsSnapshot.config?.opsView?.excludeRoomMakeup ?? false),
          ],
          rows,
          outputPath: outDir,
        };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        action: input.action,
        branch: input.branch,
        startDate: input.startDate,
        endDate: input.endDate,
        checkedAt: nowIso(),
        status: "error",
        summary: `${input.branch} ${input.action} 라이브 검토에 실패했습니다.`,
        evidence: [`error:${message}`],
        rows: buildErrorRows(input, message),
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
    status: "done",
    summary: `${input.branch} ${input.action} 작업 결과를 준비했습니다.`,
    evidence: [`window:${input.startDate}..${input.endDate}`, ...makeEvidence(settingsSnapshot, input.excludeRoomMakeup ?? settingsSnapshot.config?.opsView?.excludeRoomMakeup ?? false)],
    rows: buildWaitingRows(input),
    outputPath: null,
  };
}
