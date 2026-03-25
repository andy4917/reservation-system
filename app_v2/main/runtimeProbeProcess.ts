import fs from "node:fs";
import electron from "electron";
import type {
  AppLiveReadInput,
  AppReservationActionInput
} from "../../src/desktop/app-v2-contracts.js";
import type { AppProbeTask } from "./appMode.js";
import type { AppLaunchContext } from "./appMode.js";
import { runOtaRead, runPmsRead, runSheetRead } from "./liveReadActions.js";
import { runLiveReadBundle } from "./liveReadRuntime.js";
import { runReservationAction } from "./reservationActionRunner.js";

const { app } = electron;

function nowIso() {
  return new Date().toISOString();
}

function buildLiveReadInput(context: AppLaunchContext): AppLiveReadInput {
  return {
    branch: context.probeBranch,
    startDate: context.probeStartDate,
    endDate: context.probeEndDate
  };
}

function buildReservationInput(context: AppLaunchContext): AppReservationActionInput {
  return {
    action: context.probeReservationAction,
    branch: context.probeBranch,
    startDate: context.probeStartDate,
    endDate: context.probeEndDate,
    excludeRoomMakeup: false,
    flagContinuationCandidates: true,
    approvePlanToken: context.probeApprovePlanToken,
    executeApply: context.probeExecuteApply,
  };
}

function writeProbeResult(outputFile: string, payload: unknown) {
  const serialized = `${JSON.stringify(payload, null, 2)}\n`;
  if (outputFile) {
    fs.writeFileSync(outputFile, serialized, "utf8");
  }
  process.stdout.write(serialized);
}

async function runTask<T>(label: AppProbeTask, executor: () => Promise<T>) {
  try {
    return {
      task: label,
      status: "ok" as const,
      result: await executor()
    };
  } catch (error) {
    return {
      task: label,
      status: "error" as const,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function isLiveTaskResultSuccessful(task: { status: "ok" | "error"; result?: unknown }) {
  if (task.status !== "ok") {
    return false;
  }
  if (!task.result || typeof task.result !== "object") {
    return true;
  }
  const maybeSnapshot = task.result as {
    status?: string;
    engineStatus?: string;
    blockedReason?: string | null;
  };
  if (typeof (maybeSnapshot as { supportLevel?: string }).supportLevel === "string") {
    return (maybeSnapshot as { supportLevel?: string }).supportLevel === "read-live";
  }
  if (typeof maybeSnapshot.status !== "string") {
    return true;
  }
  if (maybeSnapshot.status === "error") {
    return false;
  }
  if (typeof maybeSnapshot.blockedReason === "string" && maybeSnapshot.blockedReason.trim()) {
    return false;
  }
  if (maybeSnapshot.engineStatus === "pending-source" || maybeSnapshot.engineStatus === "fallback") {
    return false;
  }
  return true;
}

export async function runRuntimeProbeProcess(context: AppLaunchContext) {
  const launchTime = nowIso();
  const tasks: Array<{
    task: AppProbeTask;
    status: "ok" | "error";
    result?: unknown;
    error?: string;
  }> = [];

  const liveReadInput = buildLiveReadInput(context);
  const reservationInput = buildReservationInput(context);

  const runSequence: Array<() => Promise<{
    task: AppProbeTask;
    status: "ok" | "error";
    result?: unknown;
    error?: string;
  }>> = [];

  if (context.probeTasks.includes("bundle")) {
    runSequence.push(
      () => runTask("bundle", () => runLiveReadBundle(liveReadInput))
    );
  }
  if (context.probeTasks.includes("pms")) {
    runSequence.push(
      () => runTask("pms", () => runPmsRead(liveReadInput))
    );
  }
  if (context.probeTasks.includes("ota")) {
    runSequence.push(
      () => runTask("ota", () => runOtaRead(liveReadInput))
    );
  }
  if (context.probeTasks.includes("sheet")) {
    runSequence.push(
      () => runTask("sheet", () => runSheetRead(liveReadInput))
    );
  }
  if (context.probeTasks.includes("action")) {
    runSequence.push(
      () => runTask("action", () => runReservationAction(reservationInput as AppReservationActionInput))
    );
  }

  for (const executeTask of runSequence) {
    tasks.push(await executeTask());
  }

  const overallStatus = tasks.every((task) => isLiveTaskResultSuccessful(task));
  const result = {
    checkedAt: launchTime,
    mode: "runtime-probe" as const,
    branch: context.probeBranch,
    startDate: context.probeStartDate,
    endDate: context.probeEndDate,
    action: reservationInput.action,
    executedTasks: tasks.map((item) => item.task),
    tasks,
    overallStatus
  };

  writeProbeResult(context.probeOutputFile, result);
  app.exit(result.overallStatus ? 0 : 1);
}
