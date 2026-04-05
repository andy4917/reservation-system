import type { AppSettingsSnapshot } from "../../src/desktop/app-v2-contracts.js";
import { Document } from "flexsearch";
import { Engine, type RuleProperties } from "json-rules-engine";
import { scoreTextPairs } from "./embeddingRuntime.js";

export type HybridDecisionState = "confirm" | "recommend-edit" | "review" | "abstain";

export interface HybridSearchBundle {
  id: string;
  branch: string;
  roomNo: string;
  reservationNo: string;
  reservationKey: string;
  guestName: string;
  guestNameSearchKey?: string;
  phone: string;
  channel: string;
  checkin: string;
  checkout: string;
  nightCount?: number;
  noteHead: string;
  noteHeadSearchKey?: string;
  noteSignature: string;
  packageMarkers: string[];
  roomChangeBlocker: boolean;
  fuzzyGuestMatchIds?: string[];
  fuzzyNoteMatchIds?: string[];
}

export interface HybridCandidatePair {
  id: string;
  basis: string[];
  left: HybridSearchBundle;
  right: HybridSearchBundle;
}

export interface HybridCandidateFeatureSet {
  date_gap_days: number | null;
  same_room: boolean;
  same_room_alias: boolean;
  same_reservation_no: boolean;
  same_guest_name: boolean;
  guest_name_similarity: number;
  same_phone: boolean;
  same_channel: boolean;
  same_note_signature: boolean;
  note_head_similarity: number;
  package_marker_match: boolean;
  room_change_blocker: boolean;
  branch_match: boolean;
  contradictionFlags: string[];
}

export interface HybridDecision {
  id: string;
  state: HybridDecisionState;
  reason: string;
  score?: number;
  pair: HybridCandidatePair;
  features: HybridCandidateFeatureSet;
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeKey(value: unknown) {
  return normalizeText(value).toLowerCase();
}

function parseIsoDate(value: string) {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function diffDays(left: string, right: string) {
  const leftDate = parseIsoDate(left);
  const rightDate = parseIsoDate(right);
  if (!leftDate || !rightDate) return null;
  return Math.round((rightDate.getTime() - leftDate.getTime()) / 86_400_000);
}

function overlappingMarkers(left: string[], right: string[]) {
  const rightSet = new Set(right.map((item) => normalizeKey(item)));
  return left.some((item) => rightSet.has(normalizeKey(item)));
}

function noteCompareKey(value: string) {
  return normalizeKey(value).replace(/[0-9]/g, "").slice(0, 120);
}

function roomAliasKey(value: string) {
  return normalizeKey(value).replace(/[^a-z0-9]/g, "");
}

function tokenize(value: string) {
  return normalizeKey(value)
    .split(/[^a-z0-9가-힣]+/i)
    .map((item) => item.trim())
    .filter(Boolean);
}

function overlapSimilarity(left: string, right: string) {
  const leftTokens = new Set(tokenize(left));
  const rightTokens = new Set(tokenize(right));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) overlap += 1;
  }
  return Number(((2 * overlap) / (leftTokens.size + rightTokens.size)).toFixed(4));
}

