import electron from "electron";
import type {
  AppBranch,
  AppLiveReadInput,
  AppOpsSheetApplyInput,
  AppProvider,
  AppReservationAction,
  AppReservationActionInput,
  AppRuntimeVerifyFocus,
  AppSettings
} from "../../src/desktop/app-v2-contracts.js";
import {
  APP_BRANCHES,
  DEFAULT_APP_BGE_SCORE_THRESHOLD,
  DEFAULT_APP_BGE_TOP_K,
  DEFAULT_APP_REPORT_WINDOW_DAYS,
  isAppProvider
} from "../../src/desktop/app-v2-contracts.js";
import { listAuthRequirements } from "./authRequirements.js";
import { installBgeM3Model } from "./bgeModelInstaller.js";
import {
  attemptWingsLogin,
  ensureProviderBrowser,
  getProviderBrowserState,
  hideProviderBrowser,
  listProviderBrowsers,
  openProviderBrowser,
  reloadProviderBrowser
} from "./providerWorkspaceManager.js";
import { runOtaRead, runPmsRead, runSheetRead } from "./liveReadActions.js";
import { runPreflight } from "./preflight.js";
import { applyOpsSheetOutput } from "./opsSheetApplyRunner.js";
import { runReservationAction } from "./reservationActionRunner.js";
import { evaluateRuntimeReadiness } from "./runtimeReadiness.js";
import { importWingsSharedCredentials, loadSettingsSnapshot, saveSettings } from "./settingsStore.js";

const { ipcMain } = electron;

function parseProvider(value: unknown): AppProvider {
  if (!isAppProvider(value)) {
    throw new Error(`Unsupported provider: ${String(value)}`);
  }
  return value;
}

function normalizeSettingsPayload(input: unknown): Partial<AppSettings> {
  if (!input || typeof input !== "object") return {};
  const payload = input as Partial<Record<keyof AppSettings, unknown>>;
  return {
    spreadsheet: typeof payload.spreadsheet === "string" ? payload.spreadsheet : "",
    sheetName: typeof payload.sheetName === "string" ? payload.sheetName : "",
    opsView:
      payload.opsView && typeof payload.opsView === "object"
        ? {
            excludeRoomMakeup: (payload.opsView as Record<string, unknown>).excludeRoomMakeup === true,
            flagContinuationCandidates: (payload.opsView as Record<string, unknown>).flagContinuationCandidates !== false,
          }
        : null,
    bgeM3:
      payload.bgeM3 && typeof payload.bgeM3 === "object"
        ? {
            enabled: (payload.bgeM3 as Record<string, unknown>).enabled === true,
            runtime:
              (payload.bgeM3 as Record<string, unknown>).runtime === "download-if-missing"
                ? "download-if-missing"
                : "local-path",
            modelPath:
              typeof (payload.bgeM3 as Record<string, unknown>).modelPath === "string"
                ? String((payload.bgeM3 as Record<string, unknown>).modelPath)
                : "",
            topK: Number((payload.bgeM3 as Record<string, unknown>).topK ?? DEFAULT_APP_BGE_TOP_K),
            scoreThreshold: Number((payload.bgeM3 as Record<string, unknown>).scoreThreshold ?? DEFAULT_APP_BGE_SCORE_THRESHOLD)
          }
        : null,
    wingsSharedCredentials:
      payload.wingsSharedCredentials && typeof payload.wingsSharedCredentials === "object"
        ? {
            companyId:
              typeof (payload.wingsSharedCredentials as Record<string, unknown>).companyId === "string"
                ? String((payload.wingsSharedCredentials as Record<string, unknown>).companyId)
                : "",
            branches: APP_BRANCHES.reduce((acc, branch) => {
              const rawBranches =
                (payload.wingsSharedCredentials as Record<string, unknown>).branches &&
                typeof (payload.wingsSharedCredentials as Record<string, unknown>).branches === "object"
                  ? ((payload.wingsSharedCredentials as Record<string, unknown>).branches as Record<string, unknown>)
                  : {};
              const rawCredential = rawBranches[branch];
              acc[branch] =
                rawCredential && typeof rawCredential === "object"
                  ? {
                      loginId:
                        typeof (rawCredential as Record<string, unknown>).loginId === "string"
                          ? String((rawCredential as Record<string, unknown>).loginId)
                          : "",
                      password:
                        typeof (rawCredential as Record<string, unknown>).password === "string"
                          ? String((rawCredential as Record<string, unknown>).password)
                          : "",
                    }
                  : null;
              return acc;
            }, {} as Record<AppBranch, { loginId: string; password: string } | null>),
          }
        : null,
    reportWindowDays: Number(payload.reportWindowDays ?? DEFAULT_APP_REPORT_WINDOW_DAYS)
  };
}

function parseBranch(value: unknown): AppBranch {
  if (typeof value !== "string" || !APP_BRANCHES.includes(value as AppBranch)) {
    throw new Error(`Unsupported branch: ${String(value)}`);
  }
  return value as AppBranch;
}

function parseDateInput(value: unknown, label: string) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new Error(`${label} must be YYYY-MM-DD.`);
  }
  return text;
}

function parseRuntimeVerifyFocus(value: unknown): AppRuntimeVerifyFocus {
  const focus = typeof value === "string" ? value.trim() : "";
  if (focus !== "live-read" && focus !== "sheet-live") {
    throw new Error(`Unsupported runtime verify focus: ${String(value)}`);
  }
  return focus as AppRuntimeVerifyFocus;
}

