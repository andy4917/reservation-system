# App Single Source Blueprint

Last updated: 2026-04-04
Status: canonical
Applies to: `app_v2`, Electron main/renderer, provider bridges, live-read runtime, mapping/audit core, export/handoff

## 1. Purpose

This document is the single source of truth for the app's product shape, runtime boundaries, architecture, user flow, and implementation judgment.

If another document conflicts with this one, this document wins.

This document is intentionally not a pure ideal-state spec. It is a reconciliation document that aligns:

- the original UX handoff intent
- the current codebase reality
- the target operating model
- the missing and weak areas that still need to be closed

## 2. Document Precedence

Document precedence for product and implementation judgment is:

1. `docs/architecture/APP_SINGLE_SOURCE_BLUEPRINT.md`
2. `docs/architecture/APP_V2_OPERATING_CONTRACT.md`
3. `docs/architecture/APP_IMPLEMENTATION_ROADMAP.md`
4. `docs/architecture/APP_PRODUCT_OPERATING_MODEL.md`
5. `tasks/design-handoff/handoff-input.md`

Interpretation rules:

- `APP_SINGLE_SOURCE_BLUEPRINT.md` defines what the app is.
- `APP_V2_OPERATING_CONTRACT.md` defines runtime truth and path boundaries.
- `APP_IMPLEMENTATION_ROADMAP.md` defines execution order.
- `APP_PRODUCT_OPERATING_MODEL.md` remains useful background, but is no longer the top-level canonical design source.
- `tasks/design-handoff/handoff-input.md` is historical design input, not the final authority.

## 3. Product Definition

The product is an Electron-based operations app.

It is not a Chrome-extension-first helper panel and not a generic browser overlay. The extension and browser-facing surfaces exist to capture session and host context, but the app itself is the main operating surface.

The app's v1 purpose is:

`An operator can open one app, choose branch and scope, read current state from Sheet + OTA + Wings using real runtime paths, inspect mismatch/anomaly/unresolved items with evidence, and complete human review/export without relying on write automation.`

This means:

- the app is read-first
- the app is truth-first
- the app is review-first
- the app is evidence-first
- apply is not treated as the defining success condition for v1

## 4. Canonical Product Shape

The canonical product shape is a layered operations shell:

1. App Shell
2. Feature Modules
3. Core Decision Engine
4. Auth and Runtime Bridge Layer
5. Evidence and Handoff Layer

### 4.1 App Shell

The shell owns:

- branch selection
- scope selection
- task switching
- current status and next-action visibility
- review-first workspace composition
- result and export entry points

The shell must be the operator's main surface.

The shell must not:

- invent product truth
- show placeholder success as if it were a real result
- expose raw session internals as the main UI
- collapse logs, settings, debug, and main work into one undifferentiated screen

### 4.2 Feature Modules

Feature modules are independent operating workflows that consume common runtime and engine outputs.

Canonical v1 modules are:

- PMS read and reservation audit
- OTA read and inventory compare
- Sheet read and snapshot review
- Reservation-management review actions
- Evidence/export handoff

Module rule:

- a module may orchestrate a workflow
- a module must not define its own private truth model
- a module must not bypass the core engine when the engine owns the matching or decision basis

### 4.3 Core Decision Engine

The earlier phrase `core search engine` is too weak and slightly misleading for this repository.

The canonical term is:

`Core Decision Engine`

This layer is not a generic search subsystem. It is the shared operating core that turns raw source inputs into canonical facts and reviewable outputs.

The core engine owns:

- source normalization
- room alias mapping
- reservation identity mapping
- branch-aware matching
- unresolved queue generation
- anomaly and verification classification
- recommendation as assistive logic only

The core engine must not own:

- renderer state
- provider window lifecycle
- login UX
- host-specific UI flow
- fake/demo output generation

### 4.4 Auth and Runtime Bridge Layer

Authentication is a runtime responsibility, not a renderer responsibility.

This layer exists because some providers are only accessible through active session state and some sources are better represented by direct configuration-based access.

Canonical split:

- Session-auth providers: Electron-managed provider windows and session evidence
- Config-auth providers: `.env` or settings-backed credentials where direct configuration access is appropriate

Rules:

- session-only providers must use runtime session paths
- `.env` must not be used to fake or replace a human-authenticated browser session when the real source depends on live session state
- renderer only sees explicit readiness and evidence summaries
- renderer may launch provider browser windows and show auth guidance, but it must not pretend to collect provider credentials as the primary auth path
- auth material is never treated as product output

### 4.5 Evidence and Handoff Layer

The app's direct result is not only on-screen review. It must produce evidence and operator-handoff outputs that let a human finish the job.

This layer owns:

- review summaries
- evidence lineage
- export formats
- copy-ready outputs
- run metadata

## 5. Canonical Runtime Model

The runtime model is:

- Electron main = runtime orchestration truth
- renderer = thin operator control surface
- extension/browser bridges = session/context intake helpers
- Python/domain modules = source read, canonicalization, and report generation helpers

