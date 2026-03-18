import { useUiStore } from "../state/uiStore";
import { TASK_META } from "../config/taskMeta";

export function AppHeader() {
  const runtimeMode = useUiStore((state) => state.runtimeMode);
  const activeTask = useUiStore((state) => state.activeTask);
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
  const activeCopy = TASK_META[activeTask];

  return (
    <header className="app-header">
      <div className="header-titlebar">
        <div className="header-window-controls" aria-hidden="true">
          <span className="window-dot is-close" />
          <span className="window-dot is-minimize" />
          <span className="window-dot is-expand" />
        </div>
        <strong className="header-app-title">Hotel Ledger Admin</strong>
        <span className="header-live-state">{activeRunContext ? "read snapshot ready" : "read-only preview"}</span>
      </div>
      <div className="header-overview">
        <div className="header-intro">
          <span className="workspace-kicker">Control Desk</span>
          <h2>{activeCopy.title}</h2>
          <p>{activeCopy.summary}</p>
        </div>
        <label className="header-search-panel">
          <span className="header-label">검색</span>
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="예약번호, 객실명, 경고 사유 검색"
            aria-label="객실명, 예약번호, 경고 사유 검색"
          />
          <small>{searchQuery ? `${searchResults.length}건 찾음` : "표와 기록에서 검색"}</small>
        </label>
      </div>
      <div className="header-toolbar">
        <div className="header-toolbar-group">
          <label className="header-control">
            <span className="header-label">지점</span>
            <select value={selectedBranch} onChange={(event) => setSelectedBranch(event.target.value as "GANGNAM" | "COEX")}>
              <option value="GANGNAM">강남</option>
              <option value="COEX">코엑스</option>
            </select>
          </label>
          <label className="header-control">
            <span className="header-label">시작일</span>
            <input
              type="date"
              value={selectedRange.startDate}
              onChange={(event) => setSelectedRange({ startDate: event.target.value, endDate: selectedRange.endDate })}
            />
          </label>
          <label className="header-control">
            <span className="header-label">종료일</span>
            <input
              type="date"
              value={selectedRange.endDate}
              onChange={(event) => setSelectedRange({ startDate: selectedRange.startDate, endDate: event.target.value })}
            />
          </label>
        </div>
        <div className="header-toolbar-group">
          <div className="header-stat-pill">
            <span className="header-label">확장 연결</span>
            <strong>{bridgeStatus.sessionAvailable ? "연결됨" : "연결 필요"}</strong>
          </div>
          <div className="header-stat-pill">
            <span className="header-label">현재 상태</span>
            <strong>{activeRunContext ? "조회 완료" : "조회 전"}</strong>
          </div>
          <div className="header-mode-pills">
            {(["preview", "history", "live"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                className={`mode-pill ${runtimeMode === mode ? "is-active" : ""}`}
                onClick={() => setRuntimeMode(mode)}
              >
                {mode === "preview" ? "미리보기" : mode === "history" ? "기록" : "실시간"}
              </button>
            ))}
          </div>
        </div>
      </div>
    </header>
  );
}