function parseLiveReadInput(input: unknown): AppLiveReadInput {
  if (!input || typeof input !== "object") {
    throw new Error("Live read input is required.");
  }
  const payload = input as Partial<Record<keyof AppLiveReadInput, unknown>>;
  return {
    branch: parseBranch(payload.branch),
    startDate: parseDateInput(payload.startDate, "startDate"),
    endDate: parseDateInput(payload.endDate, "endDate")
  };
}

function parseReservationAction(value: unknown): AppReservationAction {
  const action = typeof value === "string" ? value.trim() : "";
  if (
    action !== "compare" &&
    action !== "validate" &&
    action !== "reconcile" &&
    action !== "edit" &&
    action !== "apply" &&
    action !== "order-list" &&
    action !== "arrival"
  ) {
    throw new Error(`Unsupported reservation action: ${String(value)}`);
  }
  return action as AppReservationAction;
}

function parseReservationActionInput(input: unknown): AppReservationActionInput {
  if (!input || typeof input !== "object") {
    throw new Error("Reservation action input is required.");
  }
  const payload = input as Partial<Record<keyof AppReservationActionInput, unknown>>;
  return {
    action: parseReservationAction(payload.action),
    branch: parseBranch(payload.branch),
    startDate: parseDateInput(payload.startDate, "startDate"),
    endDate: parseDateInput(payload.endDate, "endDate"),
    excludeRoomMakeup: payload.excludeRoomMakeup === true,
    flagContinuationCandidates: payload.flagContinuationCandidates !== false,
    approvePlanToken: typeof payload.approvePlanToken === "string" ? String(payload.approvePlanToken) : "",
    executeApply: payload.executeApply === true,
  };
}

function parseOpsSheetApplyInput(input: unknown): AppOpsSheetApplyInput {
  if (!input || typeof input !== "object") {
    throw new Error("Ops sheet apply input is required.");
  }
  const payload = input as Partial<Record<keyof AppOpsSheetApplyInput, unknown>>;
  const action = parseReservationAction(payload.action);
  if (action !== "order-list" && action !== "arrival") {
    throw new Error(`Unsupported ops sheet apply action: ${String(payload.action)}`);
  }
  return {
    action,
    branch: parseBranch(payload.branch),
    startDate: parseDateInput(payload.startDate, "startDate"),
    endDate: parseDateInput(payload.endDate, "endDate"),
    spreadsheet: typeof payload.spreadsheet === "string" ? String(payload.spreadsheet) : "",
    sheetNames: Array.isArray(payload.sheetNames) ? payload.sheetNames.filter((item): item is string => typeof item === "string") : [],
    reportDate: typeof payload.reportDate === "string" ? String(payload.reportDate) : "",
  };
}

let ipcRegistered = false;

export function registerDesktopAppIpc() {
  if (ipcRegistered) return;
  ipcRegistered = true;

  ipcMain.handle("desktop-app:load-settings", async () => loadSettingsSnapshot());
  ipcMain.handle("desktop-app:save-settings", async (_event, input: unknown) => saveSettings(normalizeSettingsPayload(input)));
  ipcMain.handle("desktop-app:import-wings-shared-credentials", async () => importWingsSharedCredentials());
  ipcMain.handle("desktop-app:install-bge-m3-model", async () => installBgeM3Model());
  ipcMain.handle("desktop-app:list-auth-requirements", async () => listAuthRequirements());
  ipcMain.handle("desktop-app:get-runtime-readiness", async (_event, focus: unknown) =>
    evaluateRuntimeReadiness(parseRuntimeVerifyFocus(focus))
  );
  ipcMain.handle("desktop-app:ensure-provider-browser", async (_event, provider: unknown) => ensureProviderBrowser(parseProvider(provider)));
  ipcMain.handle("desktop-app:get-provider-browser-state", async (_event, provider: unknown) => getProviderBrowserState(parseProvider(provider)));
  ipcMain.handle("desktop-app:list-provider-browsers", async () => listProviderBrowsers());
  ipcMain.handle("desktop-app:open-provider-browser", async (_event, provider: unknown) => openProviderBrowser(parseProvider(provider)));
  ipcMain.handle("desktop-app:hide-provider-browser", async (_event, provider: unknown) => hideProviderBrowser(parseProvider(provider)));
  ipcMain.handle("desktop-app:reload-provider-browser", async (_event, provider: unknown) => reloadProviderBrowser(parseProvider(provider)));
  ipcMain.handle("desktop-app:run-preflight", async () => runPreflight());
  ipcMain.handle("desktop-app:run-pms-read", async (_event, input: unknown) => runPmsRead(parseLiveReadInput(input)));
  ipcMain.handle("desktop-app:run-ota-read", async (_event, input: unknown) => runOtaRead(parseLiveReadInput(input)));
  ipcMain.handle("desktop-app:run-sheet-read", async (_event, input: unknown) => runSheetRead(parseLiveReadInput(input)));
  ipcMain.handle("desktop-app:run-reservation-action", async (_event, input: unknown) =>
    runReservationAction(parseReservationActionInput(input))
  );
  ipcMain.handle("desktop-app:attempt-wings-login", async (_event, branch: unknown) => attemptWingsLogin(parseBranch(branch)));
  ipcMain.handle("desktop-app:apply-ops-sheet-output", async (_event, input: unknown) =>
    applyOpsSheetOutput(parseOpsSheetApplyInput(input))
  );
}
