import { useUiStore } from "../state/uiStore";

export function AppHeader() {
  const runtimeMode = useUiStore((state) => state.runtimeMode);
  const setRuntimeMode = useUiStore((state) => state.setRuntimeMode);
  const selectedBranch = useUiStore((state) => state.selectedBranch);
  const setSelectedBranch = useUiStore((state) => state.setSelectedBranch);
  const selectedRange = useUiStore((state) => state.selectedRange);
  const setSelectedRange = useUiStore((state) => state.setSelectedRange);
  const bridgeStatus = useUiStore((state) => state.bridgeStatus);
  const activeRunContext = useUiStore((state) => state.activeRunContext);
  const searchQuery = useUiStore((state) => state.searchQuery);
  const searchResults = useUiStore((state) => state.searchResults);
  const setSearchQuery = useUiStore((state) => state.setSearchQuery);

  return (
    <header className="app-header">
      <div className="header-primary">
        <div className="header-block">
          <span className="header-label">Branch</span>
          <strong>{selectedBranch}</strong>
        </div>
        <div className="header-block">
          <span className="header-label">Run</span>
          <strong>{activeRunContext ? activeRunContext.id.split(":").slice(0, 4).join(" · ") : "not requested"}</strong>
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
        <select value={selectedBranch} onChange={(event) => setSelectedBranch(event.target.value as "ALL" | "GANGNAM" | "COEX")}>
          <option value="ALL">ALL</option>
          <option value="GANGNAM">GANGNAM</option>
          <option value="COEX">COEX</option>
        </select>
        <input
          type="date"
          value={selectedRange.startDate}
          onChange={(event) => setSelectedRange({ startDate: event.target.value, endDate: selectedRange.endDate })}
        />
        <input
          type="date"
          value={selectedRange.endDate}
          onChange={(event) => setSelectedRange({ startDate: selectedRange.startDate, endDate: event.target.value })}
        />
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
