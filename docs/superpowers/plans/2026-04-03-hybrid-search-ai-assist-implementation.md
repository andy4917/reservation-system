# Hybrid Search AI Assist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace narrow `adjacent_stay` and `note_overlap` candidate handling with a shared hybrid search engine plus AI assist flow that controls variables explicitly, ranks with BGE-M3 only after rule evaluation, and abstains on weak or conflicting evidence.

**Architecture:** Keep Google Sheets loading and ops artifact generation in the existing Python bridge, but expand the bridge payload so Node receives enough normalized candidate data to run one shared hybrid decision engine. The new engine will evaluate features and contradiction flags first, only call BGE-M3 for unresolved coherent candidates, and finally map each result to `confirm`, `recommend-edit`, `review`, or `abstain`.

**Tech Stack:** TypeScript, Electron main process, React renderer, Python bridge scripts, Google Sheets read-only loader, Hugging Face Transformers.js (`Xenova/bge-m3`)

---

## File Structure

- Create: `app_v2/main/hybridCandidateEngine.ts`
  Responsibility: shared search-bundle normalization, feature scoring, contradiction detection, AI-gated verdict assembly
- Modify: `app_v2/main/liveReadActions.ts`
  Responsibility: replace `scoreSheetReviewCandidates()` with shared engine output
- Modify: `app_v2/main/reservationActionRunner.ts`
  Responsibility: replace note-overlap-driven ops enrichment and validate/edit recommendation rows with shared engine output
- Modify: `scripts/app_v2_live_sheet_bridge.py`
  Responsibility: emit search-bundle-ready payload fields instead of narrow review/continuation hints only, and keep `ops-preview` search bundles scoped to the active report window
- Modify: `app_v2/renderer/App.tsx`
  Responsibility: update operator-facing copy so the UI reflects hybrid evidence, abstention, and stronger recommendation gates
- Create: `tests/regression_app_v2_hybrid_candidate_engine.mjs`
  Responsibility: static regression for new shared-engine integration points
- Create: `tests/regression_app_v2_hybrid_candidate_engine_py.py`
  Responsibility: Python-side regression that verifies widened candidate payload fields and anti-single-basis behavior
- Modify: `tests/regression_app_v2_bge_readonly_expansion.mjs`
  Responsibility: update previous BGE-only contract to the new hybrid contract
- Modify: `tests/regression_app_v2_live_bridge_contract.mjs`
  Responsibility: require expanded bridge payload surface
- Modify: `tests/regression_app_v2_phase2_contract.mjs`
  Responsibility: require new UI and main-process copy/contract markers

### Task 1: Lock Hybrid Engine Contract With Failing Regressions

**Files:**
- Create: `tests/regression_app_v2_hybrid_candidate_engine.mjs`
- Create: `tests/regression_app_v2_hybrid_candidate_engine_py.py`
- Modify: `tests/regression_app_v2_bge_readonly_expansion.mjs`
- Modify: `tests/regression_app_v2_live_bridge_contract.mjs`
- Modify: `tests/regression_app_v2_phase2_contract.mjs`

- [ ] **Step 1: Write the failing Node regression**

```js
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function read(root, relativePath) {
  const filePath = path.join(root, relativePath);
  assert.equal(fs.existsSync(filePath), true, `${relativePath} should exist`);
  return fs.readFileSync(filePath, "utf8");
}

function main() {
  const root = process.cwd();
  const engine = read(root, "app_v2/main/hybridCandidateEngine.ts");
  const liveRead = read(root, "app_v2/main/liveReadActions.ts");
  const runner = read(root, "app_v2/main/reservationActionRunner.ts");

  assert.match(engine, /buildHybridCandidateDecisions/);
  assert.match(engine, /same_guest_name/);
  assert.match(engine, /same_phone/);
  assert.match(engine, /contradiction/i);
  assert.match(engine, /abstain/);

  assert.match(liveRead, /buildHybridCandidateDecisions/);
  assert.match(runner, /buildHybridCandidateDecisions/);
  assert.match(runner, /recommend-edit|abstain|confirm|review/);

  console.log("regression_app_v2_hybrid_candidate_engine: OK");
}

main();
```

- [ ] **Step 2: Write the failing Python regression**

```python
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def test_live_bridge_exposes_search_bundle_fields() -> None:
    source = (ROOT / "scripts" / "app_v2_live_sheet_bridge.py").read_text(encoding="utf-8")
    assert "searchBundles" in source
    assert "candidateFeatures" in source
    assert "contradictionFlags" in source
    assert "samePhone" in source or "same_phone" in source
    assert "sameGuestName" in source or "same_guest_name" in source
```

