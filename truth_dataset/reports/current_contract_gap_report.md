# Current Contract Gap Report

Last updated: 2026-03-12

## Scope

현재 앱 계약, 브리지 계약, 엔진 관측 모델을 truth-set 기준으로 비교한 1차 gap 보고서다.

## Summary

현재 구조는 `ProviderType`과 bridge payload가 축소된 반면, 엔진 내부에서는 branch, candidate basis, signals, tags, room alias, reservation identity를 이미 더 넓게 사용하고 있다.

## Gap Table

| Area | Current state | Missing for truth set | Action |
| --- | --- | --- | --- |
| Provider identity | `naver-partner`, `admin-station`, `wings-pms` 3종 | provider 내부 raw channel/source 분리 | taxonomy v1로 우선 분리, contract v2에서 승격 |
| Branch scope | 일부 row와 PMS record에만 존재 | query/response/meta에 branch scope와 branch coverage 필요 | truth dataset bundle + contract v2 backlog |
| Room identity | 앱 계약엔 `roomNo`/`roomType` 수준 | canonical room id, alias set, unresolved state 필요 | room alias graph v1 추가 |
| Reservation identity | exact/soft match 로직은 있음 | canonical reservation id, collision report, lineage 부족 | identity graph v1 + validator 추가 |
| Bridge evidence | `rawLine`, `sourceLineIndex`, `candidateBasis`, `signals`, `tags`는 inventory row에만 느슨하게 존재 | 공통 evidence schema, auth/info summary 표준화 필요 | canonical contract v1에 추가 |
| Coverage meta | bridge runtime엔 rate/meta만 있음 | branch/provider/channel coverage, unresolved count, confidence 필요 | 2차 contract v2로 이관 |
| Live payload schema | `payload: T[]` generic | typed inventory/reservation/evidence row schema 필요 | 2차 schema v2 backlog |
| Truth dataset | 전용 폴더/manifest 없음 | fixture, manifest, validator 필요 | 이번 라운드 구현 |

## Current Overreach

지금 당장 넣으면 과한 항목:

- `ProviderType`를 곧바로 채널별 enum으로 분해
- hybrid search를 주 경로로 교체
- apply 경로까지 신규 계약으로 연결
- fixture fallback 제거를 대규모로 진행

이 항목들은 truth-set coverage와 live parity 측정이 먼저다.

## Minimum Needed Before Contract V2

1. branch/provider/channel canonical 기준 확정
2. room alias graph artifact 고정
3. reservation identity collision 측정 가능화
4. bridge evidence schema 공통화
5. live capture bundle redaction 규격 고정
