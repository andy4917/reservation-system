# Wings PMS HAR 결론 및 권장 적용

## 결론

- Wings PMS는 지점별로 별도 시스템을 두기보다 공통 화면/공통 API 위에 `PROPERTY_NO`, `BSNS_CODE`, 권한을 얹는 멀티 프로퍼티 구조에 가깝다.
- HAR에서 확인된 조회 흐름은 대부분 `search`, `select`, `view` 계열이며, 현재 프로젝트의 예약 검증 목적과 직접 연결할 수 있다.
- 실제 Wings 예약 목록은 `GET` 단일 URL보다 `POST + form body` 패턴이 핵심이다.
- 현재 확장 UI는 `partner.booking.naver.com`, `admin.admin-stationbyuhc.com`에만 주입되므로, 이번 단계에서는 PMS 내부 화면용 별도 API 캡처기보다 HAR 1건을 변환하는 방식이 구현 대비 가장 효율적이다.

## 기능 범위

- 예약 목록 조회: `searchListGlobalRsvn_v03.do`, `searchListRsvn.do`
- 예약 상세 조회: `searchFITReserv.do`
- 객실 가용/블록차트: `searchListRoomAvaiable.do`, `searchListRoomBlockChart_V03.do`
- 체크인/폴리오 보조 조회: `searchFITInHouse.do`, `searchListRateByWalkIn.do`, `searchListServiceByWalkIn.do`
- 메모/배정/계약 조회: `searchListInterMemo.do`, `searchListAssignedRoom.do`, `searchListAccountContract.do`

## 현재 엔드포인트 수(2026-03-05 기준)

- 프리셋으로 고정 사용: **2개**
  - `searchListGlobalRsvn_v03.do`
  - `searchListRsvn.do`
- 알려진 읽기 전용 카탈로그(어댑터 내): **11개**
- 런타임 허용 규칙: `/pms/biz/.../(search|select|view)*.do` 패턴 전체(읽기 전용 제한)
- 메뉴/권한 복원: `selectAllMenuList.do`, `selectUserInfo.do`

## 권장 변경

- PMS 예약 검증 입력값은 `URL 1개`만 받는 식으로 쓰지 말고, 요청 본문까지 저장 가능한 구조로 운영한다.
- 프리셋 기반 생성기를 두고 `PROPERTY_NO`, `BSNS_CODE`, `PAGE_ID`만 입력하면 URL과 본문이 자동 생성되게 한다.
- HAR 변환기는 읽기 전용 Wings 조회 요청만 골라 `PROPERTY_NO`, `BSNS_CODE`, `PAGE_ID`, URL, `requestBody`를 바로 복원하도록 둔다.
- Wings는 조회 자체도 감사 로그가 남으므로 읽기 전용 화이트리스트 엔드포인트만 사용한다.
- 날짜 범위는 `ARRV_DATE_F/T`, `STAY_DATE_F/T`, `DEPT_DATE_F/T`, `RSVN_DATE_F/T`처럼 실제 폼 키 기준으로 치환해야 한다.
- 예약 진실원본 우선순위는 일반 OTA/직판 예약은 Wings 우선, `STATION`/`NAVER` 수기 예약 블록은 시트 예외 허용으로 고정한다.
- 상태 모델은 `ACTIVE`, `CANCELED`만 사용한다. `NOSHOW`는 운영상 별도 종결 상태가 아니라 `ACTIVE + audit anomaly`로만 집계한다.
- remark와 시트 note는 exact-match보다 조건식 기반 비교가 안전하다.
  - exact ID
  - 날짜/OTA/객실 blocking
  - 이름/전화 끝자리/remark-note token overlap soft-match
  - soft-match 성립 기준: `3조건 이상 + 날짜 근거 1개 + OTA/객실 근거 1개`
- raw remark/payload는 저장하지 않고 이름 정규화, 전화 끝자리, token hash, soft key만 런타임 메타로 유지한다.

## 활용

- 시트 예약 블록과 Wings 예약 목록을 교차 검증해 누락, 취소 잔존, 날짜 차이, 객실 차이, OTA 차이, 박수 차이를 빠르게 찾을 수 있다.
- 지점 추가 시에도 엔드포인트 구조를 유지한 채 `PROPERTY_NO`, `BSNS_CODE`, 계정 권한만 교체해서 재사용할 수 있다.
- 메뉴 트리와 화면별 JS 파일 구조를 이용해 기능 맵 문서화와 추적 자동화의 기반 데이터로 쓸 수 있다.

## 추가 구현 포인트

- 현재 반영됨: `POST + form body` 기반 Wings 예약 조회 지원
- 현재 반영됨: PMS 인증 번들에 요청 방식(`method`, `contentType`, `requestBody`) 저장 가능
- 현재 반영됨: `Global Guest List`, `Reservation List` 프리셋 생성기와 `PROPERTY_NO/BSNS_CODE/PAGE_ID` 입력 UI
- 현재 반영됨: HAR JSON에서 읽기 전용 Wings 조회 요청을 자동 추출해 PMS 설정 필드를 채우는 변환 도구
- 다음 우선순위:
  - 읽기 전용 PMS 엔드포인트 카탈로그를 UI에서 선택형으로 제공
  - PMS 페이지 전용 content script 또는 네트워크 캡처 자동화를 붙일지 검토
