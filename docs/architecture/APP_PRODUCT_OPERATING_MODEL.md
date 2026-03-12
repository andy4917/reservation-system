# 예약 통합관리 앱 제품 정의 및 운영 모델

Last updated: 2026-03-12

## 1. 왜 이 앱을 만드는가

이 앱의 목적은 `시트 + OTA + Wings` 사이에서 흩어진 운영 확인 작업을 하나의 읽기 전용 운영 화면으로 통합하는 것이다.

지금 현장 문제는 기능 부족보다 다음에 가깝다.

- 운영자가 여러 화면을 오가며 예약/재고/채널 상태를 눈으로 맞춰야 한다.
- 같은 사실을 서로 다른 이름과 구조로 보고 있어 오탐과 누락이 생긴다.
- 확장, 시트, OTA, PMS 각각의 실행 경로가 분리되어 있어 책임이 흐려진다.
- 실제 apply보다 먼저 `무엇이 현재 사실인지`, `어디가 불일치인지`, `사람이 무엇을 확인해야 하는지`를 안정적으로 보여주는 표면이 없다.

이 앱은 쓰기 자동화 앱이 아니라, 먼저 `운영 truth 확인 앱`이어야 한다.

## 2. 이 앱이 하지 말아야 하는 것

초기 범위에서 이 앱이 하면 안 되는 일:

- PMS/OTA 쓰기 경로를 주 기능처럼 다루는 것
- 세션 복구 상태를 운영자에게 로그처럼 노출하는 것
- HAR 재생만으로 운영이 가능하다고 가정하는 것
- fixture 테스트 통과를 운영 가능성으로 오해하는 것
- recommendation/embedding을 근거 데이터보다 먼저 주 경로에 올리는 것

## 3. v1의 실제 목표

v1은 다음 하나를 완성해야 한다.

`운영자가 앱 하나에서 지점/기간을 선택하고, 시트/OTA/Wings의 현재 상태를 읽기 전용으로 수집한 뒤, 불일치와 확인 필요 항목을 근거와 함께 볼 수 있다.`

즉 v1의 성공 기준은 `자동 적용`이 아니라 `신뢰 가능한 읽기 + 검증 + 사람 후처리 보조`다.

## 4. 사용자와 사용 장면

주 사용자:

- 예약/재고 운영 담당자
- 지점별 상태를 확인하는 관리자

주 사용 장면:

1. 지점 선택
2. 조회 기간 선택
3. 앱에서 시트/OTA/Wings 읽기 실행
4. inventory mismatch / reservation anomaly / mapping unresolved 확인
5. 복사용 출력 또는 evidence export 생성
6. 사람이 최종 수정/조치

## 5. 왜 앱 중심이어야 하는가

앱 중심이 맞는 이유:

- 운영자의 메인 플로우는 브라우저 제어가 아니라 결과 이해와 판단이다.
- 지점, 기간, 상태, evidence, export는 앱이 소유하는 편이 자연스럽다.
- 확장은 브라우저 세션과 DOM 문맥을 얻는 보조 도구일 뿐이다.
- UI가 확장에 남아 있으면 운영 목적보다 세션/탭 상태가 앞에 나오게 된다.

정리하면:

- 앱 = 운영 작업면
- 확장 = 브리지
- HAR = 구조 학습 자산
- truth dataset = 기준 데이터

## 6. 필수 기능과 넣는 이유

### A. Workspace / Task Shell

왜 필요한가:

- 운영자가 현재 어느 지점/기간/모드에서 보고 있는지 고정해야 한다.

해야 하는 일:

- branch 선택
- date range 선택
- runtime mode 선택
- task 전환

### B. Truth-aligned Data Intake

왜 필요한가:

- 시트/OTA/Wings를 공통 contract로 읽어야 비교가 성립한다.

해야 하는 일:

- sheet snapshot 수집
- OTA provider rows 수집
- Wings reservation / catalog / room 상태 수집
- raw + canonical 동시 보존

### C. Mapping / Identity Layer

왜 필요한가:

