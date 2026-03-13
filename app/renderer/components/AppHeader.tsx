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
          <span className="header-label">지점</span>
          <strong>{selectedBranch === "ALL" ? "전체" : selectedBranch === "GANGNAM" ? "강남" : "코엑스"}</strong>
        </div>
        <div className="header-block">
          <span className="header-label">조회 기간</span>
          <strong>{selectedRange.startDate} ~ {selectedRange.endDate}</strong>
        </div>
        <div className="header-block">
          <span className="header-label">확장 연결</span>
          <strong>{bridgeStatus.sessionAvailable ? "연결됨" : "연결 필요"}</strong>
        </div>
        <div className="header-block">
          <span className="header-label">현재 상태</span>
          <strong>{activeRunContext ? "조회 완료" : "조회 전"}</strong>
        </div>
        <div className="header-block header-search">
          <span className="header-label">검색</span>
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="객실명, 예약번호, 경고 사유 검색"
          />
          <small>{searchQuery ? `${searchResults.length}건 찾음` : "표와 기록에서 검색"}</small>
        </div>
      </div>
      <div className="header-modes">
        <select value={selectedBranch} onChange={(event) => setSelectedBranch(event.target.value as "ALL" | "GANGNAM" | "COEX")}>
          <option value="ALL">전체</option>
          <option value="GANGNAM">강남</option>
          <option value="COEX">코엑스</option>
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
            {mode === "dry-run" ? "테스트" : mode === "replay" ? "재현" : "실시간"}
          </button>
        ))}
      </div>
    </header>
  );
}
