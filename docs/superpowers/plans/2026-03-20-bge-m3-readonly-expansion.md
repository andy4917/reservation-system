# BGE-M3 Readonly Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand BGE-M3 from a narrow continuation-candidate scorer into a read-only assistant for sheet-read normalization, reservation validation/edit recommendation, and ops preview review without enabling write/apply.

**Architecture:** Keep raw fetch and hard validation rule-based, then add a second-stage BGE scoring layer that only ranks ambiguous candidates and annotates review output. Reuse the existing `embeddingRuntime.ts` entry point, add focused text-bundle builders in main-process read paths, and surface AI evidence through existing read-only result payloads.

**Tech Stack:** TypeScript, Electron IPC, React renderer, Python read-only sheet bridge, Hugging Face Transformers.js (`Xenova/bge-m3`)

---

### Task 1: Lock Plan And Patch Boundaries

**Files:**
- Create: `docs/superpowers/plans/2026-03-20-bge-m3-readonly-expansion.md`
- Modify: `app_v2/main/liveReadActions.ts`
- Modify: `app_v2/main/reservationActionRunner.ts`
- Modify: `tests/regression_app_v2_phase2_contract.mjs`
- Modify: `tests/regression_app_v2_end_user_shell_contract.mjs`
- Create: `tests/regression_app_v2_bge_readonly_expansion.mjs`

- [ ] **Step 1: Write the failing test**

```js
assert.match(liveReadActions, /sheetCandidate|embedding:|BGE-M3/);
assert.match(reservationRunner, /build.*Score|validate|order-list|arrival/);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/regression_app_v2_bge_readonly_expansion.mjs`  
Expected: FAIL because the new read-only BGE expansion hooks do not exist yet.

- [ ] **Step 3: Write minimal implementation**

Add the smallest shared helpers and evidence strings needed to make the test target explicit.

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/regression_app_v2_bge_readonly_expansion.mjs`  
Expected: PASS

### Task 2: Expand Sheet-Read Post Processing

**Files:**
- Modify: `app_v2/main/liveReadActions.ts`
- Test: `tests/regression_app_v2_bge_readonly_expansion.mjs`

- [ ] **Step 1: Write the failing test**

```js
assert.match(liveReadActions, /runSheetRead/);
assert.match(liveReadActions, /embedding:/);
assert.match(liveReadActions, /candidate|review/i);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/regression_app_v2_bge_readonly_expansion.mjs`  
Expected: FAIL because sheet-read currently returns raw bridge items without BGE annotations.

- [ ] **Step 3: Write minimal implementation**

Add a post-process layer after the Python bridge payload that:
- builds lightweight text bundles from existing sheet items/evidence
- scores neighboring candidate pairs when BGE is available
- appends read-only AI evidence and candidate/review labels to the returned snapshot

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/regression_app_v2_bge_readonly_expansion.mjs`  
Expected: PASS

### Task 3: Expand Reservation Action Scoring

**Files:**
- Modify: `app_v2/main/reservationActionRunner.ts`
- Test: `tests/regression_app_v2_bge_readonly_expansion.mjs`

- [ ] **Step 1: Write the failing test**

```js
assert.match(reservationRunner, /validate/);
assert.match(reservationRunner, /order-list/);
assert.match(reservationRunner, /arrival/);
assert.match(reservationRunner, /scoreTextPairs/);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/regression_app_v2_bge_readonly_expansion.mjs`  
Expected: FAIL because only continuation candidates inside validate/edit are scored today.

- [ ] **Step 3: Write minimal implementation**

Extend the read-only runner to:
- score live ops rows for `order-list` and `arrival`
- annotate validate/edit rows with stronger evidence labels
- keep `compare`, `reconcile`, and `apply` in read-only/mock mode

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/regression_app_v2_bge_readonly_expansion.mjs`  
Expected: PASS

### Task 4: Surface Result Copy In Renderer And Verify

**Files:**
- Modify: `app_v2/renderer/App.tsx`
- Modify: `tests/regression_app_v2_phase2_contract.mjs`
- Modify: `tests/regression_app_v2_end_user_shell_contract.mjs`
- Create: `tests/regression_app_v2_bge_readonly_expansion.mjs`

- [ ] **Step 1: Write the failing test**

```js
assert.match(appSource, /BGE-M3/);
assert.match(appSource, /추천|검토|후보/);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/regression_app_v2_phase2_contract.mjs && node tests/regression_app_v2_end_user_shell_contract.mjs && node tests/regression_app_v2_bge_readonly_expansion.mjs`  
Expected: At least one FAIL because the renderer copy does not yet reflect the expanded BGE review role.

- [ ] **Step 3: Write minimal implementation**

Update summary/evidence copy so the UI clearly describes BGE-M3 as a read-only candidate-ranking assistant across sheet-read, validate/edit, and ops preview.

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/regression_app_v2_phase2_contract.mjs && node tests/regression_app_v2_end_user_shell_contract.mjs && node tests/regression_app_v2_bge_readonly_expansion.mjs && npx tsc -p tsconfig.json --noEmit && npm run app:check`  
Expected: PASS
