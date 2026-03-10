import { AppHeader } from "../components/AppHeader";
import { AppSidebar } from "../components/AppSidebar";
import { LogPanel } from "../components/LogPanel";
import { RightPanel } from "../components/RightPanel";
import { StatusBanner } from "../components/StatusBanner";
import { TaskWorkspace } from "../components/TaskWorkspace";

export function WorkspaceScreen() {
  return (
    <div className="workspace-shell">
      <AppSidebar />
      <div className="workspace-main">
        <AppHeader />
        <StatusBanner />
        <div className="workspace-grid">
          <TaskWorkspace />
          <RightPanel />
        </div>
        <LogPanel />
      </div>
    </div>
  );
}
