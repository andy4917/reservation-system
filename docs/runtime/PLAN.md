# PLAN

- updated_at: 2026-03-17T14:57:31+09:00
- goal: Stage C를 `mapping core` 기준으로 실제 구현 단계까지 진행합니다.

## Steps
1. 완료: `NEXT_STAGE_CONTRACT.yaml`, `NEXT_STAGE_RECOMMENDED_PROPOSAL.md`, handoff/runtime 문서를 교차 확인해 Stage C 범위를 정리합니다.
2. 완료: 실행 순서, 산출물, 금지사항, 검증 게이트를 담은 `IMPLEMENT.md`를 작성합니다.
3. 완료: Milestone 1 schema close로 `SectionRef`, `MappingAnchor`, `ProviderValueSource`, `StructuralVariant`, `MappingArtifact`를 타입 계약에 추가했습니다.
4. 완료: `sheet snapshot -> generated binding draft -> run artifact payload` 경로에 `mappingArtifacts`를 연결했습니다.
5. 완료: `app:check`, `app:build:main`, `regression_app_binding_artifacts`, `regression_app_run_artifact_store`로 Milestone 1 범위를 검증했습니다.
6. 완료: Milestone 2에서 section segmentation runtime을 branch-title 중심으로 재구성하고 `active/preopen` 상태를 artifact에 남기도록 구현했습니다.
7. 완료: live `COEX/GANGNAM` 재검증으로 `GANGNAM/COEX/선릉=active`, `삼성=preopen` 분리를 확인했습니다.
8. 완료: Milestone 3에서 section-scoped decision replay, deterministic merge order, unresolved retain, persist 경로를 구현했습니다.
9. 완료: 삼성점은 live detection은 유지하되 operational `mappingArtifacts`에서는 제외하도록 비활성화했습니다.
10. 확인: Stage C 계약 검토 결과, 현재 milestone 범위는 최신 상태로 반영됐지만 `scripts/live_sheet_verify.mjs`와 bounded search assist는 아직 미구현입니다.
11. 완료: Milestone 4~5에서 main-owned bounded search assist와 repo-local live verification command를 구현했습니다.
12. 다음: Stage C 최소 계약은 닫혔으므로, Stage 3/4 경계에서 recommendation/evidence 확장 범위를 다시 고정합니다.

## Verification Gate
- Milestone 1은 `mappingArtifacts`가 타입과 run artifact payload에 모두 존재해야 합니다.
- Milestone 2는 `TYPE/ROOM` 헤더가 독립 section으로 승격되지 않아야 하고, branch title이 있는 section만 `active/preopen`으로 분류되어야 합니다.
- Milestone 3은 saved decision replay가 stable order로 동작해야 하며, section-scoped unresolved가 legacy decision key와도 호환되어야 합니다.
- renderer는 계속 `summary + selectedRunId + visibleSlice` 중심을 유지해야 하며 raw snapshot을 보관하지 않아야 합니다.
- 이번 완료 판정은 Stage C의 minimal bounded search assist + repo-local live verification command 범위에 한정합니다. broad search runtime 개편이나 Stage 3 전체 성공으로 확장하지 않습니다.

- checkpoint: 2026-03-17T04:34:30Z | status=verified | next=Milestone 3 proposal/decision merge를 section artifact 기준으로 고정

- checkpoint: 2026-03-17T04:44:58Z | status=verified | next=Milestone 3 persist/replay 경로를 추가 검증하고 section artifact 기준으로 고정

- checkpoint: 2026-03-17T04:52:30Z | status=verified | next=Milestone 4 bounded search assist와 repo-local live verification command 구현
- checkpoint: 2026-03-17T05:57:31Z | status=verified | next=Stage 3/4 경계에서 recommendation/evidence 확장 범위 재고정
