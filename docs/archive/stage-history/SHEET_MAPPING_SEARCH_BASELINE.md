# 시트 읽기 / Mapping / Search 기준선

Last updated: 2026-03-14

이 문서는 현재 저장소에서 `실제 시트 읽기`, `truth-aligned mapping`, `search / recommendation assist` 작업을 계속 이어갈 때 사용하는 단일 기준 문서입니다.

이 주제에서 구현 판단이 갈릴 때는 이 문서를 우선합니다.

실행 체크리스트와 파일별 착수 순서는 `docs/archive/stage-history/SHEET_MAPPING_SEARCH_EXECUTION_CHECKLIST.md` 를 따릅니다.

주의:
- 아래의 세부 파일 예시는 `app_v2` 전환 이전 설계 논의를 포함합니다.
- 현재 활성 런타임 경계는 `docs/architecture/APP_IMPLEMENTATION_ROADMAP.md` 와 `docs/architecture/APP_V2_OPERATING_CONTRACT.md` 를 우선합니다.

## 1. 이 문서가 고정하는 것

- 실제 시트를 읽었을 때 무엇을 성공으로 볼지
- 어떤 계층을 먼저 만들고 어떤 계층을 뒤로 미룰지
- 어떤 계약을 제품 타입으로 고정할지
- 실패를 어떤 종류로 분리해 다룰지
- hardcode / legacy / fallback을 언제 금지할지

## 2. 지금까지 드러난 실제 문제

현재 문제의 본질은 "시트를 못 읽는다" 하나가 아닙니다.

1. 시트는 읽혀도 구조 탐지가 흔들렸습니다.
- 날짜행, 재고행, room type range 탐지가 시트 구조 변화에 민감했습니다.
- 자동 탐지 실패 시 full-range 재시도로 버티는 구조가 많아 운영 안정성이 낮았습니다.

2. 시트를 읽어도 의미 확정 계층이 약했습니다.
- raw field와 canonical field가 분리되지 않아 "읽음"과 "운영에 사용 가능" 사이가 비어 있었습니다.
- room/channel/reservation mapping이 규칙과 런타임 내부에 흩어져 있었고 unresolved 상태가 제품 표면에 드러나지 않았습니다.

3. 앱 표면이 결과를 충분히 닫지 못했습니다.
- 시트 read 결과가 요약 수준에 머물렀고 evidence jump, unresolved queue, structured search로 이어지지 못했습니다.
- search는 triage 도구가 아니라 메모리 상태에 대한 얇은 문자열 필터 수준에 머물렀습니다.

4. 정책과 계약이 애매할 때 hardcode와 legacy가 늘었습니다.
- 정책이 확정되지 않은 상태에서 runtime value, 좌표, 예외 처리, fallback branch를 코드에 남겨 운영 경로를 흐렸습니다.
- 계약 미확정 상태에서 "일단 동작"을 위해 남긴 compatibility patch와 fallback이 누적되어 실제 문제 원인을 가렸습니다.

이 네 가지를 현재까지의 핵심 실패 원인으로 고정합니다.

## 3. 이번 기준선의 핵심 판단

1. v1의 우선순위는 `실제 read 안정화 -> mapping core -> search assist -> embedding assist` 입니다.
2. recommendation / embedding은 기준 데이터의 대체물이 아닙니다.
3. 검색은 단독 기능이 아니라 `mapping unresolved + anomaly triage`를 줄이는 보조 기능입니다.
4. 실제 시트 읽기의 성공은 `데이터를 받아옴`이 아니라 `운영자가 무엇이 문제인지 바로 추적 가능`한 상태입니다.
5. unresolved mapping은 예외가 아니라 1급 제품 상태입니다.
6. run artifact는 renderer보다 main-owned store에 먼저 적재합니다.
7. renderer는 `summary + selectedRunId + visibleSlice`만 우선 소유합니다.
8. compare / audit / search 계산은 renderer 직접 계산보다 main -> worker/subprocess 경계를 우선합니다.

## 4. 단일 설계

### 4-1. 운영 경로

1. 앱이 branch / date range를 고정합니다.
2. 앱이 sheet / OTA / Wings read를 같은 run context에서 수행하고 결과를 main-run artifact store에 먼저 적재합니다.
3. 시트 read는 raw snapshot + anchor metadata + value hints를 함께 수집합니다.
4. mapping 계층이 raw field를 canonical term에 바인딩하거나 unresolved로 남기고 binding artifact를 로컬 저장 우선 + developer metadata 보조로 보존합니다.
5. compare / audit가 canonical 기준으로 계산됩니다.
6. search가 run별 SearchDocument 인덱스를 main/worker 쪽에서 만들고 evidence / unresolved / anomaly를 점프 가능한 hit로 제공합니다.
7. renderer는 query, selectedRunId, visibleSlice, jumpTarget 소비만 담당합니다.
8. export가 run manifest와 evidence lineage를 포함해 생성됩니다.

### 4-2. 제품 타입으로 고정할 계약

아래 개념은 제품 계약으로 올립니다.

- `SheetRef`
  - `spreadsheetId`, `sheetName`, `sheetId`, `branch`, `timezone`
- `Anchor`
  - `anchorId`, `kind(named-range | developer-metadata | grid-hash)`, `scope`, `sheetRef`
- `SheetTerm`
  - `termId`, `canonicalName`, `synonyms`, `datatype`, `description`
- `TermBinding`
  - `anchorId`, `termId`, `confidence`, `method(rule | manual | embedding)`, `decidedAt`
- `UnresolvedBinding`
  - `anchorId`, `rawHeader`, `sampleValues`, `candidateTerms`, `reason`, `status`
