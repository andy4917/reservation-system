import { useUiStore } from "../state/uiStore";
import { TASK_META } from "../config/taskMeta";
import type { AppTaskId } from "../types";

const TASKS: Array<{ id: AppTaskId; label: string; detail: string }> = [
  { id: "inventory-compare", label: TASK_META["inventory-compare"].title, detail: "재고 차이 확인" },
  { id: "reservation-audit", label: TASK_META["reservation-audit"].title, detail: "예약 이상 점검" },
  { id: "apply-review", label: TASK_META["apply-review"].title, detail: "반영 전 확인" },
  { id: "settings", label: TASK_META.settings.title, detail: "연결 상태 확인" },
  { id: "dry-run", label: TASK_META["dry-run"].title, detail: "예시 데이터 보기" }
];

export function AppSidebar() {
  const activeTask = useUiStore((state) => state.activeTask);
  const setActiveTask = useUiStore((state) => state.setActiveTask);

  return (
    <aside className="app-sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-kicker">예약 운영</div>
        <h1>예약 통합 관리</h1>
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
