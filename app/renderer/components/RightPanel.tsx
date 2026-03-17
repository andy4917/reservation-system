import { useUiStore } from "../state/uiStore";
import type { RightPanelTab } from "../types";

const TABS: Array<{ id: RightPanelTab; label: string }> = [
  { id: "evidence", label: "근거" },
  { id: "ops", label: "처리" },
  { id: "validation", label: "점검" },
  { id: "logs", label: "기록" }
];

export function RightPanel() {
  const activeTab = useUiStore((state) => state.activeRightPanelTab);
  const setActiveTab = useUiStore((state) => state.setActiveRightPanelTab);
  const evidenceLines = useUiStore((state) => state.evidenceLines);
  const opsLines = useUiStore((state) => state.opsLines);
  const validationLines = useUiStore((state) => state.validationLines);
  const logs = useUiStore((state) => state.logs);
  const searchQuery = useUiStore((state) => state.searchQuery);
  const searchResults = useUiStore((state) => state.searchResults);

  const contentByTab = {
    evidence: evidenceLines,
    ops: opsLines,
    validation: validationLines,
    logs
  } satisfies Record<RightPanelTab, string[]>;

  return (
    <aside className="right-panel">
      <div className="panel-title">상세 정보</div>
      <div className="right-panel-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`panel-tab ${activeTab === tab.id ? "is-active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="right-panel-body">
        {searchQuery ? (
          <div className="search-result-group">
            {searchResults.length > 0 ? (
              searchResults.map((result) => (
                <article key={result.docId} className="search-result-card">
                  <strong>{result.kind}</strong>
                  <span>{result.matchReason}</span>
                  <p>{result.excerpt}</p>
                </article>
              ))
            ) : (
              <p>"{searchQuery}"에 대한 검색 결과가 없습니다.</p>
            )}
          </div>
        ) : null}
        {contentByTab[activeTab].map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
    </aside>
  );
}
