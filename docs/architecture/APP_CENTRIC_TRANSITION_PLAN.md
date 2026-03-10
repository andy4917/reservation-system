# 앱 중심 예약관리 전환 분류 계획

## 목적

- 목표: 확장 주도 UX를 축소하고, 사용자 기준 메인 플로우를 앱 중심으로 재구성한다.
- 기본값:
  - v1 우선순위는 `조회·검증·복사용 출력`
  - 브라우저 제어는 `기존 열린 탭만 사용`
  - 확장이 남더라도 `무UI 브리지/백그라운드 보조`로 축소한다.
- 이번 문서는 구현 지시서가 아니라, 구조 선택 전에 기능을 분류하고 비교할 수 있게 하는 제안형 계획서다.

## 관측 사실

- 현재 저장소는 `manifest.json` 기반 Chrome MV3 확장이다.
- 기존 사용자 가시 UX는 주로 `src/ui/*`, `src/sheetScanner.entry.js`에 있었으나, 해당 확장 패널 런타임은 제거되고 브리지 전용 확장으로 축소 중이다.
- 브라우저 세션/쿠키 브리지는 `src/background.js`, `src/scan/normalize.js`에 있다.
- OTA 조회는 `src/io/pms.fetch.js`에서 API 우선 후 DOM fallback/merge를 사용한다.
- WINGS/PMS 읽기 전용 요청은 `src/pms/wings.adapter.js`와 `docs/integrations/WINGS_PMS_INTEGRATION.md`에 정리되어 있다.
- 앱 메인 셸은 `app/` 아래에서 새로 구축 중이며, 확장은 `src/extensionBridge.entry.js` 중심의 브리지 역할만 남긴다.

## UNKNOWN / 가정

- 미확인: WINGS/PMS 조회 품질이 auth bundle + HAR만으로 항상 유지되는지 여부
- 미확인: 실운영에서 Naver/Station API 저커버리지 분기가 얼마나 자주 발생하는지 여부
- 미확인: 실제 apply를 앱으로 분리할 때 쓰기 인증/감사 조건을 동일하게 유지할 수 있는지 여부
- 가정: 앱 런타임 선택은 이번 단계 범위 밖이며, 기능 분류 이후 결정한다.

## 기능 인벤토리 및 3분류

분류 기준:

- `app-first`: `document/window/chrome` 없이 처리 가능하거나, API/OAuth/auth bundle/HAR 기반으로 앱이 최종 소유하기 적합한 기능
- `bridge-candidate`: 현재 열린 탭의 세션/쿠키/토큰/DOM 문맥이 필요하지만, 사용자에게 확장 UI를 노출하지 않고 브리지화 가능한 기능
- `hold`: API와 DOM fallback이 혼합되었거나, 앱 대체 경로는 보이지만 인증/읽기 전용/커버리지 안전성이 아직 미확인인 기능

