import { useUiStore } from "../state/uiStore";
import { TASK_META } from "../config/taskMeta";
import type { AppTaskId } from "../types";

const TASKS: Array<{ id: AppTaskId; label: string; detail: string }> = [
  { id: "inventory-compare", label: TASK_META["inventory-compare"].title, detail: "조회 / 비교 / preview" },
  { id: "reservation-audit", label: TASK_META["reservation-audit"].title, detail: "예약 검증 / anomaly" },
  { id: "apply-review", label: TASK_META["apply-review"].title, detail: "승인 / 실행 / 결과" },
  { id: "settings", label: TASK_META.settings.title, detail: "시트 / PMS / bridge" },
  { id: "dry-run", label: TASK_META["dry-run"].title, detail: "fixture / replay" }
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
