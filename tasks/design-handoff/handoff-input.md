# UI UX Handoff Input

## 1) Product Context
- Product name: Reservation Inventory Board Extension
- Platform: web
- Primary locale: ko-KR
- One-line value proposition: 운영자가 네이버/스테이션 재고와 구글 시트를 빠르게 비교하고, 안전하게 OTA 캘린더에 반영하도록 돕는 운영용 Chrome 확장.

## 2) Target Users
- Primary persona: 호텔/레지던스 운영 매니저(데스크톱 중심, 다량의 날짜/객실 데이터를 반복 처리).
- Secondary persona: 야간 당직/신입 운영자(실수 방지 가이드 필요, 교육 시간 짧음).
- Accessibility considerations:
  - 키보드만으로 날짜 선택/데이터 로드/동기화 실행 가능해야 함.
  - 저시력 사용자를 위한 고대비 상태 표현(성공/경고/오류) 필요.
  - 표 스크롤 중에도 헤더/첫 열 고정과 스크린리더 레이블이 유지되어야 함.

## 3) Goals And Success Metrics
- Business goal: 재고 불일치 수정 리드타임 단축 및 OTA 반영 오류 감소.
- User goal: 선택 기간 기준으로 사이트/시트 재고를 한 번에 검증하고, 위험 없는 단계별 승인 후 적용.
- Success metrics (quantified):
  - 데이터 로드 후 실제 적용까지 평균 완료 시간 40% 단축.
  - 동기화 실패율 5% 미만 유지.
  - 사용자 실수(잘못된 기간/잘못된 적용)로 인한 롤백 건수 50% 감소.
  - 신규 운영자 온보딩 시간 2시간 이내.

## 4) Information Architecture
List core screens/routes and purpose.

| Screen/Route | Purpose | Entry points | Exit points |
|---|---|---|---|
| Launcher (Floating CTA) | 현재 사이트 컨텍스트 확인 후 메인 작업 진입 | 네이버/스테이션 관리자 페이지 | Main Workspace |
| Main Workspace | 기간 선택, 데이터 로드, 요약 상태 확인 | Launcher | Compare Review / Sync Center / Settings |
| Compare Review | 사이트 vs 시트 비교, 보정 후보 확인/승인 | Main Workspace | Sync Center / Main Workspace |
| Sync Center | 실제 적용 ON/OFF, 실행, 결과/오류 확인 | Main Workspace / Compare Review | Result Detail / Main Workspace |
| Result Detail | 실패 원인, 날짜/객실 단위 재시도 판단 | Sync Center | Sync Center |
| Settings | 시트 연결, 스캔 좌표, 인증 정보 관리 | Main Workspace | Main Workspace |
| Debug Console (Advanced) | 로그/진단/내보내기 | Main Workspace | Main Workspace |

## 5) Key User Flows
Write each flow as numbered steps.

### Flow A: First-time onboarding
1. 운영자가 확장을 열면 현재 사이트(Naver/Station)와 작업 가능 상태를 확인한다.
2. 빠른 시작 체크리스트(시트 연결, 연도/시작행, 토큰 상태)를 완료한다.
3. 테스트 기간(예: 2일)으로 데이터 조회를 실행해 정상 응답을 확인한다.
4. 체크리스트 완료 시 본 작업 모드로 전환한다.

### Flow B: Core conversion action
1. 기간 선택 후 `사이트 재고 불러오기`와 `시트 재고 불러오기`를 순차 또는 일괄 실행한다.
2. 비교 리뷰 화면에서 불일치 요약/객실별 상세/자동보정 제안을 검토한다.
3. 적용 전 영향 범위(총 건수, 닫음 처리, 실패 예상)를 확인하고 승인한다.
4. 동기화를 실행하고 결과 상세에서 실패 건을 검토한 뒤 필요 시 재시도한다.
5. 완료 로그를 CSV/JSON으로 저장한다.

## 6) Wireframe Skeleton
Per screen, list section blocks and major components only.

### Screen: Home
- Section: 상단 상태바
- Section: 기간 선택 캘린더 + 빠른 기간 프리셋
- Section: 데이터 로드 컨트롤(사이트/시트)
- Section: KPI 요약 카드(조회/오픈/마감/선택기간)
- Section: 비교 테이블(사이트, 시트, 불일치 강조)
- Section: 보정 리뷰 박스(적용 내역, 이슈 요약)
- Section: 동기화 실행 패널(실행 토글, 실행 버튼, 결과 요약)
- Section: 설정/디버그 보조 패널
- Components:
  - Floating launcher button
  - Step progress indicator (1. 기간 2. 조회 3. 검토 4. 적용)
  - Status banner with severity pill
  - Sticky-column data tables
  - Split action buttons (primary vs secondary)
  - Collapsible error/debug drawers
  - Form fields with inline validation
  - Export actions (trace JSON/CSV, diff CSV)

## 7) States And Edge Cases
- Loading states:
  - 사이트/시트 로드를 개별 진행률로 표시.
  - 동기화 실행 중 전체 액션 잠금 + 취소 불가 안내.
- Empty states:
  - 기간 미선택, 데이터 없음, 불일치 없음을 각각 다른 문구/아이콘으로 구분.
- Error states:
  - 토큰 만료, API 타임아웃, 권한 오류, 부분 성공(일부 객실 실패)을 분리 표기.
- Offline/timeout behavior:
  - 재시도 버튼과 마지막 성공 시각 표시.
  - 장시간 응답 지연 시 백그라운드 처리 안내 및 로그 저장 가능.
- Permission denied behavior:
  - 시트 권한 없음/사이트 권한 없음 시 원인 + 해결 가이드(권한 범위, 재로그인) 제공.

## 8) Visual Direction
- Brand traits (3-5 adjectives): operational, trustworthy, high-signal, compact, decisive.
- Preferred references:
  - 데이터 운영 도구 스타일(Linear issue triage의 밀도, Notion database의 가독성, Google Sheets의 표 친화성).
  - 네이버/스테이션 브랜드 힌트는 색상만 약하게 반영하고 레이아웃은 일관 유지.
- Avoid list:
  - 과도한 라운드/장식성, 저대비 회색 텍스트, 의미 없는 애니메이션.
  - 한 화면에 우선순위 없는 버튼 과밀 배치.
  - 성공/오류 색상을 텍스트 없이 색으로만 구분.

## 9) Constraints
- Technical constraints:
  - Chrome MV3 content script + Shadow DOM 내부 UI.
  - 기존 기능 로직(스캔/비교/동기화)은 유지하고 UI 레이어 중심으로 개선.
  - 네이버/스테이션 2개 provider 테마를 지원하되 컴포넌트 구조는 단일화.
- Timeline constraints:
  - 2주 내 1차 UI 전면 개편 배포.
  - 1주 내 운영자 피드백 반영 패치.
- Regulatory/compliance constraints:
  - Google 토큰/클라이언트 비밀값 노출 최소화(마스킹, 표시 제어).
  - 운영 로그 내 민감정보(토큰, 전체 URL 쿼리) 자동 마스킹.

## 10) Delivery Expectations
- Required level of detail: implementation-ready design package
- Must include:
  - component specs
  - interaction details
  - design tokens
  - responsive behavior
  - accessibility checklist