export function buildCandidateFeatures(pair: HybridCandidatePair): HybridCandidateFeatureSet {
  const date_gap_days = diffDays(pair.left.checkout, pair.right.checkin);
  const same_room = normalizeKey(pair.left.roomNo) === normalizeKey(pair.right.roomNo);
  const same_room_alias = roomAliasKey(pair.left.roomNo) === roomAliasKey(pair.right.roomNo);
  const same_reservation_no =
    normalizeText(pair.left.reservationNo).length > 0 &&
    normalizeKey(pair.left.reservationNo) === normalizeKey(pair.right.reservationNo);
  const same_guest_name =
    normalizeText(pair.left.guestName).length > 0 &&
    normalizeKey(pair.left.guestName) === normalizeKey(pair.right.guestName);
  const guest_name_similarity = overlapSimilarity(
    pair.left.guestNameSearchKey || pair.left.guestName,
    pair.right.guestNameSearchKey || pair.right.guestName,
  );
  const same_phone =
    normalizeText(pair.left.phone).length > 0 &&
    normalizeKey(pair.left.phone) === normalizeKey(pair.right.phone);
  const same_channel =
    normalizeText(pair.left.channel).length > 0 &&
    normalizeKey(pair.left.channel) === normalizeKey(pair.right.channel);
  const same_note_signature =
    noteCompareKey(pair.left.noteSignature) !== "" &&
    noteCompareKey(pair.left.noteSignature) === noteCompareKey(pair.right.noteSignature);
  const note_head_similarity = overlapSimilarity(
    pair.left.noteHeadSearchKey || pair.left.noteHead,
    pair.right.noteHeadSearchKey || pair.right.noteHead,
  );
  const package_marker_match = overlappingMarkers(pair.left.packageMarkers, pair.right.packageMarkers);
  const room_change_blocker = pair.left.roomChangeBlocker || pair.right.roomChangeBlocker;
  const branch_match = normalizeKey(pair.left.branch) === normalizeKey(pair.right.branch);
  const contradictionFlags: string[] = [];

  if (room_change_blocker && !same_room && !package_marker_match) {
    contradictionFlags.push("room_change_blocker");
  }
  if (date_gap_days !== null && date_gap_days < -1) {
    contradictionFlags.push("date_gap_conflict");
  }
  if (!same_room && !same_reservation_no && !same_guest_name && !same_phone && !package_marker_match && !same_note_signature) {
    contradictionFlags.push("identity_conflict");
  }
  if (
    same_room &&
    !same_reservation_no &&
    !same_guest_name &&
    !same_phone &&
    !same_note_signature &&
    !package_marker_match
  ) {
    contradictionFlags.push("identity_gap_conflict");
  }
  if (
    same_room &&
    !same_reservation_no &&
    !same_guest_name &&
    !same_phone &&
    !same_note_signature &&
    normalizeText(pair.left.channel).length > 0 &&
    normalizeText(pair.right.channel).length > 0 &&
    !same_channel
  ) {
    contradictionFlags.push("channel_conflict");
  }

  return {
    date_gap_days,
    same_room,
    same_room_alias,
    same_reservation_no,
    same_guest_name,
    guest_name_similarity,
    same_phone,
    same_channel,
    same_note_signature,
    note_head_similarity,
    package_marker_match,
    room_change_blocker,
    branch_match,
    contradictionFlags,
  };
}

type CandidateLookupDocument = {
  [key: string]: string | number | boolean | string[];
  id: string;
  branch: string;
  roomNo: string;
  reservationNo: string;
  reservationKey: string;
  guestName: string;
  guestNameSearchKey: string;
  phone: string;
  channel: string;
  checkin: string;
  checkout: string;
  nightCount: number;
  noteHead: string;
  noteHeadSearchKey: string;
  noteSignature: string;
  packageMarkers: string[];
  roomChangeBlocker: boolean;
  fuzzyGuestMatchIds: string[];
  fuzzyNoteMatchIds: string[];
  packageMarkersText: string;
};

function buildCandidateLookup(bundles: HybridSearchBundle[]) {
  const index = new Document<CandidateLookupDocument>({
    tokenize: "forward",
    document: {
      id: "id",
      index: [
        "roomNo",
        "reservationNo",
        "reservationKey",
        "guestNameSearchKey",
        "phone",
        "channel",
        "noteHeadSearchKey",
        "packageMarkersText",
      ],
      store: true,
    },
  });

  for (const bundle of bundles) {
    index.add({
      id: bundle.id,
      branch: bundle.branch,
      roomNo: bundle.roomNo,
      reservationNo: bundle.reservationNo,
      reservationKey: bundle.reservationKey,
      guestName: bundle.guestName,
      guestNameSearchKey: bundle.guestNameSearchKey || normalizeKey(bundle.guestName),
      phone: bundle.phone,
      channel: bundle.channel,
      checkin: bundle.checkin,
      checkout: bundle.checkout,
      nightCount: bundle.nightCount || 0,
      noteHead: bundle.noteHead,
      noteHeadSearchKey: bundle.noteHeadSearchKey || normalizeKey(bundle.noteHead),
      noteSignature: bundle.noteSignature,
      packageMarkers: bundle.packageMarkers,
      roomChangeBlocker: bundle.roomChangeBlocker,
      fuzzyGuestMatchIds: bundle.fuzzyGuestMatchIds || [],
      fuzzyNoteMatchIds: bundle.fuzzyNoteMatchIds || [],
      packageMarkersText: bundle.packageMarkers.join(" "),
    });
  }

  return index;
}

