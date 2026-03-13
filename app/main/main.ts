import { app, BrowserWindow } from "electron";
import { startBridgeServer, stopBridgeServer } from "./bridgeServer.js";
import { createMainWindow } from "./window.js";
import { registerAppIpc } from "./ipc.js";

async function bootstrap() {
  await app.whenReady();
  registerAppIpc();
  const bridgeRuntime = await startBridgeServer();
  if (!bridgeRuntime.connected) {
    console.error("[desktop-app] bridge degraded", bridgeRuntime.code, bridgeRuntime.message);
  }
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
}

bootstrap().catch((error) => {
  console.error("[desktop-app] bootstrap failed", error);
  app.exit(1);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  void stopBridgeServer();
});
