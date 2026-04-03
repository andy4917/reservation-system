# Hybrid Search Engine + AI Assist Design

## Goal

Strengthen `app_v2` so sheet interpretation, edit recommendation, and decision assistance are driven by a hybrid search engine plus AI assist path rather than narrow heuristic candidate generation.

The system goal is not "AI always decides correctly."
The system goal is:

- gather broad candidates from the real sheet over a 1 week to 1 month window
- control variables explicitly before AI scoring
- allow AI to interpret and rank evidence bundles
- abstain instead of over-committing when evidence is weak or conflicting

## Confirmed Context

- Memento MCP is running and task session initialization succeeded.
- Real Google Sheets read-only access is ready for spreadsheet `1q7mC5p0DKIFboiiOS_aQHoQLzdtszFb76-ntEvOvMj8`.
- Current configured sheet name is `2026`.
- `npm run read-live` currently reports `sheet=ready` and `wings-pms` blocked, which means sheet-based verification can proceed independently of PMS session readiness.

## Current Problem

The current implementation is too shallow for the requested accuracy target.

Observed from the real sheet on `COEX / 2026-04-03 ~ 2026-04-08`:

- `sheet-read` imported 116 reservations and emitted 8 review candidates.
- those review candidates were dominated by `adjacent_stay`
- `ops-preview` emitted 67 continuation candidates.
- those continuation candidates were dominated by `note_overlap`
- BGE-M3 currently scores candidates after generation instead of controlling generation inputs

This means the system is missing a proper variable-control layer.
It can rank candidates, but it does not yet reliably decide which candidate bundles should exist in the first place.

## Requirements

### Functional

- build a hybrid candidate engine for sheet interpretation and reservation-action assist
- operate on a real-sheet window from 1 week up to 1 month
- support `sheet-read`, `order-list`, `arrival`, `validate`, and `edit`
- separate candidate gathering from candidate scoring
- expose structured evidence for every recommendation
- support explicit abstention when the engine cannot safely recommend

### Accuracy-Oriented

- reduce false positives by rejecting weak one-signal matches
- reduce misses by widening search across multiple normalized fields
- avoid single-basis recommendation paths such as only `adjacent_stay` or only `note_overlap`
- avoid AI-only decisions without a structured evidence bundle

### Product Rules

- preserve repo guardrails: no hidden fallback, no fake-ready paths, no silent guessing
- keep write/apply behavior gated behind stronger evidence than read-only review
- update docs and regression tests alongside behavior changes

## Non-Goals

- no vector index service outside the repo for this phase
- no AI-only auto-apply flow
- no silent auto-correction without evidence
- no weakening of explicit failure behavior

## Candidate Engine Design

### Stage 1: Search Bundle Construction

For each sheet block or ops row, build a normalized search bundle containing:

- branch
- room number and room alias keys
- reservation number
- reservation key
- guest name normalized
- phone normalized
- channel normalized
- checkin
- checkout
- stay length
- note head
- package markers
- room-change prohibition markers
- continuation markers

The search engine must search across the active window and create candidate bundles using multiple retrieval routes, not only adjacency:

- same room adjacency
- same reservation number
- same guest name
- same phone
- same channel plus overlapping note markers
- package or room-change keywords
- cross-day continuation patterns

### Stage 2: Variable Control

Each candidate pair or group must be annotated with explicit features:

- `date_gap_days`
- `same_room`
- `same_room_alias`
- `same_reservation_no`
- `same_guest_name`
- `same_phone`
- `same_channel`
- `same_note_signature`
- `package_marker_match`
- `room_change_blocker`
- `branch_match`
- `contradiction_flags`

Contradiction flags must include at minimum:

- different room with no allowed room-change context
- strong date contradiction
- conflicting reservation identity
- note conflict that points to separate guests

### Stage 3: Rule Verdict Before AI

Before BGE scoring, assign a rule verdict:

- `strong_match`
- `possible_match`
- `conflict`
- `insufficient`

AI must not rescue a `conflict` case into a confident recommendation.

### Stage 4: AI Assist

Use BGE-M3 only after rule features are computed.

AI inputs should be structured text bundles built from:

- normalized identity fields
- date and room summaries
- normalized note signatures
- contradiction summaries

AI output is used for:

- ranking `possible_match` candidates
- breaking ties between multiple plausible bundles
- upgrading a candidate only when rule features are already coherent

AI output is not used for:

- creating a candidate out of thin air
- bypassing contradiction flags
- auto-applying edits

## Decision Model

Every surfaced result must end in one of four states:

- `confirm`
- `recommend-edit`
- `review`
- `abstain`

Decision rules:

- `confirm`: multiple coherent signals, no contradiction, AI score supports but does not replace rule evidence
- `recommend-edit`: evidence is strong enough to suggest a correction but still requires operator approval
- `review`: some evidence exists but ambiguity remains
- `abstain`: evidence is weak or conflicting; show why and do not claim a direction

## Surface Mapping

### `sheet-read`

- replace narrow review-candidate generation with search-bundle retrieval plus multi-feature evaluation
- show why the candidate was surfaced
- support `abstain` instead of forcing a candidate label

### `order-list` and `arrival`

- continuation candidates must be derived from the same hybrid engine instead of a single note-overlap path
- `ops-preview` search bundles must be limited to the active report window even if the ops artifact builder reads the full branch block set
- evidence must show whether the case is a continuation, package transition, room-lock exception, or abstained ambiguity

### `validate` and `edit`

- `validate` should expose higher-confidence decision bundles with contradiction traces
- `edit` should only recommend changes when the same bundle reaches `recommend-edit` or above
- low-confidence cases must remain `review` or `abstain`

## Implementation Shape

### New Responsibilities

- introduce a shared candidate-engine module in `app_v2/main`
- centralize normalization and feature extraction for read and ops paths
- feed `liveReadActions.ts` and `reservationActionRunner.ts` from the same engine output

### Expected Changes

- expand the Python bridge payload or add a Node-side search bundle layer
- replace one-basis candidate generation logic
- enrich UI copy so operators see evidence and abstention reason
- extend regression coverage from string-contract presence to behavior-focused fixtures where feasible

## Testing Strategy

### Window Coverage

- short window: 1 week
- extended window: 1 month

### Required Test Layers

- failing regression tests for current shallow candidate logic
- fixture-level tests for feature extraction and contradiction detection
- targeted real-sheet verification commands for 1 week and 1 month windows
- local-path BGE verification on the real installed app model path, not only download-if-missing probes
- full touched-surface checks including `npm run app:check`

### Acceptance Criteria

- candidate generation is no longer dominated by single-basis heuristics
- surfaced recommendations include explicit evidence
- weak or conflicting cases return `abstain`
- `edit` recommendations are stricter than `review`
- real-sheet verification over 1 week and 1 month windows produces stable outputs without fake fallback behavior

## Risks

- one month search windows can create too many broad candidates unless search bundle pruning is bounded
- AI scores can create false confidence if contradiction features are not enforced first
- UI overload is possible if abstention reasons are verbose and unstructured

## Recommendation

Proceed with a shared hybrid candidate engine as the new bounded core for:

- sheet interpretation
- modification recommendation
- decision assistance

Implementation should start with failing tests around current false-positive-prone generation, then introduce the shared search and feature-evaluation layer, then reconnect AI ranking behind rule gating.