This is consistent with the current operating contract and is mandatory.

The renderer must not unlock product claims from readiness-only probes.

Probe, smoke, verify-only, fixture, replay, and placeholder paths remain non-default paths unless explicitly promoted through a documented contract change.

## 6. Canonical Authentication Model

The original planning note correctly separated authentication by mechanism, but the final design must be stricter.

### 6.1 Session-auth path

Use for:

- Wings PMS
- Naver partner
- Station admin
- any provider where effective access depends on a live authenticated browser/session surface

Implementation shape:

- Electron main owns provider window lifecycle
- provider operating adapter derives readiness from raw browser/runtime signals
- live reads are allowed only after explicit readiness is established
- renderer shows only actionable readiness summaries

### 6.2 Config-auth path

Use for:

- Google Sheet or other configured integrations
- local runtime toggles and model paths
- explicit API-based credentials when the source is contractually config-based

Implementation shape:

- `.env` or settings-backed values are read in config/runtime layers only
- renderer never reaches into env directly

### 6.3 Prohibited auth shortcuts

Do not:

- replace session-auth providers with `.env` credentials just for convenience
- treat HAR bundles as permanent auth strategy
- expose raw cookies, tokens, or auth bundles in operator-facing UI

## 7. Canonical End-to-End Flow

The canonical v1 end-to-end flow is:

1. Operator opens the app.
2. Operator chooses branch and scope.
3. App verifies source readiness.
4. App reads Sheet, OTA, and Wings through real runtime/config paths.
5. Core Decision Engine normalizes and joins source facts.
6. App computes compare, audit, unresolved, and review outputs.
7. Renderer shows results, blockers, and next action before secondary tools.
8. Operator reviews evidence and export outputs.
9. Human operator performs final external action when needed.

Apply, if included later, is an additional controlled path. It is not allowed to redefine what v1 is.

## 8. Canonical UI Structure

The final UI direction should keep the useful parts of the earlier handoff while aligning to the app-centered product shape.

Canonical screens are:

- Entry Shell
- Host and Runtime Context Strip
- Task Launcher
- Workspace
- Approval Preview
- Result and Report
- Secondary Utility

Interpretation for the current repository:

- these are app-shell concepts, not extension-overlay-only concepts
- `host` means active provider/runtime context, not only current browser tab
- `Secondary Utility` must remain separate from the main workflow

UI rules:

- results and blockers before tools
- date controls should not dominate first view
- review queue and evidence must be first-class surfaces
- settings/debug/logs stay secondary
- task labels should describe operator work, not internal implementation buckets

## 9. Current Implementation Alignment

The current repository already aligns with this blueprint in several important ways:

- Electron main is already treated as runtime orchestration truth.
- Renderer is already structured as a thin control surface with explicit actions.
- Provider readiness is already derived from raw runtime signals in a dedicated adapter.
- The app is already trending toward a module-based shell rather than a browser-overlay-first UI.
- The codebase already separates read paths, orchestration, and domain/report helpers.

Current implementation also shows the intended layered shape:

- shell-level module switching in `app_v2/renderer/App.tsx`
- runtime/provider readiness in `app_v2/main/providerOperatingAdapter.ts`
- readiness gating in `app_v2/main/runtimeReadiness.ts`
- live-read orchestration in `app_v2/main/liveReadActions.ts`
- branch/runtime profile resolution in `app_v2/main/branchRuntimeConfig.ts`

Current branch/runtime scope is:

- active operator branches: `COEX`, `GANGNAM`, `SEOLLEUNG`
- truth-mapped but runtime-inactive branch: `SAMSUNG`
- session-auth provider paths: `wings-pms`, `naver-partner`, `admin-station`

## 10. Reconciliation Gaps

This section defines what is still missing or under-specified.

### 10.1 Product identity gap

Problem:

- historical docs split the product identity between `Chrome extension shell` and `Electron app shell`

Final rule:

- Electron app is the product
- extension/host runtime is a bridge layer

Required follow-up:

- all future design and implementation docs must describe the app as app-centered

### 10.2 Core engine naming and boundary gap

Problem:

- `search engine` language is too broad and risks pulling unrelated logic into one bucket

Final rule:

- use `Core Decision Engine` as the canonical term
- search/recommendation is only one responsibility inside the wider shared decision core

Required follow-up:

- future docs should avoid describing the core as a generic search system

### 10.3 Authentication boundary gap

Problem:

- the planning note says `background login + .env` but does not define where each one is allowed

Final rule:

- session-auth and config-auth are separate, explicit paths
- `.env` is not a substitute for session-dependent providers

Required follow-up:

- auth docs and implementation notes must classify every provider by auth type

### 10.4 UX architecture gap

Problem:

- the historical handoff describes a stronger IA than the current app actually implements

Current weakness:

