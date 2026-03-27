import type { AppRuntimeVerifyFocus } from "../../src/desktop/app-v2-contracts.js";
import type { AppBranch, AppReservationAction } from "../../src/desktop/app-v2-contracts.js";

export type AppProbeTask = "bundle" | "pms" | "ota" | "sheet" | "action";
export type AppLaunchMode = "interactive" | "smoke" | "runtime-verify" | "runtime-probe";

export interface AppLaunchContext {
  mode: AppLaunchMode;
  smokeFile: string;
  verifyFocus: AppRuntimeVerifyFocus;
  verifyOutputFile: string;
  userDataDirOverride: string;
  probeTasks: AppProbeTask[];
  probeBranch: AppBranch;
  probeStartDate: string;
  probeEndDate: string;
  probeReservationAction: AppReservationAction;
  probeApprovePlanToken: string;
  probeExecuteApply: boolean;
  probeOutputFile: string;
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeDate(value: string, fallback: string) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value.trim()) ? value.trim() : fallback;
}

function isAppBranch(value: string): value is AppBranch {
  return value === "GANGNAM" || value === "COEX" || value === "SEOLLEUNG" || value === "SAMSEONG";
}

function parseProbeBranch(value: unknown): AppBranch {
  const raw = normalizeText(value);
  return isAppBranch(raw) ? raw : "GANGNAM";
}

function toDateString(date: Date) {
  const normalized = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const year = normalized.getFullYear();
  const month = `${normalized.getMonth() + 1}`.padStart(2, "0");
  const day = `${normalized.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function defaultDateWindow() {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return {
    startDate: toDateString(today),
    endDate: toDateString(tomorrow)
  };
}

const DEFAULT_PROBE_TASKS: AppProbeTask[] = ["bundle", "action"];
function parseProbeTasks(value: unknown) {
  const raw = normalizeText(value);
  if (!raw) return DEFAULT_PROBE_TASKS;

  const requested = raw
    .split(",")
    .map((task) => task.trim().toLowerCase())
    .filter((task): task is AppProbeTask => task === "bundle" || task === "pms" || task === "ota" || task === "sheet" || task === "action");
  if (requested.length === 0) {
    return DEFAULT_PROBE_TASKS;
  }
  return [...new Set(requested)];
}

function parseProbeAction(value: unknown): AppReservationAction {
  const raw = normalizeText(value);
  if (
    raw === "compare" ||
    raw === "validate" ||
    raw === "reconcile" ||
    raw === "edit" ||
    raw === "apply" ||
    raw === "order-list" ||
    raw === "arrival"
  ) {
    return raw;
  }
  return "compare";
}

export function readAppLaunchMode(): AppLaunchContext {
  const smokeMode = normalizeText(process.env.UHS_APP_V2_SMOKE_TEST) === "1";
  const verifyMode = normalizeText(process.env.UHS_APP_V2_RUNTIME_VERIFY) === "1";
  const probeMode = normalizeText(process.env.UHS_APP_V2_RUNTIME_PROBE) === "1";
  const defaultWindow = defaultDateWindow();
  return {
    mode: probeMode ? "runtime-probe" : verifyMode ? "runtime-verify" : smokeMode ? "smoke" : "interactive",
    smokeFile: normalizeText(process.env.UHS_APP_V2_SMOKE_FILE),
    verifyFocus: normalizeText(process.env.UHS_APP_V2_VERIFY_FOCUS) === "sheet-live" ? "sheet-live" : "live-read",
    verifyOutputFile: normalizeText(process.env.UHS_APP_V2_VERIFY_OUTPUT_FILE),
    userDataDirOverride: normalizeText(process.env.UHS_APP_V2_USER_DATA_DIR),
    probeTasks: parseProbeTasks(process.env.UHS_APP_V2_PROBE_TASKS),
    probeBranch: parseProbeBranch(process.env.UHS_APP_V2_PROBE_BRANCH),
    probeStartDate: normalizeDate(process.env.UHS_APP_V2_PROBE_START_DATE || "", defaultWindow.startDate),
    probeEndDate: normalizeDate(process.env.UHS_APP_V2_PROBE_END_DATE || "", defaultWindow.endDate),
    probeReservationAction: parseProbeAction(process.env.UHS_APP_V2_PROBE_RESERVATION_ACTION),
    probeApprovePlanToken: normalizeText(process.env.UHS_APP_V2_PROBE_APPROVE_PLAN_TOKEN),
    probeExecuteApply: normalizeText(process.env.UHS_APP_V2_PROBE_EXECUTE_APPLY) === "1",
    probeOutputFile: normalizeText(process.env.UHS_APP_V2_PROBE_OUTPUT_FILE)
  };
}
