import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type {
  AppReservationActionInput,
  AppReservationActionRow,
  AppReservationActionSnapshot,
} from "../../src/desktop/app-v2-contracts.js";
import { loadSettingsSnapshot } from "./settingsStore.js";

const PYTHON_COMMAND = process.env.PYTHON_BIN || "python3";

function nowIso() {
  return new Date().toISOString();
}

function makeEvidence(settingsSummary: Awaited<ReturnType<typeof loadSettingsSnapshot>>) {
  const bge = settingsSummary.config?.bgeM3;
  return [
    `windowDays:${settingsSummary.config?.reportWindowDays ?? 5}`,
    `bgeM3:${bge?.enabled ? "on" : "off"}`,
    `bgeRuntime:${bge?.runtime ?? "local-path"}`,
    `bgeModelPath:${bge?.modelPath ? "set" : "missing"}`,
    `bgeTopK:${bge?.topK ?? 5}`,
    `bgeThreshold:${bge?.scoreThreshold ?? 0.72}`,
  ];
}

function buildMockRows(input: AppReservationActionInput): AppReservationActionRow[] {
  const branchLabel = input.branch === "COEX" ? "코엑스" : "강남";
  if (input.action === "compare") {
    return [
      { id: "cmp-1", primary: `${branchLabel} PMS ↔ OTA`, secondary: "판매수량 차이 2건", statusLabel: "검토" },
      { id: "cmp-2", primary: `${branchLabel} OTA ↔ 시트`, secondary: "중복 예약 후보 1건", statusLabel: "주의" },
    ];
  }
  if (input.action === "validate") {
    return [
      { id: "val-1", primary: `${branchLabel} 기준 검증`, secondary: `${input.startDate} ~ ${input.endDate}`, statusLabel: "정상" },
      { id: "val-2", primary: "소프트 매치 후보", secondary: "예약번호 보정 필요 2건", statusLabel: "보조" },
    ];
  }
  if (input.action === "reconcile") {
    return [
      { id: "rec-1", primary: `${branchLabel} PMS ↔ 시트`, secondary: "체크인 차이 1건", statusLabel: "대조" },
      { id: "rec-2", primary: `${branchLabel} PMS ↔ OTA`, secondary: "상태 재동기화 후보", statusLabel: "주의" },
    ];
  }
  if (input.action === "edit") {
    return [
      { id: "edit-1", primary: "수정 대기", secondary: "권장 수정 3건", statusLabel: "편집" },
      { id: "edit-2", primary: "BGE-M3 보조", secondary: "후보 정렬 준비", statusLabel: "AI" },
    ];
  }
  return [
    { id: "apply-1", primary: "반영 전 점검", secondary: `${input.startDate} ~ ${input.endDate}`, statusLabel: "확인" },
    { id: "apply-2", primary: "반영 대기", secondary: "승인 대상 2건", statusLabel: "실행" },
  ];
}

function parseTabularRows(raw: string, action: AppReservationActionInput["action"]): AppReservationActionRow[] {
  const lines = raw.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split("\t");
  return lines.slice(1, 7).map((line, index) => {
    const values = line.split("\t");
    const row = Object.fromEntries(headers.map((header, headerIndex) => [header, values[headerIndex] ?? ""]));
    if (action === "order-list") {
      return {
        id: `order-${index}`,
        primary: `${row.room_no || "-"} / ${row.task_label || "작업"}`,
        secondary: [row.date, row.note_head, row.arrival_reservation_nos].filter(Boolean).join(" · ") || "오더리스트",
        statusLabel: row.task_rule_id || "OPS",
      };
    }
    return {
      id: `arrival-${index}`,
      primary: `${row.room_no || "-"} / ${row.section || "ARRIVAL"}`,
      secondary: [row.date, row.arrival_text || row.note_head, row.arrival_reservation_nos].filter(Boolean).join(" · ") || "어라이벌",
      statusLabel: row.section || "ARRIVAL",
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

async function runOpsPreview(input: AppReservationActionInput): Promise<AppReservationActionSnapshot> {
  const cwd = process.cwd();
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), "uhs-app-v2-ops-"));
  const scriptPath = path.join(cwd, "scripts", "app_v2_ops_preview.py");
  const { stdout, stderr } = await runPythonScript(
    [scriptPath, "--branch", input.branch, "--start-date", input.startDate, "--end-date", input.endDate, "--out-dir", outDir],
    cwd,
  );
  const summaryPath = path.join(outDir, "ops_summary.json");
  const tsvPath = path.join(outDir, input.action === "order-list" ? "orderlist_report.tsv" : "arrival_report.tsv");
  const [summaryRaw, tableRaw] = await Promise.all([fs.readFile(summaryPath, "utf8"), fs.readFile(tsvPath, "utf8")]);
  const summary = JSON.parse(summaryRaw) as {
    derived_reports?: {
      orderlist?: { counts?: { total_rows?: number } };
      arrival?: { counts?: { total_rows?: number } };
    };
  };
  const total =
    input.action === "order-list"
      ? Number(summary.derived_reports?.orderlist?.counts?.total_rows ?? 0)
      : Number(summary.derived_reports?.arrival?.counts?.total_rows ?? 0);
  return {
    action: input.action,
    branch: input.branch,
    startDate: input.startDate,
    endDate: input.endDate,
    checkedAt: nowIso(),
    status: "done",
    summary:
      input.action === "order-list"
        ? `${input.branch} 오더리스트를 생성했습니다.`
        : `${input.branch} 어라이벌 보드를 생성했습니다.`,
    evidence: [
      `python:${PYTHON_COMMAND}`,
      `window:${input.startDate}..${input.endDate}`,
      `rows:${total}`,
      stdout.trim(),
      stderr.trim(),
    ].filter(Boolean),
    rows: parseTabularRows(tableRaw, input.action),
    outputPath: outDir,
  };
}

export async function runReservationAction(input: AppReservationActionInput): Promise<AppReservationActionSnapshot> {
  const settingsSnapshot = await loadSettingsSnapshot();
  if (input.action === "order-list" || input.action === "arrival") {
    const result = await runOpsPreview(input);
    return {
      ...result,
      evidence: [...result.evidence, ...makeEvidence(settingsSnapshot)],
    };
  }
  return {
    action: input.action,
    branch: input.branch,
    startDate: input.startDate,
    endDate: input.endDate,
    checkedAt: nowIso(),
    status: "done",
    summary: `${input.branch} ${input.action} 작업 결과를 준비했습니다.`,
    evidence: [`window:${input.startDate}..${input.endDate}`, ...makeEvidence(settingsSnapshot)],
    rows: buildMockRows(input),
    outputPath: null,
  };
}
