import electron from "electron";
import type {
  AppBranch,
  AppLiveReadInput,
  AppProvider,
  AppReservationAction,
  AppReservationActionInput,
  AppSettings,
  AppWingsLoginInput
} from "../../src/desktop/app-v2-contracts.js";
import { APP_BRANCHES, isAppProvider } from "../../src/desktop/app-v2-contracts.js";
import { installBgeM3Model } from "./bgeModelInstaller.js";
import {
  ensureProviderBrowser,
  getProviderBrowserState,
  hideProviderBrowser,
  loginWingsSession,
  listProviderBrowsers,
  openProviderBrowser,
  reloadProviderBrowser
} from "./providerWorkspaceManager.js";
import { runOtaRead, runPmsRead, runSheetRead } from "./liveReadActions.js";
import { runLiveReadBundle } from "./liveReadRuntime.js";
import { runPreflight } from "./preflight.js";
import { runReservationAction } from "./reservationActionRunner.js";
import { loadSettingsSnapshot, saveSettings } from "./settingsStore.js";

const { ipcMain } = electron;

function parseProvider(value: unknown): AppProvider {
  if (!isAppProvider(value)) {
    throw new Error(`Unsupported provider: ${String(value)}`);
  }
  return value;
}

function parseWingsLoginInput(input: unknown): AppWingsLoginInput {
  if (!input || typeof input !== "object") {
    return { username: "", password: "" };
  }
  const payload = input as Partial<Record<keyof AppWingsLoginInput, unknown>>;
  const username = typeof payload.username === "string" ? payload.username.trim() : "";
  const password = typeof payload.password === "string" ? String(payload.password) : "";
  return { username, password };
}

function normalizeSettingsPayload(input: unknown): Partial<AppSettings> {
  if (!input || typeof input !== "object") return {};
  const payload = input as Partial<Record<keyof AppSettings, unknown>>;
  return {
    spreadsheet: typeof payload.spreadsheet === "string" ? payload.spreadsheet : "",
    sheetName: typeof payload.sheetName === "string" ? payload.sheetName : "",
    sheetTabs:
      payload.sheetTabs && typeof payload.sheetTabs === "object"
        ? {
            gangnam:
              typeof (payload.sheetTabs as Record<string, unknown>).gangnam === "string"
                ? String((payload.sheetTabs as Record<string, unknown>).gangnam)
                : "",
            coex:
              typeof (payload.sheetTabs as Record<string, unknown>).coex === "string"
                ? String((payload.sheetTabs as Record<string, unknown>).coex)
                : "",
            seolleung:
              typeof (payload.sheetTabs as Record<string, unknown>).seolleung === "string"
                ? String((payload.sheetTabs as Record<string, unknown>).seolleung)
                : "",
            samseong:
              typeof (payload.sheetTabs as Record<string, unknown>).samseong === "string"
                ? String((payload.sheetTabs as Record<string, unknown>).samseong)
                : "",
          }
        : null,
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
            modelId: typeof (payload.bgeM3 as Record<string, unknown>).modelId === "string" ? String((payload.bgeM3 as Record<string, unknown>).modelId) : "Xenova/bge-m3",
            runtime:
              (payload.bgeM3 as Record<string, unknown>).runtime === "download-if-missing"
                ? "download-if-missing"
                : "local-path",
            modelPath:
              typeof (payload.bgeM3 as Record<string, unknown>).modelPath === "string"
                ? String((payload.bgeM3 as Record<string, unknown>).modelPath)
                : "",
            topK: Number.isFinite(Number((payload.bgeM3 as Record<string, unknown>).topK))
              ? Number((payload.bgeM3 as Record<string, unknown>).topK)
              : undefined,
            scoreThreshold: Number.isFinite(Number((payload.bgeM3 as Record<string, unknown>).scoreThreshold))
              ? Number((payload.bgeM3 as Record<string, unknown>).scoreThreshold)
              : undefined
          }
        : null,
    reportWindowDays: payload.reportWindowDays == null ? undefined : Number(payload.reportWindowDays)
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

let ipcRegistered = false;

export function registerDesktopAppIpc() {
  if (ipcRegistered) return;
  ipcRegistered = true;

  ipcMain.handle("desktop-app:load-settings", async () => loadSettingsSnapshot());
  ipcMain.handle("desktop-app:save-settings", async (_event, input: unknown) => saveSettings(normalizeSettingsPayload(input)));
  ipcMain.handle("desktop-app:install-bge-m3-model", async () => installBgeM3Model());
  ipcMain.handle("desktop-app:login-wings-session", async (_event, input: unknown) => loginWingsSession(parseWingsLoginInput(input)));
  ipcMain.handle("desktop-app:ensure-provider-browser", async (_event, provider: unknown) => ensureProviderBrowser(parseProvider(provider)));
  ipcMain.handle("desktop-app:get-provider-browser-state", async (_event, provider: unknown) => getProviderBrowserState(parseProvider(provider)));
  ipcMain.handle("desktop-app:list-provider-browsers", async () => listProviderBrowsers());
  ipcMain.handle("desktop-app:open-provider-browser", async (_event, provider: unknown) => openProviderBrowser(parseProvider(provider)));
  ipcMain.handle("desktop-app:hide-provider-browser", async (_event, provider: unknown) => hideProviderBrowser(parseProvider(provider)));
  ipcMain.handle("desktop-app:reload-provider-browser", async (_event, provider: unknown) => reloadProviderBrowser(parseProvider(provider)));
  ipcMain.handle("desktop-app:run-preflight", async () => runPreflight());
  ipcMain.handle("desktop-app:fetch-live-read-bundle", async (_event, input: unknown) => runLiveReadBundle(parseLiveReadInput(input)));
  ipcMain.handle("desktop-app:run-pms-read", async (_event, input: unknown) => runPmsRead(parseLiveReadInput(input)));
  ipcMain.handle("desktop-app:run-ota-read", async (_event, input: unknown) => runOtaRead(parseLiveReadInput(input)));
  ipcMain.handle("desktop-app:run-sheet-read", async (_event, input: unknown) => runSheetRead(parseLiveReadInput(input)));
  ipcMain.handle("desktop-app:run-reservation-action", async (_event, input: unknown) =>
    runReservationAction(parseReservationActionInput(input))
  );
}
