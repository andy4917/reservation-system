import type electron from "electron";
import type { AppLaunchContext } from "./appMode.js";
import { readAppLaunchMode } from "./appMode.js";

export { readAppLaunchMode };

export function applyLaunchPaths(app: typeof electron.app, context: AppLaunchContext) {
  if (context.userDataDirOverride) {
    app.setPath("userData", context.userDataDirOverride);
  }
}

export function applyLaunchSwitches(app: typeof electron.app, context: AppLaunchContext) {
  if (context.mode === "interactive") return;
  app.commandLine.appendSwitch("headless");
  app.commandLine.appendSwitch("disable-gpu");
  app.commandLine.appendSwitch("no-sandbox");
}
