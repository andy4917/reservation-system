import { TASK_META } from "../config/taskMeta";
import { useUiStore } from "../state/uiStore";
import { MetricCardGrid, PlaceholderGrid, WorkspaceHero } from "./SurfacePrimitives";
import { InventoryCompareSurface } from "./surfaces/InventoryCompareSurface";
import { ReservationAuditSurface } from "./surfaces/ReservationAuditSurface";
import { SettingsSurface } from "./surfaces/SettingsSurface";

function PlaceholderSurface() {
  return (
    <PlaceholderGrid>
      <div className="placeholder-panel">
        <h3>Primary Surface</h3>
        <p>이 영역에 task별 메인 비교 표, 예약 검증 결과, apply preview를 연결합니다.</p>
      </div>
      <div className="placeholder-panel">
        <h3>Execution Controls</h3>
        <p>Bridge 연결 이후 실행 버튼, 재시도, export, feature gate를 이 영역에 배치합니다.</p>
      </div>
    </PlaceholderGrid>
  );
}

export function TaskWorkspace() {
  const activeTask = useUiStore((state) => state.activeTask);
  const metrics = useUiStore((state) => state.metrics);
  const copy = TASK_META[activeTask];

  return (
    <main className="task-workspace">
      <WorkspaceHero title={copy.title} summary={copy.summary} action={copy.action} />
      <MetricCardGrid metrics={metrics} />
      {activeTask === "inventory-compare" ? (
        <InventoryCompareSurface />
      ) : activeTask === "settings" ? (
        <SettingsSurface />
      ) : activeTask === "reservation-audit" ? (
        <ReservationAuditSurface />
      ) : (
        <PlaceholderSurface />
      )}
    </main>
  );
}