- 같은 예약/객실/채널이 소스마다 다른 이름으로 나타난다.
- 이 계층이 없으면 앱은 단순 viewer로 끝난다.

해야 하는 일:

- provider/channel taxonomy
- room alias graph
- reservation identity graph
- branch-aware mapping confidence
- unresolved mapping queue

### D. Verification / Audit Layer

왜 필요한가:

- 운영자는 전체 raw data보다 `어디가 문제인지`를 먼저 알아야 한다.

해야 하는 일:

- inventory compare
- reservation audit
- anomaly / review / unresolved 분류
- evidence lineage 표시

### E. Search / Recommendation Assist

왜 필요한가:

- 매핑과 anomaly triage를 빨리 하려면 단순 문자열 검색만으로는 부족하다.

해야 하는 일:

- lexical search
- structured evidence search
- 이후 embedding-assisted recommendation

중요:

- 이 기능은 truth-aligned mapping이 먼저다.
- 임베딩은 보조 기능이지 기준 데이터의 대체물이 아니다.

### F. Export / Operator Handoff

왜 필요한가:

- 이 앱의 직접 결과물은 apply가 아니라 `사람이 쓰는 확인 결과`다.

해야 하는 일:

- copy-ready text
- JSON/CSV evidence bundle
- branch/date/run metadata 포함

## 7. 모듈별 책임

### 앱

앱이 반드시 소유해야 하는 것:

- 메인 UI
- 설정/범위/실행 orchestration
- truth contract와 canonical 모델
- mapping / audit / recommendation orchestration
- export / handoff

### 확장

확장이 반드시 소유해야 하는 것:

- 현재 브라우저 세션 감지
- 현재 탭 context
- 쿠키/토큰/CSRF/auth bundle 캡처
- DOM fallback payload 추출

확장이 소유하면 안 되는 것:

- 메인 사용자 플로우
- 결과 화면의 주 렌더링
- 운영 의사결정 로직

### HAR

HAR는 다음에만 사용한다.

- endpoint 식별
- request body/preset 복원
- read-only vs mutation 분류
- regression fixture

HAR를 다음 용도로 쓰면 안 된다.

- 영구 인증 재료
- 운영 주경로 세션 수단

## 8. 운영 모드

### Mode 1. Fixture / Replay

목적:

- UI와 orchestration이 깨지지 않는지 확인

### Mode 2. Live Read with Browser Session

목적:

- 실제 운영용 기본 모드

원칙:

- 브라우저에 공식 계정 세션이 살아 있으면 이 경로를 우선
- 앱은 브리지에서 auth material만 조용히 받음
- UI에는 세션 내부 상태를 노출하지 않음

### Mode 3. Offline Fallback

목적:

- 브라우저 세션이 끊긴 상태에서 구조 검증 또는 제한적 재실행

원칙:

- HAR/auth bundle 기반
- 운영 주경로가 아님

## 9. E2E 플로우

정상 E2E는 아래 순서로 끝까지 이어져야 한다.

1. 운영자가 앱을 연다.
2. branch와 date range를 선택한다.
3. 앱이 시트 데이터를 읽는다.
4. 앱이 OTA 데이터를 읽는다.
5. 앱이 Wings 데이터를 읽는다.
6. 앱이 channel / room / reservation identity를 정규화한다.
7. 앱이 inventory compare와 reservation audit를 계산한다.
8. 앱이 unresolved mapping과 anomaly를 분리한다.
9. 앱이 검색/추천 보조를 제공한다.
10. 앱이 evidence/export를 생성한다.
11. 운영자가 사람 판단으로 후처리한다.

이 중 하나라도 빠지면 v1은 완성으로 보지 않는다.

## 10. 지금까지의 문제를 반영한 재구현 원칙

이번 재구현에서는 아래 원칙을 강제한다.

1. 운영 경로가 먼저다.
설명:
- 테스트보다 실제 live read 경로를 먼저 성립시킨다.

2. truth set과 mapping이 recommendation보다 먼저다.
설명:
- 임베딩 추천은 mapping/identity 품질 위에 올라가야 한다.

