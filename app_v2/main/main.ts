import electron from "electron";
import type { BrowserWindow as ElectronBrowserWindow } from "electron";
import { applyLaunchPaths, applyLaunchSwitches, readAppLaunchMode } from "./mainRuntimeStartup.js";
import { registerDesktopAppIpc } from "./ipc.js";
import { destroyProviderBrowsers, openProviderBrowser, primeProviderBrowsers } from "./providerWorkspaceManager.js";
import { runPreflight } from "./preflight.js";
import { runRuntimeVerificationProcess } from "./runtimeVerificationProcess.js";
import { bindSmokeWindowLifecycle } from "./smokeHarness.js";
import { createMainWindow, hasMainWindow } from "./window.js";

const { app } = electron;
const launchContext = readAppLaunchMode();

applyLaunchPaths(app, launchContext);
applyLaunchSwitches(app, launchContext);

function bootstrapProviderSessions() {
  if (launchContext.mode !== "interactive") return;
  void primeProviderBrowsers().catch((error) => {
    console.error("[app_v2] provider session bootstrap failed", error);
  });
}

function revealBlockingProviderSessions() {
  if (launchContext.mode !== "interactive") return;
  void (async () => {
    const snapshot = await runPreflight();
    const blockingProvider = snapshot.providers.find(
      (provider) => provider.operatingStatus === "needs-login" || provider.operatingStatus === "attention"
    );
    if (!blockingProvider) return;
    await openProviderBrowser(blockingProvider.provider);
  })().catch((error) => {
    console.error("[app_v2] provider session reveal failed", error);
  });
}

function bindMainWindowLifecycle(windowRef: ElectronBrowserWindow) {
  if (launchContext.mode !== "interactive") return;
  windowRef.once("closed", () => {
    destroyProviderBrowsers();
    if (process.platform !== "darwin") {
      app.quit();
    }
  });
}

async function bootstrap() {
  await app.whenReady();
  if (launchContext.mode === "runtime-verify") {
    await runRuntimeVerificationProcess(launchContext);
    return;
  }
  registerDesktopAppIpc();
  const windowRef = createMainWindow();
  bindMainWindowLifecycle(windowRef);
  bootstrapProviderSessions();
  revealBlockingProviderSessions();
  if (launchContext.mode === "smoke") {
    bindSmokeWindowLifecycle(windowRef, launchContext.smokeFile);
  }

  app.on("activate", () => {
    if (!hasMainWindow()) {
      const nextWindow = createMainWindow();
      bindMainWindowLifecycle(nextWindow);
      bootstrapProviderSessions();
      revealBlockingProviderSessions();
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
