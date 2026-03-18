# Stage C Implementation Procedure

- updated_at: 2026-03-17T20:05:00+09:00
- stage_id: STAGE_C_MAPPING_CORE_SEARCH_ASSIST_PREP
- status: closed-historical

## Purpose

이 문서는 `Stage C — Mapping Core + Search Assist Prep`를 실제 착수 순서, 산출물, 검증 게이트로 고정했던 실행 절차의 보관본입니다.

현재 기준으로 Stage C minimal 계약과 좁은 Stage 3 Search / Recommendation 계약은 닫혔고, 다음 활성 범위는 Stage 4 Evidence / Export / Operator Loop 입니다. 이 문서는 후속 구현의 최신 순서 문서가 아니라 완료된 Stage C 절차 기록으로 봐야 합니다.

## Source Of Truth

- `docs/architecture/SHEET_MAPPING_SEARCH_GPT_HANDOFF.md`
- `docs/architecture/SHEET_MAPPING_SEARCH_BASELINE.md`
- `docs/architecture/SHEET_MAPPING_SEARCH_EXECUTION_CHECKLIST.md`
- `docs/runtime/PLAN.md`
- `docs/runtime/TASK_STATE.md`
- `NEXT_STAGE_CONTRACT.yaml`
- `NEXT_STAGE_RECOMMENDED_PROPOSAL.md`

## Entry Gate

Stage C는 아래 조건이 유지되는 상태에서만 시작합니다.

- `COEX`, `GANGNAM` live read가 `validationIssueCount=0`
- `COEX`, `GANGNAM` 모두 `rawDerivedMismatchCount=0`
- `physicalOrderVariant`는 실패가 아니라 structural metadata로만 남음
- renderer는 `summary + selectedRunId + visibleSlice`만 유지
- manual anchors는 현재 허용 범위만 유지

## Stage Rules

모든 milestone은 아래 규칙을 유지해야 합니다.

1. `mapping core`보다 넓은 search/runtime 확장을 먼저 하지 않습니다.
2. unresolved는 자동 canonical 값으로 덮지 않습니다.
3. provider row와 typed row의 역할은 artifact와 diagnostics에서 분리합니다.
4. raw rows/raw snapshot은 renderer store에 재도입하지 않습니다.
5. fallback body를 explicit room-map header 없이 `ROOM_MAP`처럼 해석하지 않습니다.
6. manual anchors는 `dateRow`, `roomStartRow`, `inventorySearchStartRow`, `stationInventoryRow`, `naverInventoryRow` 범위를 넘기지 않습니다.
7. search assist는 read-only 또는 suggestion-only로만 동작해야 합니다.

## Milestone Order

### Milestone 1. Mapping Schema Close

목표:

- section-aware mapping artifact 타입을 확정합니다.
- existing run artifact, binding decision, unresolved draft의 관계를 정리합니다.

필수 산출물:

- `SectionRef`
- `AnchorEvidence`
- `ProviderValueSource`
- `StructuralVariant`
- `MappingArtifact`

우선 파일 표면:

- `app/contracts/provider.ts`
- `app/renderer/types.ts`
- `app/services/bindingArtifacts.ts`
- `app/main/runArtifactStore.ts`

종료 조건:

- section 단위 artifact shape가 타입으로 고정됩니다.
- provider row vs typed row 구분이 artifact 필드로 표현됩니다.
- structural variance가 artifact 안에 명시적으로 남습니다.

### Milestone 2. Section Segmentation Runtime

목표:

- 한 탭 내 복수 branch section을 runtime에서 first-class로 분리합니다.

핵심 작업:

- title/header/room signal/inventory row signal을 함께 사용해 section boundary를 잡습니다.
- branch anchor overlay는 section boundary 이후에만 적용합니다.
- boundary 판단 근거를 artifact evidence로 남깁니다.

우선 파일 표면:

- `app/main/sheetRuntime.ts`
- `src/io/sheets.fetch.js`
- `src/scan/blockBuilder.js`
- `src/scan/normalize.js`

종료 조건:

- tab 전체를 단일 branch처럼 다루지 않습니다.
- `COEX`, `GANGNAM` section이 각각 artifact 단위로 남습니다.

### Milestone 3. Binding And Unresolved Pipeline

목표:

- `scan -> proposal -> saved decision merge -> unresolved retain -> persist` 순서를 결정론적으로 고정합니다.

