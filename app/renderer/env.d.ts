export {};

declare global {
  interface Window {
    desktopBridge?: {
      ping: () => Promise<{ ok: true; runtime: string; ts: string }>;
    };
  }
}
