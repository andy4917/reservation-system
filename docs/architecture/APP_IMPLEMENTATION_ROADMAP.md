# 앱 재구현 로드맵

기준 문서:

- [`APP_PRODUCT_OPERATING_MODEL.md`](/mnt/c/Users/anise/OneDrive/바탕%20화면/예약%20통합%20관리%20시스템/docs/architecture/APP_PRODUCT_OPERATING_MODEL.md)

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

## Stage 3. Audit / Evidence E2E

목표:

- inventory compare와 reservation audit가 실데이터 기준으로 한 run 안에서 닫힌다.

작업:

- evidence lineage 연결
- audit/anomaly/review 분리
- export-ready evidence bundle 생성

완료 기준:

- 운영자가 앱 결과만으로 확인/후처리 대상을 식별할 수 있다.

## Stage 4. Search / Recommendation 실제화

목표:

- search와 recommendation이 실제 triage를 줄이는 보조 기능이 된다.

작업:

- lexical + structured search 통합
- embedding runtime 연결
- recommendation acceptance 측정 가능화

완료 기준:

- 추천은 evidence 기반으로 설명 가능해야 한다.
- 추천이 없어도 앱은 완결되며, 추천이 있으면 더 빨라진다.

## Stage 5. Operator Export / Handoff

목표:

- 사람이 앱 결과를 외부 후처리로 자연스럽게 넘길 수 있다.

작업:

- copy/export format 고정
- run manifest / branch / date / coverage 포함

완료 기준:

- 운영자가 앱 화면과 export만으로 업무를 마칠 수 있다.

## Stage 6. Apply 판단

목표:

- apply를 v1에 넣을지 분리할지 결정한다.

작업:

- 쓰기 인증/감사 경계 문서화
- read-only만으로 충분한 운영 가치 평가

완료 기준:

- apply가 범위 안인지 범위 밖인지 명시적으로 결정된다.

## 검증 원칙

- 검증은 배치형으로 수행한다.
- 진행을 막는 오류만 즉시 확인한다.
- fixture 통과를 운영 성공으로 해석하지 않는다.
- live read 성공, mapping 품질, export 완결성이 더 높은 우선순위를 가진다.
