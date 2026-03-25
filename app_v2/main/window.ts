import path from "node:path";
import { fileURLToPath } from "node:url";
import electron from "electron";
import type { BrowserWindow as ElectronBrowserWindow } from "electron";
import { readAppLaunchMode } from "./appMode.js";

const { BrowserWindow } = electron;

const currentDir = path.dirname(fileURLToPath(import.meta.url));
let mainWindow: ElectronBrowserWindow | null = null;
const launchContext = readAppLaunchMode();
const appIconPath = path.resolve(currentDir, "..", "..", "..", "icons", "icon128.png");

export function createMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.focus();
    return mainWindow;
  }

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1180,
    minHeight: 780,
    backgroundColor: "#f6f0e8",
    autoHideMenuBar: true,
    show: launchContext.mode === "interactive",
    icon: appIconPath,
    webPreferences: {
      preload: path.resolve(currentDir, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  const devUrl = process.env.UHS_APP_RENDERER_URL;
  if (devUrl) {
    void mainWindow.loadURL(devUrl);
  } else {
    void mainWindow.loadFile(path.resolve(currentDir, "..", "renderer", "index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  return mainWindow;
}
