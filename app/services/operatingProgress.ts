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
      percent: 35,
      summary: "브라우저 세션 우선 구조와 Wings read-only contract는 연결됐지만, 실제 live JSON read는 아직 닫히지 않았다."
    },
    {
      id: "stage-2",
      title: "Truth-Aligned Mapping Core",
      percent: 25,
      summary: "taxonomy/graph/scaffold는 생겼지만 실제 운영 샘플을 반영한 mapping 완성도는 아직 낮다."
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
