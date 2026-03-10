import { useUiStore } from "../state/uiStore";
import type { AppTaskId } from "../types";

const TASKS: Array<{ id: AppTaskId; label: string; detail: string }> = [
  { id: "inventory-compare", label: "Inventory Compare", detail: "조회 / 비교 / preview" },
  { id: "reservation-audit", label: "Reservation Audit", detail: "예약 검증 / anomaly" },
  { id: "apply-review", label: "Apply Review", detail: "승인 / 실행 / 결과" },
  { id: "settings", label: "Settings", detail: "시트 / PMS / bridge" },
  { id: "dry-run", label: "Dry Run", detail: "fixture / replay" }
];

export function AppSidebar() {
  const activeTask = useUiStore((state) => state.activeTask);
  const setActiveTask = useUiStore((state) => state.setActiveTask);

  return (
    <aside className="app-sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-kicker">Reservation Ops</div>
        <h1>Unified Control</h1>
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
    </aside>
  );
}
