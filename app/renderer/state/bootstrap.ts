import { pingDesktopRuntime } from "../../services/bridgeClient";
import { useUiStore } from "./uiStore";

export async function bootstrapUiState() {
  const runtime = await pingDesktopRuntime().catch(() => null);
  if (runtime) {
    useUiStore.setState((state) => ({
      bridgeStatus: {
        ...state.bridgeStatus,
        connected: runtime.connected,
        message: runtime.connected
          ? `Desktop runtime connected: ${runtime.bridgeVersion}`
          : state.bridgeStatus.message
      },
      logs: [
        ...state.logs,
        `Desktop runtime ping received: ${runtime.bridgeVersion}`
      ]
    }));
  }

  await useUiStore.getState().refreshInventoryCompare();
}
