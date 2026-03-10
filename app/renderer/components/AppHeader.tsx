import { useUiStore } from "../state/uiStore";

export function AppHeader() {
  const runtimeMode = useUiStore((state) => state.runtimeMode);
  const setRuntimeMode = useUiStore((state) => state.setRuntimeMode);
  const selectedRange = useUiStore((state) => state.selectedRange);
  const bridgeStatus = useUiStore((state) => state.bridgeStatus);

  return (
    <header className="app-header">
      <div className="header-primary">
        <div className="header-block">
          <span className="header-label">Range</span>
          <strong>{selectedRange.startDate} - {selectedRange.endDate}</strong>
        </div>
        <div className="header-block">
          <span className="header-label">Bridge</span>
          <strong>{bridgeStatus.connected ? "Connected" : "Not Connected"}</strong>
        </div>
        <div className="header-block">
          <span className="header-label">Host</span>
          <strong>{bridgeStatus.activeHost}</strong>
        </div>
      </div>
      <div className="header-modes">
        {(["dry-run", "replay", "live"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            className={`mode-pill ${runtimeMode === mode ? "is-active" : ""}`}
            onClick={() => setRuntimeMode(mode)}
          >
            {mode}
          </button>
        ))}
      </div>
    </header>
  );
}
