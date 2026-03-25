# APP_V2 Identity Summary

- updated_at: 2026-03-25T23:10:26+09:00
- audience: 운영 담당자, 협업자, 후속 구현자
- scope: 현재 `app_v2`가 어떤 앱인지, 어떤 일을 하는지, 화면이 어떤 형태를 가져야 하는지에 대한 전달용 요약

## 한 줄 정의

`app_v2`는 예약/재고 운영 담당자가 `시트 + OTA + Wings PMS`에 흩어진 사실을 한곳에서 읽고, 불일치와 확인 대상을 빠르게 판단하기 위한 `read-only 운영 판단 앱`입니다.

이 앱의 1차 목적은 자동 수정이 아니라 아래 세 가지입니다.

1. 지금 무엇이 사실인지 읽는다.
2. 어디가 서로 맞지 않는지 찾는다.
3. 사람이 어디를 확인하고 후처리해야 하는지 바로 알 수 있게 한다.

## 이 앱이 하는 일

현재 앱은 아래 작업을 하나의 운영 셸 안에서 다루도록 설계되어 있습니다.

- 지점과 날짜 범위를 고정하고 같은 기준으로 본다.
- 시트, OTA, Wings PMS에서 읽은 값을 같은 축으로 비교한다.
- `통합 조회`, `오더리스트 생성`, `어라이벌 생성` 3개 작업을 예약 관리 아래에서 병렬 작업으로 다룬다.
- 객실별, 날짜별, 지점별로 `정상 / 마감 / 불일치 / 확인 필요`를 빠르게 판독한다.
- 생성 작업은 운영자가 바로 쓰는 작업표와 어라이벌 보드 산출물로 이어진다.

## 이 앱이 아닌 것

현재 정체성상 이 앱은 다음을 전면에 내세우지 않습니다.

- 소비자용 예약 앱
- 예쁜 카드 중심 대시보드
- 설명을 많이 읽어야 이해되는 안내형 UI
- 자동 apply를 주목적으로 하는 쓰기 앱
- 세션/브라우저/토큰 상태를 운영자에게 계속 보여주는 도구

즉, 이 앱은 “업무를 설명하는 앱”이 아니라 “업무 사실을 판독하는 앱”입니다.

## 핵심 사용자

- 예약/재고 운영 담당자
- 지점 상태를 보는 관리자
- 체크인/체크아웃, 객실 상태, 채널 노출 상태를 맞춰 보는 현장 운영자

이 사용자들은 이미 Google Sheet 형태의 운영 시트에 익숙합니다. 따라서 앱은 완전히 새로운 소비자형 UI보다, 기존 시트의 사고 구조를 유지하면서 노이즈만 덜어낸 운영형 UI여야 합니다.

## 화면의 전체 형태

현재 앱의 전체 형태는 아래 4층으로 이해하면 됩니다.

1. 로그인/세션 진입
2. 좌측 운영 내비게이션
3. 메인 판독 화면
4. 우측 또는 하단 상세 레이어

### 1. 로그인/세션 진입

- WINGS 브라우저 세션을 재사용하는 진입 화면입니다.
- 앱이 직접 자격 증명을 저장하는 형태가 아니라, 공식 세션을 확인하고 그 세션을 운영 읽기 경로에 연결하는 형태입니다.

### 2. 좌측 운영 내비게이션

현재 제품 정체성 기준 상위 메뉴는 `예약 관리` 하나로 묶이고, 그 아래 작업 선택이 분기됩니다.

- 통합 조회
- 오더리스트 생성
- 어라이벌 생성

즉 이 화면은 메뉴를 많이 늘리는 앱이 아니라, 예약 관리 아래에서 서로 다른 운영 작업 3개를 병렬로 고르는 구조가 맞습니다.

### 3. 메인 판독 화면

메인 화면은 메뉴마다 구조가 달라집니다. 공통점은 “설명”보다 “판독 구조”를 우선한다는 점입니다.

#### 통합 조회

이 화면은 `날짜 가로축 + 객실 세로축`을 유지하는 `레이어 선택형 매트릭스`가 중심입니다.

대표 레이어는 다음과 같습니다.

- 판매가
- 채널상태
- 프로모션
- 검토필요

핵심 원칙:

- 한 셀에는 기본 상태 1개만 먼저 보인다.
- 색은 유지하되 의미를 텍스트와 함께 보여준다.
- 여러 의미를 한 번에 겹쳐서 읽게 하지 않는다.
- 필요하면 상세 레이어에서 원본 값으로 내려간다.

#### 오더리스트 생성

이 화면은 입력 폼이 아니라 `작업 큐`입니다.

시트의 원래 구조는 유지하되, 앱에서는 다음 순서로 더 짧게 판독하게 합니다.

- 객실번호
- 업무형태
- 시간
- 메모 유무

상단에는 작업량을 빠르게 읽는 요약 블록이 옵니다.

- 긴급클리닝
- 룸클리닝
- 룸메이크업
- 코멘트 있음

즉, 작업 목록의 정체성은 “입력 표”가 아니라 “정렬된 작업 대기열”입니다.

#### 어라이벌 생성

이 화면은 카드형 대시보드가 아니라 `A/B동 x Departure/Arrival 이중 보드`입니다.

핵심 축:

- Building B / Building A
- Departure / Arrival

