# Truth-Set Program

Last updated: 2026-03-12

## Goal

실제 시트 + OTA + Wings 조회 데이터를 truth set으로 삼아 계약, 엔진, 브리지, 앱을 다시 정렬한다.

핵심 원칙:

- truth set이 먼저고 엔진/앱 재설계는 그 다음이다.
- raw field와 canonical field를 동시에 보존한다.
- 읽기 전용 수집과 검증 경로를 먼저 고정한다.
- 축소 계약을 다시 넓히더라도 실제 관측 데이터로 검증되지 않은 필드는 주 경로에 올리지 않는다.

## What Stays

다음 항목은 유지가 맞다.

- 1차에서 실제 데이터 수집 기준, canonical 모델, truth dataset fixture를 먼저 만든다.
- 2차에서 channel-aware 계약과 엔진/브리지 구조를 올린다.
- 3차에서 shadow mode부터 운영 검증을 거쳐 rollout 한다.
- branch-aware room/reservation identity를 중심으로 coverage와 precision을 같이 본다.

## Missing

원안에 빠져 있던 항목이다. 1차에 포함해야 한다.

- redaction policy
  - raw payload를 그대로 fixture에 남기지 않고 guest/name/phone/token은 축약 또는 hash 처리한다.
- schema versioning
  - canonical contract, taxonomy, graph, capture bundle에 각각 버전을 둔다.
- source lineage
  - `source_system`, `source_line_index`, `raw_line`, `candidate_basis`, `signals`, `tags`를 공통 evidence 축으로 정의한다.
- truth dataset manifest
  - fixture 묶음의 범위, branch, date window, source coverage를 설명하는 manifest가 필요하다.
- sampling policy
  - branch별, provider별, channel별 최소 샘플 수 기준이 필요하다.
- evaluation ownership
  - coverage, unresolved alias, identity collision, branch field miss rate를 어떤 스크립트가 계산하는지 명시해야 한다.
- raw/canonical split
  - `raw_channel`, `raw_room_label`, `raw_status`, `canonical_channel`, `canonical_room_id`, `canonical_status`를 분리해야 한다.
- branch-property mapping
  - branch와 `PROPERTY_NO`/`BSNS_CODE`/provider 계정을 연결하는 규격이 필요하다.

## Defer

원안 중 지금 바로 구현하면 범위를 흐리는 항목이다. 2차 이후로 미룬다.

- `ProviderType`를 곧바로 다수 채널 타입으로 깨는 작업
  - 현재 런타임과 계약이 `wings-pms` 단일 provider를 중심으로 돌아가므로 1차에서는 taxonomy와 evidence field부터 고정한다.
- lexical search -> hybrid search
  - truth set과 structured evidence가 먼저여야 평가가 가능하다.
- fixture fallback 제거 확대
  - live contract v2와 parity 측정 없이 제거하면 회귀 추적이 어려워진다.
- apply 경로 재배선
  - 현재 요청 범위는 읽기 전용 truth-set 정렬이다.
- provider capability matrix를 앱 readiness 보드에 바로 노출
  - 1차에서는 taxonomy/contract 문서와 data bundle에서 먼저 정의한다.

## Phase 1

목표:

- 실제 관측 모델을 확정한다.
- 현재 코드 계약과 실제 데이터 간 누락을 문서화한다.
- 반복 검증 가능한 truth dataset scaffold를 만든다.

필수 산출물:

- canonical data contract v1
- provider/channel taxonomy v1
- room alias graph v1
- reservation identity graph v1
- sampled truth dataset capture bundle
- current contract gap report
- truth dataset validation script + regression

완료 기준:

- 시트/Wings/OTA/브리지 샘플이 공통 schema로 적재된다.
- branch/provider/channel/room/reservation canonical 필드가 명시된다.
- coverage, alias unresolved, identity collision, branch field missing rate를 계산할 수 있다.

## Phase 2

목표:

- 엔진, 브리지, 앱 계약을 channel-aware 구조로 재설계한다.

2차 착수 전 선행 조건:

- phase-1 truth dataset와 contract v1이 고정됨
- gap report 기준으로 어떤 필드를 contract v2에 올릴지 합의됨
- live read smoke 범위가 branch/provider별로 정의됨

핵심 범위:

- auth/provider/bridge contract v2
- inventory compare row / reservation row schema v2
- evidence schema v2
- provider/channel-aware payload
- reservation live hydration
- join trace / evidence lineage
- unresolved mapping queue
- confidence-driven validation gate

## Phase 3

목표:

- 신규 계약과 엔진을 실제 운영 데이터 기준으로 평가하고 전환한다.

핵심 지표:

- provider/channel coverage
- reservation join precision/recall
- room mapping top-1/top-3 accuracy
- unresolved mapping rate
- audit anomaly precision
- inventory drift precision
- search usefulness hit rate
- recommendation accept rate
- bridge/live read success rate
- end-to-end read latency

전환 방식:

1. `shadow`
2. `operator-assisted`
3. `guarded apply`
4. `full migration`

## Current Repo Gaps

현재 저장소 기준 주요 gap:

- 앱 계약의 `ProviderType`은 아직 `naver-partner | admin-station | wings-pms`로 축소되어 있다.
- bridge/provider contract는 `payload: T[]` 수준이라 evidence lineage와 coverage 메타가 부족하다.
- room alias는 엔진 내부 규칙과 `room_registry_baseline.json`으로 흩어져 있고, truth-set graph artifact가 없다.
- reservation identity는 note/remark 기반 로직이 있지만 canonical graph artifact와 collision report가 없다.
- truth dataset 전용 폴더, manifest, validator가 없다.

## Immediate Backlog

이번 라운드에서 바로 구현할 최소 backlog:

1. truth dataset 폴더 구조 추가
2. canonical contract/taxonomy/gap report 문서 추가
3. room alias graph 생성기와 generated graph 추가
4. sampled capture bundle 추가
5. truth dataset validator와 regression 추가
