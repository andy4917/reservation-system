import { useUiStore } from "../state/uiStore";
import type { HandoffHistoryFilter, RightPanelTab } from "../types";

const TABS: Array<{ id: RightPanelTab; label: string }> = [
  { id: "evidence", label: "근거" },
  { id: "ops", label: "처리" },
  { id: "validation", label: "점검" },
  { id: "logs", label: "기록" },
  { id: "handoff", label: "전달물" }
];

const HANDOFF_FILTERS: Array<{ id: HandoffHistoryFilter; label: string }> = [
  { id: "all", label: "전체" },
  { id: "pending", label: "미확인만" },
  { id: "needs-follow-up", label: "후속 필요만" },
  { id: "confirmed", label: "확인됨만" }
];

function buildHandoffPreviewLines(content: string) {
  return String(content || "")
    .split(/\r?\n/u)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .slice(0, 6);
}

function buildHandoffAgeLabel(exportedAt: string) {
  const timestamp = Date.parse(String(exportedAt || ""));
  if (!Number.isFinite(timestamp)) return null;
  const elapsedDays = Math.max(0, Math.floor((Date.now() - timestamp) / 86400000));
  return elapsedDays > 0 ? `${elapsedDays}일 경과` : "오늘 전달";
}

export function RightPanel() {
  const activeTab = useUiStore((state) => state.activeRightPanelTab);
  const setActiveTab = useUiStore((state) => state.setActiveRightPanelTab);
  const handoffHistoryFilter = useUiStore((state) => state.handoffHistoryFilter);
  const setHandoffHistoryFilter = useUiStore((state) => state.setHandoffHistoryFilter);
  const jumpToSearchResult = useUiStore((state) => state.jumpToSearchResult);
  const evidenceLines = useUiStore((state) => state.evidenceLines);
  const opsLines = useUiStore((state) => state.opsLines);
  const validationLines = useUiStore((state) => state.validationLines);
  const logs = useUiStore((state) => state.logs);
  const searchQuery = useUiStore((state) => state.searchQuery);
  const searchResults = useUiStore((state) => state.searchResults);
  const operatorExport = useUiStore((state) => state.operatorExport);
  const refreshOperatorExport = useUiStore((state) => state.refreshOperatorExport);
  const exportOperatorHandoff = useUiStore((state) => state.exportOperatorHandoff);
  const repeatOperatorHandoff = useUiStore((state) => state.repeatOperatorHandoff);
  const setOperatorHandoffStatus = useUiStore((state) => state.setOperatorHandoffStatus);

  const contentByTab = {
    evidence: evidenceLines,
    ops: opsLines,
    validation: validationLines,
    logs,
    handoff: []
  } satisfies Record<RightPanelTab, string[]>;

  const getHandoffStatusLabel = (status: string) => {
    if (status === "confirmed") return "확인됨";
    if (status === "needs-follow-up") return "후속 필요";
    return "전송됨";
  };

  const getImpactScopeLabel = (impactScope: string) => {
    if (impactScope === "operations") return "운영 영향";
    if (impactScope === "mixed") return "운영/구현 영향";
    return "구현 영향";
  };

  const handoffHistory = operatorExport?.handoffHistory || [];
  const handoffSummary = operatorExport?.handoffSummary || {
    totalCount: handoffHistory.length,
    pendingCount: handoffHistory.filter((item) => item.status !== "confirmed").length,
    needsFollowUpCount: handoffHistory.filter((item) => item.status === "needs-follow-up").length,
    confirmedCount: handoffHistory.filter((item) => item.status === "confirmed").length,
    hiddenNeedsFollowUpCount: 0
  };
  const followUpQueue = operatorExport?.followUpQueue || [];
  const filteredHandoffHistory = handoffHistory.filter((item) => {
    if (handoffHistoryFilter === "pending") return item.status !== "confirmed";
    if (handoffHistoryFilter === "needs-follow-up") return item.status === "needs-follow-up";
    if (handoffHistoryFilter === "confirmed") return item.status === "confirmed";
    return true;
  });

  const renderHandoffCard = (item: (typeof handoffHistory)[number]) => {
    const previewLines = buildHandoffPreviewLines(item.payload.content);
    const ageLabel = buildHandoffAgeLabel(item.exportedAt);
    return (
      <div key={item.handoffId} className="right-panel-card">
        <div className="handoff-item-header">
          <strong>{`${item.target} ${item.format}`}</strong>
          <span className="handoff-item-status">{getHandoffStatusLabel(item.status)}</span>
        </div>
        <span>{item.fileName || "clipboard"}</span>
        <span>{`${item.exportedAt} | ${item.verifyClassification} | ${item.bytes} bytes`}</span>
        {ageLabel ? <span className="handoff-item-age">{ageLabel}</span> : null}
        <span className="handoff-item-impact">{`${getImpactScopeLabel(item.impactScope)} | ${item.impactReasons.join(", ") || "reason-none"}`}</span>
        <div className="right-panel-section-actions handoff-item-actions">
          <button
            type="button"
            className="action-button"
            onClick={() => void repeatOperatorHandoff(item.handoffId, "clipboard")}
          >
            다시 복사
          </button>
          <button type="button" className="action-button" onClick={() => void repeatOperatorHandoff(item.handoffId, "file")}>
            다시 저장
          </button>
          <button
            type="button"
            className="action-button"
            disabled={item.status === "confirmed"}
            onClick={() => void setOperatorHandoffStatus(item.handoffId, "confirmed")}
          >
            확인 완료
          </button>
          <button
            type="button"
            className="action-button"
            disabled={item.status === "needs-follow-up"}
            onClick={() => void setOperatorHandoffStatus(item.handoffId, "needs-follow-up")}
          >
            후속 필요
          </button>
          {item.filePath ? <span className="handoff-item-file-path">{item.filePath}</span> : null}
          {item.repeatedFromHandoffId ? (
            <span className="handoff-item-file-path">{`repeated-from ${item.repeatedFromHandoffId}`}</span>
          ) : null}
        </div>
        <details className="handoff-item-details">
          <summary>전달 내용 보기</summary>
          {previewLines.length > 0 ? <pre>{previewLines.join("\n")}</pre> : <p>저장된 전달 내용이 없습니다.</p>}
          <span className="handoff-item-file-path">{`lineage ${item.evidenceLineage.join(", ") || "none"}`}</span>
        </details>
      </div>
    );
  };

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
                <button
                  key={result.docId}
                  type="button"
                  className="search-result-card"
                  onClick={() => jumpToSearchResult(result.docId)}
                >
                  <strong>{result.kind}</strong>
                  <span>{`${result.matchReason} | ${result.source}${result.sectionKey ? ` | ${result.sectionKey}` : ""}`}</span>
                  <p>{result.excerpt}</p>
                </button>
              ))
            ) : (
              <p>"{searchQuery}"에 대한 검색 결과가 없습니다.</p>
            )}
          </div>
        ) : null}
        {activeTab === "handoff" ? (
          operatorExport ? (
            <>
              <div className="right-panel-section right-panel-section--current">
                <strong>현재 전달물</strong>
                <div className="right-panel-card">
                  <strong>{`${operatorExport.manifest.branch} ${operatorExport.manifest.startDate}..${operatorExport.manifest.endDate}`}</strong>
                  <span>{`verify ${operatorExport.verifyEvidence.classification} | source ${operatorExport.verifyEvidence.source}`}</span>
                  <span>{`채택 ${operatorExport.metrics.latestAcceptedCount} | 거절 ${operatorExport.metrics.latestRejectedCount} | 미해결 ${operatorExport.metrics.unresolvedCount}`}</span>
                  <span>{`정확 자동 ${operatorExport.metrics.exactAutoBindingCount} | soft triage ${operatorExport.metrics.softTriageCount}`}</span>
                  <span>{`precision ${operatorExport.metrics.precisionScore} | gate ${operatorExport.metrics.precisionGate}`}</span>
                </div>
                <div className="right-panel-section-actions">
                  <button type="button" className="action-button" onClick={() => void refreshOperatorExport()}>
                    전달물 새로 고침
                  </button>
                  <button type="button" className="action-button" onClick={() => void exportOperatorHandoff("clipboard", "copy-text")}>
                    전달 문구 복사
                  </button>
                  <button type="button" className="action-button" onClick={() => void exportOperatorHandoff("file", "json")}>
                    JSON 저장
                  </button>
                  <button type="button" className="action-button" onClick={() => void exportOperatorHandoff("file", "csv")}>
                    CSV 저장
                  </button>
                </div>
              </div>
              <div className="right-panel-section">
                <strong>운영 루프</strong>
                {operatorExport.operatorLoopLines.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
              <div className="right-panel-section">
                <strong>후속 현황</strong>
                <div className="handoff-summary-grid">
                  <div className="handoff-summary-card">
                    <strong>전체</strong>
                    <span>{handoffSummary.totalCount}</span>
                  </div>
                  <div className="handoff-summary-card">
                    <strong>미확인</strong>
                    <span>{handoffSummary.pendingCount}</span>
                  </div>
                  <div className="handoff-summary-card">
                    <strong>후속 필요</strong>
                    <span>{handoffSummary.needsFollowUpCount}</span>
                  </div>
                  <div className="handoff-summary-card">
                    <strong>확인됨</strong>
                    <span>{handoffSummary.confirmedCount}</span>
                  </div>
                </div>
                {handoffSummary.hiddenNeedsFollowUpCount > 0 ? (
                  <p>{`최근 이력 밖에 후속 필요 ${handoffSummary.hiddenNeedsFollowUpCount}건이 남아 있습니다.`}</p>
                ) : null}
                <div className="handoff-filter-row">
                  {HANDOFF_FILTERS.map((filter) => (
                    <button
                      key={filter.id}
                      type="button"
                      className={`handoff-filter-button ${handoffHistoryFilter === filter.id ? "is-active" : ""}`}
                      onClick={() => setHandoffHistoryFilter(filter.id)}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
              </div>
              {followUpQueue.length > 0 ? (
                <div className="right-panel-section">
                  <strong>장기 후속 필요</strong>
                  <span>{`최근 이력 밖의 후속 필요 ${followUpQueue.length}건 | 오래된 순 정렬`}</span>
                  <div className="handoff-history-list">{followUpQueue.map((item) => renderHandoffCard(item))}</div>
                </div>
              ) : null}
              <div className="right-panel-section">
                <strong>전달 이력</strong>
                <span>{`현재 필터 ${filteredHandoffHistory.length}건`}</span>
                {filteredHandoffHistory.length > 0 ? (
                  <div className="handoff-history-list">{filteredHandoffHistory.map((item) => renderHandoffCard(item))}</div>
                ) : (
                  <p>{handoffHistory.length > 0 ? "현재 필터에 해당하는 전달 이력이 없습니다." : "아직 전달 이력이 없습니다."}</p>
                )}
              </div>
            </>
          ) : (
            <p>선택된 run의 전달물을 먼저 생성해 주세요.</p>
          )
        ) : null}
        {activeTab !== "handoff" &&
          contentByTab[activeTab].map((line) => (
            <p key={line}>{line}</p>
          ))}
      </div>
    </aside>
  );
}
