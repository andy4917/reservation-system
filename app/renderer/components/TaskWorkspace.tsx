import { useUiStore } from "../state/uiStore";

const TASK_COPY: Record<string, { title: string; summary: string; action: string }> = {
  "inventory-compare": {
    title: "Inventory Compare",
    summary: "사이트 재고, 시트 스냅샷, mismatch preview를 앱 메인 화면에서 직접 비교합니다.",
    action: "현재 단계: app-owned compare surface restored"
  },
  "reservation-audit": {
    title: "Reservation Audit",
    summary: "PMS 예약 fetch, anomaly, evidence summary를 앱 우측 패널과 함께 검토합니다.",
    action: "다음 단계: reservation service adapter 연결"
  },
  "apply-review": {
    title: "Apply Review",
    summary: "승인 게이트, apply preview, post-apply summary를 앱 기준으로 재구성합니다.",
    action: "다음 단계: live apply는 bridge policy 이후 연결"
  },
  settings: {
    title: "Settings",
    summary: "시트, PMS, provider, auth bundle, bridge 연결 상태를 앱 저장소 기준으로 정리합니다.",
    action: "다음 단계: secure storage wrapper 추가"
  },
  "dry-run": {
    title: "Dry Run",
    summary: "fixture를 사용해 브라우저 없이 흐름 전체를 재생합니다.",
    action: "다음 단계: replay fixture와 scenario selector 추가"
  }
};

function InventoryCompareSurface() {
  const inventoryCompare = useUiStore((state) => state.inventoryCompare);
  const inventoryCompareLoading = useUiStore((state) => state.inventoryCompareLoading);
  const runtimeMode = useUiStore((state) => state.runtimeMode);
  const refreshInventoryCompare = useUiStore((state) => state.refreshInventoryCompare);

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
          <button type="button" className="action-button" onClick={() => void refreshInventoryCompare()}>
            {inventoryCompareLoading ? "Loading..." : `${runtimeMode} compare run`}
          </button>
          <div className="action-hint">
            Live read는 다음 단계에서 `bridge.getContext`와 `provider.fetchRows`에 연결됩니다.
          </div>
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
        <div className="panel-heading">
          <div>
            <span className="workspace-kicker">Mismatch Preview</span>
            <h3>Provider vs Sheet</h3>
          </div>
          <p>현재는 fixture 기준이며, 표 구조는 live read 연결을 전제로 유지됩니다.</p>
        </div>
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
      <div className="workspace-placeholder">
        <div className="placeholder-panel">
          <h3>Bridge Contract Next</h3>
          <p>`bridge.getContext`, `provider.fetchRows`, `provider.domSnapshot` 순으로 live read를 이 표에 꽂습니다.</p>
        </div>
        <div className="placeholder-panel">
          <h3>Execution Gate</h3>
          <p>Mismatch 0, warning review 완료, reservation audit 통과 이후에만 apply-review를 엽니다.</p>
        </div>
      </div>
    </>
  );
}

export function TaskWorkspace() {
  const activeTask = useUiStore((state) => state.activeTask);
  const metrics = useUiStore((state) => state.metrics);
  const copy = TASK_COPY[activeTask];

  return (
    <main className="task-workspace">
      <div className="workspace-hero">
        <div>
          <span className="workspace-kicker">Main Task</span>
          <h2>{copy.title}</h2>
          <p>{copy.summary}</p>
        </div>
        <div className="workspace-action">{copy.action}</div>
      </div>
      <div className="metric-grid">
        {metrics.map((metric) => (
          <article key={metric.label} className={`metric-card tone-${metric.tone || "default"}`}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
          </article>
        ))}
      </div>
      {activeTask === "inventory-compare" ? (
        <InventoryCompareSurface />
      ) : (
        <div className="workspace-placeholder">
          <div className="placeholder-panel">
            <h3>Primary Surface</h3>
            <p>이 영역에 task별 메인 비교 표, 예약 검증 결과, apply preview를 연결합니다.</p>
          </div>
          <div className="placeholder-panel">
            <h3>Execution Controls</h3>
            <p>Bridge 연결 이후 실행 버튼, 재시도, export, feature gate를 이 영역에 배치합니다.</p>
          </div>
        </div>
      )}
    </main>
  );
}