- `SearchDocument`
  - `docId`, `kind`, `sourceSystem`, `sourceLineIndex`, `rawText`, `canonicalFields`, `candidateBasis`, `signals`, `tags`
- `SearchHit`
  - `docId`, `score`, `matchReason`, `jumpTarget`, `excerpt`

### 4-3. 실패 분류

실패는 아래 네 가지로 분리합니다.

- `access`
  - 토큰 없음, 토큰 만료, 권한 부족, bridge/session 미성립
- `sheet-structure`
  - 날짜행 탐지 실패, inventory row 탐지 실패, metadata/named range 부재, 구조 이동
- `mapping`
  - canonical term 확정 실패, alias 충돌, branch-aware identity 불일치
- `value-parse`
  - 셀 파싱 실패, 색상 분류 실패, provider value 해석 불가

앞으로 새 오류나 경고는 이 네 축 중 하나에 귀속되지 않으면 주 경로에 올리지 않습니다.

## 5. hardcode / legacy / fallback 정책

이 문서 기준으로 아래를 강하게 금지합니다.

- 정책 미확정 상태를 runtime hardcode로 메우는 것
- 실제 계약 대신 "일단 맞는 것처럼 보이게" 하는 compatibility branch 추가
- unresolved 상태를 숨기기 위한 fallback 값 자동 주입
- 운영 시트 구조 차이를 legacy exception으로 누적하는 것

허용되는 것은 아래뿐입니다.

- 명시적 manual override
  - 이유: 운영 시트별 앵커를 확정하기 위한 통제된 설정
- quarantine 성격의 fallback
  - 이유: read 자체를 완전히 끊지 않되 unresolved 상태를 숨기지 않는 복구
- 문서화된 compatibility layer
  - 제거 조건과 만료 조건이 있을 때만 허용

정책과 계약이 애매할 때의 기본 행동:

1. hardcode하지 않습니다.
2. unresolved로 올립니다.
3. 필요한 타입과 문서를 먼저 고정합니다.
4. 그 뒤 구현합니다.

## 6. 바로 이어갈 작업 순서

### Stage A. Read Contract 강화

완료 기준:
- `FetchSheetSnapshotSummary`가 anchor / hint / validation / coverage / retry 메타를 포함합니다.
- 결과는 renderer state가 아니라 main-run artifact store에 먼저 저장됩니다.
- renderer는 `summary + selectedRunId + visibleSlice`만 소비합니다.

### Stage B. Mapping Core 고정

완료 기준:
- `SheetRef / Anchor / SheetTerm / TermBinding / UnresolvedBinding`이 제품 타입으로 고정됩니다.
- binding artifact는 로컬 저장 우선 + developer metadata 보조로 남습니다.
- unresolved queue가 앱 상태와 export surface에 숨김 없이 존재합니다.

### Stage B+. 계산 격리

완료 기준:
- `sheet_domain.py`, inventory compare, reservation audit 계산이 renderer 직접 처리 대신 main -> worker/subprocess 호출형으로 이동합니다.
- 이 단계는 채택 예정 구조이며, subprocess 경계와 payload 비용은 구현 전 검증합니다.

### Stage C. Search 재구성

완료 기준:
- search runtime이 main/worker 쪽으로 이동합니다.
- run별 SearchDocument 인덱스가 생성됩니다.
- unresolved / evidence / anomaly가 같은 corpus에 포함됩니다.
- renderer는 query와 `SearchHit[] + jumpTarget page`만 소비합니다.

### Stage D. Embedding Assist

완료 기준:
- embedding은 `SheetTerm` 후보 추천과 unresolved triage 보조에만 1차 적용됩니다.
- recommendation acceptance를 측정할 수 있습니다.

### UI 경량화

완료 기준:
- `AppHeader`, `RightPanel`, `TaskWorkspace`는 lazy load 기준으로 정리됩니다.
- 대형 결과표는 virtualization 처리합니다.
- embedding UI는 Stage D 전까지 넣지 않습니다.

### 재평가 조건

완료 기준:
- Stage C 종료 시점에 idle/peak RAM, 배포 복잡도, 운영자 체감이 기준 미달이면 좁은 Tauri 스파이크를 별도 브랜치에서 검증합니다.
- 본선 마이그레이션은 실제 read / mapping / search 개선이 입증될 때만 검토합니다.

## 7. 작업 연속성 규칙

이 주제의 후속 작업에서는 아래를 매번 확인합니다.

1. 이번 변경이 Stage A/B/C/D 중 어디에 속하는지 먼저 적습니다.
2. 새 타입이나 계약을 추가하면 이 문서에 먼저 반영합니다.
3. unresolved를 숨기는 fallback은 추가하지 않습니다.
4. hardcoded runtime value가 필요해 보이면 먼저 문서 결정으로 승격할지 검토합니다.
5. 구현 후에는 "실제 시트 read에서 어떤 실패를 줄였는지"로 검증합니다.

## 8. 현재 고정 결론

- 네, 정책과 계약이 애매했을 때 hardcoding과 legacy가 많이 남은 것은 큰 문제 중 하나가 맞습니다.
- 더 정확히는 그것이 `실제 시트 read 실패를 숨기고`, `mapping 미완성을 런타임 예외 처리로 덮고`, `search를 제품 기능이 아니라 보조 필터 수준에 묶어 둔` 원인 중 하나였습니다.
- 따라서 앞으로는 "애매하면 hardcode"가 아니라 "애매하면 unresolved + 계약 고정"을 기준으로 작업을 이어갑니다.
