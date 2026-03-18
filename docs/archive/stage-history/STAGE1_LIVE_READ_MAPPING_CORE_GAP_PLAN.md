# Stage1 Live Read / Mapping Core Gap Plan

Last updated: 2026-03-18

## 목적

이 문서는 현재 저장소에서 `Stage 1. Live Read 최소 경로`와 `Stage 2. Truth-Aligned Mapping Core`가 어디까지 실제 코드로 닫혔는지, 문서/진행률/구현 사이에 어떤 불일치가 있는지, 다음 구현을 어떤 순서로 잘라야 하는지 정리합니다.

이 문서는 제품 진행 완료 선언이 아니라, 구현 착수 전 조사 결과와 보강 설계 메모입니다.

## 1. 코드 기준 현재 상태

### 1.1 Stage 1 최소 Live Read 실제 경로

현재 앱에서 live read를 시도하는 최소 경로는 아래입니다.

1. `app/renderer/state/uiStore.ts`
   - `refreshInventoryCompare()`가 시트, bridge context, provider rows, reservation rows를 병렬 조회합니다.
2. `app/services/bridgeClient.ts`
   - renderer에서 `provider.fetchSheetSnapshot`, `provider.fetchRows`, `provider.fetchReservations` IPC를 호출합니다.
3. `app/main/ipc.ts`
   - `desktop:fetch-sheet-snapshot`은 `app/main/sheetRuntime.ts`로, provider read는 provider/wings runtime으로 전달합니다.
4. `app/main/sheetRuntime.ts`
   - `src/io/sheets.fetch.js`를 브라우저 유사 VM 환경으로 로드해 시트 snapshot/summary를 만듭니다.
5. `src/io/sheets.fetch.js`
   - sheet anchor, row boundary, provider row/value row, validation issue, section evidence를 계산합니다.
6. `app/services/inventoryCompare.ts`
   - live provider rows가 있으면 실데이터 row를 surface로 변환하고, 없으면 경고 placeholder를 보여 줍니다.
7. `app/services/reservationAudit.ts`
   - live reservation rows가 있으면 Wings row를 surface로 변환하고, 없으면 audit fixture/pending row를 보여 줍니다.

정리하면 Stage 1의 실제 핵심 경로는 이미 `UI -> IPC -> sheet/provider/reservation runtime -> compare/audit surface`까지 연결되어 있습니다. 다만 live 실패 시에도 운영자에게 placeholder row가 남아 Stage 1 완료 조건과 체감 상태가 어긋납니다.

### 1.2 Mapping Core 실제 구현 경로

현재 Mapping Core는 문서가 말하는 full graph 계층이 아니라, `sheet snapshot -> section-aware artifact -> unresolved/manual decision replay` 경로로 구현되어 있습니다.

1. `app/contracts/provider.ts`
   - `SectionRef`, `MappingAnchor`, `MappingTermBinding`, `MappingUnresolvedBinding`, `ProviderValueSource`, `MappingArtifact` 계약이 존재합니다.
2. `app/services/bindingArtifacts.ts`
   - 시트 summary 또는 `scan.sections`에서 section-aware artifact를 만들고 unresolved를 유지합니다.
3. `app/main/bindingStore.ts`
   - operator manual decision을 branch/sheet/section/anchor/rawHeader 기준으로 저장합니다.
4. `app/main/runArtifactStore.ts`
   - run artifact에 `mappingArtifacts`를 저장해 search/export와 재사용합니다.
5. `app/main/searchRuntime.ts`
   - unresolved, validation, structural summary, decision trace, acceptance trace를 검색 corpus에 넣습니다.
6. `app/main/operatorExportRuntime.ts`
   - mapping section별 unresolved/binding 수와 triage coverage를 export 요약에 포함합니다.

즉 현재 Mapping Core는 `section 분리`, `provider value source 진단`, `unresolved queue`, `manual replay`, `search/export 재노출`까지는 와 있습니다. 반면 `channel taxonomy`, `room alias graph`, `reservation identity graph`, `branch-aware join precision`은 아직 artifact/metric 수준으로 닫히지 않았습니다.

## 2. 문서 기준과 코드 기준의 불일치

### 2.1 Stage 순서 문서와 실제 활성 작업이 다릅니다

- 제품/로드맵 문서는 여전히 `Stage 1 -> Stage 2 -> Stage 3 -> Stage 4` 순서를 기준으로 설명합니다.
- 하지만 `docs/runtime/PLAN.md`, `docs/runtime/TASK_STATE.md` 기준 실제 활성 작업은 이미 좁은 Stage 3를 닫고 Stage 4 handoff loop까지 일부 구현한 상태입니다.

의미:

