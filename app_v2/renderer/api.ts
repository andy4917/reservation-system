import type { DesktopAppApi } from "../../src/desktop/app-v2-contracts.js";

export function getDesktopAppApi(): DesktopAppApi | null {
  return window.desktopApp ?? null;
}

export function requireDesktopAppApi(): DesktopAppApi {
  const api = getDesktopAppApi();
  if (!api) {
    throw new Error("desktop-app-unavailable");
  }
  return api;
}
