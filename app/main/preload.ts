import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("desktopBridge", {
  ping: () => ipcRenderer.invoke("desktop:ping"),
  getContext: () => ipcRenderer.invoke("desktop:get-context"),
  loadBindingDecisions: (request: unknown) => ipcRenderer.invoke("desktop:load-binding-decisions", request),
  saveBindingDecision: (request: unknown) => ipcRenderer.invoke("desktop:save-binding-decision", request),
  deleteBindingDecision: (request: unknown) => ipcRenderer.invoke("desktop:delete-binding-decision", request),
  loadManualScanAnchor: (request: unknown) => ipcRenderer.invoke("desktop:load-manual-scan-anchor", request),
  saveManualScanAnchor: (request: unknown) => ipcRenderer.invoke("desktop:save-manual-scan-anchor", request),
  deleteManualScanAnchor: (request: unknown) => ipcRenderer.invoke("desktop:delete-manual-scan-anchor", request),
  fetchSheetSnapshot: (request: unknown) => ipcRenderer.invoke("desktop:fetch-sheet-snapshot", request),
  fetchProviderRows: (request: unknown) => ipcRenderer.invoke("desktop:fetch-provider-rows", request),
  fetchProviderReservations: (request: unknown) => ipcRenderer.invoke("desktop:fetch-provider-reservations", request),
  fetchWingsLiveContract: (request: unknown) => ipcRenderer.invoke("desktop:fetch-wings-live-contract", request),
  openWingsLogin: () => ipcRenderer.invoke("desktop:open-wings-login"),
  captureWingsSession: () => ipcRenderer.invoke("desktop:capture-wings-session"),
  getBridgeMeta: () => ipcRenderer.invoke("desktop:get-bridge-meta"),
  getBridgeRuntime: () => ipcRenderer.invoke("desktop:get-bridge-runtime"),
  getBridgeSummary: (provider?: unknown) => ipcRenderer.invoke("desktop:get-bridge-summary", provider)
});
