import { useUiStore } from "../../state/uiStore";
import { PanelHeading } from "../SurfacePrimitives";

export function ReservationAuditSurface() {
  const bridgeSummary = useUiStore((state) => state.bridgeSummary);
  const jobStatusCards = useUiStore((state) => state.jobStatusCards);
  const reservationAudit = useUiStore((state) => state.reservationAudit);
  const reservationAuditLoading = useUiStore((state) => state.reservationAuditLoading);
  const runtimeMode = useUiStore((state) => state.runtimeMode);
  const refreshWorkspaceData = useUiStore((state) => state.refreshWorkspaceData);

  return (
    <div className="settings-surface">
      <div className="inventory-toolbar">
        <div className="toolbar-copy">
          <span className="workspace-kicker">Audit Surface</span>
          <strong>{reservationAudit.sourceLabel}</strong>
          <p>
            Support: <strong>{reservationAudit.supportLevel}</strong> · Last run:{" "}
            {new Date(reservationAudit.lastRunAt).toLocaleString("ko-KR", { hour12: false })}
          </p>
        </div>
        <div className="toolbar-actions">
          <button type="button" className="action-button" onClick={() => void refreshWorkspaceData()}>
            {reservationAuditLoading ? "Loading..." : `${runtimeMode} audit run`}
          </button>
          <div className="action-hint">
            {reservationAudit.supportLevel === "read-live"
              ? "Wings reservation lookup이 live row를 공급 중입니다. anomaly만 우선 검토하면 됩니다."
              : reservationAudit.supportLevel === "partial-live"
                ? "bridge auth/info summary는 연결됐지만 reservation row는 아직 일부 fallback 상태입니다."
                : "live row가 없으면 fixture 또는 bridge summary 기준으로 표시합니다."}
          </div>
        </div>
      </div>
      <div className="inventory-summary-grid inventory-summary-grid-wide">
        <article className="summary-card tone-critical">
          <span>Anomaly</span>
          <strong>{reservationAudit.anomalyCount}</strong>
          <p>즉시 점검 필요</p>
        </article>
        <article className="summary-card tone-warn">
          <span>Review</span>
          <strong>{reservationAudit.reviewCount}</strong>
          <p>보조 검증 대기</p>
        </article>
        <article className="summary-card tone-ok">
          <span>Active</span>
          <strong>{reservationAudit.activeCount}</strong>
          <p>현재 stay 기준</p>
        </article>
        <article className="summary-card tone-default">
          <span>Canceled</span>
          <strong>{reservationAudit.canceledCount}</strong>
          <p>취소 동기화 완료</p>
        </article>
      </div>
      <section className="process-panel">
        <PanelHeading
          kicker="Audit Readiness"
          title="Reservation Audit Inputs"
          description="provider read 상태 기준으로 감사 준비도만 표시합니다."
        />
        <div className="process-grid">
          {jobStatusCards
            .filter((job) => ["provider-read", "reservation-audit"].includes(job.id))
            .map((job) => (
              <article key={job.id} className={`process-card tone-${job.status === "blocked" ? "critical" : job.status === "running" ? "ok" : "warn"}`}>
                <span>{job.status}</span>
                <strong>{job.title}</strong>
                <p>{job.detail}</p>
              </article>
            ))}
          <article className="process-card tone-default">
            <span>bridge</span>
            <strong>Live Workspace</strong>
            <p>
              {bridgeSummary.authSummary?.cookieCount || bridgeSummary.authSummary?.hasBearer || bridgeSummary.authSummary?.hasCsrf
                ? "Live provider materials available"
                : "Live provider materials unavailable"}
            </p>
          </article>
        </div>
      </section>
      <section className="inventory-table-panel">
        <PanelHeading
          kicker="Audit Queue"
          title="PMS / OTA Verification Rows"
          description="이 표는 anomaly와 review-only row를 앱 메인 화면에서 먼저 정리하기 위한 운영 표면입니다."
        />
        <div className="inventory-table-scroll">
          <table className="inventory-table">
            <thead>
              <tr>
                <th>Reservation</th>
                <th>Guest</th>
                <th>Channel</th>
                <th>Check-in</th>
                <th>Check-out</th>
                <th>Status</th>
                <th>Audit</th>
                <th>Reason</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {reservationAudit.rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.reservationNo}</td>
                  <td>{row.guestName}</td>
                  <td>{row.channel}</td>
                  <td>{row.checkin}</td>
                  <td>{row.checkout}</td>
                  <td>{row.status}</td>
                  <td>
                    <span className={`status-chip tone-${row.auditStatus === "anomaly" ? "critical" : row.auditStatus === "review" ? "warn" : "ok"}`}>
                      {row.auditStatus}
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
    </div>
  );
}
