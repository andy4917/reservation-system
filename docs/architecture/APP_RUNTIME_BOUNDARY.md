# 앱/확장 런타임 경계

## 목표

- 메인 사용자 플로우는 데스크톱 앱이 소유한다.
- 브라우저 확장은 인증/세션/현재 탭/DOM 브리지로 축소한다.
- 앱과 확장은 타입이 고정된 계약으로만 통신한다.

## 앱이 담당하는 것

- 메인 UI 전체
- Task 전환
- 날짜 범위/실행 모드 선택
- Inventory Compare / Reservation Audit / Apply Review orchestration
- 결과 요약, validation, ops, logs, export
- 설정 저장과 최근 작업 이력
- 민감값 저장을 위한 보안 저장 래퍼
- dry-run / replay / live 모드 제어

## 확장이 담당하는 것

- 현재 브라우저 세션 감지
- 현재 탭 host/context 수집
- 쿠키/토큰/CSRF/auth bundle 캡처
- DOM fallback payload 추출
- 현재 세션 기반 provider read/write 요청 대행

## 브리지 경계

- 앱은 확장의 내부 구현을 직접 호출하지 않는다.
- 확장은 UI 상태를 소유하지 않는다.
- 통신 단위는 typed request/response envelope로 고정한다.

## Hold 항목

- live apply의 최종 안전장치와 감사 경계
- DOM fallback이 필요한 provider fetch의 운영 커버리지
- WINGS/PMS 읽기 전용 경로의 반복 안정성

## 단계별 목표

1. 앱 셸과 dry-run 모드를 먼저 구현한다.
2. live 연동 전에 동일한 UI 흐름이 mock 데이터로 재생되어야 한다.
3. extension bridge는 auth/session/context부터 붙인다.
4. live inventory/reservation/apply는 순차적으로 옮긴다.
5. 앱에서 기능 대체가 검증된 뒤에는, 확장에 남은 중복 UI와 dead path를 단계적으로 제거한다.

## 제거 원칙

- 앱이 주 작업면을 안정적으로 대체하기 전에는 확장 기능을 제거하지 않는다.
- 제거는 항상 기능 단위로 진행한다.
- 아래 3가지를 만족할 때만 제거한다.
  - 앱 쪽 동일 기능이 존재한다.
  - dry-run 또는 live smoke 검증이 있다.
  - 확장 쪽 호출 지점과 fallback 경로가 식별되었다.

## 제거 우선순위

1. 확장 패널의 중복 UI 렌더링
2. 앱에서 이미 대체한 설정 패널 조작
3. 앱에서 이미 대체한 결과/ops/evidence 표시
4. 마지막으로 남는 확장 전용 실행 진입 버튼
