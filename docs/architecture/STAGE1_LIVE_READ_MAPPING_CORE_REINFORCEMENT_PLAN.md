# Stage1 Live Read + Mapping Core Reinforcement Plan

Last updated: 2026-03-18

## Goal

`Stage 1. Live Read 최소 경로`와 `Stage 2. Truth-Aligned Mapping Core`를 코드 기준으로 다시 정의하고, 실제 부족분을 가장 작은 구현 경계로 보강하는 순서를 고정합니다.

이 문서는 새 기능 제안이 아니라 현재 저장소의 실제 구현 경로와 미완 지점을 기준으로 작성합니다.

## Current Diagnosis

현재 저장소는 Stage 1/2가 비어 있는 상태는 아닙니다.

- Stage 1은 `sheet + OTA provider rows + Wings reservations`를 앱에서 읽는 경로가 이미 있습니다.
- Stage 2는 `mappingArtifacts + unresolved + saved decision replay + recommendation trace`까지 이어지는 뼈대가 이미 있습니다.

문제는 다음 두 가지입니다.

1. Stage 1은 실제 read 체인이 분산되어 있고, 하나의 main-owned run contract로 닫혀 있지 않습니다.
2. Stage 2는 artifact/store/search 연결은 있으나 canonical truth, 자동 confidence, section별 품질 게이트가 얕습니다.

## Stage 1 Actual Minimal Path

현재 Stage 1의 실제 최소 경로는 아래 두 갈래입니다.

### 1. App runtime path

1. `app/renderer/state/uiStore.ts`
   - `refreshInventoryCompare`
2. `app/services/bridgeClient.ts`
   - `fetchSheetSnapshot`
   - `fetchProviderRows`
   - `fetchProviderReservations`
3. `app/main/ipc.ts`
   - `desktop:fetch-sheet-snapshot`
   - `desktop:fetch-provider-rows`
   - `desktop:fetch-provider-reservations`
4. main runtimes
   - `app/main/sheetRuntime.ts::fetchSheetSnapshot`
   - `app/main/providerRuntime.ts::fetchProviderRowsLive`
   - `app/main/wingsRuntime.ts::fetchWingsReservations`
5. runtime backends
   - `src/io/sheets.fetch.js`
   - `src/io/pms.fetch.js`

### 2. Verify path

1. `scripts/live_sheet_verify.mjs`
2. `app/main/sheetRuntime.ts::fetchSheetSnapshot`
3. `app/services/sheetVerifySummary.ts::formatSheetVerifySummary`

### What This Means

- 앱은 실제로 live read를 시도합니다.
- 하지만 Stage 1 문서가 요구하는 `same run context`는 renderer가 같은 `selectedBranch/startDate/endDate`를 각 IPC 호출에 반복 전달하는 수준입니다.
- main-owned live bundle, source classification, cross-source coverage 판정이 하나로 묶여 있지 않습니다.
- verify 경로도 현재는 sheet-only입니다.

## Stage 1 Missing Pieces

### A. Shared live-read contract 부재

현재는 renderer가 개별 fetch를 병렬 호출합니다.

- run id
- source coverage
- branch/date query echo
- partial-live 분류
- per-source failure classification

같은 정보가 한 객체에 묶여 있지 않습니다.

### B. Sheet path가 browser-session-first 계약과 직접 일치하지 않음

`app/main/sheetRuntime.ts`는 `UHS_SYNC_CONFIG_JSON`이 없으면 즉시 `sheet-unconfigured`로 종료합니다.

즉,

- OTA/Wings: bridge/auth bundle 기반 live read 존재
- Sheet: env sync config 의존

상태입니다. 문서상 `브라우저 세션 우선 경로`와는 아직 간극이 있습니다.

### C. Stage 1 smoke verify 부재

현재 `scripts/live_sheet_verify.mjs`는 Stage 1 전체가 아니라 sheet snapshot만 검증합니다.

부족한 것은 다음입니다.

- NAVER live rows
- STATION live rows
- Wings reservations
- sheet summary
- unified classification

를 한 번에 보는 smoke verify입니다.

### D. Placeholder/partial-live 표현 혼재

`app/services/inventoryCompare.ts`에는 여전히 `"live read contract is not connected yet"` 성격의 placeholder가 남아 있습니다.

실제 경로가 존재하는 현재 상태에서는 아래를 분리해야 합니다.

- bridge unavailable
- provider read empty
- sheet unconfigured
- partial-live
- read-live

## Stage 2 Actual Mapping Core

현재 Mapping Core의 실제 경로는 아래와 같습니다.

1. sheet summary/snapshot 생성
   - `app/main/sheetRuntime.ts`
   - `src/io/sheets.fetch.js`