- [ ] **Step 3: Run the regressions to verify RED**

Run: `node tests/regression_app_v2_hybrid_candidate_engine.mjs`  
Expected: FAIL because `app_v2/main/hybridCandidateEngine.ts` does not exist yet.

Run: `python3 -m pytest tests/regression_app_v2_hybrid_candidate_engine_py.py -q`  
Expected: FAIL because the bridge does not yet expose widened search-bundle fields.

- [ ] **Step 4: Update older contract tests to fail on the shallow implementation**

```js
assert.match(bridgeScript, /searchBundles/);
assert.match(bridgeScript, /candidateFeatures|contradictionFlags/);
assert.match(liveRead, /abstain|confirm|review/);
assert.match(runner, /recommend-edit|abstain/);
assert.match(appSource, /보류|근거|충돌/);
```

- [ ] **Step 5: Run the touched contract tests again**

Run: `node tests/regression_app_v2_bge_readonly_expansion.mjs && node tests/regression_app_v2_live_bridge_contract.mjs && node tests/regression_app_v2_phase2_contract.mjs`  
Expected: FAIL because the code still reflects narrow candidate generation.

### Task 2: Expand Python Bridge Payload Into Search Bundles

**Files:**
- Modify: `scripts/app_v2_live_sheet_bridge.py`
- Test: `tests/regression_app_v2_hybrid_candidate_engine_py.py`
- Test: `tests/regression_app_v2_live_bridge_contract.mjs`

- [ ] **Step 1: Write the failing payload-shape assertion inside the Python test**

```python
def test_live_bridge_does_not_stop_at_adjacent_or_note_overlap() -> None:
    source = (ROOT / "scripts" / "app_v2_live_sheet_bridge.py").read_text(encoding="utf-8")
    assert "adjacent_stay" in source
    assert "same_reservation_no" in source
    assert "same_guest_name" in source
    assert "same_phone" in source
    assert "room_change_blocker" in source
```

- [ ] **Step 2: Run the Python test to verify RED**

Run: `python3 -m pytest tests/regression_app_v2_hybrid_candidate_engine_py.py -q`  
Expected: FAIL because only `adjacent_stay` and `note_overlap` dominate the current bridge logic.

- [ ] **Step 3: Write minimal bridge implementation**

```python
def build_search_bundles(blocks: List[Any]) -> List[Dict[str, Any]]:
    bundles: List[Dict[str, Any]] = []
    for block in blocks:
        bundles.append(
            {
                "id": f"{normalize_text(getattr(block, 'room_no', ''))}:{iso_or_empty(getattr(block, 'checkin', None))}",
                "branch": normalize_text(getattr(block, "branch", "")),
                "roomNo": normalize_text(getattr(block, "room_no", "")),
                "reservationNo": normalize_text(getattr(block, "reservation_no", "")),
                "reservationKey": normalize_text(getattr(block, "reservation_key", "")),
                "guestName": normalize_text(getattr(block, "guest_name", "")),
                "phone": normalize_phone(build_note_head(block)),
                "channel": extract_channel_marker(build_note_head(block)),
                "checkin": iso_or_empty(getattr(block, "checkin", None)),
                "checkout": iso_or_empty(getattr(block, "checkout", None)),
                "noteHead": normalize_text(build_note_head(block)),
                "packageMarkers": extract_package_markers(build_note_head(block)),
                "roomChangeBlocker": has_room_change_blocker(build_note_head(block)),
            }
        )
    return bundles
```

- [ ] **Step 4: Emit the new payload fields for both `sheet-read` and `ops-preview`**

```python
"searchBundles": build_search_bundles(window_blocks),
"candidateFeatures": [],
"contradictionFlags": [],
```

For `ops-preview`, attach the same normalized bundle fields to each continuation candidate:

```python
{
    "id": f"{row.get('date', '')}:{row.get('room_no', '')}",
    "roomNo": row.get("room_no", ""),
    "date": row.get("date", ""),
    "basis": row.get("continuation_basis", ""),
    "departureText": row.get("departure_reservation_nos", ""),
    "arrivalText": row.get("arrival_reservation_nos", ""),
    "noteHead": row.get("note_head", ""),
    "sameReservationNo": row.get("departure_reservation_nos", "") == row.get("arrival_reservation_nos", ""),
}
```

- [ ] **Step 5: Run the bridge regressions to verify GREEN**

Run: `python3 -m pytest tests/regression_app_v2_hybrid_candidate_engine_py.py -q && node tests/regression_app_v2_live_bridge_contract.mjs`  
Expected: PASS

### Task 3: Add Shared Hybrid Candidate Engine In Electron Main