3. 앱 목적 문서와 구현이 항상 같이 간다.
설명:
- 기능 추가 전에 이 문서의 어느 섹션을 만족시키는지 먼저 확인한다.

4. 브라우저 세션은 조용히 쓰고, UI에 드러내지 않는다.
설명:
- 운영자는 결과를 봐야지 세션 기계를 보면 안 된다.

5. 배치 검증만 한다.
설명:
- 진행을 막는 오류만 즉시 확인하고, 나머지는 묶어서 검증한다.

## 11. 재구현 로드맵

### Stage 0. 제품 기준선 고정

완료 조건:

- 이 문서가 기준 문서가 된다.
- README와 로드맵이 이 문서를 먼저 가리킨다.
- 앱/확장/브리지/HAR/truth dataset 책임이 겹치지 않는다.

### Stage 1. Live Read 최소 경로 성립

목표:

- 강남/코엑스 기준으로 앱에서 실제 live read가 된다.

완료 조건:

- 브라우저 세션 연결 상태에서 Wings JSON 응답 확인
- sheet/OTA/Wings를 같은 run context에서 읽음
- `reservation audit`, `inventory compare`가 live rows로 채워짐

### Stage 2. Mapping Core 완성

목표:

- channel/room/reservation mapping을 운영에 쓸 수준으로 올린다.

완료 조건:

- canonical taxonomy 고정
- alias graph / identity graph 실제 샘플 반영
- unresolved queue와 confidence 계산
- branch-aware mismatch 감소

### Stage 3. Search / Recommendation 실제화

목표:

- search와 recommendation이 실제 triage 시간을 줄이게 한다.

완료 조건:

- lexical + structured search 완성
- embedding runtime를 실제 evidence 입력에 연결
- recommendation acceptance를 측정 가능

### Stage 4. Evidence / Export / Operator Loop 완성

목표:

- 사람이 앱 결과만으로 후처리할 수 있게 한다.

완료 조건:

- copy/export format 고정
- run manifest/evidence lineage 포함
- branch/date/source coverage 표시

### Stage 5. Apply 분리 여부 판단

목표:

- apply를 넣을지 말지 결정한다.

완료 조건:

- read-only 운영 가치가 이미 충분한지 평가
- 쓰기 인증/감사 경계를 별도 문서로 정의
- 필요 없으면 v1 범위 밖으로 확정

## 12. 바로 실행할 재구현 순서

1. 이 문서를 기준으로 README와 구현 로드맵을 재정렬한다.
2. live read 최소 경로를 최우선으로 잡는다.
3. 브라우저 세션 연결 기준의 Wings live success를 먼저 닫는다.
4. 그 다음 mapping core를 올린다.
5. 그 다음 recommendation과 search를 얹는다.
6. 마지막에 export/operator loop를 마감한다.

## 13. 현재 상태의 냉정한 판정

현재는 아래 수준이다.

- 앱/확장 코드 골격: 있음
- read-only endpoint 정리: 상당 부분 있음
- live 운영 성립: 아직 아님
- mapping 실완성: 아직 아님
- embedding 추천 실효성: 아직 아님
- operator workflow 완결: 아직 아님

따라서 지금 저장소는 `부분 구현된 운영 준비 상태`이지 `완성된 운영 앱`이 아니다.

## 14. 현재 단계별 진행률

운영 전제 기준의 현재 평가는 아래와 같다.

- Stage 0. 기준선 재정렬: `100%`
- Stage 1. Live Read 최소 경로: `35%`
- Stage 2. Truth-Aligned Mapping Core: `25%`
- Stage 3. Audit / Evidence E2E: `40%`
- Stage 4. Search / Recommendation: `20%`
- Stage 5. Operator Export / Handoff: `30%`
- Stage 6. Apply 판단: `0%`

전체 진행률은 보수적으로 `약 36%`로 본다.

이 수치는 코드량이 아니라 `실제 운영자가 앱으로 업무를 수행할 수 있는 정도`를 기준으로 한다.
