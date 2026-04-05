# 예약 통합관리 앱 전환 저장소

현재 저장소는 데스크톱 앱 중심 전환을 진행 중이며, Chrome MV3 확장은 인증/세션/DOM 브리지로 축소하는 중입니다.

가장 먼저 읽을 문서:

- 제품 정의 / 왜 만드는지 / v1 범위: `docs/architecture/APP_PRODUCT_OPERATING_MODEL.md`
- 재구현 순서 / 운영 경로 중심 로드맵: `docs/architecture/APP_IMPLEMENTATION_ROADMAP.md`
- 현재 앱 경계 규칙: `docs/architecture/APP_V2_OPERATING_CONTRACT.md`

## 문서 구조

- 루트: `README.md`, `AGENTS.md`만 유지
- 아키텍처/전환 문서: `docs/architecture/`
- 시트 문서: `docs/sheets/`
- 연동 문서: `docs/integrations/`
- 작업 인계/세션 메모: `tasks/handoffs/`

## 코드 스켈레톤

- `app_v2/main/`: Electron main 런타임, IPC, provider/session orchestration
- `app_v2/renderer/`: renderer shell, 화면 상태, 사용자 조작면
- `src/desktop/`: 앱 계약, 런타임 정책, shared defaults
- `src/core_bridge/`: Python/C++ bridge wrapper와 parity entrypoint
- `src/domain/`: 운영 규칙, 정책, canonical domain logic
- `src/io/`: 외부 소스 fetch/adapter
- `src/report/`: operator/export/report formatting
- `src/scan/`: sheet scan, normalize, aggregation
- `scripts/`: build/verify/bridge 실행 스크립트
- `tests/`: regression 및 parity check
- `truth_dataset/`: truth-set spec, validator input, fixture contract

아키텍처 참고:
- 제품/운영 기준선: `docs/architecture/APP_PRODUCT_OPERATING_MODEL.md`
- 운영 재개 순서: `docs/architecture/APP_IMPLEMENTATION_ROADMAP.md`
- 현재 앱 경계 규칙: `docs/architecture/APP_V2_OPERATING_CONTRACT.md`
- OTA Adapter Layer: `docs/integrations/OTA_ADAPTER_LAYER.md`
  - 운영 모드: NAVER 직접 API, BOOKING/AGODA/TRIP/AIRBNB는 WINGS HAR 기반
- Inventory Planner: `docs/integrations/INVENTORY_PLANNER.md`

## Python/C++ 런타임 권장 상태

- Python runtime 고정: `python3.10`
- Native module 유지: `inventory_cpp_core.cpython-310-x86_64-linux-gnu.so`
- 제거 대상: `inventory_cpp_core.cpython-311-*.so`
- Wrapper 기본 모드(운영): `INVENTORY_CPP_MODE=auto`
- 강제 검증 모드: `INVENTORY_CPP_MODE=required`

빌드 산출물 관리:
- `build/`와 `*.so`는 산출물로 취급하며 저장소 추적 대상이 아닙니다.
- 필요 시 시스템 Python 3.10에서 재빌드:

```bash
python3.10 setup.py build_ext --inplace
```

## 브리지 대상 페이지

- `https://partner.booking.naver.com/*`
- `https://admin.admin-stationbyuhc.com/*`

## 로그인 없이 동작(내장 인증 모드)

기본값은 `OFF`입니다. 소스 코드에는 더 이상 실제 OAuth 비밀값을 넣지 않으며, 기본 운영은 설정 패널 저장값 또는 로컬 비공개 빌드만 사용해야 합니다.

위치:
- `src/constants.js`
- `EMBEDDED_AUTH_MODE`
- `EMBEDDED_AUTH`

필수 값:
1. `clientId`
2. `clientSecret`
3. `refreshToken`

권장 값:
1. `spreadsheet`
2. `sheetName`
3. `startRow`
4. `year`
5. `stockMode`

동작 방식:
- 실행 시 `refreshToken`으로 `access_token`을 자동 발급/갱신
- 사용자 OAuth 로그인 화면 없이 시트 조회 가능
- 주의: 실제 `clientSecret`/`refreshToken`은 저장소에 커밋하지 말고 로컬 전용 값으로만 사용

## 현재 주요 축

- 데스크톱 앱 실행 폴더: `app_v2/`
- 브리지 전용 확장:
  - 세션 캡처
  - 현재 탭 context
  - DOM snapshot
- 확장 UI 패널 런타임은 제거 중이며, 메인 조작면은 앱으로 이동합니다.

## 앱 실행

