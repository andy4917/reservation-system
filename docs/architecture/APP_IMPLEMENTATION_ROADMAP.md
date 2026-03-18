# 앱 재구현 로드맵

기준 문서:

- [`APP_PRODUCT_OPERATING_MODEL.md`](./APP_PRODUCT_OPERATING_MODEL.md)

이 로드맵은 기능 나열이 아니라 `실제 운영 경로가 성립되는 순서`로 정렬한다.

## Stage 0. 기준선 재정렬

목표:

- 앱을 왜 만드는지와 어디까지가 v1인지 고정한다.

작업:

- 제품 정의 문서 고정
- README 우선순위 재정렬
- 앱/확장/브리지/HAR/truth dataset 책임 정렬

완료 기준:

- 구현 판단 기준이 하나의 문서로 수렴한다.

## Stage 1. Live Read 최소 경로

목표:

- 강남/코엑스 기준 live read가 실제로 성립한다.

작업:

- 브라우저 세션 우선 경로 고정
- Wings live JSON 응답 성립
- sheet/OTA/Wings 공통 run context 연결

완료 기준:

- 앱에서 실제 live inventory/audit rows가 보인다.
- HAR fallback 없이 브라우저 세션 기준 조회가 성공한다.

현재 상태:

- main-owned `LiveReadRunContext`와 `coverage` bundle까지는 구현 완료
- 현재 환경에서는 `sheet-unconfigured / provider unavailable / wings unavailable`로 `offline-preview`
- 즉 코드 경로는 닫혔고, 남은 것은 운영 환경 smoke다

## Stage 2. Truth-Aligned Mapping Core

목표:

- 비교와 검증이 단순 문자열 비교가 아니라 canonical mapping 위에서 돌아간다.

작업:

- channel taxonomy 반영
- room alias graph 실데이터 반영
- reservation identity graph 반영
- unresolved queue / confidence 계산

완료 기준:

- branch-aware join precision을 추적할 수 있다.
- unresolved mapping이 명시적으로 분리된다.

현재 상태:

- exact room alias / reservation identity auto binding 구현 완료
- soft-triage, precision score, precision gate까지 artifact/export/search/UI에 노출 완료
- mapping core v1은 닫혔고, 후속은 recommendation 고도화 또는 운영 환경 실증이다

## Stage 3. Search / Recommendation 실제화

목표:

- search와 recommendation이 실제 triage를 줄이는 보조 기능이 된다.

작업:

- `SearchDocument`를 `unresolved binding`, `saved decision replay trace`, `validation/structural summary`, `inventory compare explanation`, `reservation audit explanation`, `live verify output`, `operator acceptance trace` 중심으로 재분류
- 각 문서에 `kind`, `runId`, `sectionKey`, `source`, `jumpTarget`, `matchReason`, `candidateBasis`, `score`, `evidenceLineage`를 연결
- recommendation을 `unresolved alias` / `SheetTerm` 후보 triage에만 연결
- recommendation acceptance / reject 저장 구조를 추가
- repo-local verify output을 별도 디버그 출력이 아니라 evidence source 중 하나로 재사용

완료 기준:

- lexical + structured search가 `unresolved / evidence / validation / audit` line에 대해 실제 jump를 제공한다.
- recommendation이 unresolved triage 보조로 실제 화면에 연결된다.
- recommendation acceptance / reject가 측정 가능한 형태로 저장된다.
- recommendation이 없어도 앱의 `read / compare / search` 경로는 완결된다.
- repo-local verify 결과가 failure classification과 함께 evidence source로 재사용 가능하다.
- renderer는 계속 `summary + selectedRunId + visibleSlice + query/hits` 중심의 얇은 상태를 유지한다.

현재 상태:

- bounded search, recommendation trace 저장, evidence jump는 구현 완료
- 다음 단계는 broad search 확장이 아니라 운영 환경 재검증과 triage 정밀화다

제외 범위:

- broad search runtime 대개편
- full workerization 선행 착수
- broad search UI expansion
- renderer에 raw rows, raw snapshot, 대형 matrix 재도입
- embedding을 mapping core보다 먼저 주 경로에 연결하는 변경
- recommendation을 canonical 확정값처럼 보이게 만드는 UI/저장 방식

## Stage 4. Evidence / Export / Operator Loop

목표:

- 사람이 앱 결과만으로 후처리할 수 있게 한다.

작업:

- copy/export format 고정
- run manifest / branch / date / coverage 포함
- acceptance 저장과 evidence lineage를 export/operator loop로 넘김

완료 기준:

- 운영자가 앱 화면과 export만으로 업무를 마칠 수 있다.

현재 상태:

- external file/clipboard handoff, operator history, follow-up queue, 전달물 format 고정까지 구현 완료
- precision / soft-triage summary도 handoff surface에 포함된다

## Stage 5. Apply 판단

목표:

- apply를 v1에 넣을지 분리할지 결정한다.

작업:

- 쓰기 인증/감사 경계 문서화
- read-only만으로 충분한 운영 가치 평가

완료 기준:

- apply가 범위 안인지 범위 밖인지 명시적으로 결정된다.

현재 상태:

- 아직 결정 전
- read-only 운영 가치 검증이 우선이다

## 검증 원칙

- 검증은 배치형으로 수행한다.
- 진행을 막는 오류만 즉시 확인한다.
- fixture 통과를 운영 성공으로 해석하지 않는다.
- live read 성공, mapping 품질, export 완결성이 더 높은 우선순위를 가진다.