- 현재 로드맵 문서는 "원래의 우선순위"를 설명하는 데는 유효하지만, "지금 바로 무엇을 구현해야 하는가"의 운영 문서로는 뒤처져 있습니다.

### 2.2 운영 진행률 표시는 Stage 3/4 구현 상태를 반영하지 못합니다

- `app/services/operatingProgress.ts`는 `Search 12%`, `Operator Export / Handoff 30%`로 표시합니다.
- 반면 runtime 문서와 실제 코드에는 search runtime, recommendation trace, verify-output indexing, operator export bundle, clipboard/file handoff, history/follow-up queue가 이미 구현되어 있습니다.

의미:

- 현재 진행률 위젯은 사용자에게 "search/runtime이 거의 없다"는 인상을 주지만, 실제 저장소 상태는 "좁은 Stage 3는 닫힘, Stage 4는 일부 진입"에 가깝습니다.

### 2.3 Stage 1 완료 조건과 실제 surface 동작이 다릅니다

문서 기준 Stage 1 완료 조건:

- Wings JSON 응답 확인
- sheet/OTA/Wings 공통 run context
- inventory compare / reservation audit가 live rows로 채워짐

코드 기준 현재 상태:

- 시트 runtime은 실제 summary/section/validation artifact를 생성합니다.
- inventory compare는 live rows가 없으면 `live read contract is not connected yet` placeholder를 남깁니다.
- reservation audit도 live reservation rows가 없으면 `bridge pending` fixture row를 남깁니다.

의미:

- Stage 1은 "호출 경로 연결"과 "운영 표면 live closure"가 아직 분리된 상태입니다.
- 따라서 현재 Stage 1의 가장 부족한 부분은 bridge/provider API 자체보다, `실패를 명시하는 운영 상태 모델`과 `공통 run 단위 closure`입니다.

### 2.4 Stage 2 완료 조건과 실제 Mapping Core 범위가 다릅니다

문서 기준 Stage 2 완료 조건:

- canonical taxonomy 고정
- alias graph / identity graph 실제 샘플 반영
- unresolved queue / confidence 계산
- branch-aware mismatch 감소

코드 기준 현재 상태:

- unresolved queue와 manual confidence는 있습니다.
- 그러나 `SheetTerm`은 4개 고정 항목 중심입니다.
- unresolved 후보도 `candidateTerms` 기반의 bounded triage 수준입니다.
- room alias graph / reservation identity graph / taxonomy artifact는 runtime artifact로 연결되지 않았습니다.

의미:

- 현재 Mapping Core는 "sheet anchor/binding core"이지, 문서가 약속한 "truth-aligned identity core"는 아닙니다.

## 3. 핵심 부족분

### 3.1 Live Read 최소 경로 부족분

1. 공통 run closure 부족
   - sheet/provider/reservation read가 같은 화면 갱신 안에서 호출되지만, 성공/실패/부분성공을 묶는 main-owned `live read run` 계약이 없습니다.
2. live 실패 surface가 placeholder row에 섞임
   - inventory/audit 화면이 실제 live row와 placeholder row를 같은 list surface에 섞어 보여 줍니다.
3. Stage 1 acceptance metric 부재
   - branch/provider별로 `rows > 0`, `audit rows > 0`, `same runId`, `same date range`, `same branch`를 확인하는 acceptance gate가 없습니다.
4. repo-local verify와 UI live status 분리
   - `scripts/live_sheet_verify.mjs`는 시트만 검증합니다. provider rows / reservation rows live closure는 같은 verify 묶음으로 잡히지 않습니다.

### 3.2 Mapping Core 부족분

1. taxonomy artifact 부재
   - provider/channel canonicalization은 일부 규칙과 타입에 흩어져 있고, versioned artifact가 없습니다.
2. room alias graph 부재
   - 현재는 section/room map/typed row 진단은 있으나, branch-aware alias 후보 그래프가 없습니다.
3. reservation identity graph 부재
   - reservation audit는 live row를 surface로 바꾸지만, identity collision/report artifact가 없습니다.
4. confidence 정의 부족
   - 저장되는 confidence는 주로 manual decision에 한정됩니다. auto-join, alias 후보, identity evidence confidence는 없습니다.
5. disabled/preopen section 처리 일관성 부족
   - `BRANCH_THE_SAMSEONG`은 scan에는 남고 operational mappingArtifacts에서는 빠집니다. 이 정책은 artifact reason으로 명시되지 않아 later-stage metric에 구멍이 생깁니다.

## 4. 보강 구현 방안

### Track A. Stage 1 Live Read Close

#### A1. `LiveReadRun` 계약 추가

main-owned run aggregate를 추가합니다.

필수 필드:

