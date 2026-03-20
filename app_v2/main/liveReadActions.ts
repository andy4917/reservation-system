import { spawn } from "node:child_process";
import path from "node:path";
import type {
  AppBranch,
  AppLiveReadInput,
  AppLiveReadPreviewItem,
  AppLiveReadSnapshot,
  AppProvider,
} from "../../src/desktop/app-v2-contracts.js";
import { getProviderBrowserState } from "./providerWorkspaceManager.js";
import { loadSettingsSnapshot } from "./settingsStore.js";

const PYTHON_COMMAND = process.env.PYTHON_BIN || "python3";

interface LiveSheetBridgePayload {
  branch: AppBranch;
  checkedAt: string;
  recordsImported: number;
  summary: string;
  items: AppLiveReadPreviewItem[];
  evidence: string[];
  error?: string;
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

async function ensureProviderReadable(provider: AppProvider, summaryLabel: string) {
  const providerState = await getProviderBrowserState(provider);
  if (providerState.pageState !== "loaded") {
    return {
      ok: false as const,
      reason: `${summaryLabel} 세션이 아직 준비되지 않았습니다.`,
      evidence: [
        `pageState:${providerState.pageState}`,
        `operatingHost:${providerState.currentHost ?? "-"}`,
        `providerCookies:${providerState.providerCookieCount}`,
      ],
    };
  }
  return {
    ok: true as const,
    evidence: [
      `pageState:${providerState.pageState}`,
      `operatingHost:${providerState.currentHost ?? "-"}`,
      `providerCookies:${providerState.providerCookieCount}`,
    ],
  };
}

function runPythonJson(args: string[], cwd: string) {
  return new Promise<string>((resolve, reject) => {
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
    `windowDays:${settings.config?.reportWindowDays ?? 5}`,
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
  const cwd = process.cwd();
  const scriptPath = path.join(cwd, "scripts", "app_v2_live_sheet_bridge.py");
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
  const stdout = await runPythonJson(args, cwd);
  const payload = JSON.parse(stdout) as LiveSheetBridgePayload;
  if (payload.error) throw new Error(payload.error);
  return payload;
}

export async function runPmsRead(input: AppLiveReadInput): Promise<AppLiveReadSnapshot> {
  const readiness = await ensureProviderReadable("wings-pms", "PMS");
  if (!readiness.ok) {
    return buildError("pms", input.branch, readiness.reason, readiness.evidence);
  }
  const settingsEvidence = await buildSettingsEvidence();
  return {
    source: "pms",
    branch: input.branch,
    checkedAt: nowIso(),
    status: "done",
    summary: `${input.branch} PMS 조회는 현재 세션 준비 상태만 확인합니다.`,
    recordsImported: 0,
    blockedReason: null,
    items: [
      {
        id: `pms-ready:${input.branch}`,
        title: "WINGS 세션 준비",
        subtitle: `${input.startDate} ~ ${input.endDate} 실조회 연결 전 readiness 확인`,
        statusLabel: "READY",
      },
    ],
    evidence: [...readiness.evidence, `window:${input.startDate}..${input.endDate}`, ...settingsEvidence],
  };
}

export async function runOtaRead(input: AppLiveReadInput): Promise<AppLiveReadSnapshot> {
  const naver = await ensureProviderReadable("naver-partner", "OTA");
  const station = await ensureProviderReadable("admin-station", "OTA");
  if (!naver.ok && !station.ok) {
    return buildError("ota", input.branch, "OTA 세션이 준비되지 않았습니다.", [...naver.evidence, ...station.evidence]);
  }
  const settingsEvidence = await buildSettingsEvidence();
  return {
    source: "ota",
    branch: input.branch,
    checkedAt: nowIso(),
    status: "done",
    summary: `${input.branch} OTA 조회는 현재 세션 준비 상태만 확인합니다.`,
    recordsImported: 0,
    blockedReason: null,
    items: [
      {
        id: `ota-ready:${input.branch}`,
        title: "OTA 세션 준비",
        subtitle: `${input.startDate} ~ ${input.endDate} live adapter 연결 전 readiness 확인`,
        statusLabel: "READY",
      },
    ],
    evidence: [...naver.evidence, ...station.evidence, `window:${input.startDate}..${input.endDate}`, ...settingsEvidence],
  };
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
    return {
      source: "sheet",
      branch: input.branch,
      checkedAt: payload.checkedAt,
      status: "done",
      summary: `${payload.summary} (${input.startDate} ~ ${input.endDate})`,
      recordsImported: payload.recordsImported,
      blockedReason: null,
      items: payload.items,
      evidence: [...payload.evidence, `window:${input.startDate}..${input.endDate}`, ...settingsEvidence],
    };
  } catch (error) {
    return buildError("sheet", input.branch, "예약 시트 라이브 조회에 실패했습니다.", [
      `error:${error instanceof Error ? error.message : String(error)}`,
    ]);
  }
}