| 기능명 | 입력 | 처리 | 출력 | 현재 진입점 | 브라우저 의존 | 세션 의존 | API·OAuth 대체 가능성 | 분류 | 근거 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 호스트 진입/Task gate | 현재 호스트, provider 상태 | direct-entry host 판정, task 접근 제한 | 시작 가능/차단 상태 | legacy `src/ui/productFlow.js`, new `app/` shell | 현재는 앱으로 이동 중 | 예 | 앱 상태 관리로 대체 가능 | `app-first` | 현재 UX 문제의 중심이며, 기능 자체는 앱 셸이 더 자연스럽게 소유 가능 |
| 설정 관리 | 지점, 시트, OAuth, PMS preset, auth bundle | sanitize, 저장, 복원, 보조 미리보기 | 저장된 설정, 설정 상태 | legacy `src/sheetScanner.entry.js`, target `app/` settings | 현재는 앱으로 이동 중 | 부분 있음 | 앱 저장소 + 앱 비밀 저장으로 대체 가능 | `app-first` | 값 편집/저장은 본질적으로 앱 책임이며, 현재도 주로 데이터 정규화 중심 |
| 시트 조회·스캔 | spreadsheet, sheetName, row/range, token | Sheets API 조회, 좌표 해석, 스냅샷 구성 | 시트 snapshot, block/model | `src/io/sheets.fetch.js`, `src/scan/*` | 없음 | Google auth 필요 | 가능 | `app-first` | 브라우저 DOM 없이 API와 스캔 로직으로 동작 |
| OTA 조회 | 날짜 범위, provider, 현재 인증 재료 | Naver/Station API 조회, coverage 평가, DOM merge | provider rows | `src/io/pms.fetch.js`, bridge `src/extensionBridge.entry.js` | 현재 혼합 | 예 | 부분 가능, API 우선 + 저커버리지 시 브리지 필요 | `bridge-candidate` | 작은 PoC에서 두 provider 모두 API-only 정상 경로는 통과했지만, 저커버리지 입력에서는 DOM merge가 커버리지를 실질 복구했다. |
| PMS 예약 검증 | WINGS URL, auth bundle/HAR, 시트/OTA 데이터 | 읽기 전용 요청 구성, 응답 정규화, 예약 매칭 | mismatch, anomaly, 검증 결과 | `src/pms/wings.adapter.js`, `src/report/reservationVerification.js`, `docs/integrations/WINGS_PMS_INTEGRATION.md` | 부분 있음 | 예 | HAR/auth bundle로 일부 대체 가능 | `hold` | 읽기 전용 경로는 있으나 세션 지속성과 앱 단독 운영 품질은 미확인 |
| 재고 diff/검증 | 시트 snapshot, provider rows, 정책 | diff 계산, 최대값/경고/차단 검증 | mismatch list, approval context | `src/engine/rules.js`, `src/report/validator.js`, `src/report/reservationVerification.js` | 없음 | 없음 | 가능 | `app-first` | 정책/검증 엔진은 UI와 브라우저에 묶이지 않음 |
| 결과 요약·로그·오류 표시 | 조회/검증/apply 결과 | KPI, 상태, blocker, error render | 결과 화면, 경고, 로그 | target `app/renderer/*` | 앱으로 이동 중 | 없음 | 앱 UI로 대체 가능 | `app-first` | 사용자가 실제 보는 주 플로우이며 앱 소유가 맞음 |
| 복사용 출력·artifact export | loaded rows, snapshot, trace, report | copy text 생성, CSV/JSON bundle 생성 | 복사 텍스트, CSV/JSON 파일 | target `app/services/*`, `src/report/*` | 현재는 일부 `document` 사용 | 없음 | 앱 파일 저장/클립보드로 대체 가능 | `app-first` | 업무 핵심이 결과 수집/정리/표시 후 사람 손 후처리라는 요구와 직접 일치 |
| 실제 apply | diff preview, approval, provider actions | Station/Naver 쓰기 요청 실행 | apply result, partial/fail summary | target app service + bridge write path, `src/channel_executors/*` | 현재는 호스트/세션에 묶임 | 예 | 이론상 가능하나 쓰기 안전성 미확인 | `hold` | v1 핵심 목표 밖이고, 인증/감사/승인 경계 재설계가 필요 |
| 세션 캡처·복원 | 현재 열린 탭, providerType, cookie/token | 쿠키 export/import, bearer 추출, auth bundle 구성 | 구조화된 auth bundle, 세션 준비 상태 | `src/scan/normalize.js`, `src/background.js` | 필수 | 필수 | 앱 단독 대체 어려움 | `bridge-candidate` | 쿠키/토큰은 현재 브라우저 컨텍스트에서만 직접 추출 |
| DOM 기반 보정·fallback | 현재 페이지 DOM, API 결과, query | DOM snapshot 추출, API 결과와 merge | 보완된 rows, 커버리지 보정 | `src/io/pms.fetch.js` | 필수 | 보통 예 | 대체 경로 미확정 | `bridge-candidate` | 현재 코드가 `querySelectorAll` 기반 DOM rows와 API rows를 병합 |

### 분류 집계

- `app-first`: 6개
- `bridge-candidate`: 3개
- `hold`: 2개

해석:

- 사용자 메인 플로우의 대부분은 앱으로 옮길 후보가 이미 우세하다.
- 남는 브라우저 의존은 주로 `세션 확보`, `DOM 보정` 두 축이다.
- 핵심 미확정 리스크는 `OTA 저커버리지 분기 빈도`, `WINGS 세션 지속성`, `실제 apply 경계`다.

## 앱 기준 메인 플로우

사용자는 아래 흐름만 보면 전체 작업을 이해할 수 있어야 한다.

1. 앱에서 지점, 기간, 필요한 설정을 선택한다.
2. 앱에서 데이터 수집을 실행한다.
3. 앱이 시트/OTA/PMS 결과를 수집하고 필요한 경우 브리지 상태를 함께 표시한다.
4. 앱에서 검증 결과, 경고, 차단 사유를 확인한다.
5. 앱에서 복사용 출력 또는 artifact export를 생성한다.
6. 사용자는 앱 결과를 바탕으로 사람 손 후처리를 진행한다.

