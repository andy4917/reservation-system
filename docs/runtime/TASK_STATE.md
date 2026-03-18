# TASK STATE

- updated_at: 2026-03-18T22:50:13+09:00
- status: verified
- goal: Stage 1 `Live Read 최소 경로`와 Stage 2 `Truth-Aligned Mapping Core` completion을 위해 실제 시트/PMS 기반 alias/identity auto binding과 precision/soft-triage surface를 반영
- current_milestone: stage/v1 checklist, repo handoff, active memory, archive 정리까지 현재 상태 기준으로 동기화
- next_step: 환경 세션이 준비되면 `offline-preview`를 넘어 실제 `read-live` smoke를 다시 확인

## Completed
- `memory-bootstrap` 절차를 다시 실행하고 continuation 작업 상태를 최신화했습니다.
- `app/main/liveReadRuntime.ts`, `app/main/ipc.ts`, `app/renderer/state/uiStore.ts`를 기준으로 shared run contract와 main-owned branch/date scope를 제품 코드에 반영했습니다.
- `app/main/truthCatalogRuntime.ts`를 truth dataset loader 단일 원본으로 확장하고, `app/main/mappingTruthRuntime.ts`의 중복 파일 로딩/캐시를 제거했습니다.
- `app/services/bindingArtifacts.ts`에서 `branch_the_samseong` 하드코드 필터를 제거하고, preopen section도 artifact로 유지되게 조정했습니다.
- `app/contracts/provider.ts`, `app/renderer/types.ts`에 canonical binding 보존용 optional field(`resolvedCanonicalId`)를 추가했습니다.
- `app/services/operatingProgress.ts`를 최신 구현 상태 기준으로 갱신했습니다.
- 관련 회귀 테스트와 smoke script를 최신 구현 기준으로 재실행했습니다.
- `app/main/mappingAutoBindingRuntime.ts`를 추가하고, `app/main/ipc.ts`의 `buildSheetSnapshotBridgeResponse`에서 시트 snapshot + PMS reservation rows를 함께 사용해 auto binding을 생성하도록 연결했습니다.
- room alias는 `snapshot.readHints.roomTypeByRoomNo/localRoomTypeByRoomNo`와 truth alias graph를 기준으로 auto binding하고, reservation identity는 `snapshot.reservationBlocks`와 PMS reservation rows를 기준으로 exact pair만 auto binding, soft pair는 unresolved로 남기도록 구현했습니다.
- 새 회귀 테스트 `tests/regression_app_mapping_auto_binding_runtime.mjs`를 추가했습니다.
- `app/main/operatorExportRuntime.ts`와 `app/contracts/provider.ts`에서 exact auto binding / soft triage / precision gate를 bundle-level manifest, metrics, copy text, csv, preview, operator loop에 노출했습니다.
- `app/main/searchRuntime.ts`에 `binding-summary` 문서를 추가하고, unresolved binding search document에 confidence/domain/severity/rule/evidence signal을 보강했습니다.
- `app/renderer/components/RightPanel.tsx`, `app/renderer/components/surfaces/SettingsSurface.tsx`에서 exact auto binding, soft triage, precision gate/score를 최소 UI 변경으로 surface에 반영했습니다.
- `tests/regression_app_binding_artifacts.mjs`, `tests/regression_app_operator_export_runtime.mjs`, `tests/regression_app_search_runtime.mjs`를 completion 기준으로 갱신했습니다.
- `npm run app:check`, `npm run app:build:main`, `node tests/regression_app_binding_artifacts.mjs`, `node tests/regression_app_mapping_auto_binding_runtime.mjs`, `node tests/regression_app_operator_export_runtime.mjs`, `node tests/regression_app_search_runtime.mjs`, `node --experimental-vm-modules tests/regression_app_ui_store_live_wings_flow.mjs`, `node scripts/live_read_verify.mjs --json`를 통과했습니다.
- `docs/runtime/STAGE_V1_CHECKLIST.md`, `docs/runtime/HANDOFF.md`, `docs/runtime/ACTIVE_MEMORY.md`를 추가했습니다.
- 완료된 stage 설계 문서와 옛 handoff는 `docs/archive/stage-history/`로 이동했습니다.

## Current Findings
- Stage 1의 `sheet/provider/wings`는 이제 하나의 main-owned live bundle과 coverage 요약으로 묶이지만, 실제 live 성공 여부는 환경 설정/브라우저 세션 가용성에 계속 의존합니다.
- Stage 2의 `truthSignals`, `metrics`, `resolvedCanonicalId`는 이제 artifact 경로에 연결됐고, exact room/reservation auto binding이 생성됩니다.
- reservation identity soft match는 자동 채택하지 않고 unresolved로만 남기되, operator export/search/UI에서 잔량과 precision gate를 직접 드러냅니다.
- `preopen` section은 더 이상 숨기지 않고 artifact로 유지되어 운영 상태를 드러냅니다.
- UI store 회귀는 기본 Node 환경에서는 `vm` 모듈 미지원으로 skip 처리되며, `--experimental-vm-modules` 경로에서 실제 동작을 확인했습니다.
- 현재 active 문서는 `docs/runtime/*`이고, 이전 stage memo는 archive로 분리됐습니다.

## Risks
- 현재 환경의 `live_read_verify` 결과는 `offline-preview`이며, 운영 세션이 없는 상태를 명시적으로 보여 줍니다.
- UI store 회귀는 실험적 `vm` 모듈 플래그에 의존하므로, 기본 Node 실행만으로는 full-path 검증이 닫히지 않습니다.