**Files:**
- Create: `app_v2/main/hybridCandidateEngine.ts`
- Test: `tests/regression_app_v2_hybrid_candidate_engine.mjs`

- [ ] **Step 1: Write the failing engine contract assertion**

```js
assert.match(engine, /type HybridDecisionState = "confirm" \| "recommend-edit" \| "review" \| "abstain"/);
assert.match(engine, /buildCandidateFeatures/);
assert.match(engine, /buildHybridCandidateDecisions/);
assert.match(engine, /contradictionFlags/);
```

- [ ] **Step 2: Run the Node regression to verify RED**

Run: `node tests/regression_app_v2_hybrid_candidate_engine.mjs`  
Expected: FAIL because the engine file and exported functions do not exist yet.

- [ ] **Step 3: Write the minimal shared engine**

```ts
export type HybridDecisionState = "confirm" | "recommend-edit" | "review" | "abstain";

export interface HybridSearchBundle {
  id: string;
  branch: string;
  roomNo: string;
  reservationNo: string;
  reservationKey: string;
  guestName: string;
  phone: string;
  channel: string;
  checkin: string;
  checkout: string;
  noteHead: string;
  packageMarkers: string[];
  roomChangeBlocker: boolean;
}

export interface HybridCandidateFeatureSet {
  date_gap_days: number | null;
  same_room: boolean;
  same_room_alias: boolean;
  same_reservation_no: boolean;
  same_guest_name: boolean;
  same_phone: boolean;
  same_channel: boolean;
  same_note_signature: boolean;
  package_marker_match: boolean;
  room_change_blocker: boolean;
  branch_match: boolean;
  contradictionFlags: string[];
}
```

- [ ] **Step 4: Add verdict and AI-gating logic**

```ts
export function buildHybridCandidateDecisions(
  bundles: HybridSearchBundle[],
  scores: Map<string, number> = new Map(),
): HybridDecision[] {
  return bundles.map((bundle) => {
    const features = buildCandidateFeatures(bundle);
    const hasConflict = features.contradictionFlags.length > 0;
    const score = scores.get(bundle.id);
    if (hasConflict) return { id: bundle.id, state: "abstain", score, features, reason: "conflict" };
    if (features.same_reservation_no || features.same_phone) return { id: bundle.id, state: "confirm", score, features, reason: "identity-match" };
    if (score !== undefined && score >= 0.9) return { id: bundle.id, state: "recommend-edit", score, features, reason: "ai-supported-rule-match" };
    if (score !== undefined && score >= 0.72) return { id: bundle.id, state: "review", score, features, reason: "review-needed" };
    return { id: bundle.id, state: "abstain", score, features, reason: "insufficient" };
  });
}
```

- [ ] **Step 5: Run the engine regression to verify GREEN**

Run: `node tests/regression_app_v2_hybrid_candidate_engine.mjs`  
Expected: PASS

### Task 4: Integrate The Shared Engine Into `sheet-read`, `order-list`, `arrival`, `validate`, And `edit`

**Files:**
- Modify: `app_v2/main/liveReadActions.ts`
- Modify: `app_v2/main/reservationActionRunner.ts`
- Test: `tests/regression_app_v2_bge_readonly_expansion.mjs`
- Test: `tests/regression_app_v2_hybrid_candidate_engine.mjs`

- [ ] **Step 1: Write the failing integration assertion**

```js
assert.match(liveRead, /buildHybridCandidateDecisions/);
assert.match(liveRead, /abstain|confirm|review/);
assert.match(runner, /buildHybridCandidateDecisions/);
assert.match(runner, /recommend-edit|abstain/);
```

- [ ] **Step 2: Run the integration regressions to verify RED**

Run: `node tests/regression_app_v2_bge_readonly_expansion.mjs && node tests/regression_app_v2_hybrid_candidate_engine.mjs`  
Expected: FAIL because `liveReadActions.ts` and `reservationActionRunner.ts` still use narrow candidate paths.

- [ ] **Step 3: Replace `sheet-read` scoring with hybrid decisions**

```ts
const decisions = await buildHybridCandidateDecisionsFromSheetPayload(settings, payload);
const reviewItems = decisions.slice(0, 8).map((decision) => ({
  id: `sheet-review:${decision.id}`,
  title: `${decision.bundle.roomNo || "-"} 판단 후보`,
  subtitle: [decision.state, decision.reason, decision.bundle.noteHead].filter(Boolean).join(" · "),
  statusLabel: decision.state === "confirm" ? "확정" : decision.state === "recommend-edit" ? "수정 추천" : decision.state === "review" ? "검토" : "보류",
}));
```

- [ ] **Step 4: Replace ops preview and validate/edit row generation**

