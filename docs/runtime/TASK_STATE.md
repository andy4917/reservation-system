# TASK STATE

- updated_at: 2026-03-17T14:57:31+09:00
- status: verified
- goal: Stage C minimal bounded search assist / repo-local live verification close-out
- current_milestone: main-owned bounded search index와 `live_sheet_verify.mjs` 추가 완료
- next_step: Stage 3/4 경계에서 recommendation/evidence 확장 범위를 다시 고정합니다.

## Completed
- `memory-bootstrap` 절차를 실행해 continuation 작업 컨텍스트를 다시 정리했습니다.
- `src/io/sheets.fetch.js`의 section detection을 `branch title -> nearby TYPE/ROOM header -> room/inventory scan` 흐름으로 재구성했습니다.
- `TYPE/ROOM` 헤더 자체가 독립 section으로 승격되지 않도록 branch marker 탐지를 known branch 라벨로 제한하고, header가 없는 후보를 제거했습니다.
- `SectionRef`에 `state: active | preopen`를 추가하고 `app/services/bindingArtifacts.ts`, `app/main/runArtifactStore.ts`에 반영했습니다.
- `삼성`은 `BRANCH_THE_SAMSEONG`으로 별도 유지되며, live 시트 기준 `headerRow`는 있으나 `roomStartRow`가 없어 `preopen`으로 분류됩니다.
- `선릉`은 live 시트 기준 `titleRow/headerRow/roomStartRow/inventoryStartRow`가 모두 검출되어 `active`로 분류됩니다.
- `tests/regression_sheets_fetch_boundaries.mjs`, `tests/regression_app_binding_artifacts.mjs`, `tests/regression_app_run_artifact_store.mjs`, `tests/regression_sync_config_defaults.mjs`, `tests/regression_sheet_scan_py.py`로 회귀를 보강했습니다.
- `app/services/bindingArtifacts.ts`에서 saved decision replay를 stable sort로 고정하고, section-scoped unresolved anchor가 legacy decision anchor와도 호환되도록 merge 조건을 확장했습니다.
- `app/main/bindingStore.ts`, `app/contracts/provider.ts`, `app/renderer/state/uiStore.ts`에 `sectionKey`를 추가해 saved decision persist/load 경로도 section-aware로 고정했습니다.
- 삼성점은 live `scan.sections`에는 남기되, operational `mappingArtifacts`에서는 제외해 현재 운영 경로에서 사실상 비활성화했습니다.
- `app/main/searchRuntime.ts`를 추가해 run별 bounded `SearchDocument` 인덱스를 main에 적재하고, renderer는 IPC로 query/hit만 소비하도록 연결했습니다.
- 검색 corpus에는 inventory row, audit row, unresolved binding, artifact line, evidence/ops/validation/log line을 함께 포함했습니다.
- `scripts/live_sheet_verify.mjs`와 `npm run app:verify:sheet-live`를 추가해 저장소 내부에서 시트 런타임을 직접 재검증할 수 있게 했습니다.
- `tests/regression_app_search_runtime.mjs`를 추가하고, 기존 search/process regression을 main-owned bounded search 흐름에 맞게 갱신했습니다.

## Verification
- 통과: `npm run app:check`
- 통과: `npm run app:build:main`
- 통과: `node tests/regression_sheets_fetch_boundaries.mjs`
- 통과: `node tests/regression_app_binding_artifacts.mjs`
- 통과: `node tests/regression_app_binding_store.mjs`
- 통과: `node tests/regression_app_run_artifact_store.mjs`
- 통과: `node tests/regression_sheet_room_row_fallbacks.mjs`
- 통과: `node tests/regression_inventory_rows_and_color_map.mjs`
- 통과: `node tests/regression_app_sheet_runtime_summary_builder.mjs`
- 통과: `node tests/regression_sync_config_defaults.mjs`
- 통과: `python3 tests/regression_sheet_scan_py.py`
- 통과: `npm run app:build`
- 통과: live `COEX/GANGNAM` snapshot 재검증
  - `sectionCount=4`
  - `GANGNAM/COEX/BRANCH_THE_SEOLLEUNG = active`
  - `BRANCH_THE_SAMSEONG = preopen`
  - `scan.sections`에는 삼성점이 남고 `mappingArtifacts`에서는 제외됨
- 통과: `npm run app:check`
- 통과: `npm run app:build:main`
- 통과: `node tests/regression_app_search_runtime.mjs`
- 통과: `node tests/regression_app_search_process_modules.mjs`
- 통과: `node tests/regression_app_sheet_runtime_summary.mjs`
- 통과: `node scripts/live_sheet_verify.mjs --start-date 2026-03-12 --end-date 2026-03-12 --branch GANGNAM`
  - 현재 기본 결과는 `sheet-unconfigured`이며, 저장소 내부 verify command가 시트 런타임 경로와 failure classification을 그대로 노출함

## Risks
- 삼성점은 아직 room row가 비어 있어 `inventoryStartRow`만 있고 `roomStartRow`는 `null`입니다. 실제 객실 운영이 시작되면 anchor를 다시 검증해야 합니다.
- 현재 저장소 schema는 decision key에 별도 `sectionKey` 필드를 두지 않고 anchorId scope 호환으로 처리합니다. 나중에 section별 decision 조회가 필요해지면 schema version 상승이 필요할 수 있습니다.
- 현재 operator UI와 baseline 문서는 아직 `GANGNAM/COEX` 중심이므로, 선릉/삼성을 운영 UI에 올리려면 별도 onboarding 단계가 필요합니다.
- AGENTS 원본 경로는 사용자 지시문을 기준으로 따랐고, 저장소 로컬 `AGENTS.md`에는 별도 수정이 없었습니다.
- `SHEET_MAPPING_SEARCH_EXECUTION_CHECKLIST.md`의 기존 Stage C 표현은 넓은 search runtime 재구성으로 읽힐 수 있으므로, 실제 구현 시에는 계속 `IMPLEMENT.md`를 우선 적용해야 합니다.
- 이번 bounded search는 main-owned minimal assist 범위입니다. full workerization, broader lexical/structured ranking, jump UI 고도화는 아직 후속 범위입니다.

### Checkpoint 2026-03-17T04:34:30Z
- status: verified
- completed: Milestone 2 section segmentation active/preopen separation + live COEX/GANGNAM verification
- next_step: Milestone 3 proposal/decision merge를 section artifact 기준으로 고정
- risks: none

### Checkpoint 2026-03-17T04:44:58Z
- status: verified
- completed: Milestone 3 stable decision replay + Samsung mappingArtifacts disable
- next_step: Milestone 3 persist/replay 경로를 추가 검증하고 section artifact 기준으로 고정
- risks: none

### Checkpoint 2026-03-17T04:52:30Z
- status: verified
- completed: Milestone 3 section-aware persist/replay complete; contract compliance rechecked
- next_step: Milestone 4 bounded search assist와 repo-local live verification command 구현
- risks: none

### Checkpoint 2026-03-17T05:57:31Z
- status: verified
- completed: main-owned bounded search assist + repo-local live verification command 구현 및 회귀 검증
- next_step: Stage 3/4 경계의 recommendation/evidence 확장 범위를 다시 고정
- risks: live verify는 `UHS_SYNC_CONFIG_JSON`이 없으면 `sheet-unconfigured`로 끝나므로, 실제 라이브 검증에는 로컬 비공개 sync config가 계속 필요