- `Approval Preview`, `Result/Report`, and `Secondary Utility` are not yet fully separated as first-class surfaces
- host-aware workspace specialization is still shallow
- current renderer still exposes implementation-driven labels and structure in some places

Final rule:

- UI must converge on the canonical screen structure in this document
- reservation-management IA should visibly separate `read proof`, `review`, `edit preparation`, `apply-possible`, and `operations output`

### 10.5 Live-read completeness gap

Problem:

- code structure is ahead of fully proven live-read runtime coverage

Current weakness:

- real session-auth read paths now exist for PMS, Naver OTA, and Station in Electron main
- renderer now exposes per-source live-read proof cards from actual read evidence and readiness state
- live operator proof for the full external environment is still pending in this checkout state

Final rule:

- fixture or readiness success must never be presented as operating success
- runtime proof depends on actual source reads and visible operator outputs
- live-read proof UI must be driven by actual evidence (`sessionReadiness`, `runtimeHost`, `sourceLineage`, provider/session state), not synthetic copy

### 10.6 Apply-scope gap

Problem:

- apply exists conceptually but is not yet justified as the defining v1 path

Final rule:

- read-only truth, review, and export remain the primary v1 goal
- apply stays gated until auth, audit, and operator boundary documentation are explicit
- current app_v2 `apply` surface is limited to `apply-possible` calculation only
- current apply scope is restricted to sheet-derived NAVER + STATION inventory actions against OTA management surfaces
- real OTA write execution remains disabled in the product runtime until a later contract change explicitly promotes it

## 11. Fill-in Requirements

These are the sections that must be filled or tightened in follow-up work whenever the design is operationalized.

### 11.1 Provider classification table

Must explicitly list for each provider:

- source type
- auth type
- runtime owner
- readiness signals
- read capability
- write capability
- fallback policy

Current implementation baseline:

| Target | Source type | Auth type | Runtime owner | Readiness signals | Read capability | Write capability | Fallback policy |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Google Sheets | configured API integration | config-auth | config layer + Electron main readiness check | spreadsheet configured, sheet name present, Google token valid | yes | no | fail explicitly when settings or env auth are missing |
| Wings PMS | browser session surface | session-auth | Electron main provider workspace | expected host/path, provider cookies, non-login route | yes | no | do not replace with `.env`; operator must log in through the app-owned browser window |
| Naver Partner | browser session surface | session-auth | Electron main provider workspace | expected host/path, non-login route, provider cookies or recognized surface | yes | apply-possible calculation only; real write disabled | do not replace with `.env`; operator must log in through the app-owned browser window |
| Station Admin | browser session surface | session-auth | Electron main provider workspace | expected host/path, non-login route | yes | apply-possible calculation only; real write disabled | do not replace with `.env`; operator must log in through the app-owned browser window |

### 11.2 Core engine contract

Must explicitly define:

- raw input contracts
- canonical output contracts
- unresolved and anomaly taxonomy
- confidence and review thresholds
- recommendation boundary

### 11.3 Shell-to-module contract

Must explicitly define:

- what the shell passes into a module
- what a module may return
- what states are considered blocking vs reviewable
- what evidence is required before a module can claim completion

### 11.4 Result and handoff contract

Must explicitly define:

- on-screen summary requirements
- export file types
- evidence lineage requirements
- operator replay and retry surfaces

## 12. Strengthening Requirements

These are not blank sections; they already exist partially and need to be made stricter.

### 12.1 Runtime truth

Strengthen:

- all runtime and readiness claims must be traceable to Electron main evidence

### 12.2 Renderer thinness

Strengthen:

- renderer must remain orchestration-lite and presentation-heavy
- synthetic success, cached demo truth, and hidden fallbacks remain prohibited

### 12.3 Review-first workflow

Strengthen:

- KPI, blockers, unresolved items, and next action must appear ahead of settings/debug/config surfaces

### 12.4 Read-first v1 definition

Strengthen:

- roadmap, tests, and docs must keep v1 centered on trusted read/audit/export, not premature apply automation

## 13. Final Unified Standard

From this point forward, the unified standard for the app is:

- product form: Electron operations app
- primary user surface: app shell
- extension role: session/context bridge
- core shared logic: Core Decision Engine
- v1 value: trusted read, compare, audit, review, evidence, export
- auth split: session-auth vs config-auth
- runtime truth owner: Electron main
- renderer role: thin control surface
- quality gate: real end-to-end runtime evidence, not fixture-only success

Any future design, implementation, or review proposal should be evaluated against those statements first.

## 14. Relationship To Historical Documents

Use historical documents as follows:

- `tasks/design-handoff/handoff-input.md`: preserve as UX source material and layout intent
- `docs/architecture/APP_PRODUCT_OPERATING_MODEL.md`: preserve as product rationale and staging background
- `docs/architecture/APP_IMPLEMENTATION_ROADMAP.md`: preserve as execution-order document

Do not use any of those three documents alone as the top-level source of truth anymore.
