# Handoff

- updated_at: 2026-03-18T22:50:13+09:00
- branch: `codex/reference-ledger-shell`
- commit: `fd37173`
- status: verified handoff snapshot

## What Is Done
- Stage 1 minimal live-read path is implemented as a main-owned bundle.
- Stage 2 mapping core v1 is implemented with truth signals, exact alias/identity auto binding, soft-triage retention, and precision metrics.
- Operator export, search index, handoff history, and UI surfaces now expose precision and soft-triage state.
- Default app shell UI was refreshed to a ledger-style dark-sidebar / bright-panel layout without widening product scope.

## What Is True Now
- The product is still read-only by contract.
- `node scripts/live_read_verify.mjs --json` currently reports `offline-preview`.
- The immediate cause is environment availability, not product-path breakage:
  - `sheet-unconfigured`
  - `provider unavailable`
  - `wings unavailable`

## Where To Look First
- runtime status: [PLAN.md](/mnt/c/Users/anise/OneDrive/바탕%20화면/예약%20통합%20관리%20시스템/docs/runtime/PLAN.md)
- task snapshot: [TASK_STATE.md](/mnt/c/Users/anise/OneDrive/바탕%20화면/예약%20통합%20관리%20시스템/docs/runtime/TASK_STATE.md)
- stage/v1 checklist: [STAGE_V1_CHECKLIST.md](/mnt/c/Users/anise/OneDrive/바탕%20화면/예약%20통합%20관리%20시스템/docs/runtime/STAGE_V1_CHECKLIST.md)

## Code Surfaces
- live read contract: [liveReadRuntime.ts](/mnt/c/Users/anise/OneDrive/바탕%20화면/예약%20통합%20관리%20시스템/app/main/liveReadRuntime.ts)
- truth and auto binding: [truthCatalogRuntime.ts](/mnt/c/Users/anise/OneDrive/바탕%20화면/예약%20통합%20관리%20시스템/app/main/truthCatalogRuntime.ts), [mappingTruthRuntime.ts](/mnt/c/Users/anise/OneDrive/바탕%20화면/예약%20통합%20관리%20시스템/app/main/mappingTruthRuntime.ts), [mappingAutoBindingRuntime.ts](/mnt/c/Users/anise/OneDrive/바탕%20화면/예약%20통합%20관리%20시스템/app/main/mappingAutoBindingRuntime.ts)
- mapping metrics: [bindingArtifacts.ts](/mnt/c/Users/anise/OneDrive/바탕%20화면/예약%20통합%20관리%20시스템/app/services/bindingArtifacts.ts)
- operator handoff/export: [operatorExportRuntime.ts](/mnt/c/Users/anise/OneDrive/바탕%20화면/예약%20통합%20관리%20시스템/app/main/operatorExportRuntime.ts), [operatorHandoffStore.ts](/mnt/c/Users/anise/OneDrive/바탕%20화면/예약%20통합%20관리%20시스템/app/main/operatorHandoffStore.ts)
- search surface: [searchRuntime.ts](/mnt/c/Users/anise/OneDrive/바탕%20화면/예약%20통합%20관리%20시스템/app/main/searchRuntime.ts)
- UI shell: [AppHeader.tsx](/mnt/c/Users/anise/OneDrive/바탕%20화면/예약%20통합%20관리%20시스템/app/renderer/components/AppHeader.tsx), [AppSidebar.tsx](/mnt/c/Users/anise/OneDrive/바탕%20화면/예약%20통합%20관리%20시스템/app/renderer/components/AppSidebar.tsx), [app.css](/mnt/c/Users/anise/OneDrive/바탕%20화면/예약%20통합%20관리%20시스템/app/renderer/styles/app.css)

## Verification Used
- `npm run app:check`
- `npm run app:build:main`
- `node tests/regression_app_binding_artifacts.mjs`
- `node tests/regression_app_mapping_auto_binding_runtime.mjs`
- `node tests/regression_app_operator_export_runtime.mjs`
- `node tests/regression_app_search_runtime.mjs`
- `node --experimental-vm-modules tests/regression_app_ui_store_live_wings_flow.mjs`
- `node scripts/live_read_verify.mjs --json`

## Remaining Risks
- Real `read-live` success cannot be claimed until the external sheet/provider/wings environment is restored.
- UI runtime-path regression still depends on `--experimental-vm-modules`.
- Write/apply remains intentionally out of scope.

## Next Recommended Action
1. Restore live environment inputs and rerun `node scripts/live_read_verify.mjs --json`.
2. If `read-live` is available, revalidate inventory/audit flows against the same run context.
3. Only after that, decide whether v1 closes here or whether a v1.1 write/apply track is needed.