- `runId`
- `branch`
- `startDate`, `endDate`
- `sheet.status`, `provider.status`, `reservation.status`
- `sheet.source`, `provider.sources[]`, `reservation.source`
- `rowCounts`
- `failureReasons[]`
- `coverage`

효과:

- Stage 1을 "호출했는가"가 아니라 "같은 run에서 세 소스가 얼마나 닫혔는가"로 측정할 수 있습니다.

#### A2. live placeholder row 제거 또는 분리

- `inventoryCompare.ts`, `reservationAudit.ts`의 live placeholder row를 결과 row 배열에서 제거합니다.
- 대신 `supportLevel`, `sourceLabel`, `validationLines`, `opsLines`에 explicit failure/pending 상태를 남깁니다.

효과:

- 운영자는 "실데이터 1건"과 "미연결 경고 1건"을 같은 의미로 읽지 않게 됩니다.

#### A3. branch/provider matrix verify 추가

새 verify 묶음은 아래를 최소 포함해야 합니다.

- `GANGNAM`, `COEX` 각각에서
  - sheet summary 존재
  - provider live rows 1건 이상
  - reservation rows 1건 이상 또는 명시적 unsupported 분류
  - 세 surface가 같은 `runId/branch/date range`를 공유

효과:

- Stage 1 완료 조건을 문서 문장 대신 repo-local command로 닫을 수 있습니다.

### Track B. Mapping Core Truth Hardening

#### B1. Mapping 계약을 2층으로 분리

현재 `MappingArtifact`는 유지하되 아래를 별도 artifact로 올립니다.

- `ChannelTaxonomyArtifact`
- `RoomAliasGraphArtifact`
- `ReservationIdentityGraphArtifact`
- `MappingGapReport`

효과:

- 지금의 sheet-anchor artifact와, 문서가 요구하는 truth-aligned identity artifact를 분리해 진도를 읽을 수 있습니다.

#### B2. unresolved reason 체계를 확장

현재의 reason에 아래를 추가합니다.

- `taxonomy-missing`
- `alias-ambiguous`
- `identity-collision`
- `section-disabled`
- `section-preopen`

효과:

- "왜 unresolved인지"가 provider row 부족인지, alias 충돌인지, 정책적 제외인지 분리됩니다.

#### B3. confidence를 계산 가능한 신호로 확장

confidence 입력 신호 예시:

- branch exact match
- section match
- room map exact hit
- typed row consistency
- provider value coverage
- reservation identity field completeness
- saved manual override 존재

효과:

- Stage 2 완료 기준의 `branch-aware mismatch 감소`를 수치로 추적할 수 있습니다.

#### B4. disabled/preopen section을 first-class 상태로 유지

- scan에는 보이지만 operational mapping에서 제외되는 section은 artifact에서 제거하지 말고 `state=disabled-operational` 또는 별도 exclusion reason으로 유지합니다.

효과:

- 선릉/삼성 같은 onboarding 상태가 metrics, search, export에서 조용히 사라지지 않습니다.

## 5. 권장 구현 순서

1. `Track A1-A2`
   - 공통 `LiveReadRun` 계약 도입
   - live placeholder row 제거/분리
2. `Track A3`
   - branch/provider matrix verify 추가
3. `Track B2-B4`
   - unresolved reason, exclusion reason, confidence signal 확장
4. `Track B1`
   - taxonomy/alias/identity artifact를 별도 generated asset로 승격
5. 그 다음에만 Stage 3 recommendation 후보를 alias graph 기반으로 고도화

## 6. 바로 착수할 최소 패치 경계

가장 작은 첫 구현 단위는 아래가 적절합니다.

### Slice 1

- `app/renderer/state/uiStore.ts`
- `app/services/inventoryCompare.ts`
- `app/services/reservationAudit.ts`
- `app/contracts/provider.ts`
- 관련 regression

목표:

- 같은 query에서 sheet/provider/reservation 결과를 `LiveReadRun`으로 묶고, live placeholder row를 운영 상태 메시지로 치환합니다.

### Slice 2

- `app/contracts/provider.ts`
- `app/services/bindingArtifacts.ts`
- `app/main/runArtifactStore.ts`
- `app/main/searchRuntime.ts`
- 관련 regression

목표:

- unresolved reason과 exclusion reason을 확장하고, disabled/preopen section을 artifact/search/export에서 잃지 않게 합니다.

## 7. 이 문서가 덮지 않는 것

- broad search runtime 재설계
- embedding/vector index 재도입
- apply/write path 결정
- operator workflow 전체 완결 선언

이 문서는 Stage 1 closure와 Stage 2 진짜 부족분을 다시 분리해, 다음 구현이 Stage 3/4와 섞여 흐려지지 않게 만드는 데 목적이 있습니다.
