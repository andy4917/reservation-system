import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("desktopBridge", {
  ping: () => ipcRenderer.invoke("desktop:ping"),
  getContext: () => ipcRenderer.invoke("desktop:get-context"),
  fetchProviderRows: (request: unknown) => ipcRenderer.invoke("desktop:fetch-provider-rows", request),
  getBridgeMeta: () => ipcRenderer.invoke("desktop:get-bridge-meta"),
  getBridgeRuntime: () => ipcRenderer.invoke("desktop:get-bridge-runtime"),
  getBridgeSummary: (provider?: unknown) => ipcRenderer.invoke("desktop:get-bridge-summary", provider),
  getRecommendationRuntime: (settings?: unknown) => ipcRenderer.invoke("desktop:get-recommendation-runtime", settings),
  getRecommendationRuntimeDiagnostics: (settings?: unknown) =>
    ipcRenderer.invoke("desktop:get-recommendation-runtime-diagnostics", settings),
  warmRecommendationRuntime: (settings?: unknown) => ipcRenderer.invoke("desktop:warm-recommendation-runtime", settings),
  sampleRecommendationEmbed: (settings?: unknown, text?: unknown) =>
    ipcRenderer.invoke("desktop:sample-recommendation-embed", settings, text),
  scoreRecommendationCandidates: (request: unknown) => ipcRenderer.invoke("desktop:score-recommendation-candidates", request)
});
