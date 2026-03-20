# Reservation Management Engineization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `compare`, `reconcile`, and `apply` placeholder paths in `app_v2` with a real read-only reservation-management engine that uses existing reconciliation logic and a dry-run apply planner without executing writes.

**Architecture:** Add a Python bridge dedicated to reservation-management actions. The bridge will load sheet blocks, optionally load source-record fixtures or future live source bundles, run `cross_validate_sheet_vs_sources`, summarize rows for compare/reconcile, and generate a dry-run apply patch plan with approval token output. TypeScript will call this bridge from `reservationActionRunner.ts` and keep write execution disabled.

**Tech Stack:** TypeScript, Electron IPC, Python bridge, `src.reconcile.sheet_reconcile`, `reservation_sheet_sync` guardrails concepts

---

### Task 1: Lock Contracts With Failing Tests

**Files:**
- Create: `tests/regression_app_v2_management_engine_contract.mjs`
- Create: `tests/regression_app_v2_management_bridge_py.py`
- Modify: `app_v2/main/reservationActionRunner.ts`
- Modify: `src/desktop/app-v2-contracts.ts`

- [ ] **Step 1: Write the failing test**

```js
assert.match(runner, /app_v2_reservation_management_bridge.py/);
assert.match(contracts, /planToken/);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/regression_app_v2_management_engine_contract.mjs && python3 tests/regression_app_v2_management_bridge_py.py`  
Expected: FAIL because no reservation-management bridge or apply-plan contract exists yet.

- [ ] **Step 3: Write minimal implementation**

Add the bridge file, optional contract fields, and runner references.

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/regression_app_v2_management_engine_contract.mjs && python3 tests/regression_app_v2_management_bridge_py.py`  
Expected: PASS

### Task 2: Add Compare/Reconcile Engine Bridge

**Files:**
- Create: `scripts/app_v2_reservation_management_bridge.py`
- Modify: `app_v2/main/reservationActionRunner.ts`
- Test: `tests/regression_app_v2_management_bridge_py.py`

- [ ] **Step 1: Write the failing test**

```python
assert payload["mode"] == "compare"
assert payload["issueCount"] > 0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 tests/regression_app_v2_management_bridge_py.py`  
Expected: FAIL because the bridge does not exist.

- [ ] **Step 3: Write minimal implementation**

Implement compare/reconcile using real `cross_validate_sheet_vs_sources` output and issue-row summarization.

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 tests/regression_app_v2_management_bridge_py.py`  
Expected: PASS

### Task 3: Add Dry-Run Apply Planner

**Files:**
- Create: `scripts/app_v2_reservation_management_bridge.py`
- Modify: `src/desktop/app-v2-contracts.ts`
- Modify: `app_v2/main/reservationActionRunner.ts`
- Test: `tests/regression_app_v2_management_bridge_py.py`

- [ ] **Step 1: Write the failing test**

```python
assert payload["planToken"]
assert payload["requiresApproval"] is True
assert payload["applyAllowed"] is False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 tests/regression_app_v2_management_bridge_py.py`  
Expected: FAIL because no dry-run apply plan exists yet.

- [ ] **Step 3: Write minimal implementation**

Generate a reservation patch plan and approval token without executing writes.

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 tests/regression_app_v2_management_bridge_py.py`  
Expected: PASS

### Task 4: Wire Runner And Verify Type Safety

**Files:**
- Modify: `app_v2/main/reservationActionRunner.ts`
- Modify: `tests/regression_app_v2_phase2_contract.mjs`
- Create: `tests/regression_app_v2_management_engine_contract.mjs`

- [ ] **Step 1: Write the failing test**

```js
assert.match(runner, /engineStatus/);
assert.match(runner, /planToken/);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/regression_app_v2_management_engine_contract.mjs`  
Expected: FAIL because the runner still returns placeholder summaries.

- [ ] **Step 3: Write minimal implementation**

Wire compare/reconcile/apply actions to the new bridge and preserve write-disabled behavior.

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/regression_app_v2_management_engine_contract.mjs && node tests/regression_app_v2_phase2_contract.mjs && npx tsc -p tsconfig.json --noEmit && npm run app:check`  
Expected: PASS
