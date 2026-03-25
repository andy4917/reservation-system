import electron from "electron";
import { applyLaunchPaths, applyLaunchSwitches, readAppLaunchMode } from "./mainRuntimeStartup.js";
import { registerDesktopAppIpc } from "./ipc.js";
import { destroyProviderBrowsers } from "./providerWorkspaceManager.js";
import { runRuntimeVerificationProcess } from "./runtimeVerificationProcess.js";
import { runRuntimeProbeProcess } from "./runtimeProbeProcess.js";
import { bindSmokeWindowLifecycle } from "./smokeHarness.js";
import { createMainWindow } from "./window.js";

const { app, BrowserWindow } = electron;
const launchContext = readAppLaunchMode();

applyLaunchPaths(app, launchContext);
applyLaunchSwitches(app, launchContext);

async function bootstrap() {
  await app.whenReady();
  if (launchContext.mode === "runtime-verify") {
    await runRuntimeVerificationProcess(launchContext);
    return;
  }
  if (launchContext.mode === "runtime-probe") {
    await runRuntimeProbeProcess(launchContext);
    return;
  }
  registerDesktopAppIpc();
  const windowRef = createMainWindow();
  if (launchContext.mode === "smoke") {
    bindSmokeWindowLifecycle(windowRef, launchContext.smokeFile);
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
}

bootstrap().catch((error) => {
  console.error("[app_v2] bootstrap failed", error);
  app.exit(1);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  destroyProviderBrowsers();
});
