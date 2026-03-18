import { useUiStore } from "../state/uiStore";
import { TASK_META } from "../config/taskMeta";
import type { AppTaskId } from "../types";

const TASKS: Array<{ id: AppTaskId; label: string; detail: string }> = [
  { id: "inventory-compare", label: TASK_META["inventory-compare"].title, detail: "재고 차이 확인" },
  { id: "reservation-audit", label: TASK_META["reservation-audit"].title, detail: "예약 이상 점검" },
  { id: "apply-review", label: TASK_META["apply-review"].title, detail: "반영 전 확인" },
  { id: "settings", label: TASK_META.settings.title, detail: "연결 상태 확인" }
];

export function AppSidebar() {
  const activeTask = useUiStore((state) => state.activeTask);
  const setActiveTask = useUiStore((state) => state.setActiveTask);
  const selectedBranch = useUiStore((state) => state.selectedBranch);

  return (
    <aside className="app-sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-brand-mark">HL</div>
        <div>
          <div className="sidebar-kicker">Hotel Ledger</div>
          <h1>예약 통합 관리</h1>
          <p>{selectedBranch === "GANGNAM" ? "강남 운영 보드" : "코엑스 운영 보드"}</p>
        </div>
      </div>
      <div className="sidebar-profile">
        <div className="sidebar-profile-badge">{selectedBranch === "GANGNAM" ? "GN" : "CX"}</div>
        <div>
          <strong>{selectedBranch === "GANGNAM" ? "Gangnam Desk" : "Coex Desk"}</strong>
          <span>실시간 조회는 읽기 전용으로 유지됩니다.</span>
        </div>
      </div>
      <nav className="task-nav">
        {TASKS.map((task) => (
          <button
            key={task.id}
            type="button"
            className={`task-nav-item ${activeTask === task.id ? "is-active" : ""}`}
            onClick={() => setActiveTask(task.id)}
          >
            <span>{task.label}</span>
            <small>{task.detail}</small>
          </button>
        ))}
      </nav>
      <button type="button" className="sidebar-cta">
        <span>새 점검 시작</span>
        <strong>+</strong>
      </button>
    </aside>
  );
}
