import type {
  RecommendationTrace,
  SaveRecommendationTraceInput
} from "../contracts/provider.js";
import type { UnresolvedBinding } from "../renderer/types.js";

export const RECOMMENDATION_MODEL_VERSION = "bounded-alias-triage-v1";

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeKeyPart(value: unknown) {
  return normalizeText(value).toLowerCase();
}

export function buildRecommendationReferenceKey(input: {
  branch: string;
  sheetRef: SaveRecommendationTraceInput["sheetRef"];
  sectionKey?: string | null;
  anchorId: string;
  rawHeader: string;
  candidateId: string;
}) {
  const keyParts = [
    normalizeKeyPart(input.branch),
    normalizeKeyPart(input.sheetRef.spreadsheetId),
    normalizeKeyPart(input.sheetRef.sheetName)
  ];
  const sectionKey = normalizeKeyPart(input.sectionKey);
  if (sectionKey) keyParts.push(sectionKey);
  keyParts.push(
    normalizeKeyPart(input.anchorId),
    normalizeKeyPart(input.rawHeader),
    normalizeKeyPart(input.candidateId)
  );
  return keyParts.join("|");
}

export function buildRecommendationTraceInput(input: {
  branch: string;
  sheetRef: SaveRecommendationTraceInput["sheetRef"];
  runId: string | null;
  sectionKey: string | null;
  unresolved: UnresolvedBinding;
  candidateId: string;
  outcome: "accepted" | "rejected";
}): SaveRecommendationTraceInput {
  const unresolved = input.unresolved;
  const candidateId = normalizeText(input.candidateId);
  const sectionKey = normalizeText(input.sectionKey) || null;
  return {
    branch: input.branch,
    sheetRef: input.sheetRef,
    runId: input.runId,
    sectionKey,
    anchorId: unresolved.anchorId,
    rawHeader: unresolved.rawHeader,
    candidateId,
    candidateBasis: [
      `candidate:${candidateId}`,
      `reason:${normalizeText(unresolved.reason)}`,
      ...unresolved.candidateTerms
        .filter((term) => normalizeText(term) && normalizeKeyPart(term) !== normalizeKeyPart(candidateId))
        .slice(0, 2)
        .map((term) => `alternate:${term}`)
    ],
    evidenceLineage: [
      input.runId ? `run:${input.runId}` : "run:none",
      sectionKey ? `section:${sectionKey}` : "section:none",
      `anchor:${normalizeText(unresolved.anchorId)}`,
      `rawHeader:${normalizeText(unresolved.rawHeader)}`,
      ...unresolved.sampleValues.slice(0, 3).map((value) => `value:${normalizeText(value)}`)
    ].filter(Boolean),
    modelVersion: RECOMMENDATION_MODEL_VERSION,
    outcome: input.outcome
  };
}

export function matchesRecommendationTrace(
  trace: RecommendationTrace,
  input: {
    anchorId: string;
    rawHeader: string;
    candidateId: string;
    sectionKey?: string | null;
  }
) {
  const normalizedSectionKey = normalizeText(input.sectionKey);
  if (normalizeKeyPart(trace.anchorId) !== normalizeKeyPart(input.anchorId)) return false;
  if (normalizeKeyPart(trace.rawHeader) !== normalizeKeyPart(input.rawHeader)) return false;
  if (normalizeKeyPart(trace.candidateId) !== normalizeKeyPart(input.candidateId)) return false;
  if (normalizedSectionKey && normalizeKeyPart(trace.sectionKey) !== normalizeKeyPart(normalizedSectionKey)) return false;
  return true;
}
