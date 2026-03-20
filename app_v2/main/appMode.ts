import type { AppRuntimeVerifyFocus } from "../../src/desktop/app-v2-contracts.js";

export type AppLaunchMode = "interactive" | "smoke" | "runtime-verify";

export interface AppLaunchContext {
  mode: AppLaunchMode;
  smokeFile: string;
  verifyFocus: AppRuntimeVerifyFocus;
  verifyOutputFile: string;
  userDataDirOverride: string;
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function readAppLaunchMode(): AppLaunchContext {
  const smokeMode = normalizeText(process.env.UHS_APP_V2_SMOKE_TEST) === "1";
  const verifyMode = normalizeText(process.env.UHS_APP_V2_RUNTIME_VERIFY) === "1";
  return {
    mode: verifyMode ? "runtime-verify" : smokeMode ? "smoke" : "interactive",
    smokeFile: normalizeText(process.env.UHS_APP_V2_SMOKE_FILE),
    verifyFocus: normalizeText(process.env.UHS_APP_V2_VERIFY_FOCUS) === "sheet-live" ? "sheet-live" : "live-read",
    verifyOutputFile: normalizeText(process.env.UHS_APP_V2_VERIFY_OUTPUT_FILE),
    userDataDirOverride: normalizeText(process.env.UHS_APP_V2_USER_DATA_DIR)
  };
}
