# UI UX Handoff Input

## 1) Product Context
- Product name: UHS Multi-Host Ops Shell
- Platform: web
- Primary locale: ko-KR
- One-line value proposition: 운영자가 네이버, 스테이션, 시트, PMS 어디에서 작업하든 동일한 작업 셸 안에서 조회, 비교, 검토, 승인, 반영, 결과 확인 흐름을 안정적으로 수행하도록 돕는 운영용 Chrome 확장.
- Current product reality:
  - Existing UI is not a real cross-host shell.
  - It behaves like a temporary helper panel layered on top of OTA pages.
  - Current implementation is injected only on Naver and Station pages; Sheet and PMS are currently treated as data inputs rather than first-class host workspaces.
- Design mandate:
  - This is a redesign task, not a polish task.
  - Do not preserve the current right-fixed large panel as the main interaction model.
  - Reframe the product as a host-independent operations shell with host-specific workspaces.

## 2) Target Users
- Primary persona: 호텔/레지던스 운영 매니저
  - Desktop-heavy usage
  - Repeated date-room inventory and reservation review tasks
  - Needs fast risk scanning before action
- Secondary persona: 야간 당직 / 신입 운영자
  - Needs clear next action
  - Needs strong guardrails before approval or apply
  - Should understand current host, status, and step within 3 seconds
- Accessibility considerations:
  - Keyboard-only operation for launcher, task selection, scope selection, compare review, approval, and result review
  - Status cannot be conveyed by color only; text labels are mandatory for read-only, compare-enabled, apply-enabled, blocked, success, failure
  - Screen reader users must hear host context, current task, current step, blockers, and next action in predictable order

## 3) Goals And Success Metrics
- Business goal:
  - Reduce mismatch review time
  - Reduce wrong-period and wrong-target apply errors
  - Make the extension usable across Naver, Station, Sheet, and PMS with one shell model
- User goal:
  - Understand current host, current task, current step, and next action immediately
  - Review results before tools
  - Move through `조회 -> 비교 -> 검토 -> 승인 -> 반영 -> 결과 확인` without losing context
- Success metrics (quantified):
  - Users can identify current host / current task / current step / next action within 3 seconds
  - Time from open shell to first valid compare result reduced by 30%+
  - Wrong range / wrong target apply incidents reduced by 50%+
  - Main task completion occurs without page obstruction complaints on all supported hosts
  - Users report no persistent scroll conflict between host page and shell in usability testing

## 4) Information Architecture
List core screens/routes and purpose.

| Screen/Route | Purpose | Entry points | Exit points |
|---|---|---|---|
| Minimal Entry Shell | Persistent but low-obstruction shell showing host context, status, and task launcher | Any supported host page | Workspace, Secondary Utility |
| Host Context Layer | Show host, branch/document/hotel, account connection, permission state, last query/compare/apply status | Entry Shell | Task Launcher |
| Task Launcher | Present task choices in work language | Entry Shell, Workspace | Host Workspace |
| Workspace | Main task area for current host and current step | Task Launcher | Approval Preview, Result/Report |
| Approval Preview | Show impact, blockers, preview before apply | Workspace | Apply, back to Review |
| Result / Report | Show success/failure/partial success, logs, export, retry path | Workspace, Approval Preview | Workspace, Secondary Utility |
| Secondary Utility | Settings, logs, debug, ops info separated from main workflow | Entry Shell, Result / Report | Previous screen |

Additional IA rules:
- Common shell structure must be shared across all hosts.
- Main workspace must branch by host.
- Internal labels like `메인`, `동기화`, `설정`, `운영` must not be used as primary navigation.
- Primary navigation must use task language:
  - 재고 조회/비교
  - 예약 읽기/검증
  - 시트 매핑/검토
  - PMS 대조
  - 동기화 실행
  - 결과/리포트 확인

## 5) Key User Flows
Write each flow as numbered steps.

### Flow A: Shell entry and task orientation
1. User opens the shell from a supported host.
2. Shell shows current host, current object context, account/connection state, permission state, and last run state.
3. User selects a task from the task launcher.
4. Workspace opens at the correct step with blockers and next action visible.

### Flow B: OTA inventory compare and apply (Naver / Station)
1. User enters from Naver or Station host.
2. Shell reads host context first and mirrors host-selected range if the host already defines a date range.
3. User confirms scope only if needed; date tools must not dominate first view.
4. User runs inventory fetch and compare against Sheet snapshot.
5. Workspace shows KPI summary before any input tools:
   - target period
   - target rooms
   - compare count
   - mismatch count
   - risk count
   - apply-ready count
6. User reviews mismatch queue and opens detail comparison for selected items.
7. User opens approval preview and confirms impact range.
8. User executes apply.
9. User lands on result/report view with success, failure, partial success, retry target, and export path.

### Flow C: Sheet review and snapshot preparation
1. User enters from Sheet context or launches Sheet-focused task.
2. User selects sheet source, tab, and range.
3. User reviews room / room-type mappings.
4. User reviews reservation block rules.
5. User creates a snapshot for downstream comparison.
6. Result state shows snapshot readiness and unresolved mapping or rule issues.

### Flow D: PMS reservation audit
1. User enters from PMS context or launches PMS-focused task.
2. User runs reservation read.
3. User reviews room mapping and stay-date validation.
4. User compares PMS reservations against OTA and Sheet snapshots.
5. User reviews differences, anomaly types, and unresolved pairs.
6. User exits with report-ready state; this host does not expose OTA apply as its primary action.

### Flow E: Results and evidence review
1. User opens results/report after compare or apply.
2. User sees summary first:
   - success
   - partial success
   - failure
   - blocked
   - retry available
