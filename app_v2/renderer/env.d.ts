import type { DesktopAppApi } from "../../src/desktop/app-v2-contracts.js";

export {};

declare global {
  interface Window {
    desktopApp?: DesktopAppApi;
  }
}
