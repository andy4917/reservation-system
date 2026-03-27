import type { AppProvider, AppProviderOperatingSnapshot } from "../../src/desktop/app-v2-contracts.js";
import type { AppProviderBrowserState } from "../../src/desktop/app-v2-contracts.js";
import { evaluateProviderOperatingState } from "./providerOperatingAdapter.js";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForProviderOperatingState(
  readState: () => Promise<AppProviderBrowserState>,
  accept: (snapshot: AppProviderOperatingSnapshot) => boolean,
  timeoutMs = 20000
) {
  const startedAt = Date.now();
  let lastSnapshot = evaluateProviderOperatingState(await readState());
  while (Date.now() - startedAt < timeoutMs) {
    lastSnapshot = evaluateProviderOperatingState(await readState());
    if (accept(lastSnapshot)) return lastSnapshot;
    await delay(300);
  }
  return lastSnapshot;
}

export async function waitForProviderReadyOrSettledState(
  readState: () => Promise<AppProviderBrowserState>,
  timeoutMs = 20000
) {
  return waitForProviderOperatingState(
    readState,
    (snapshot) => snapshot.operatingStatus !== "attention",
    timeoutMs
  );
}

export async function waitForWingsLoginOperatingState(
  provider: AppProvider,
  readState: () => Promise<AppProviderBrowserState>
) {
  const loadedSnapshot = await waitForProviderOperatingState(
    readState,
    (snapshot) => snapshot.pageState === "loaded" || snapshot.operatingStatus === "error",
    15000
  );
  if (loadedSnapshot.operatingStatus === "ready") {
    return loadedSnapshot;
  }
  if (loadedSnapshot.operatingStatus === "error") {
    return loadedSnapshot;
  }
  return waitForProviderOperatingState(
    readState,
    (snapshot) => {
      if (snapshot.operatingStatus === "ready" || snapshot.operatingStatus === "error") {
        return true;
      }
      return provider === "wings-pms" && snapshot.operatingStatus === "needs-login";
    },
    20000
  );
}
