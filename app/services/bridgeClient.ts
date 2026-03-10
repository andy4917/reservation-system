import type {
  BridgeContextResponse,
  BridgePingResponse
} from "../contracts";

declare global {
  interface Window {
    desktopBridge?: {
      ping: () => Promise<{ ok: true; runtime: string; ts: string }>;
    };
  }
}

export async function pingDesktopRuntime(): Promise<BridgePingResponse | null> {
  if (!window.desktopBridge?.ping) return null;
  const result = await window.desktopBridge.ping();
  return {
    ok: true,
    connected: result.ok === true,
    bridgeVersion: `${result.runtime}@${result.ts}`
  };
}

export async function getBridgeContext(): Promise<BridgeContextResponse> {
  return {
    ok: true,
    provider: null,
    host: null,
    url: null,
    sessionAvailable: false
  };
}
