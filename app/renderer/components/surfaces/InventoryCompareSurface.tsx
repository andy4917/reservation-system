import { useUiStore } from "../../state/uiStore";
import { PanelHeading, PlaceholderGrid, SectionCard } from "../SurfacePrimitives";

export function InventoryCompareSurface() {
  const inventoryCompare = useUiStore((state) => state.inventoryCompare);
  const inventoryCompareLoading = useUiStore((state) => state.inventoryCompareLoading);
  const runtimeMode = useUiStore((state) => state.runtimeMode);
  const refreshWorkspaceData = useUiStore((state) => state.refreshWorkspaceData);
  const processModules = useUiStore((state) => state.processModules);
  const recommendationAssist = useUiStore((state) => state.recommendationAssist);
  const recommendationRuntime = useUiStore((state) => state.recommendationRuntime);

  return (
    <>
      <div className="inventory-toolbar">
        <div className="toolbar-copy">
          <span className="workspace-kicker">Operator Surface</span>
          <strong>{inventoryCompare.sourceLabel}</strong>
          <p>
            Support: <strong>{inventoryCompare.supportLevel}</strong> · Last run:{" "}
            {new Date(inventoryCompare.lastRunAt).toLocaleString("ko-KR", { hour12: false })}
          </p>
        </div>
        <div className="toolbar-actions">
          <button type="button" className="action-button" onClick={() => void refreshWorkspaceData()}>
            {inventoryCompareLoading ? "Loading..." : `${runtimeMode} compare run`}
          </button>
          <div className="action-hint">Live read는 다음 단계에서 `bridge.getContext`와 `provider.fetchRows`에 연결됩니다.</div>
        </div>
      </div>
      <div className="inventory-summary-grid">
        <article className="summary-card tone-critical">
          <span>Mismatch</span>
          <strong>{inventoryCompare.mismatchCount}</strong>
          <p>apply 차단 대상</p>
        </article>
        <article className="summary-card tone-warn">
          <span>Warnings</span>
          <strong>{inventoryCompare.warningCount}</strong>
          <p>fallback 확인 필요</p>
        </article>
        <article className="summary-card tone-ok">
          <span>Matched</span>
          <strong>{inventoryCompare.matchedCount}</strong>
          <p>즉시 유지 가능</p>
        </article>
      </div>
      <section className="inventory-table-panel">
        <PanelHeading
          kicker="Recommendation Assist"
          title="Review-Only Candidates"
          description={`추천 레이어는 후보와 설명만 제공합니다. compare/validation의 최종 판정은 기존 엔진이 유지합니다.${recommendationRuntime ? ` 현재 런타임: ${recommendationRuntime.activeRuntime}.` : ""}`}
        />
        <div className="recommendation-panel-body">
          <article className="placeholder-panel">
            <h3>Summary</h3>
            <p>{recommendationAssist.summary}</p>
          </article>
          <div className="recommendation-grid">
            {recommendationAssist.recommendations.length > 0 ? (
              recommendationAssist.recommendations.map((item) => (
                <article key={`${item.input.source}-${item.input.fieldType}`} className="process-card tone-default">
                  <span>{item.input.fieldType}</span>
                  <strong>{item.input.rawValue}</strong>
                  <p>{item.reason}</p>
                  <div className="candidate-list">
                    {item.candidates.map((candidate) => (
                      <div key={`${item.input.source}-${candidate.value}`} className="candidate-chip">
                        {candidate.value} · score {Math.round(candidate.score * 100)}%
                      </div>
                    ))}
                  </div>
                </article>
              ))
            ) : (
              <article className="process-card tone-ok">
                <span>assist</span>
                <strong>No extra candidates</strong>
                <p>현재 compare snapshot에서는 추가 review-only 후보가 생성되지 않았습니다.</p>
              </article>
            )}
          </div>
          <div className="process-grid">
            {recommendationAssist.mismatchGroups.map((group) => (
              <article key={group.id} className="process-card tone-warn">
                <span>{group.count} rows</span>
                <strong>{group.title}</strong>
                <p>{group.detail}</p>
                <div className="candidate-list">
                  {group.examples.map((example) => (
                    <div key={`${group.id}-${example}`} className="candidate-chip">
                      {example}
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section className="inventory-table-panel">
        <PanelHeading
          kicker="Mismatch Preview"
          title="Provider vs Sheet"
          description="현재는 fixture 기준이며, 표 구조는 live read 연결을 전제로 유지됩니다."
        />
        <div className="inventory-table-scroll">
          <table className="inventory-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Room Type</th>
                <th>Channel</th>
                <th>Site</th>
                <th>Sheet</th>
                <th>Diff</th>
                <th>Status</th>
                <th>Reason</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {inventoryCompare.rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.date}</td>
                  <td>{row.roomType}</td>
                  <td>{row.channel}</td>
                  <td>{row.siteRaw}</td>
                  <td>{row.sheetRaw}</td>
                  <td>{row.diff}</td>
                  <td>
                    <span className={`status-chip tone-${row.status === "mismatch" ? "critical" : row.status === "warning" ? "warn" : "ok"}`}>
                      {row.status}
                    </span>
                  </td>
                  <td>{row.reason}</td>
                  <td>{row.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <SectionCard>
        <PanelHeading
          kicker="Process Modules"
          title="App + Extension Roles"
          description="앱은 orchestration/search를, 확장은 session/auth/info 수집을 담당합니다."
        />
        <div className="process-grid">
          {processModules.map((module) => (
            <article key={module.id} className={`process-card tone-${module.status === "blocked" ? "critical" : module.status === "pending" ? "warn" : module.status === "active" ? "ok" : "default"}`}>
              <span>{module.owner}</span>
              <strong>{module.title}</strong>
              <p>{module.detail}</p>
            </article>
          ))}
        </div>
      </SectionCard>
      <PlaceholderGrid>
        <div className="placeholder-panel">
          <h3>Bridge Contract Next</h3>
          <p>`search engine`, `process orchestrator`, `auth/info bridge`, `provider.fetchRows`를 함께 운영면으로 묶습니다.</p>
        </div>
        <div className="placeholder-panel">
          <h3>Execution Gate</h3>
          <p>Mismatch 0, warning review 완료, reservation audit 통과 이후에만 apply-review를 엽니다.</p>
        </div>
      </PlaceholderGrid>
    </>
  );
}