function lookupCandidates(
  index: Document<CandidateLookupDocument>,
  bundle: HybridSearchBundle,
) {
  const candidateIds = new Set<string>();
  const queries = [
    bundle.roomNo,
    bundle.reservationNo,
    bundle.reservationKey,
    bundle.guestNameSearchKey || bundle.guestName,
    bundle.phone,
    bundle.channel,
    bundle.noteHeadSearchKey || bundle.noteHead,
    bundle.packageMarkers.join(" "),
  ].map((item) => normalizeText(item));

  for (const query of queries) {
    if (!query) continue;
    const results = index.search(query, { enrich: true, merge: true, limit: 8, suggest: true });
    for (const result of results) {
      if (result.id !== bundle.id) candidateIds.add(String(result.id));
    }
  }

  for (const matchId of bundle.fuzzyGuestMatchIds || []) candidateIds.add(matchId);
  for (const matchId of bundle.fuzzyNoteMatchIds || []) candidateIds.add(matchId);
  return candidateIds;
}

export function buildHybridCandidatePairs(bundles: HybridSearchBundle[]) {
  const pairs: HybridCandidatePair[] = [];
  const seen = new Set<string>();
  const sorted = [...bundles].sort((left, right) =>
    [left.roomNo, left.checkin, left.reservationNo].join(":").localeCompare([right.roomNo, right.checkin, right.reservationNo].join(":")),
  );
  const bundleById = new Map(sorted.map((bundle) => [bundle.id, bundle]));
  const lookup = buildCandidateLookup(sorted);

  for (const left of sorted) {
    const candidateIds = lookupCandidates(lookup, left);
    for (const candidateId of candidateIds) {
      const right = bundleById.get(candidateId);
      if (!right) continue;
      if (left.id === right.id) continue;
      if (left.id.localeCompare(right.id) >= 0) continue;
      if (normalizeKey(left.branch) !== normalizeKey(right.branch)) continue;

      const dateGap = diffDays(left.checkout, right.checkin);
      const basis: string[] = [];
      const guestNameSimilarity = overlapSimilarity(
        left.guestNameSearchKey || left.guestName,
        right.guestNameSearchKey || right.guestName,
      );
      const noteHeadSimilarity = overlapSimilarity(
        left.noteHeadSearchKey || left.noteHead,
        right.noteHeadSearchKey || right.noteHead,
      );
      if (roomAliasKey(left.roomNo) === roomAliasKey(right.roomNo) && dateGap !== null && dateGap <= 1) {
        basis.push("adjacent_stay");
      }
      if (normalizeText(left.reservationNo) && normalizeKey(left.reservationNo) === normalizeKey(right.reservationNo)) {
        basis.push("same_reservation_no");
      }
      if (normalizeText(left.guestName) && normalizeKey(left.guestName) === normalizeKey(right.guestName)) {
        basis.push("same_guest_name");
      }
      if (normalizeText(left.phone) && normalizeKey(left.phone) === normalizeKey(right.phone)) {
        basis.push("same_phone");
      }
      if (guestNameSimilarity >= 0.9) {
        basis.push("fuzzy_guest_name");
      }
      if (normalizeText(left.channel) && normalizeKey(left.channel) === normalizeKey(right.channel) && noteCompareKey(left.noteSignature) === noteCompareKey(right.noteSignature)) {
        basis.push("same_note_signature");
      }
      if (noteHeadSimilarity >= 0.88) {
        basis.push("fuzzy_note_head");
      }
      if (overlappingMarkers(left.packageMarkers, right.packageMarkers)) {
        basis.push("package_marker_match");
      }

      if (basis.length === 0) continue;
      const pairId = `${left.id}=>${right.id}`;
      if (seen.has(pairId)) continue;
      seen.add(pairId);
      pairs.push({ id: pairId, basis, left, right });
    }
  }

  return pairs;
}

function decisionPriority(state: HybridDecisionState) {
  return state === "confirm" ? 0 : state === "recommend-edit" ? 1 : state === "review" ? 2 : 3;
}

type DecisionReason = HybridDecision["reason"];

type DecisionFacts = {
  has_contradiction: boolean;
  has_identity_match: boolean;
  room_match: boolean;
  date_gap_lte_one: boolean;
  score_at_least_090: boolean;
  has_review_signal: boolean;
  score_at_least_072: boolean;
};