`app_v2/` 폴더에서 바로 실행합니다.

```bash
cd app_v2
npm start
```

Windows에서 WSL 경로로 앱을 띄울 때는 `scripts/run-app-windows.cmd`를 사용합니다.

## 확장 브리지 설치

직접 로드할 폴더는 `extension/` 입니다.

1. `chrome://extensions` 접속
2. `개발자 모드` 활성화
3. `압축해제된 확장 프로그램 로드` 클릭
4. `extension/` 폴더 선택

압축/배포용 산출물이 필요하면 아래 명령으로 별도 패키징합니다.

```bash
./tasks/build_extension_unpacked.sh
```

- 스크립트는 `python3`가 없으면 가능한 패키지 매니저(`apt`, `dnf`, `yum`, `pacman`, `brew`, `winget`, `choco`)로 자동 설치를 시도합니다.

주의:
- 현재 확장은 메인 작업 UI가 아니라 브리지 역할만 담당합니다.
- 메인 사용자 플로우는 `app_v2/` 아래 데스크톱 앱 런타임으로 이동했습니다.

## SSO 세션 재사용 / 인증 번들

- 설정 패널의 `현재 사이트 인증 번들(JSON)` 영역에서 `현재 세션 캡처`를 누르면 현재 브라우저 컨텍스트의 인증 상태를 JSON으로 저장하거나 복사할 수 있습니다.
- 네이버는 쿠키/CSRF/(선택)role, 스테이션은 bearer 토큰을 번들에 담습니다.
- 번들을 저장한 뒤 같은 브라우저 컨텍스트에서 다시 실행하면, 확장이 저장된 번들을 기준으로 세션을 다시 주입한 뒤 요청을 재시도합니다.
- 외부 Python 재검증도 같은 번들을 사용할 수 있습니다.

예시:

```bash
python3 reservation_sheet_sync.py \
  --provider naver \
  --auth-bundle-file ./naver_auth_bundle.json
```

## PMS API 맵

- Station 조회: `GET https://api.admin-stationbyuhc.com/admin/branch/{branchId}/calendar`
- Station 적용: `PATCH https://api.admin-stationbyuhc.com/admin/branch/{branchId}/apply/price-set`
- Naver 객실 목록: `GET https://api-partner.booking.naver.com/v3.1/businesses/{businessId}/biz-items`
- Naver 일별 스케줄 조회: `GET https://api-partner.booking.naver.com/v3.0/businesses/{businessId}/biz-items/{bizItemId}/daily-schedules`
- Naver 재고 적용: `POST https://api-partner.booking.naver.com/v3.0/businesses/{businessId}/biz-items/{bizItemId}/stock-schedules`
- Naver 판매일 적용: `POST https://api-partner.booking.naver.com/v3.1/businesses/{businessId}/biz-items/{bizItemId}/sale-schedules`
- Naver 인증 헤더: `Cookie`, `x-csrf-token`, `x-booking-naver-role(선택)`
- Station 인증 헤더: `Authorization: Bearer ...`

## Wings PMS 예약 검증 연동

- 현재 확장에는 시트 예약과 PMS 예약 목록을 대조하는 읽기 전용 검증 훅이 있습니다.
- `WINGS/PMS 예약목록 API URL`에는 조회 엔드포인트를 넣고, `WINGS/PMS 인증 번들(JSON)`에는 인증 정보와 요청 방식을 함께 넣을 수 있습니다.
- 설정 패널에서 `Wings PMS 조회 프리셋`에 `Global Guest List` 또는 `Reservation List`를 고르면 `PROPERTY_NO`, `BSNS_CODE`, `PAGE_ID`만으로 조회 템플릿을 자동 생성할 수 있습니다.
- PMS 페이지 전용 content script가 아직 없으므로, 현재는 특정 PMS 내부 API를 별도로 붙이는 것보다 HAR 1건에서 실제 조회 요청을 복원하는 방식이 가장 구현 대비 효율적입니다.
- 설정 패널의 `WINGS HAR(JSON)`에 브라우저 HAR를 붙여넣으면 읽기 전용 Wings 조회 요청 1건을 골라 `PROPERTY_NO`, `BSNS_CODE`, `PAGE_ID`, URL, `requestBody`를 자동으로 채웁니다.
- 이제 `GET`뿐 아니라 `POST + application/x-www-form-urlencoded` 요청도 지원합니다.
- `requestBody` 안에 날짜 키가 이미 들어 있으면, 실행 시 선택한 조회 기간으로 자동 치환됩니다.
- 예약 상태 모델은 `ACTIVE`, `CANCELED` 두 개만 운영에 사용합니다.
- `NOSHOW`는 사용자 UI에 별도 상태로 노출하지 않고 `ACTIVE + audit anomaly`로만 집계합니다.
- 시트 note와 Wings remark는 exact-match가 아니라 `exact ID -> 날짜/OTA/객실 blocking -> 이름/전화/remark-note token soft-match` 순서로 비교합니다.
- soft-match는 `7조건 중 3개 이상 + 날짜 근거 1개 + OTA/객실 근거 1개`일 때만 성립합니다.
- 시트에만 있는 `STATION`, `NAVER` 예약 블록은 수기 OTA 예외로 보고 `PMS 누락 오류`로 세지지 않습니다.

