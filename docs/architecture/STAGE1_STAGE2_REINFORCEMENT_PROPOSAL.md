# Stage 1 / Stage 2 Reinforcement Proposal

Last updated: 2026-03-18

이 문서는 현재 코드 기준으로 `Stage 1. Live Read 최소 경로`와 `Stage 2. Truth-Aligned Mapping Core`의 실제 구현 상태를 다시 읽고, 부족한 부분을 가장 작은 구현 단위로 보강하기 위한 설계 메모입니다.

기준 문서:

- [`APP_PRODUCT_OPERATING_MODEL.md`](./APP_PRODUCT_OPERATING_MODEL.md)
- [`APP_IMPLEMENTATION_ROADMAP.md`](./APP_IMPLEMENTATION_ROADMAP.md)

## 1. 문서상 목표와 실제 구현 차이

### Stage 1 문서상 목표

- `sheet/OTA/Wings`를 같은 run context에서 읽는다.
- 앱에서 실제 live inventory / audit rows가 보인다.
- HAR fallback 없이 브라우저 세션 기준 조회가 성공한다.

### Stage 1 실제 구현

- sheet live read는 `desktop:fetch-sheet-snapshot -> app/main/ipc.ts -> app/main/sheetRuntime.ts -> src/io/sheets.fetch.js` 경로로 동작합니다.
- provider live rows는 `desktop:fetch-provider-rows -> app/main/providerRuntime.ts -> src/io/pms.fetch.js` 경로로 동작합니다.
- renderer는 `app/renderer/state/uiStore.ts`에서 sheet/provider/wings fetch를 병렬 호출하지만, 공통 `runId`는 renderer 상태(`activeRunContext`)에만 있고 main 요청 계약에는 내려가지 않습니다.
- provider rows는 main에서 branch-scoped fetch되지 않고 renderer에서 후필터링됩니다.

결론:

- Stage 1은 `개별 live read entry`는 있으나, 문서가 요구하는 `same run context`, `main-owned branch scope`, `coverage closure`는 아직 닫히지 않았습니다.

### Stage 2 문서상 목표

- canonical taxonomy 고정
- alias graph / identity graph 실제 샘플 반영
- unresolved queue와 confidence 계산
- branch-aware mismatch 감소

### Stage 2 실제 구현

- `MappingArtifact`, `SectionRef`, `MappingAnchor`, `ProviderValueSource`, `StructuralVariant` 계약은 존재합니다.
- `buildGeneratedBindingDraftFromSnapshot`는 section별 artifact를 만들고, missing room-map / scan-config / provider-value-row 류를 unresolved로 올립니다.
- `bindingStore`는 manual binding decision을 저장하고 replay합니다.
- room alias / reservation identity 관련 로직은 `src/io/pms.fetch.js`, `src/reconcile/sheet_reconcile.py`에 존재합니다.
- 하지만 이 alias / identity 로직이 `MappingArtifact` 생성 경로에 직접 연결되어 있지 않습니다.
- 현재 `TermBinding`은 사실상 manual replay 중심이며 auto binding/confidence/precision 측정이 없습니다.

결론:

- Stage 2는 `mapping shell + unresolved surface`까지는 왔지만, 문서가 말한 `truth-aligned canonical mapping core`까지는 아직 아닙니다.

## 2. 실제 최소 경로

### Stage 1 최소 Live Read 경로

1. `app/renderer/state/uiStore.ts`
   - `refreshInventoryCompare`
   - sheet / provider / reservation fetch를 병렬 실행
2. `app/services/bridgeClient.ts`
   - desktop bridge 요청 래핑
3. `app/main/ipc.ts`
   - `desktop:fetch-sheet-snapshot`
   - `desktop:fetch-provider-rows`
4. `app/main/sheetRuntime.ts`
   - `fetchSheetSnapshot`
   - branch별 manual scan anchor 적용
5. `src/io/sheets.fetch.js`
   - `fetchSheetSnapshot`
   - `buildSheetReadPlan`
   - `assembleSnapshotFromSheetRead`
6. `app/main/providerRuntime.ts`
   - `fetchProviderRowsLive`
7. `src/io/pms.fetch.js`
   - `fetchProviderRows`

### Stage 2 최소 Mapping Core 경로

1. `app/main/ipc.ts`
   - sheet snapshot 이후 `buildGeneratedBindingDraftFromSnapshot` 호출
2. `app/services/bindingArtifacts.ts`
   - `buildGeneratedBindingDraftFromSummary`
   - `buildGeneratedBindingDraftFromSnapshot`
   - `mergeBindingDraftWithSavedDecisions`
3. `app/main/bindingStore.ts`
   - manual decision persist / load
4. `app/main/runArtifactStore.ts`
   - mapping artifact를 run artifact에 적재
5. `app/services/inventoryCompare.ts`
   - 아직 canonical mapping을 소비하지 않고 raw/live row 위주 snapshot 생성

## 3. 부족한 부분

### Stage 1 부족분

1. 공통 run context가 main-owned contract가 아닙니다.
- 실제 `runId`는 sheet artifact 저장 후에야 생기고, provider/wings 요청과 묶이지 않습니다.

2. branch scope가 요청 계약에 없습니다.
- `FetchProviderRowsRequest`에는 `branch`가 없고 renderer가 결과를 후필터링합니다.

3. live coverage 요약이 없습니다.
- 현재는 sheet/provider/wings 각각 성공/실패를 흩어진 상태로만 가지고 있고, Stage 1 완료 기준을 판정할 manifest가 없습니다.

