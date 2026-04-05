import fs from "node:fs";
import electron from "electron";
import type { BrowserWindow as ElectronBrowserWindow } from "electron";

const { app } = electron;

export function bindSmokeWindowLifecycle(windowRef: ElectronBrowserWindow, smokeFile: string) {
  const recordSmokeMarker = (marker: string) => {
    console.log(marker);
    if (!smokeFile) return;
    fs.appendFileSync(smokeFile, `${marker}\n`, "utf8");
  };

  recordSmokeMarker("app-v2-smoke:window-created");
  const timer = setTimeout(() => {
    recordSmokeMarker("app-v2-smoke:timeout");
    app.exit(1);
  }, 20000);

  windowRef.webContents.once("did-finish-load", () => {
    clearTimeout(timer);
    recordSmokeMarker("app-v2-smoke:renderer-loaded");
    void windowRef.webContents
      .executeJavaScript("document.body?.dataset?.appShell || ''", true)
      .then((marker) => {
        if (marker === "end-user") {
          recordSmokeMarker("app-v2-smoke:end-user-shell");
        }
      })
      .finally(() => {
        setTimeout(() => app.quit(), 250);
      });
  });

  windowRef.webContents.once("did-fail-load", (_event: unknown, code: number, description: string) => {
    clearTimeout(timer);
    recordSmokeMarker(`app-v2-smoke:renderer-failed:${code}:${description}`);
    app.exit(1);
  });
}