```ts
const decisions = await buildHybridCandidateDecisionsFromOpsPayload(settingsSnapshot, payload);
const rows = decisions.slice(0, 8).map((decision, index) => ({
  id: `${input.action}-${index}`,
  primary: `${decision.bundle.roomNo} / ${decision.bundle.checkin || decision.bundle.checkout}`,
  secondary: [decision.reason, decision.bundle.reservationNo, decision.bundle.channel].filter(Boolean).join(" · "),
  statusLabel: decision.state === "confirm" ? "확정" : decision.state === "recommend-edit" ? "수정 추천" : decision.state === "review" ? "검토" : "보류",
  detail: [...decision.features.contradictionFlags, decision.bundle.noteHead].filter(Boolean).join(" / "),
}));
```

- [ ] **Step 5: Run the updated regressions to verify GREEN**

Run: `node tests/regression_app_v2_bge_readonly_expansion.mjs && node tests/regression_app_v2_hybrid_candidate_engine.mjs && node tests/regression_app_v2_phase2_contract.mjs`  
Expected: PASS

### Task 5: Update Operator Copy And Run Real-Sheet Verification

**Files:**
- Modify: `app_v2/renderer/App.tsx`
- Modify: `tests/regression_app_v2_phase2_contract.mjs`
- Test: `tests/regression_app_v2_runtime_verify.mjs`

- [ ] **Step 1: Write the failing UI contract assertion**

```js
assert.match(appSource, /하이브리드 검색/);
assert.match(appSource, /확정|수정 추천|검토|보류/);
assert.match(appSource, /근거 충돌 시 보류/);
```

- [ ] **Step 2: Run the UI regression to verify RED**

Run: `node tests/regression_app_v2_phase2_contract.mjs`  
Expected: FAIL because the current UI still describes BGE as a simple read-only sorter.

- [ ] **Step 3: Write minimal UI copy changes**

```tsx
<div className="detail-panel">하이브리드 검색 + AI 보조가 예약번호, 예약키, 이름, 연락처, 채널, 노트, 날짜 인접성을 함께 해석합니다.</div>
<div className="detail-panel">결과 단계: 확정 / 수정 추천 / 검토 / 보류. 근거가 충돌하면 보류로 남깁니다.</div>
<div className="detail-panel">BGE-M3는 규칙 근거가 정리된 후보만 재정렬하며 충돌을 무시하지 않습니다.</div>
```

- [ ] **Step 4: Run touched tests and real-sheet verification**

Run: `node tests/regression_app_v2_phase2_contract.mjs && node tests/regression_app_v2_runtime_verify.mjs && npm run app:check`  
Expected: PASS

Run: `npm run app:verify:sheet-live -- --json`  
Expected: PASS with `overallReady=true`

Run: `python3 scripts/app_v2_live_sheet_bridge.py sheet-read --spreadsheet "$APP_V2_SPREADSHEET_ID" --sheet-name 2026 --branch COEX --start-date 2026-04-03 --end-date 2026-04-10 | python3 -m json.tool`  
Expected: JSON output with widened candidate evidence, not only `adjacent_stay`

Run: `python3 scripts/app_v2_live_sheet_bridge.py sheet-read --spreadsheet "$APP_V2_SPREADSHEET_ID" --sheet-name 2026 --branch COEX --start-date 2026-04-03 --end-date 2026-05-02 | python3 -m json.tool`  
Expected: JSON output remains structured and bounded for a 1 month window

- [ ] **Step 5: Commit**

```bash
git add app_v2/main/hybridCandidateEngine.ts app_v2/main/liveReadActions.ts app_v2/main/reservationActionRunner.ts app_v2/renderer/App.tsx scripts/app_v2_live_sheet_bridge.py tests/regression_app_v2_hybrid_candidate_engine.mjs tests/regression_app_v2_hybrid_candidate_engine_py.py tests/regression_app_v2_bge_readonly_expansion.mjs tests/regression_app_v2_live_bridge_contract.mjs tests/regression_app_v2_phase2_contract.mjs docs/superpowers/specs/2026-04-03-hybrid-search-ai-assist-design.md docs/superpowers/plans/2026-04-03-hybrid-search-ai-assist-implementation.md
git commit -m "feat: add hybrid search ai assist engine"
```

## Self-Review

- Spec coverage: candidate search widening, variable control, contradiction handling, AI gating, abstention, UI copy, and 1 week to 1 month real-sheet verification are all covered by Tasks 1 through 5.
- Placeholder scan: no `TODO`, `TBD`, or deferred wording remains in the task steps.
- Type consistency: all tasks use the same decision state set: `confirm`, `recommend-edit`, `review`, `abstain`.
