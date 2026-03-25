# Packaging, Room Alias, Guard Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore app packaging/runtime safety, remove COEX room alias overmatching, and return guard checks to green with aligned docs/contracts.

**Architecture:** Keep runtime asset resolution explicit so packaged builds do not depend on repository-root source files. Centralize the COEX alias truth table so Python, JS, and extension policy paths agree on the same room identities without heuristic spillover. Tighten hygiene scanning so machine-local path checks catch real leaks without flagging intentional test fixtures or registry URLs.

**Tech Stack:** TypeScript, Electron, Python, Node.js packaging scripts, regression tests

---

### Task 1: Reproduce Current Guard and Packaging Failures

**Files:**
- Read: `package.json`
- Read: `scripts/check_contract_hygiene.py`
- Read: `tests/regression_app_v2_*`
- Read: `tests/regression_coex_room_alias_*`

- [ ] Run `npm run app:check` and `python3 scripts/check_contract_hygiene.py --cwd .`
- [ ] Run the packaging and room-alias regression tests called out in the review
- [ ] Record exact failure causes before editing code

### Task 2: Fix Packaged Runtime Asset Resolution

**Files:**
- Modify: `app_v2/main/providerDataRuntime.ts`
- Modify: `app_v2/main/wingsReservationRuntime.ts`
- Modify: `app_v2/main/liveReadActions.ts`
- Modify: `app_v2/main/reservationActionRunner.ts`
- Modify: `package.json`
- Modify: `scripts/build_app_v2_portable.mjs`
- Modify: `scripts/build_app_v2_installer.mjs`
- Test: `tests/regression_app_v2_portable_package_contract.mjs`
- Test: `tests/regression_app_v2_installer_package_contract.mjs`

- [ ] Write or extend failing regression coverage for packaged runtime asset lookup
- [ ] Update runtime path resolution so packaged builds can load required JS/Python assets from packaged resources
- [ ] Update packaging manifest/scripts to include required runtime assets
- [ ] Run packaging regression tests until green

### Task 3: Fix COEX Room Alias Overmatching and Contract Drift

**Files:**
- Modify: `src/reconcile/sheet_reconcile.py`
- Modify: `src/scan/sheet_scan.py`
- Modify: `src/report/reservationVerification.js`
- Modify: `extension/src/shared/syncPolicy.js`
- Test: `tests/regression_coex_room_alias_py.py`
- Test: `tests/regression_coex_room_alias_js.mjs`

- [ ] Write or extend failing tests that prove `B112` does not expand to `112` and `A121` does not expand to `1121`
- [ ] Align JS/Python/extension alias sources on the same canonical mappings
- [ ] Re-run the alias regression tests and any affected runtime contract tests

### Task 4: Restore Guard Hygiene Signal and Rename Misleading Installer Contract

**Files:**
- Modify: `scripts/check_contract_hygiene.py`
- Modify: `package.json`
- Modify: `scripts/build_app_v2_installer.mjs`
- Modify: `docs/runtime/APP_V2_WINDOWS_INSTALLER.md`
- Test: `tests/regression_app_v2_runtime_safety_behavior.mjs`

- [ ] Narrow absolute-path detection to actual leaks instead of test fixture paths or registry URLs
- [ ] Rename or clarify the Windows portable build path so scripts and docs no longer imply NSIS installer output
- [ ] Re-run `npm run app:check` plus affected regression coverage

### Task 5: Full Verification

**Files:**
- Verify only

- [ ] Run `npm run app:check`
- [ ] Run `npm run extension:contracts:check`
- [ ] Run Python and Node regression suites touched by the changes
- [ ] Summarize any remaining unverified risk explicitly if something still cannot be exercised
