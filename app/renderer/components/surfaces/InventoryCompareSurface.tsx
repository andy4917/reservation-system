import { useUiStore } from "../../state/uiStore";
import { PanelHeading, SectionCard } from "../SurfacePrimitives";

export function InventoryCompareSurface() {
  const inventoryCompare = useUiStore((state) => state.inventoryCompare);
  const inventoryCompareLoading = useUiStore((state) => state.inventoryCompareLoading);
  const refreshWorkspaceData = useUiStore((state) => state.refreshWorkspaceData);
  const sheetRead = useUiStore((state) => state.sheetRead);
  const bridgeStatus = useUiStore((state) => state.bridgeStatus);
  const activeFocus = useUiStore((state) => state.activeFocus);

  return (
    <>
      <div className="inventory-toolbar">
        <div className="toolbar-copy">
          <span className="workspace-kicker">재고 조회</span>
          <strong>{inventoryCompare.sourceLabel}</strong>
          <p>
            마지막 조회: {new Date(inventoryCompare.lastRunAt).toLocaleString("ko-KR", { hour12: false })}
          </p>
        </div>
        <div className="toolbar-actions">
          <button type="button" className="action-button" onClick={() => void refreshWorkspaceData()}>
            {inventoryCompareLoading ? "조회 중..." : "재고 다시 조회"}
          </button>
          <div className="action-hint">
            {bridgeStatus.sessionAvailable ? "확장 연결 상태로 조회합니다." : "확장 연결 전이라 예시 데이터가 보일 수 있습니다."}
          </div>
        </div>
      </div>

      <div className="inventory-summary-grid">
        <article className="summary-card tone-critical">
          <span>차이 있음</span>
          <strong>{inventoryCompare.mismatchCount}</strong>
          <p>우선 확인 필요</p>
        </article>
        <article className="summary-card tone-warn">
          <span>주의</span>
          <strong>{inventoryCompare.warningCount}</strong>
          <p>추가 확인 필요</p>
        </article>
        <article className="summary-card tone-ok">
          <span>일치</span>
          <strong>{inventoryCompare.matchedCount}</strong>
          <p>변경 없음</p>
        </article>
      </div>

      <SectionCard className="inventory-table-panel">
        <PanelHeading
          kicker="조회 상태"
          title="현재 연결 상태"
          description="조회 결과를 이해하는 데 필요한 상태만 간단히 보여줍니다."
        />
        <div className="simple-status-grid">
          <article className="simple-status-card">
            <span>시트</span>
            <strong>{sheetRead.supportLevel === "read-live" ? "실시간 연결" : "예시 데이터"}</strong>
          </article>
          <article className="simple-status-card">
            <span>사이트</span>
            <strong>{inventoryCompare.supportLevel === "read-live" ? "실시간 조회" : "예시 데이터"}</strong>
          </article>
          <article className="simple-status-card">
            <span>확장</span>
            <strong>{bridgeStatus.sessionAvailable ? "연결됨" : "연결 안 됨"}</strong>
          </article>
        </div>
      </SectionCard>

      <section className="inventory-table-panel">
        <PanelHeading
          kicker="재고 표"
          title="사이트 값과 시트 값 비교"
          description="차이가 있는 날짜와 객실을 표에서 바로 확인합니다."
        />
        <div className="inventory-table-scroll">
          <table className="inventory-table">
            <thead>
              <tr>
                <th>날짜</th>
                <th>객실 유형</th>
                <th>채널</th>
                <th>사이트</th>
                <th>시트</th>
                <th>차이</th>
                <th>상태</th>
                <th>사유</th>
              </tr>
            </thead>
            <tbody>
              {inventoryCompare.rows.map((row) => (
                <tr
                  key={row.id}
                  className={activeFocus?.task === "inventory-compare" && activeFocus.rowId === row.id ? "is-focused-row" : ""}
                >
                  <td>{row.date}</td>
                  <td>{row.roomType}</td>
                  <td>{row.channel}</td>
                  <td>{row.siteRaw}</td>
                  <td>{row.sheetRaw}</td>
                  <td>{row.diff}</td>
                  <td>
                    <span className={`status-chip tone-${row.status === "mismatch" ? "critical" : row.status === "warning" ? "warn" : "ok"}`}>
                      {row.status === "mismatch" ? "차이" : row.status === "warning" ? "주의" : "일치"}
                    </span>
                  </td>
                  <td>{row.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <SectionCard>
        <PanelHeading kicker="안내" title="확인 순서" description="필요한 순서만 남겼습니다." />
        <div className="simple-guide-list">
          <p>1. 지점과 날짜를 고릅니다.</p>
          <p>2. 재고 다시 조회를 누릅니다.</p>
          <p>3. 표에서 `차이`와 `주의`만 먼저 확인합니다.</p>
        </div>
      </SectionCard>
    </>
  );
}