4. compare/audit가 branch/run-scoped manifest 위에서 닫히지 않습니다.
- provider live rows가 들어오더라도 "이번 run에서 어떤 source가 실제로 채워졌는지"를 main-owned 요약으로 남기지 않습니다.

### Stage 2 부족분

1. canonical domain이 너무 좁습니다.
- 현재 term은 `room-map`, `provider-value-row`, `room-type-range`, `scan-config` 4개뿐입니다.

2. auto binding과 confidence 계층이 없습니다.
- unresolved는 있지만 왜 이 term이 더 유력한지, confidence가 왜 이 값인지가 제품 계약으로 남지 않습니다.

3. room alias / reservation identity 로직이 mapping artifact와 분리돼 있습니다.
- 이미 존재하는 deterministic alias 로직이 compare/audit 쪽에서 일부 쓰여도 mapping core 자체는 이를 canonical binding으로 저장하지 않습니다.

4. branch-aware precision metric이 없습니다.
- 문서상 완료 조건은 `branch-aware mismatch 감소`인데, 현재 artifact에는 precision/coverage metric이 없습니다.

5. section 운영 상태가 onboarding 정책과 섞여 있습니다.
- `branch_the_samseong` 비활성화는 artifact builder 하드코드 예외입니다.

## 4. 보강 설계

### Phase 1. Live Read Manifest

추가 계약:

- `LiveReadRunContext`
  - `runId`
  - `branch`
  - `startDate`
  - `endDate`
  - `requestedAt`
  - `sources: { sheet, naver, station, wings }`
- `LiveReadCoverage`
  - source별 `status`
  - `rowsLoaded`
  - `branchScoped`
  - `usedFallback`
  - `errorCategory`

핵심 변경:

- renderer가 만든 run context를 main IPC 요청에 함께 보냅니다.
- `FetchProviderRowsRequest`, `FetchReservationsRequest`에 `branch`, `runId`를 추가합니다.
- main이 branch-scoped filtering과 coverage 요약을 소유합니다.

완료 기준:

- sheet/provider/wings 결과가 하나의 manifest에 묶입니다.
- renderer 후필터링 없이 main 응답 자체가 branch-scoped입니다.

### Phase 2. Mapping Domain 확장

추가 계약:

- `MappingDomain = sheet-structure | channel | room | reservation`
- `TermBinding`
  - `domain`
  - `sectionKey`
  - `sourceValue`
  - `candidateBasis`
  - `evidenceLineage`
- `UnresolvedBinding`
  - `domain`
  - `severity`
  - `provider`
  - `sampleCount`
- `MappingArtifactMetrics`
  - `autoBindingCount`
  - `manualBindingCount`
  - `unresolvedCountByDomain`
  - `confidenceBands`

핵심 변경:

- 현재 4개 term scaffold를 domain별 canonical term set으로 확장합니다.
- unresolved가 단순 reason 문자열이 아니라 domain-aware triage 대상이 되게 만듭니다.

### Phase 3. Deterministic Alias / Identity Integration

재사용 대상:

- `src/io/pms.fetch.js`
  - `resolvePresetRoomId`
- `src/reconcile/sheet_reconcile.py`
  - `build_source_reservation_alias_index`
  - `room_alias_keys`
  - 관련 alias helper

핵심 변경:

- room alias 결과를 `room` domain binding/unresolved로 승격합니다.
- reservation alias/identity 결과를 `reservation` domain binding/unresolved로 승격합니다.
- compare/audit는 raw 문자열 대신 canonical ids를 함께 소비합니다.

### Phase 4. Precision / Coverage Metrics

추가 산출물:

- branch/provider별 `joinAttemptCount`, `joinMatchedCount`, `joinUnresolvedCount`
- `mismatchWithoutCanonical`, `mismatchAfterCanonical`
- section/provider별 `coverage`

핵심 변경:

- Stage 2 완료 조건을 문서 문장 대신 계량 가능한 artifact metric으로 바꿉니다.

### Phase 5. Onboarding / Section Status 정리

핵심 변경:

- `disabled section` 하드코드를 제거하고 `operationalStatus` 또는 별도 onboarding registry로 이동합니다.
- `preopen`과 `not-onboarded`를 분리합니다.

## 5. 가장 작은 구현 순서

1. `runId + branch`를 sheet/provider/wings IPC 계약에 추가합니다.
2. main-owned `LiveReadCoverage`를 만들고 run artifact에 저장합니다.
3. provider branch filtering을 renderer에서 main으로 이동합니다.
4. `MappingDomain`, `MappingArtifactMetrics`, 확장된 `TermBinding/UnresolvedBinding` 계약을 추가합니다.
5. room alias deterministic binding을 먼저 통합합니다.
6. reservation identity deterministic binding을 그다음 통합합니다.
7. compare/audit가 canonical id와 precision metric을 함께 소비하게 바꿉니다.
8. Samsung hardcode disable을 onboarding policy로 이동합니다.

## 6. 검증 제안

### Stage 1

- branch-scoped provider fetch regression
- shared run manifest regression
- sheet/provider/wings coverage summary regression

### Stage 2

- room alias binding regression
- reservation identity binding regression
- unresolved domain/confidence regression
- branch-aware precision metric regression

## 7. 고정 결론

- 지금 코드의 강점은 `live read entry`, `section artifact shell`, `manual decision replay`, `unresolved surface`가 이미 있다는 점입니다.
- 지금 코드의 핵심 공백은 `same run context`, `main-owned branch scope`, `canonical room/reservation identity integration`, `precision/confidence metric`입니다.
- 따라서 다음 구현은 search나 export를 넓히는 것이 아니라, Stage 1의 manifest/coverage와 Stage 2의 deterministic mapping core를 먼저 닫는 쪽이 맞습니다.
