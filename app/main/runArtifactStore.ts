import type {
  MappingArtifact,
  FetchSheetSnapshotSummary,
  SheetArtifactVisibleSlice
} from "../contracts/provider.js";

interface SheetRunArtifactInput {
  source: string;
  error: string;
  summary: FetchSheetSnapshotSummary | null;
  snapshot: Record<string, unknown> | null;
  mappingArtifacts?: MappingArtifact[];
}

interface SheetRunArtifactRecord extends SheetRunArtifactInput {
  runId: string;
  createdAt: string;
  lines: string[];
  mappingArtifacts: MappingArtifact[];
}

const MAX_SHEET_RUN_ARTIFACTS = 20;
const DEFAULT_VISIBLE_LIMIT = 12;

const sheetRunArtifacts = new Map<string, SheetRunArtifactRecord>();
let artifactSequence = 0;

function nextRunId() {
  artifactSequence += 1;
  return `sheet-run:${Date.now()}:${artifactSequence}`;
}

function pruneArtifacts() {
  while (sheetRunArtifacts.size > MAX_SHEET_RUN_ARTIFACTS) {
    const oldestKey = sheetRunArtifacts.keys().next().value;
    if (!oldestKey) break;
    sheetRunArtifacts.delete(oldestKey);
  }
}

function buildArtifactLines(record: SheetRunArtifactInput) {
  const summary = record.summary;
  if (!summary) {
    return [record.error || record.source || "sheet snapshot unavailable"];
  }

  const mappingArtifacts = Array.isArray(record.mappingArtifacts) ? record.mappingArtifacts : [];
  const bindingCount = mappingArtifacts.reduce((count, artifact) => count + artifact.bindings.length, 0);
  const unresolvedCount = mappingArtifacts.reduce((count, artifact) => count + artifact.unresolved.length, 0);

  const lines = [
    `시트 ${summary.sheetName || "미설정"} ${summary.startDate}..${summary.endDate}`,
    `mode=${summary.readMode || "unknown"} | failure=${summary.failureCategory}`,
    `anchor=NR ${summary.anchorSummary.namedRangeCount} / MD ${summary.anchorSummary.metadataCount} / manual=${summary.anchorSummary.manualAnchorUsed ? "yes" : "no"}`,
    `validation=${summary.validationSummary.issueCount} | reservationBlocks=${summary.reservationBlockCount}`,
    `value-source=${summary.validationSummary.providerValueSourceKind}:${summary.validationSummary.providerValueRow ?? "-"} (${summary.validationSummary.providerRowRole})`,
    `typed-slots=${summary.validationSummary.typedSlotComplete ? "complete" : "partial"} / duplicate=${summary.validationSummary.typedSlotDuplicate ? "yes" : "no"} / order-variant=${summary.validationSummary.physicalOrderVariant ? "yes" : "no"}`,
    `providerDays=NAVER ${summary.providerValueDays.NAVER} / STATION ${summary.providerValueDays.STATION}`,
    `mapping-sections=${mappingArtifacts.length} | bindings=${bindingCount} | unresolved=${unresolvedCount}`
  ];

  for (const artifact of mappingArtifacts) {
    lines.push(
      `section=${artifact.section.sectionKey} | state=${artifact.section.state} | anchors=${artifact.anchors.length} | bindings=${artifact.bindings.length} | unresolved=${artifact.unresolved.length} | exactAuto=${artifact.metrics?.exactAutoBindingCount ?? 0} | softTriage=${artifact.metrics?.softTriageCount ?? 0} | precision=${artifact.metrics?.precisionScore ?? 0}`
    );
  }

  if (summary.retryReason) {
    lines.push(`retry=${summary.retryReason}`);
  }
  if (summary.retryTrace.length > 0) {
    lines.push(...summary.retryTrace.map((entry) => `retry-trace=${entry}`));
  }
  if (summary.failureDetail) {
    lines.push(`detail=${summary.failureDetail}`);
  }
  if (record.error && record.error !== summary.failureDetail) {
    lines.push(`error=${record.error}`);
  }
  return lines;
}

export function createEmptyVisibleSlice(): SheetArtifactVisibleSlice {
  return {
    runId: null,
    offset: 0,
    limit: DEFAULT_VISIBLE_LIMIT,
    total: 0,
    lines: []
  };
}

export function storeSheetRunArtifact(input: SheetRunArtifactInput) {
  const runId = nextRunId();
  const mappingArtifacts = Array.isArray(input.mappingArtifacts)
    ? input.mappingArtifacts.map((artifact) => ({
        ...artifact,
        runId,
        bindings: [...artifact.bindings],
        unresolved: [...artifact.unresolved],
        anchors: [...artifact.anchors],
        structuralSummary: [...artifact.structuralSummary]
      }))
    : [];
  const record: SheetRunArtifactRecord = {
    ...input,
    runId,
    createdAt: new Date().toISOString(),
    mappingArtifacts,
    lines: buildArtifactLines({
      ...input,
      mappingArtifacts
    })
  };
  sheetRunArtifacts.set(runId, record);
  pruneArtifacts();
  return record;
}

export function getSheetRunArtifact(runId: string | null | undefined) {
  if (!runId) return null;
  return sheetRunArtifacts.get(runId) || null;
}

export function getSheetArtifactVisibleSlice(
  runId: string | null | undefined,
  offset = 0,
  limit = DEFAULT_VISIBLE_LIMIT
): SheetArtifactVisibleSlice {
  const record = getSheetRunArtifact(runId);
  if (!record) {
    return createEmptyVisibleSlice();
  }
  const normalizedOffset = Math.max(0, Math.trunc(offset));
  const normalizedLimit = Math.max(1, Math.trunc(limit));
  return {
    runId: record.runId,
    offset: normalizedOffset,
    limit: normalizedLimit,
    total: record.lines.length,
    lines: record.lines.slice(normalizedOffset, normalizedOffset + normalizedLimit)
  };
}

export function __resetRunArtifactStoreForTests() {
  sheetRunArtifacts.clear();
  artifactSequence = 0;
}
