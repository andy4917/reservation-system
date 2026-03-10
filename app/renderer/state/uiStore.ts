import { create } from "zustand";
import { uiMockState } from "../../fixtures/uiMockState";
import { loadInventoryCompareSnapshot } from "../../services/inventoryCompare";
import type { AppTaskId, RightPanelTab, WorkspaceMockState } from "../types";
import type { RuntimeMode } from "../../contracts";

interface UiStore extends WorkspaceMockState {
  activeRightPanelTab: RightPanelTab;
  setActiveTask: (task: AppTaskId) => void;
  setActiveRightPanelTab: (tab: RightPanelTab) => void;
  setRuntimeMode: (mode: RuntimeMode) => void;
  refreshInventoryCompare: () => Promise<void>;
}

export const useUiStore = create<UiStore>((set, get) => ({
  ...uiMockState,
  activeRightPanelTab: "evidence",
  setActiveTask: (task) => set({ activeTask: task }),
  setActiveRightPanelTab: (tab) => set({ activeRightPanelTab: tab }),
  setRuntimeMode: (mode) => {
    set({ runtimeMode: mode });
    void get().refreshInventoryCompare();
  },
  refreshInventoryCompare: async () => {
    const runtimeMode = get().runtimeMode;
    set({ inventoryCompareLoading: true });

    const snapshot = await loadInventoryCompareSnapshot(runtimeMode);
    const providerLabel = runtimeMode === "live" ? "Bridge Pending" : "NAVER/STATION";
    const bridgeMessage =
      runtimeMode === "live"
        ? "Live mode selected, but bridge.getContext/provider.fetchRows are not connected yet."
        : `Fixture compare loaded for ${runtimeMode} mode.`;

    set((state) => ({
      inventoryCompareLoading: false,
      inventoryCompare: snapshot,
      metrics: [
        { label: "Mismatch", value: String(snapshot.mismatchCount), tone: snapshot.mismatchCount > 0 ? "critical" : "ok" },
        { label: "Preview Warn", value: String(snapshot.warningCount), tone: snapshot.warningCount > 0 ? "warn" : "ok" },
        { label: "Matched", value: String(snapshot.matchedCount), tone: "ok" },
        {
          label: "Live Support",
          value: snapshot.supportLevel === "read-live" ? "Read only" : "Dry-run",
          tone: snapshot.supportLevel === "read-live" ? "warn" : "default"
        }
      ],
      evidenceLines: snapshot.evidenceLines,
      opsLines: snapshot.opsLines,
      validationLines: snapshot.validationLines,
      logs: [...state.logs, ...snapshot.logs],
      bridgeStatus: {
        ...state.bridgeStatus,
        provider: providerLabel,
        message: bridgeMessage
      }
    }));
  }
}));
