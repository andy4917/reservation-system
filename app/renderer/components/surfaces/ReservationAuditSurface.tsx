import { useUiStore } from "../../state/uiStore";
import { PanelHeading, SectionCard } from "../SurfacePrimitives";

export function ReservationAuditSurface() {
  const bridgeSummary = useUiStore((state) => state.bridgeSummary);
  const reservationAudit = useUiStore((state) => state.reservationAudit);
  const reservationAuditLoading = useUiStore((state) => state.reservationAuditLoading);
  const refreshWorkspaceData = useUiStore((state) => state.refreshWorkspaceData);
  const activeFocus = useUiStore((state) => state.activeFocus);

  return (
    <div className="settings-surface">
      <div className="inventory-toolbar">
        <div className="toolbar-copy">
          <span className="workspace-kicker">예약 점검</span>
          <strong>{reservationAudit.sourceLabel}</strong>
          <p>
            마지막 조회: {new Date(reservationAudit.lastRunAt).toLocaleString("ko-KR", { hour12: false })}
          </p>
        </div>
        <div className="toolbar-actions">
          <button type="button" className="action-button" onClick={() => void refreshWorkspaceData()}>
            {reservationAuditLoading ? "조회 중..." : "예약 다시 점검"}
          </button>
          <div className="action-hint">
            {reservationAudit.supportLevel === "read-live"
              ? "실제 예약 데이터를 읽고 있습니다."
              : reservationAudit.supportLevel === "partial-live"
                ? "일부만 연결되어 있어 예시 데이터가 함께 보일 수 있습니다."
                : "현재는 예시 데이터 기준으로 보입니다."}
          </div>
        </div>
      </div>

      <div className="inventory-summary-grid inventory-summary-grid-wide">
        <article className="summary-card tone-critical">
          <span>이상</span>
          <strong>{reservationAudit.anomalyCount}</strong>
          <p>즉시 확인 필요</p>
        </article>
        <article className="summary-card tone-warn">
          <span>검토</span>
          <strong>{reservationAudit.reviewCount}</strong>
          <p>추가 확인 필요</p>
        </article>
        <article className="summary-card tone-ok">
          <span>진행 중</span>
          <strong>{reservationAudit.activeCount}</strong>
          <p>현재 예약</p>
        </article>
        <article className="summary-card tone-default">
          <span>취소</span>
          <strong>{reservationAudit.canceledCount}</strong>
          <p>취소 예약</p>
        </article>
      </div>

      <SectionCard>
        <PanelHeading kicker="상태" title="점검 준비 상태" description="예약 점검에 필요한 상태만 간단히 표시합니다." />
        <div className="simple-status-grid">
          <article className="simple-status-card">
            <span>예약 데이터</span>
            <strong>{reservationAudit.supportLevel === "read-live" ? "실시간 연결" : "예시 데이터"}</strong>
          </article>
          <article className="simple-status-card">
            <span>확장</span>
            <strong>
              {bridgeSummary.authSummary?.cookieCount || bridgeSummary.authSummary?.hasBearer || bridgeSummary.authSummary?.hasCsrf
                ? "연결됨"
                : "연결 안 됨"}
            </strong>
          </article>
          <article className="simple-status-card">
            <span>점검 결과</span>
            <strong>{reservationAudit.anomalyCount > 0 ? "이상 있음" : "이상 없음"}</strong>
          </article>
        </div>
      </SectionCard>

      <section className="inventory-table-panel">
        <PanelHeading
          kicker="예약 표"
          title="예약 점검 결과"
          description="이상 또는 검토가 필요한 예약을 먼저 확인합니다."
        />
        <div className="inventory-table-scroll">
          <table className="inventory-table">
            <thead>
              <tr>
                <th>예약번호</th>
                <th>이름</th>
                <th>채널</th>
                <th>입실</th>
                <th>퇴실</th>
                <th>상태</th>
                <th>점검</th>
                <th>사유</th>
              </tr>
            </thead>
            <tbody>
              {reservationAudit.rows.map((row) => (
                <tr
                  key={row.id}
                  className={activeFocus?.task === "reservation-audit" && activeFocus.rowId === row.id ? "is-focused-row" : ""}
                >
                  <td>{row.reservationNo}</td>
                  <td>{row.guestName}</td>
                  <td>{row.channel}</td>
                  <td>{row.checkin}</td>
                  <td>{row.checkout}</td>
                  <td>{row.status === "ACTIVE" ? "진행" : "취소"}</td>
                  <td>
                    <span className={`status-chip tone-${row.auditStatus === "anomaly" ? "critical" : row.auditStatus === "review" ? "warn" : "ok"}`}>
                      {row.auditStatus === "anomaly" ? "이상" : row.auditStatus === "review" ? "검토" : "정상"}
                    </span>
                  </td>
                  <td>{row.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
