import { useUiStore } from "../state/uiStore";

export function AppHeader() {
  const runtimeMode = useUiStore((state) => state.runtimeMode);
  const setRuntimeMode = useUiStore((state) => state.setRuntimeMode);
  const selectedRange = useUiStore((state) => state.selectedRange);
  const bridgeStatus = useUiStore((state) => state.bridgeStatus);
  const searchQuery = useUiStore((state) => state.searchQuery);
  const searchResults = useUiStore((state) => state.searchResults);
  const setSearchQuery = useUiStore((state) => state.setSearchQuery);

  return (
    <header className="app-header">
      <div className="header-primary">
        <div className="header-block">
          <span className="header-label">Range</span>
          <strong>{selectedRange.startDate} - {selectedRange.endDate}</strong>
        </div>
        <div className="header-block">
          <span className="header-label">Bridge</span>
          <strong>{bridgeStatus.capability === "ready" ? "Ready" : "Degraded"}</strong>
        </div>
        <div className="header-block">
          <span className="header-label">Host</span>
          <strong>{bridgeStatus.activeHost}</strong>
        </div>
        <div className="header-block header-search">
          <span className="header-label">Search</span>
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="room / host / warning / token ..."
          />
          <small>{searchQuery ? `${searchResults.length} matches` : "Search logs, evidence, rows"}</small>
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
