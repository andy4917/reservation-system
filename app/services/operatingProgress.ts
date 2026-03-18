export interface OperatingStageProgress {
  id: string;
  title: string;
  percent: number;
  summary: string;
}

export function getOperatingStageProgress(): {
  overallPercent: number;
  stages: OperatingStageProgress[];
} {
  const stages: OperatingStageProgress[] = [
    {
      id: "stage-0",
      title: "기준선 재정렬",
      percent: 100,
      summary: "제품 정의, 운영 모델, 앱/확장 책임 경계를 다시 고정했다."
    },
    {
      id: "stage-1",
      title: "Live Read 최소 경로",
      percent: 60,
      summary: "main-owned live bundle, branch/date scoped read, coverage 요약, read-only smoke 경로가 연결됐고 남은 공백은 운영 세션/시트 설정 검증입니다."
    },
    {
      id: "stage-2",
      title: "Truth-Aligned Mapping Core",
      percent: 45,
      summary: "domain-aware unresolved, artifact metrics, truth signal 연결은 반영됐고 실제 canonical auto binding과 precision gate가 남아 있습니다."
    },
    {
      id: "stage-3",
      title: "Audit / Evidence E2E",
      percent: 40,
      summary: "inventory compare와 reservation audit 표면은 있으나 실제 live run 기반 evidence closure는 미완료다."
    },
    {
      id: "stage-4",
      title: "Search",
      percent: 12,
      summary: "search는 단순 read-only 보조로 유지되고, 추천 스켈레톤과 관련 런타임은 활성 경로에서 제거했다."
    },
    {
      id: "stage-5",
      title: "Operator Export / Handoff",
      percent: 30,
      summary: "export 관련 자산은 일부 있으나 앱 운영 루프 기준 결과물 고정은 아직 진행 중이다."
    },
    {
      id: "stage-6",
      title: "Apply 판단",
      percent: 0,
      summary: "read-only 운영 가치가 먼저 닫혀야 하므로 아직 착수 전이다."
    }
  ];
  const overallPercent = Math.round(stages.reduce((acc, stage) => acc + stage.percent, 0) / stages.length);
  return {
    overallPercent,
    stages
  };
}
