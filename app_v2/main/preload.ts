import electron from "electron";

const { contextBridge, ipcRenderer } = electron;

contextBridge.exposeInMainWorld("desktopApp", {
  loadSettings: () => ipcRenderer.invoke("desktop-app:load-settings"),
  saveSettings: (input: unknown) => ipcRenderer.invoke("desktop-app:save-settings", input),
  installBgeM3Model: () => ipcRenderer.invoke("desktop-app:install-bge-m3-model"),
  listAuthRequirements: () => ipcRenderer.invoke("desktop-app:list-auth-requirements"),
  getRuntimeReadiness: (focus: unknown) => ipcRenderer.invoke("desktop-app:get-runtime-readiness", focus),
  ensureProviderBrowser: (provider: unknown) => ipcRenderer.invoke("desktop-app:ensure-provider-browser", provider),
  getProviderBrowserState: (provider: unknown) => ipcRenderer.invoke("desktop-app:get-provider-browser-state", provider),
  listProviderBrowsers: () => ipcRenderer.invoke("desktop-app:list-provider-browsers"),
  openProviderBrowser: (provider: unknown) => ipcRenderer.invoke("desktop-app:open-provider-browser", provider),
  hideProviderBrowser: (provider: unknown) => ipcRenderer.invoke("desktop-app:hide-provider-browser", provider),
  reloadProviderBrowser: (provider: unknown) => ipcRenderer.invoke("desktop-app:reload-provider-browser", provider),
  runPreflight: () => ipcRenderer.invoke("desktop-app:run-preflight"),
  runPmsRead: (input: unknown) => ipcRenderer.invoke("desktop-app:run-pms-read", input),
  runOtaRead: (input: unknown) => ipcRenderer.invoke("desktop-app:run-ota-read", input),
  runSheetRead: (input: unknown) => ipcRenderer.invoke("desktop-app:run-sheet-read", input),
  runReservationAction: (input: unknown) => ipcRenderer.invoke("desktop-app:run-reservation-action", input),
  attemptWingsLogin: () => ipcRenderer.invoke("desktop-app:attempt-wings-login"),
  applyOpsSheetOutput: (input: unknown) => ipcRenderer.invoke("desktop-app:apply-ops-sheet-output", input),
});