핵심 작업:

- generated proposal을 section 단위로 생성합니다.
- saved operator decision merge를 deterministic replay로 고정합니다.
- unresolved queue를 artifact의 first-class state로 유지합니다.

우선 파일 표면:

- `app/services/bindingArtifacts.ts`
- `app/main/bindingStore.ts`
- `app/main/runArtifactStore.ts`
- `app/main/ipc.ts`

종료 조건:

- unresolved가 조용히 사라지지 않습니다.
- 동일 입력에 대해 동일 binding artifact와 unresolved 집합이 재현됩니다.

### Milestone 4. Minimal Search Assist

목표:

- mapping artifact, unresolved, manual decision replay를 찾기 위한 제한적 검색 표면만 추가합니다.

허용 범위:

- exact match
- normalized keyword match
- prefix / contains
- lightweight fuzzy alias match

금지 범위:

- semantic ranking runtime
- embedding/vector index
- canonical auto-apply
- live sheet raw body 전체 직접 인덱싱

우선 파일 표면:

- `app/services/searchEngine.ts`
- `app/renderer/state/uiStore.ts`
- search IPC 또는 main-owned search surface 관련 파일

종료 조건:

- 검색은 suggestion-only입니다.
- unresolved/manual decisions/mapping artifact를 찾을 수 있지만 binding을 자동 확정하지 않습니다.

### Milestone 5. Live Verification Hardening

목표:

- `/tmp` 기반 임시 검증 경로를 repo-local 계약으로 옮깁니다.

핵심 작업:

- `scripts/live_sheet_verify.mjs`를 추가합니다.
- 출력 shape를 branch별 고정 필드로 통일합니다.
- Codex가 동일 명령으로 Stage C pass/fail을 판정할 수 있게 만듭니다.

필수 출력:

- `validationIssueCount`
- `expectedTypeCounts`
- `detectedTypeCounts`
- `expectedRoomCount`
- `detectedRoomCount`
- `rawDerivedMismatchCount`
- `physicalOrderVariant`

종료 조건:

- live validation이 더 이상 ad-hoc `/tmp` 스크립트에 의존하지 않습니다.

### Milestone 6. Docs And Agent Contract

목표:

- Stage C 범위, 금지사항, 검증 명령을 문서 계약으로 고정합니다.

핵심 작업:

- `AGENTS.md`에 Stage C 범위와 검증 명령을 반영할지 검토합니다.
- `docs/runtime/PLAN.md`, `docs/runtime/TASK_STATE.md`를 milestone 기준으로 갱신합니다.
- 필요 시 이 문서와 `SHEET_MAPPING_SEARCH_EXECUTION_CHECKLIST.md`의 Stage C 표현을 정렬합니다.

종료 조건:

- 후속 에이전트가 문서만 읽고도 동일 순서로 Stage C를 수행할 수 있습니다.

## Validation Contract

Stage C 최종 검증은 아래 명령을 기준으로 합니다.

```bash
node tests/regression_sheet_room_row_fallbacks.mjs
node tests/regression_inventory_rows_and_color_map.mjs
node tests/regression_sheets_fetch_boundaries.mjs
node tests/regression_app_sheet_runtime_summary_builder.mjs
npm run app:check
npm run app:build
node scripts/live_sheet_verify.mjs --spreadsheet 1q7mC5p0DKIFboiiOS_aQHoQLzdtszFb76-ntEvOvMj8 --sheet 2026 --branches COEX,GANGNAM
```

Milestone별 권장 회귀 확인:

- schema/binding 변경 시 `tests/regression_app_binding_artifacts.mjs`
- binding store 변경 시 `tests/regression_app_binding_store.mjs`
- search assist 변경 시 `tests/regression_app_search_process_modules.mjs`

## Pass / Fail

Pass:

- `COEX`, `GANGNAM`의 `validationIssueCount == 0`
- `COEX`, `GANGNAM`의 `rawDerivedMismatchCount == 0`
- section별 mapping artifact 존재
- unresolved가 explicit state로 유지
- search assist가 read-only 또는 suggestion-only

Fail:

- embedding runtime 또는 vector index가 생김
- renderer가 raw rows/raw snapshot을 다시 저장함
- 수동 anchor 범위를 넘어서는 새 좌표 hardcode가 늘어남
- structural variance가 숨겨짐
- live 검증이 다시 `/tmp` ad-hoc 스크립트에 의존함