2. mapping artifact 생성
   - `app/services/bindingArtifacts.ts`
   - `buildGeneratedBindingDraft`
   - `buildGeneratedBindingDraftFromSnapshot`
3. manual decision merge
   - `app/main/bindingStore.ts`
   - `app/services/bindingArtifacts.ts::mergeBindingDraftWithSavedDecisions`
4. trace/search/export 연결
   - `app/main/recommendationStore.ts`
   - `app/main/searchRuntime.ts`
   - `app/main/operatorExportRuntime.ts`
   - `app/main/runArtifactStore.ts`

현재 생성되는 핵심 구조는 아래입니다.

- `section`
- `anchors`
- `bindings`
- `unresolved`
- `providerValueSource`
- `structuralSummary`
- `validationSummary`

즉, Stage 2는 이미 "empty"가 아니라 `artifact-first mapping core`입니다.

## Stage 2 Missing Pieces

### A. Term/model scope가 너무 좁음

`app/services/bindingArtifacts.ts`의 `STAGE_B_SHEET_TERMS`는 현재 4개뿐입니다.

- `inventory.room-map`
- `inventory.provider-value-row`
- `inventory.room-type-range`
- `sheet.scan-config`

이 구조만으로는 문서가 말하는

- channel taxonomy
- room alias graph
- reservation identity graph
- branch-aware mismatch 감소

를 직접 표현하기 어렵습니다.

### B. 자동 confidence와 evidence scoring이 부족함

현재 binding confidence는 사실상 아래 둘 중 하나입니다.

- manual anchor: `1`
- saved manual decision: 저장값 재사용

자동 추론의 confidence, 근거 점수, branch별 후보 비교가 mapping artifact에 충분히 들어가지 않습니다.

### C. Truth dataset가 app mapping path에 연결되지 않음

`truth_dataset/` 아래에 아래 자산은 존재합니다.

- `room_alias_graph_v1.json`
- `reservation_identity_graph_v1.json`
- `provider_channel_taxonomy_v1.json`
- `branch_provider_mapping_v1.json`
- gap report / validator

하지만 앱의 Mapping Core는 현재 이 artifact들을 직접 읽어 binding/unresolved/confidence를 계산하지 않습니다.

즉, truth asset은 존재하지만 runtime mapping core의 입력 계약으로 아직 승격되지 않았습니다.

### D. Section별 품질 게이트가 얕음

현재 section별로 남는 것은 주로 다음입니다.

- unresolved count
- validation issue code
- provider value source
- physical order variance

하지만 실제 운영에서 필요한 아래 항목은 부족합니다.

- section별 join precision/coverage
- alias candidate ranking
- unresolved severity tier
- branch-aware mismatch trend
- section별 acceptance gate

### E. Primary section 중심 요약 편향

`buildGeneratedBindingDraftFromSnapshot`는 primary section에만 `unresolved`, `providerValueSource`, `validationSummary`를 강하게 싣고, 비주요 section은 빈 구조로 남기는 경향이 있습니다.

이 방식은 multi-section sheet를 읽을 수는 있지만, Stage 2가 목표로 하는 branch-aware mapping 완성도에는 부족합니다.

## Document / Runtime Drift

현재 문서와 코드 상태는 아래처럼 어긋나 있습니다.

### Code says

- Stage 3/4 계열 구현은 많이 진행됨
- Stage 1/2도 최소 뼈대는 이미 존재함

### Progress surface says

`app/services/operatingProgress.ts`

- Stage 1: 35%
- Stage 2: 25%
- Stage 3: 40%
- Stage 4: 12%
- Stage 5: 30%

이 수치는 현재 코드의 실구현 양상과 직접 맞지 않습니다.

문제는 퍼센트 그 자체보다, 운영자가 다음 판단을 할 때

- "없음"
- "뼈대 있음"
- "운영용 smoke 미완"
- "quality gate 미완"

을 구분하지 못한다는 점입니다.

## Reinforcement Strategy

보강은 큰 재설계보다 아래 순서로 진행하는 편이 맞습니다.

### Track A. Stage 1 contract closure

가장 작은 패치 경계:

- 새 main module: `app/main/liveReadRuntime.ts`
- 새 IPC: `desktop:fetch-live-read-bundle`

이 번들이 최소한 아래를 함께 반환해야 합니다.

- query echo: `branch/startDate/endDate`
- run timestamp 또는 live bundle id
- sheet result
- NAVER result
- STATION result
- Wings result
- per-source `source/status/error`
- overall classification: `offline-preview | partial-live | read-live | blocked`

renderer는 `refreshInventoryCompare`에서 개별 3회 호출 대신 이 번들을 사용합니다.

### Track B. Stage 1 smoke verify closure

옵션은 둘 중 하나입니다.