직원들이 이미 익숙한 구조이기 때문에, 이 화면은 소비자형 UI로 바꾸기보다 보드 구조를 유지하는 편이 더 빠르게 읽힙니다.

반응형 방향:

- 데스크톱: 좌우 2-pane 보드
- 태블릿: 가변 split view
- 모바일: A동/B동 세그먼트 전환

### 4. 상세 레이어

상세는 별도 페이지보다 `컨텍스트 유지형 상세 레이어`가 중심입니다.

- 데스크톱: 우측 side sheet / inspector
- 모바일: bottom sheet

이 레이어는 본문을 가리지 않으면서 선택한 셀 또는 행의 근거만 보여주는 역할입니다.

현재 기준으로 상세에는 아래만 남기는 방향이 맞습니다.

- 선택된 항목의 현재 값
- 원본 값 매핑
- 관련 메모 또는 보조 값

반대로 장황한 상태 설명, 앱이 무엇을 했는지에 대한 서술형 메시지, 일반 사용자에게 직접 필요하지 않은 운영 문구는 빼는 것이 맞습니다.

## 현재 시각적 문법

현재 테마 기준선은 다음과 같습니다.

- light mode
- 낮은 라운드
- 과하지 않은 spacing
- 고밀도 표 중심
- 상태 색 유지

이 문법은 운영형 화면에 맞습니다. 다만 색만으로 의미를 전달하지 말고, 짧은 텍스트와 함께 써야 합니다.

## 현재 기술적 정체성

현재 `app_v2`는 Electron + React + TypeScript 기반의 데스크톱 앱 셸입니다.

구조적으로는 아래처럼 나뉩니다.

- `app_v2/main/*`: Electron main/runtime, provider 브라우저 세션, live read orchestration
- `app_v2/renderer/*`: 운영 셸 UI
- `src/desktop/app-v2-contracts.ts`: main/renderer 공유 계약
- `window.desktopApp`: renderer가 쓰는 IPC 브리지
- 최근 런타임 정리는 아래 3개를 중심으로 고정되었습니다.
  - synthetic fallback를 빼고 PMS → OTA → Sheet 순으로 live bundle을 순차 실행하도록 정렬.
  - provider/Wings live runtime은 공용 배타 실행기로 직렬화해 글로벌 fetch/module 충돌 가능성을 줄임.
  - `scripts/app_v2_runtime_verify.mjs`에서 `--json` 실행 시 빌드/프로브 실패를 구조화 payload로 복구.
  - `src/io/sheets_api.py`의 예외 메시지를 상태/원인 기반 텍스트로 정합화.

제품 정체성 관점에서 보면:

- 앱 = 운영 작업면
- 확장/브라우저 = 세션 브리지
- 시트/OTA/Wings = 읽기 소스
- mapping/audit = 판단 엔진

## 현재 구현 상태를 한 문장으로 말하면

현재 `app_v2`는 `운영 판단용 read-only 셸`로서의 형태와 계약은 유지되며, 현재 dirty 작업 상태 기준으로 다음 점검 상태입니다.

- pass: `app:check`, `app:build:main`, `regression_app_v2_live_bundle_contract`, `regression_app_v2_management_engine_contract`, `regression_app_v2_runtime_probe_contract`, `regression_app_v2_runtime_verify`, `regression_app_v2_runtime_safety_behavior`, `regression_app_v2_live_runtime_contract`, `regression_app_v2_runtime_safety_contract`, `regression_app_v2_runtime_readiness_contract`, `regression_app_v2_source_reservation_runtime`, `regression_app_v2_provider_storage_snapshot`, `regression_sheets_api_fetch_grid_range_py`, `regression_ops_workflow_py`, `regression_pms_reconcile_py`, `regression_app_v2_management_bridge_py`.
- remaining: 실제 운영 세션 smoke와 Windows 산출물 build는 아직 이 문서 범위 밖입니다.

즉:

- 제품 방향: 명확함
- UI 정체성: 운영형 판독 앱으로 수렴 중
- 기술 경계: read-only 운영 셸
- 남은 일: 운영 smoke, 실제 live read 증명, 패키징 검증

## 전달할 때 이렇게 설명하면 됩니다

이 앱은 예약 운영팀이 여러 시트와 OTA, PMS를 오가며 사실을 맞춰보던 일을 한 화면으로 모으기 위한 앱입니다. 중요한 것은 “보기 좋게 설명하는 것”이 아니라 “현재 상태를 빨리 판독하고, 어디를 사람이 확인해야 하는지 바로 아는 것”입니다. 그래서 화면은 카드형 소비자 앱이 아니라, 시트에 익숙한 직원이 바로 읽을 수 있는 통합 조회 매트릭스, 오더리스트 작업 큐, 어라이벌 보드 중심으로 설계됩니다.

## 참고 근거

- 제품 정의: [APP_PRODUCT_OPERATING_MODEL.md](/mnt/c/Users/anise/workspaces/reservation-system/docs/architecture/APP_PRODUCT_OPERATING_MODEL.md)
- 현재 핸드오프: [HANDOFF.md](/mnt/c/Users/anise/workspaces/reservation-system/docs/runtime/HANDOFF.md)
- 현재 상태: [TASK_STATE.md](/mnt/c/Users/anise/workspaces/reservation-system/docs/runtime/TASK_STATE.md)
- 현재 셸 구현: [App.tsx](/mnt/c/Users/anise/workspaces/reservation-system/app_v2/renderer/App.tsx)