앱 셸 v1 책임:

- 설정 편집과 저장
- 작업 실행 시작점
- 결과 뷰어
- 로그/오류 표시
- 복사용 출력과 export
- 브리지 필요 여부와 상태 표시

확장 브리지 책임:

- 현재 열린 탭의 세션 확인
- 현재 열린 탭의 쿠키/토큰/읽기 전용 페이지 데이터 추출
- 앱으로 구조화된 결과 전달

확장이 하지 않는 일:

- 사용자 직접 클릭 시작
- 패널/팝업/사이드패널 기반 주 플로우
- 결과 표시의 주 화면

## 공개 계약과 경계

이름은 고정하지 않되 계약 자체는 아래로 고정한다.

### 앱 → 브리지 요청 계약

- `provider`
- `capability`
  - `session-only`
  - `dom-snapshot`
  - `readonly-page-extract`
- `tabContext`
  - 현재 열린 탭 식별 정보
  - 현재 URL/host
- `query`
  - 날짜 범위
  - provider별 조회 파라미터

### 브리지 → 앱 응답 계약

- `sessionAvailable`
- `authMaterial`
  - cookie/token/csrf/auth bundle 등 구조화된 인증 재료
- `domUsed`
- `payload`
  - 읽기 전용 추출 데이터 또는 DOM snapshot
- `failure`
  - 실패 사유
  - 재시도 가능 여부

### 기능 분류 결과 계약

- `classification`
  - `app-first`
  - `bridge-candidate`
  - `hold`
- `reason`
- `appReplacementPath`
- `remainingRisks`

이번 단계에서 확정하지 않는 항목:

- RPC 이름
- 전송 기술
- Electron/Tauri/PySide 선택
- 탭 정리 방식

## 구조안 3개 비교

| 안 | 개요 | 남는 확장 책임 | 사용자 플로우 차이 | 주요 리스크 |
| --- | --- | --- | --- | --- |
| 권장안 | 앱 중심 + 무UI 확장 브리지 | 세션 캡처, DOM snapshot, 읽기 전용 페이지 추출 | 사용자는 앱만 보고 작업하고, 필요 시 앱이 브리지 상태만 안내 | OTA 조회의 DOM 의존이 예상보다 높으면 일부 기능이 늦게 드러날 수 있음 |
| 대안 | 앱 단독 우선 + DOM 의존 기능 보류 | 없음 또는 최소 세션 입력 수동화 | 앱에서 API/HAR/auth bundle 기반 작업만 먼저 수행 | Naver/Station/WINGS 일부 커버리지 저하 가능성 |
| 보류안 | 하이브리드 유지 + 앱 전환 준비 | 현재 확장 런타임 대부분 유지, UI만 후면화 | 앱은 결과 소비자 역할부터 시작 | UX 전환 효과가 약하고 확장 중심 구조가 오래 남을 수 있음 |

### 권장안

- 앱이 설정/실행/결과/복사 출력을 모두 소유한다.
- 확장은 무UI 브리지로만 남긴다.
- 현재 코드 기준 가장 현실적이다.
- 근거:
  - `src/io/pms.fetch.js`에 이미 DOM fallback 경계가 분리되어 있다.
  - `src/scan/normalize.js`, `src/background.js`에 세션 브리지 축이 분리되어 있다.
  - 사용자가 실제로 소비하는 주 결과물은 이미 표/로그/복사/export 중심이다.

### 대안

- 앱에서 API/HAR/auth bundle 기반 조회·검증만 먼저 가져온다.
- DOM fallback과 live session 추출은 v1에서 제외한다.
- 확장 잔존을 최소화할 수 있지만, 현재 운영 커버리지가 낮아질 수 있다.

### 보류안

- 확장 런타임을 유지하되 UI를 후면화한다.
- 앱은 결과 소비/정리 화면부터 맡는다.
- DOM/세션 의존 비중이 생각보다 높을 때만 쓰는 위험 완충안이다.

## 결정 게이트

### 권장안 채택 조건

- 사용자 메인 플로우가 앱 화면만으로 완결된다.
- 확장 잔류 기능이 `세션 캡처`, `DOM snapshot`, `읽기 전용 추출` 수준으로 축소된다.
- 실제 apply를 v1 핵심 목표에서 제외해도 업무 가치가 유지된다.

### 대안 채택 조건

- DOM 필수 기능이 핵심 업무를 막지 않는다.
- auth bundle/HAR/API만으로 운영 검증 품질이 수용 가능하다.