Wings Global Guest List 예시:

```json
{
  "method": "POST",
  "contentType": "form",
  "headers": {
    "x-requested-with": "XMLHttpRequest"
  },
  "requestBody": "take=300&skip=0&page=1&pageSize=300&filter[PAGE_ID]=IR04_0100X_V03&filter[AUTH_PASS_YN]=N&filter[filters][0][field]=BSNS_CODE&filter[filters][0][value]=91&filter[filters][1][field]=PROPERTY_NO&filter[filters][1][value]=91&ARRV_DATE_F=20260228&ARRV_DATE_T=20260307"
}
```

권장 URL 예시:

```text
https://pms.sanhait.com/pms/biz/ir04_0100X/searchListGlobalRsvn_v03.do
```

주의:

- 쓰기 계열 `update`, `insert`, `delete`, `send` 엔드포인트는 연결하지 않는 것이 안전합니다.
- HAR 기준으로는 `search`, `select`, `view` 계열만 읽기 전용 화이트리스트로 보는 것이 적절합니다.
- PMS 요청은 짧은 재시도/타임아웃으로 동작하며, 캐시 키에는 토큰/쿠키 원문 대신 지문만 남깁니다.

## 적용 안전장치

- 확장 UI의 실제 apply는 전역 토글과 현재 OTA별 허용 설정을 모두 통과해야 실행됩니다.
- 기본값:
  - Station 실제 적용 허용: `ON`
  - Naver 실제 적용 허용: `OFF`
- 결과 요약 상단에 `적용 차단 사유` 패널이 표시되며, scan warn 승격, sheet warn 승격, 저신뢰 소스, 설정 차단 사유를 바로 확인할 수 있습니다.
- 저장된 sync 설정의 민감정보(`clientSecret`, token, auth bundle`)는 background worker에서 암복호화한 뒤 `chrome.storage.local`에는 암호문만 저장합니다.
- 원문 note/remark/PMS payload/HAR payload/plain token/cookie는 영속 저장하지 않고, 예약번호/날짜/OTA/객실/전화 끝자리/이름 정규화/토큰 해시 같은 최소 메타만 런타임에서 유지합니다.

## 수동 좌표 운영

- 수동 좌표 입력은 설정 패널의 기본 설정 섹션에서만 처리합니다.
- `좌표 모드`, `날짜/요일 기준 행`, `수동 범위` 입력과 preview는 운영 상세가 아니라 기본 설정으로 유지됩니다.
- 시트 배치가 크게 바뀌지 않는 범위에서는 자동 탐색을 우선 사용하고, 날짜행이나 타입 범위가 흔들릴 때만 manual ranges를 채워 고정합니다.

## 골든셋 export

- 설정 패널 `운영 전용` 섹션의 `골든셋 JSON+CSV 저장` 버튼은 현재 메모리 기준 정규화 데이터를 즉시 내보냅니다.
- 생성 파일:
  - `golden_set_manifest_*.json`
  - `site_inventory_*.csv`
  - `sheet_inventory_*.csv`
  - `pms_reservations_*.csv`
  - `sheet_reservation_blocks_*.csv`
  - `reservation_pairs_*.csv`
  - `reservation_mismatches_*.csv`
  - `policy_issues_*.csv`
  - `scan_trace_*.json`

## 테스트 실행

전체 회귀:

```bash
INVENTORY_CPP_MODE=required python3.10 tests/run_regressions.py
```

개별 실행 예시:

```bash
node tests/regression_pms_fetch_wings_post.mjs
python3 tests/regression_sync_guardrails_py.py
```

COEX HAR 기반 읽기 전용 통합 점검:

```bash
./tasks/dryrun_coex_readonly.sh
```

## 폴더 정리

- `debug/`: 디버그 JSON 산출물
- `logs/`: 실행 로그(`*.log`) 보관 폴더
