import type { WorkspaceMockState } from "../renderer/types";

export interface ProcessModule {
  id: string;
  title: string;
  owner: "app" | "extension";
  status: "ready" | "active" | "blocked" | "pending";
  detail: string;
}

export function buildProcessModules(state: WorkspaceMockState): ProcessModule[] {
  const hasLiveBridge = state.bridgeStatus.sessionAvailable;
  const hasMismatch = state.inventoryCompare.mismatchCount > 0;
  const hasWarnings = state.inventoryCompare.warningCount > 0;

  return [
    {
      id: "search-engine",
      title: "Search Engine",
      owner: "app",
      status: "ready",
      detail: "logs, evidence, validation, inventory rows를 앱에서 검색"
    },
    {
      id: "workflow-orchestrator",
      title: "Process Orchestrator",
      owner: "app",
      status: state.activeTask === "inventory-compare" ? "active" : "ready",
      detail: "task별 실행 단계와 blocker를 앱에서 정리"
    },
    {
      id: "session-auth",
      title: "Session/Auth Bridge",
      owner: "extension",
      status: hasLiveBridge ? "active" : "pending",
      detail: hasLiveBridge ? "현재 탭 세션과 host 문맥이 앱에 연결됨" : "현재 탭 세션 heartbeat 대기 중"
    },
    {
      id: "provider-read",
      title: "Provider Read Module",
      owner: "extension",
      status: hasLiveBridge ? "active" : "pending",
      detail: hasLiveBridge ? "provider live row 추출이 브리지로 전달됨" : "provider별 실 row mapper 미연결"
    },
    {
      id: "validation-gate",
      title: "Validation Gate",
      owner: "app",
      status: hasMismatch ? "blocked" : hasWarnings ? "pending" : "ready",
      detail: hasMismatch
        ? "mismatch가 남아 있어 apply-review 차단"
        : hasWarnings
          ? "warning review 이후 apply-review 가능"
          : "검증 게이트 통과 가능"
    }
  ];
}