const hybridDecisionRules: RuleProperties[] = [
  {
    name: "conflict",
    priority: 100,
    conditions: {
      all: [{ fact: "has_contradiction", operator: "equal", value: true }],
    },
    event: {
      type: "decision",
      params: { state: "abstain", reason: "conflict" satisfies DecisionReason },
    },
  },
  {
    name: "identity-match",
    priority: 90,
    conditions: {
      all: [{ fact: "has_identity_match", operator: "equal", value: true }],
    },
    event: {
      type: "decision",
      params: { state: "confirm", reason: "identity-match" satisfies DecisionReason },
    },
  },
  {
    name: "ai-supported-rule-match",
    priority: 80,
    conditions: {
      all: [
        { fact: "room_match", operator: "equal", value: true },
        { fact: "date_gap_lte_one", operator: "equal", value: true },
        { fact: "score_at_least_090", operator: "equal", value: true },
      ],
    },
    event: {
      type: "decision",
      params: { state: "recommend-edit", reason: "ai-supported-rule-match" satisfies DecisionReason },
    },
  },
  {
    name: "review-needed",
    priority: 70,
    conditions: {
      all: [
        { fact: "has_review_signal", operator: "equal", value: true },
        { fact: "score_at_least_072", operator: "equal", value: true },
      ],
    },
    event: {
      type: "decision",
      params: { state: "review", reason: "review-needed" satisfies DecisionReason },
    },
  },
];

function buildDecisionEngine() {
  return new Engine(hybridDecisionRules);
}

function buildDecisionFacts(features: HybridCandidateFeatureSet, pair: HybridCandidatePair, score: number | undefined): DecisionFacts {
  return {
    has_contradiction: features.contradictionFlags.length > 0,
    has_identity_match: features.same_reservation_no || features.same_phone,
    room_match: features.same_room || features.same_room_alias,
    date_gap_lte_one: features.date_gap_days !== null && features.date_gap_days <= 1,
    score_at_least_090: typeof score === "number" && score >= 0.9,
    has_review_signal:
      features.same_guest_name ||
      features.guest_name_similarity >= 0.9 ||
      features.same_note_signature ||
      features.note_head_similarity >= 0.88 ||
      features.package_marker_match ||
      pair.basis.includes("adjacent_stay"),
    score_at_least_072: typeof score === "number" && score >= 0.72,
  };
}

async function applyDecisionRules(features: HybridCandidateFeatureSet, pair: HybridCandidatePair, score: number | undefined) {
  const decisionRules = buildDecisionEngine();
  const facts = buildDecisionFacts(features, pair, score);
  const { events } = await decisionRules.run(facts);
  const event = events[0];
  if (!event?.params) {
    return { state: "abstain" as const, reason: "insufficient" as const };
  }
  return {
    state: event.params.state as HybridDecisionState,
    reason: event.params.reason as DecisionReason,
  };
}

export async function buildHybridCandidateDecisions(
  settingsSnapshot: AppSettingsSnapshot,
  pairs: HybridCandidatePair[],
) {
  if (pairs.length === 0) return [] as HybridDecision[];

  const featuresById = new Map(pairs.map((pair) => [pair.id, buildCandidateFeatures(pair)]));
  const pairsToScore = pairs.filter((pair) => {
    const features = featuresById.get(pair.id);
    if (!features) return false;
    if (features.contradictionFlags.length > 0) return false;
    if (features.same_reservation_no || features.same_phone) return false;
    return true;
  });
  const scoreInputs = pairsToScore.map((pair) => ({
    id: pair.id,
    left: [pair.left.reservationNo, pair.left.guestName, pair.left.phone, pair.left.channel, pair.left.noteHead].filter(Boolean).join(" | "),
    right: [pair.right.reservationNo, pair.right.guestName, pair.right.phone, pair.right.channel, pair.right.noteHead].filter(Boolean).join(" | "),
  }));
  const pairScores = await scoreTextPairs(settingsSnapshot, scoreInputs);
  const scoreMap = new Map(pairScores.map((item) => [item.id, item.score]));

  const decisions = await Promise.all(
    pairs.map(async (pair) => {
      const features = featuresById.get(pair.id) ?? buildCandidateFeatures(pair);
      const score = scoreMap.get(pair.id);
      const { state, reason } = await applyDecisionRules(features, pair, score);
      return { id: pair.id, state, reason, score, pair, features } satisfies HybridDecision;
    }),
  );

  return decisions
    .sort((left, right) => {
      const priorityDiff = decisionPriority(left.state) - decisionPriority(right.state);
      if (priorityDiff !== 0) return priorityDiff;
      return (right.score ?? -1) - (left.score ?? -1);
    });
}
