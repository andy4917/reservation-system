import { ipcMain } from "electron";

export function registerAppIpc() {
  ipcMain.handle("desktop:ping", async () => ({
    ok: true,
    runtime: "electron-main",
    ts: new Date().toISOString()
  }));
}
