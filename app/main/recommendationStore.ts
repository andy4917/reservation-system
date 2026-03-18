import fs from "node:fs/promises";
import path from "node:path";
import electron from "electron";
import type {
  BindingDecisionSheetRef,
  RecommendationTrace,
  SaveRecommendationTraceInput
} from "../contracts/provider.js";
import { buildRecommendationReferenceKey } from "../services/recommendationRuntime.js";

interface RecommendationStoreFile {
  schemaVersion: 1;
  traces: Record<string, RecommendationTrace>;
}

const RECOMMENDATION_STORE_FILE = "recommendation-traces.v1.json";
const RECOMMENDATION_STORE_SCHEMA_VERSION = 1 as const;
const { app } = electron;

let recommendationStoreDirOverride: string | null = null;

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeKeyPart(value: unknown) {
  return normalizeText(value).toLowerCase();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeSheetRef(sheetRef: BindingDecisionSheetRef): BindingDecisionSheetRef {
  return {
    spreadsheetId: normalizeText(sheetRef.spreadsheetId),
    sheetName: normalizeText(sheetRef.sheetName),
    sheetId: normalizeText(sheetRef.sheetId) || null,
    timezone: normalizeText(sheetRef.timezone) || null
  };
}

function getRecommendationStoreDir() {
  return recommendationStoreDirOverride || app.getPath("userData");
}

function getRecommendationStorePath() {
  return path.join(getRecommendationStoreDir(), RECOMMENDATION_STORE_FILE);
}

async function ensureRecommendationStoreDir() {
  await fs.mkdir(getRecommendationStoreDir(), { recursive: true });
}

async function quarantineCorruptRecommendationStore(filePath: string) {
  const corruptPath = `${filePath}.corrupt-${Date.now()}`;
  try {
    await fs.rename(filePath, corruptPath);
  } catch (_error) {
    return;
  }
}

function createEmptyRecommendationStore(): RecommendationStoreFile {
  return {
    schemaVersion: RECOMMENDATION_STORE_SCHEMA_VERSION,
    traces: {}
  };
}

function buildReferenceKey(input: {
  branch: string;
  sheetRef: BindingDecisionSheetRef;
  sectionKey?: string | null;
  anchorId: string;
  rawHeader: string;
  candidateId: string;
}) {
  return buildRecommendationReferenceKey(input);
}

function buildTraceKey(input: {
  referenceKey: string;
  outcome: RecommendationTrace["outcome"];
  decidedAt: string;
}) {
  return `${input.referenceKey}|${normalizeKeyPart(input.outcome)}|${normalizeKeyPart(input.decidedAt)}`;
}

function normalizeStringArray(value: unknown) {
  return Array.isArray(value) ? value.map((entry) => normalizeText(entry)).filter(Boolean) : [];
}

function normalizePersistedTrace(value: unknown): RecommendationTrace | null {
  if (!isPlainObject(value) || !isPlainObject(value.sheetRef)) return null;
  const branch = normalizeText(value.branch);
  const sheetRef = normalizeSheetRef({
    spreadsheetId: normalizeText(value.sheetRef.spreadsheetId),
    sheetName: normalizeText(value.sheetRef.sheetName),
    sheetId: normalizeText(value.sheetRef.sheetId) || null,
    timezone: normalizeText(value.sheetRef.timezone) || null
  });
  const sectionKey = normalizeText(value.sectionKey) || null;
  const anchorId = normalizeText(value.anchorId);
  const rawHeader = normalizeText(value.rawHeader);
  const candidateId = normalizeText(value.candidateId);
  const outcome = value.outcome === "accepted" ? "accepted" : value.outcome === "rejected" ? "rejected" : null;
  const modelVersion = normalizeText(value.modelVersion);
  const decidedAt = normalizeText(value.decidedAt);
  if (!branch || !sheetRef.spreadsheetId || !sheetRef.sheetName || !anchorId || !rawHeader || !candidateId || !outcome || !modelVersion || !decidedAt) {
    return null;
  }
  const referenceKey =
    normalizeText(value.referenceKey) ||
    buildReferenceKey({ branch, sheetRef, sectionKey, anchorId, rawHeader, candidateId });
  return {
    referenceKey,
    traceKey: normalizeText(value.traceKey) || buildTraceKey({ referenceKey, outcome, decidedAt }),
    branch,
    sheetRef,
    runId: normalizeText(value.runId) || null,
    sectionKey,
    anchorId,
    rawHeader,
    candidateId,
    candidateBasis: normalizeStringArray(value.candidateBasis),
    evidenceLineage: normalizeStringArray(value.evidenceLineage),
    modelVersion,
    outcome,
    decidedAt
  };
}

function normalizeRecommendationTrace(input: SaveRecommendationTraceInput): RecommendationTrace {
  const sheetRef = normalizeSheetRef(input.sheetRef);
  const branch = normalizeText(input.branch);
  const sectionKey = normalizeText(input.sectionKey) || null;
  const anchorId = normalizeText(input.anchorId);
  const rawHeader = normalizeText(input.rawHeader);
  const candidateId = normalizeText(input.candidateId);
  const modelVersion = normalizeText(input.modelVersion);
  if (!branch || !sheetRef.spreadsheetId || !sheetRef.sheetName || !anchorId || !rawHeader || !candidateId || !modelVersion) {
    throw new Error("Recommendation trace is missing required fields.");
  }
  const decidedAt = new Date().toISOString();
  const referenceKey = buildReferenceKey({ branch, sheetRef, sectionKey, anchorId, rawHeader, candidateId });
  return {
    referenceKey,
    traceKey: buildTraceKey({ referenceKey, outcome: input.outcome, decidedAt }),
    branch,
    sheetRef,
    runId: normalizeText(input.runId) || null,
    sectionKey,
    anchorId,
    rawHeader,
    candidateId,
    candidateBasis: normalizeStringArray(input.candidateBasis),
    evidenceLineage: normalizeStringArray(input.evidenceLineage),
    modelVersion,
    outcome: input.outcome,
    decidedAt
  };
}

async function readRecommendationStore(): Promise<RecommendationStoreFile> {
  const filePath = getRecommendationStorePath();
  try {
    const raw = await fs.readFile(filePath, "utf8");
    if (!raw.trim()) return createEmptyRecommendationStore();
    const parsed = JSON.parse(raw);
    if (!isPlainObject(parsed) || parsed.schemaVersion !== RECOMMENDATION_STORE_SCHEMA_VERSION || !isPlainObject(parsed.traces)) {
      await quarantineCorruptRecommendationStore(filePath);
      return createEmptyRecommendationStore();
    }
    const traces: Record<string, RecommendationTrace> = {};
    for (const [traceKey, value] of Object.entries(parsed.traces)) {
      const normalized = normalizePersistedTrace(value);
      if (!normalized) continue;
      traces[traceKey] = normalized;
    }
    return {
      schemaVersion: RECOMMENDATION_STORE_SCHEMA_VERSION,
      traces
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return createEmptyRecommendationStore();
    await quarantineCorruptRecommendationStore(filePath);
    return createEmptyRecommendationStore();
  }
}

async function writeRecommendationStore(store: RecommendationStoreFile) {
  await ensureRecommendationStoreDir();
  const filePath = getRecommendationStorePath();
  const tempPath = `${filePath}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(store, null, 2), "utf8");
  await fs.rename(tempPath, filePath);
}

function matchesSheetRef(left: BindingDecisionSheetRef, right: BindingDecisionSheetRef) {
  return (
    normalizeKeyPart(left.spreadsheetId) === normalizeKeyPart(right.spreadsheetId) &&
    normalizeKeyPart(left.sheetName) === normalizeKeyPart(right.sheetName)
  );
}

export async function loadRecommendationTraces(query: { branch: string; sheetRef: BindingDecisionSheetRef }) {
  const branch = normalizeText(query.branch);
  const sheetRef = normalizeSheetRef(query.sheetRef);
  if (!branch || !sheetRef.spreadsheetId || !sheetRef.sheetName) return [];
  const store = await readRecommendationStore();
  return Object.values(store.traces)
    .filter((trace) => normalizeKeyPart(trace.branch) === normalizeKeyPart(branch) && matchesSheetRef(trace.sheetRef, sheetRef))
    .sort((left, right) => normalizeText(left.decidedAt).localeCompare(normalizeText(right.decidedAt)) || left.traceKey.localeCompare(right.traceKey));
}

export async function saveRecommendationTrace(input: SaveRecommendationTraceInput) {
  const trace = normalizeRecommendationTrace(input);
  const store = await readRecommendationStore();
  const latestSameReference = Object.values(store.traces)
    .filter((item) => item.referenceKey === trace.referenceKey)
    .sort((left, right) => normalizeText(left.decidedAt).localeCompare(normalizeText(right.decidedAt)) || left.traceKey.localeCompare(right.traceKey));
  const latestTrace = latestSameReference[latestSameReference.length - 1];
  if (latestTrace && latestTrace.outcome === trace.outcome) {
    return latestTrace;
  }
  store.traces[trace.traceKey] = trace;
  await writeRecommendationStore(store);
  return trace;
}

export function __setRecommendationStoreDirForTests(dir: string | null) {
  recommendationStoreDirOverride = dir;
}

export function __getRecommendationStorePathForTests() {
  return getRecommendationStorePath();
}