3. User optionally opens logs, debug, exports, and ops evidence in Secondary Utility, not inside main workspace.

## 6) Wireframe Skeleton
Per screen, list section blocks and major components only.

### Screen: Minimal Entry Shell
- Section: Host context summary
- Section: Current task / current step / next action
- Section: Task launcher
- Section: Utility entry points
- Components:
  - Host badge
  - Object context line (branch / doc / hotel)
  - Permission state indicator
  - Last action status
  - Task launcher list
  - Open workspace action

### Screen: Workspace
- Section: Step header
- Section: Preconditions and blockers
- Section: KPI summary strip
- Section: Review queue / worklist
- Section: Detail comparison pane
- Section: Approval preview trigger
- Section: Single primary action rail
- Optional Section: Scope tools drawer
- Components:
  - Current step marker
  - Blocker summary
  - KPI metrics
  - Compare list
  - Detail diff viewer
  - Approval preview panel
  - Primary action button

### Screen: Result / Report
- Section: Result summary
- Section: Error / partial success queue
- Section: Retry targets
- Section: Export actions
- Section: Evidence links to logs / debug / ops info

### Screen: Secondary Utility
- Section: Settings
- Section: Logs
- Section: Debug
- Section: Ops information

Required wireframe behavior:
- Main workflow and secondary utility must be separated.
- Calendar / date picking must be hidden until scope editing is invoked.
- Onboarding checklist must be collapsed or moved to first-run only context.
- Avoid nested box-inside-box-inside-box composition. Use hierarchy by order, grouping, spacing, and typography.

## 7) States And Edge Cases
- Global states:
  - host unresolved
  - context ready
  - read-only
  - compare enabled
  - apply enabled
  - blocked
  - loading
  - compare ready
  - approval required
  - applying
  - partial success
  - success
  - failure
- Scope states:
  - scope inherited from host
  - scope defined in shell
  - scope mismatch between host and shell
  - stale snapshot
- Empty states:
  - no host context
  - no snapshot
  - no mismatch
  - no apply-ready items
  - no PMS match candidates
- Error states:
  - auth expired
  - connection lost
  - mapping missing
  - compare blocked by missing prerequisite
  - apply blocked by permission or unresolved risk
  - partial fetch
  - partial apply
- Special edge cases:
  - Host already has its own date range UI; shell must not introduce a competing source of truth
  - Sheet and PMS may not support apply; shell must show this as capability limitation, not as hidden functionality
  - When the host changes during an open session, workspace must invalidate stale work and require re-confirmation
  - When mappings are incomplete, comparison may be allowed but apply must remain blocked with explicit reason

## 8) Visual Direction
- Brand traits:
  - operational
  - restrained
  - high-signal
  - review-first
  - decisive
- Fixed visual reference:
  - Use the user-provided reference image as the spatial and proportion reference.
  - Borrow only the structural composition:
    - slim side launcher rail
    - single dominant floating workboard
    - thin context strip
    - soft surrounding field
    - spacious central canvas with clear focal hierarchy
  - Do not borrow consumer-chat content patterns from the reference:
    - no hero welcome copy
    - no mascot
    - no promotional cards
    - no chatbot-style input dock as the main task surface
- Direction:
  - Emphasize workflow clarity over visual uniformity
  - Results and blockers must appear before tools
  - Prefer text hierarchy, spacing, and order over decorative cards and borders
  - Visual emphasis should follow severity, step, and next action
- Avoid list:
  - preserving the current large right-side floating panel as primary shell
  - persistent large calendar in the first viewport
  - internal category tabs such as `메인 / 동기화 / 설정 / 운영`
  - checklist-centered main screen
  - stuffing settings, debug, and logs into the main work area
  - host-specific skinning without actual host-specific workspace behavior

## 9) Constraints
- Technical constraints:
  - Chrome MV3 content script + Shadow DOM internal UI
  - Existing logic for scan, compare, report, and apply remains; this phase redesigns structure, workflow, and UI architecture
  - Current codebase injects on Naver and Station only, but the shell must be designed as if Sheet and PMS are first-class hosts
  - Need a viewport-fit behavior for the workspace surface so the shell preserves intended proportions across laptop widths and varying host layouts
- Product constraints:
  - Do not solve this with color, rounded corners, spacing cleanup, or other surface-only changes
  - Do not keep the right-fixed panel and only restyle it
  - Do not merge all host needs into one identical panel body
  - Do not keep calendar, checklist, settings, and ops info permanently visible in one screen
  - Do not use internal labels as primary navigation
- Scope constraints:
  - This is still design stage, not implementation
  - Do not prescribe framework, CSS strategy, or code structure
  - Focus on IA, workflow, layout hierarchy, states, and handoff-level instructions
- Timeline constraints:
  - Need handoff-ready redesign package that design and engineering can act on immediately

## 10) Delivery Expectations
- Required level of detail: implementation-ready design handoff without code
- Must include:
  - structural diagnosis of why current UI fails
  - explicit rationale for discarding the current structure
  - full IA for common shell and host-specific branches
  - explicit adoption/rejection judgment for the proposed `UniversalWorkShellApp` container structure
  - step-by-step task flow from entry to result
  - screen hierarchy rules:
    - always visible
    - on-demand only
    - secondary utility only
  - viewport ratio / fit behavior for the floating workspace surface
  - keep / modify / remove / hold classification where relevant
  - P0 / P1 / P2 redesign priorities
  - success criteria
  - assumptions and unresolved dependencies
- Preferred emphasis:
  - designer/developer handoff language
  - concrete directives instead of abstract adjectives
  - operational safety and review clarity over visual polish