1. `scripts/live_sheet_verify.mjs`를 확장
2. `scripts/live_read_verify.mjs`를 별도 추가

추천은 2번입니다.

이유:

- sheet verify는 현재 역할이 명확합니다.
- Stage 1 smoke는 sheet-only verify와 목적이 다릅니다.

새 smoke는 아래를 출력해야 합니다.

- query/branch
- sheet classification
- provider row coverage
- wings reservation coverage
- overall live-read classification
- blockers

### Track C. Mapping Core input strengthening

Stage 2는 새 UI보다 입력 계약을 먼저 강화해야 합니다.

우선순위:

1. `truth_dataset` artifact를 읽는 main/service layer 추가
2. room alias / provider taxonomy / branch mapping을 binding draft 입력으로 승격
3. unresolved candidate ranking 규칙 추가
4. section별 confidence / severity 계산 추가

추천 파일 경계:

- `app/services/mappingCatalog.ts`
- `app/services/bindingArtifacts.ts`
- 필요 시 `app/contracts/provider.ts`

### Track D. Mapping quality gate 강화

Mapping Artifact에 아래 필드를 추가하는 것이 좋습니다.

- `coverageSummary`
- `qualityGate`
- `candidateRankings`
- `severity`

최소 계약 예시는 다음 수준이면 충분합니다.

- unresolved item마다 `severity`
- candidate마다 `score`, `basis`
- section마다 `coverage`
- artifact마다 `readyForCompare`

### Track E. Progress surface 정렬

`app/services/operatingProgress.ts`의 퍼센트는 바로 올리는 것이 목적이 아닙니다.

먼저 아래 상태 모델로 바꾸는 편이 좋습니다.

- `not-started`
- `skeleton-present`
- `runtime-present`
- `smoke-verified`
- `quality-gated`

그 다음 퍼센트를 붙이는 편이 해석이 덜 흔들립니다.

## Recommended Implementation Order

### Milestone 1. Live bundle contract

- `app/main/liveReadRuntime.ts`
- `desktop:fetch-live-read-bundle`
- renderer 1회 호출 전환

완료 조건:

- Stage 1 read 경로가 main-owned bundle 하나로 수렴
- branch/date/source classification이 한 payload에 존재

### Milestone 2. Stage 1 smoke verify

- `scripts/live_read_verify.mjs`
- 관련 regression 추가

완료 조건:

- sheet/NAVER/STATION/Wings를 함께 보는 smoke 가능
- `sheet-unconfigured`, `partial-live`, `read-live`가 일관되게 분류됨

### Milestone 3. Truth-backed mapping catalog

- truth dataset loader 추가
- `bindingArtifacts` 입력 강화

완료 조건:

- term 후보가 4개 고정이 아님
- alias/taxonomy/branch mapping이 unresolved 후보 계산에 반영됨

### Milestone 4. Mapping quality gate

- section별 coverage/severity/confidence 추가
- operator/export/search가 이 메타를 재사용

완료 조건:

- unresolved triage 우선순위가 계산됨
- compare/audit가 section quality를 근거로 읽힘

## Verification Plan

### Stage 1

- 기존:
  - `tests/regression_app_sheet_runtime_summary.mjs`
  - `tests/regression_app_ui_store_live_wings_flow.mjs`
  - `tests/regression_app_inventory_compare_live_bridge.mjs`
- 추가 필요:
  - live bundle regression
  - Stage 1 smoke verify regression
  - partial-live classification regression

### Stage 2

- 기존:
  - `tests/regression_app_binding_artifacts.mjs`
  - `tests/regression_app_binding_store.mjs`
  - `tests/regression_truth_dataset_validator_py.py`
  - `tests/regression_provider_room_mapping_guardrail.mjs`
- 추가 필요:
  - truth catalog -> binding draft 연결 regression
  - section quality gate regression
  - candidate ranking / severity regression

## Immediate Recommendation

지금 바로 구현에 들어간다면 우선순위는 아래가 맞습니다.

1. `liveReadRuntime`로 Stage 1 공통 run contract를 먼저 닫습니다.
2. Stage 1 smoke verify를 별도 스크립트로 추가합니다.
3. 그 다음 `truth_dataset`를 Mapping Core 입력으로 승격합니다.
4. 마지막으로 section quality gate를 추가합니다.

이 순서가 맞는 이유는 다음과 같습니다.

- Stage 1이 닫히지 않으면 Mapping Core 품질을 live 기준으로 측정하기 어렵습니다.
- truth asset을 runtime에 연결하기 전까지 Mapping Core는 계속 manual/artifact 중심에 머뭅니다.
- UI 확장보다 contract와 verify를 먼저 닫는 편이 현재 저장소 방향과도 일치합니다.