### 보류안 채택 조건

- 핵심 기능 다수가 live DOM 또는 브라우저 세션 없이는 성립하지 않는다.
- 특히 API 커버리지 부족 시 DOM merge가 빈번하다.

## 검증 기준

### 분류 테스트

- 각 기능에 대해 아래 중 하나를 근거와 함께 표시한다.
  - `DOM 불필요`
  - `세션만 필요`
  - `API/OAuth/HAR 대체 가능`
  - `현재는 혼합`
- `src/io/pms.fetch.js`처럼 API+DOM 혼합 기능은 자동으로 `hold` 또는 `bridge-candidate` 우선 검토 대상으로 둔다.

### UX 테스트

- 앱만 보는 사용자가 문서 한 장으로 전체 흐름을 이해할 수 있어야 한다.
- 문서상 확장 클릭, 패널 열기, 사이드패널 사용, 확장 직접 조작 단계가 0건이어야 한다.

### 구조 테스트

- 기능 수 기준으로 `app-first`, `bridge-candidate`, `hold` 개수를 집계한다.
- 확장 잔류 기능마다 왜 앱이 아닌지 한 줄 근거를 남긴다.
- 구조안 3개 모두에 대해 남는 확장 책임, 사용자 플로우 차이, 주요 리스크를 같은 형식으로 비교한다.

## 판단 보류 기능과 PoC 우선순위

1. OTA 조회 DOM 의존 제거 가능성
   - 이유: `src/io/pms.fetch.js`에서 API failure/coverage 부족 시 DOM merge가 실제로 사용된다.
   - 확인 항목: Naver/Station 각각 DOM 없이 허용 가능한 coverage 임계치
2. WINGS/PMS 앱 단독 조회 품질
   - 이유: HAR/auth bundle 경로는 보이지만 세션 유지와 재실행 안정성은 미확인이다.
   - 확인 항목: auth bundle만으로 반복 조회 가능한지, 읽기 전용 보장이 충분한지
3. 실제 apply 분리 여부
   - 이유: 쓰기 인증, 승인, 감사 경계를 앱과 브리지 사이에 새로 정의해야 한다.
   - 확인 항목: apply를 v1 밖으로 두어도 운영 가치가 유지되는지, 후속 단계에서 session-only write가 가능한지

### OTA 조회 작은 PoC 결과

- 실행 근거: `tests/regression_ota_dom_fallback_poc.mjs`
- 범위: 3일 x 3객실 preset grid를 기준으로 `admin-station`, `naver-partner` 각각 `API-only 정상 경로`와 `API 저커버리지 + DOM merge 경로`를 비교
- 관측:
  - 두 provider 모두 API가 full grid를 주는 경우 DOM 없이 coverage 기준을 통과했다.
  - 두 provider 모두 API를 3행 수준으로 낮추면 DOM merge 후에만 coverage 기준을 다시 통과했다.
  - 두 provider 모두 API 오류를 강제하면 DOM-only fallback으로 coverage 기준을 다시 통과했고, `fetchProviderRows` 계측 카운터가 `API직행 / API+DOM / DOM대체`를 누적 기록했다.
  - 따라서 OTA 조회는 `app-first`로 닫기보다, `API 우선 + 필요 시 DOM 보정`을 가진 `bridge-candidate`로 옮기는 편이 현재 코드/검증 결과와 맞다.
- 미확인:
  - 위 PoC는 코드 하네스 기반이며, 실운영 세션에서 저커버리지 분기가 얼마나 자주 발생하는지는 별도 계측이 필요하다.

### 운영 계측

- `src/io/pms.fetch.js`는 provider별로 `api_only_accept`, `api_dom_merge`, `dom_only_fallback` 누적 카운터와 마지막 fetch 메타를 `App.runtime.providerFetchInstrumentation`에 기록한다.
- legacy 확장 패널에서는 상태 문구가 조회 경로와 세션 누적치를 함께 표시했으나, 현재는 동일 계측을 앱 셸로 옮기는 방향으로 전환 중이다.

## 현재 권장 결론

- 현재 기준 권장안은 `앱 중심 + 무UI 확장 브리지`다.
- 이유는 앱으로 옮길 수 있는 기능 수가 우세하고, 남는 브라우저 의존이 `세션 확보`와 `DOM 보정`으로 비교적 명확하게 모이기 때문이다.
- OTA 조회는 작은 PoC 기준 `bridge-candidate`로 올릴 수 있고, WINGS 조회와 실제 apply만 추가 판단이 남아 있다.
