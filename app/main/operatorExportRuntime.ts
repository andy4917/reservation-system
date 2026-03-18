import type {
  BindingDecisionSheetRef,
  OperatorExportBundle,
  OperatorExportHandoffFormat,
  OperatorExportHandoffPayload,
  OperatorExportManifest,
  RecommendationTrace
} from "../contracts/provider.js";
import { loadRecommendationTraces } from "./recommendationStore.js";
import { loadOperatorHandoffHistory } from "./operatorHandoffStore.js";
import { getSheetRunArtifact } from "./runArtifactStore.js";
import { classifySheetVerifySummary, formatSheetVerifySummary } from "../services/sheetVerifySummary.js";

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function compareTrace(left: RecommendationTrace, right: RecommendationTrace) {
  return normalizeText(left.decidedAt).localeCompare(normalizeText(right.decidedAt)) || left.traceKey.localeCompare(right.traceKey);
}

function compareHandoffByExportedAt(left: { exportedAt: string; handoffId: string }, right: { exportedAt: string; handoffId: string }) {
  return normalizeText(left.exportedAt).localeCompare(normalizeText(right.exportedAt)) || left.handoffId.localeCompare(right.handoffId);
}

function buildSheetRef(summary: NonNullable<ReturnType<typeof getSheetRunArtifact>>["summary"]): BindingDecisionSheetRef {
  return {
    spreadsheetId: normalizeText(summary?.spreadsheetId),
    sheetName: normalizeText(summary?.sheetName),
    sheetId: null,
    timezone: "Asia/Seoul"
  };
}

function buildLatestTraceMap(traces: RecommendationTrace[]) {
  const byReference = new Map<string, RecommendationTrace>();
  const sorted = [...traces].sort(compareTrace);
  for (const trace of sorted) {
    byReference.set(trace.referenceKey, trace);
  }
  return byReference;
}

function sanitizeFileToken(value: string) {
  const normalized = normalizeText(value).replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/-{2,}/g, "-");
  return normalized || "unknown";
}

function buildExportBaseName(manifest: OperatorExportManifest) {
  return [
    "operator-export",
    sanitizeFileToken(manifest.branch),
    sanitizeFileToken(manifest.startDate),
    sanitizeFileToken(manifest.endDate),
    sanitizeFileToken(manifest.runId)
  ].join("-");
}

function buildOperatorLoopLines(bundle: {
  branch: string;
  manifest: OperatorExportManifest;
  verifyLines: string[];
  unresolvedCount: number;
  softTriageCount: number;
  precisionSectionsNeedingReview: string[];
  latestAcceptedCount: number;
  latestRejectedCount: number;
  sections: OperatorExportBundle["sections"];
  latestTraces: RecommendationTrace[];
}) {
  const unresolvedSections = bundle.sections.filter((item) => item.unresolvedCount > 0).map((item) => item.sectionKey);
  const latestTrace = bundle.latestTraces[bundle.latestTraces.length - 1];
  return [
    `1. run=${bundle.manifest.runId} branch=${bundle.branch} range=${bundle.manifest.startDate}..${bundle.manifest.endDate} source=${bundle.manifest.source}를 확인합니다.`,
    `2. unresolved=${bundle.unresolvedCount} softTriage=${bundle.softTriageCount} triageCoverage=${bundle.manifest.triageCoverage} precision=${bundle.manifest.precisionScore}를 보고 ${unresolvedSections.join(", ") || "미해결 없음"} 순서로 검토합니다.`,
    `3. precisionGate=${bundle.precisionSectionsNeedingReview.length > 0 ? `needs-review(${bundle.precisionSectionsNeedingReview.join(", ")})` : "ready"} 여부를 확인합니다.`,
    `4. accepted=${bundle.latestAcceptedCount} rejected=${bundle.latestRejectedCount} 최신 판정${latestTrace ? `(${latestTrace.rawHeader} -> ${latestTrace.candidateId})` : ""}을 확인합니다.`,
    `5. verify ${bundle.manifest.verifyClassification}와 핵심 근거 ${bundle.verifyLines.slice(0, 2).join(" | ") || "없음"}을 전달물에 포함합니다.`
  ];
}

function buildCopyText(bundle: {
  manifest: OperatorExportManifest;
  sections: OperatorExportBundle["sections"];
  latestTraces: RecommendationTrace[];
  verifyLines: string[];
  evidenceLineage: string[];
  operatorLoopLines: string[];
}) {
  const sectionLines = bundle.sections.map(
    (item) =>
      `- ${item.sectionKey} [${item.state}] bindings=${item.bindingCount} unresolved=${item.unresolvedCount} exactAuto=${item.exactAutoBindingCount} softTriage=${item.softTriageCount} precision=${item.precisionScore} gate=${item.precisionGate} accepted=${item.latestAcceptedCount} rejected=${item.latestRejectedCount}`
  );
  const traceLines = bundle.latestTraces.slice(-5).map(
    (trace) => `- ${trace.outcome} ${trace.sectionKey || "global"} ${trace.rawHeader} -> ${trace.candidateId} @ ${trace.decidedAt}`
  );
  return [
    "[운영 전달물]",
    `run=${bundle.manifest.runId}`,
    `branch=${bundle.manifest.branch}`,
    `sheet=${bundle.manifest.sheetName} (${bundle.manifest.spreadsheetId || "-"})`,
    `range=${bundle.manifest.startDate}..${bundle.manifest.endDate}`,
    `source=${bundle.manifest.source}`,
    `verify=${bundle.manifest.verifyClassification}`,
    "",
    "[측정]",
    `sectionCount=${bundle.manifest.sectionCount}`,
    `unresolvedCount=${bundle.manifest.unresolvedCount}`,
    `exactAutoBindingCount=${bundle.manifest.exactAutoBindingCount}`,
    `softTriageCount=${bundle.manifest.softTriageCount}`,
    `precisionScore=${bundle.manifest.precisionScore}`,
    `precisionGate=${bundle.manifest.precisionGate}`,
    `triageCoverage=${bundle.manifest.triageCoverage}`,
    `traceCount=${bundle.manifest.traceCount}`,
    `latestAccepted=${bundle.manifest.latestAcceptedCount}`,
    `latestRejected=${bundle.manifest.latestRejectedCount}`,
    "",
    "[섹션]",
    ...(sectionLines.length > 0 ? sectionLines : ["- 없음"]),
    "",
    "[최근 판정]",
    ...(traceLines.length > 0 ? traceLines : ["- 없음"]),
    "",
    "[검증 근거]",
    ...bundle.verifyLines.map((line) => `- ${line}`),
    "",
    "[Evidence Lineage]",
    ...bundle.evidenceLineage.map((line) => `- ${line}`),
    "",
    "[Operator Loop]",
    ...bundle.operatorLoopLines
  ].join("\n");
}

function buildCsvContent(bundle: {
  manifest: OperatorExportManifest;
  sections: OperatorExportBundle["sections"];
}) {
  const header = [
    "runId",
    "branch",
    "sectionKey",
    "state",
    "bindingCount",
    "unresolvedCount",
    "exactAutoBindingCount",
    "softTriageCount",
    "precisionScore",
    "precisionGate",
    "latestAcceptedCount",
    "latestRejectedCount",
    "verifyClassification",
    "triageCoverage"
  ];
  const rows = bundle.sections.map((item) =>
    [
      bundle.manifest.runId,
      bundle.manifest.branch,
      item.sectionKey,
      item.state,
      String(item.bindingCount),
      String(item.unresolvedCount),
      String(item.exactAutoBindingCount),
      String(item.softTriageCount),
      String(item.precisionScore),
      item.precisionGate,
      String(item.latestAcceptedCount),
      String(item.latestRejectedCount),
      bundle.manifest.verifyClassification,
      String(bundle.manifest.triageCoverage)
    ]
      .map((value) => `"${String(value).replace(/"/g, '""')}"`)
      .join(",")
  );
  return [header.join(","), ...rows].join("\n");
}

export function buildOperatorExportHandoffPayloads(bundle: OperatorExportBundle): OperatorExportBundle["handoff"] {
  const baseName = buildExportBaseName(bundle.manifest);
  const jsonPayload = {
    format: "json",
    fileName: `${baseName}.json`,
    mimeType: "application/json",
    content: JSON.stringify(bundle, null, 2)
  } satisfies OperatorExportHandoffPayload;
  const csvPayload = {
    format: "csv",
    fileName: `${baseName}.csv`,
    mimeType: "text/csv",
    content: buildCsvContent(bundle)
  } satisfies OperatorExportHandoffPayload;
  return {
    copyText: buildCopyText({
      manifest: bundle.manifest,
      sections: bundle.sections,
      latestTraces: bundle.traces,
      verifyLines: bundle.verifyEvidence.summaryLines,
      evidenceLineage: bundle.evidenceLineage,
      operatorLoopLines: bundle.operatorLoopLines
    }),
    files: [jsonPayload, csvPayload]
  };
}

export function resolveOperatorExportHandoffPayload(
  bundle: OperatorExportBundle,
  format: OperatorExportHandoffFormat
): OperatorExportHandoffPayload | null {
  if (format === "copy-text") {
    return {
      format,
      fileName: `${buildExportBaseName(bundle.manifest)}.txt`,
      mimeType: "text/plain",
      content: bundle.handoff.copyText
    };
  }
  return bundle.handoff.files.find((item) => item.format === format) || null;
}

export async function buildOperatorExport(query: { runId: string; branch: string }): Promise<OperatorExportBundle | null> {
  const runId = normalizeText(query.runId);
  const branch = normalizeText(query.branch);
  if (!runId || !branch) return null;
  const artifact = getSheetRunArtifact(runId);
  if (!artifact?.summary) return null;

  const sheetRef = buildSheetRef(artifact.summary);
  const traces = await loadRecommendationTraces({ branch, sheetRef });
  const fullHandoffHistory = await loadOperatorHandoffHistory({ branch, sheetRef });
  const handoffHistory = fullHandoffHistory.slice(0, 5);
  const visibleHandoffIds = new Set(handoffHistory.map((item) => item.handoffId));
  const followUpQueue = fullHandoffHistory
    .filter((item) => item.status === "needs-follow-up" && !visibleHandoffIds.has(item.handoffId))
    .sort(compareHandoffByExportedAt)
    .slice(0, 5);
  const handoffSummary = {
    totalCount: fullHandoffHistory.length,
    pendingCount: fullHandoffHistory.filter((item) => item.status !== "confirmed").length,
    needsFollowUpCount: fullHandoffHistory.filter((item) => item.status === "needs-follow-up").length,
    confirmedCount: fullHandoffHistory.filter((item) => item.status === "confirmed").length,
    hiddenNeedsFollowUpCount: Math.max(0, fullHandoffHistory.filter((item) => item.status === "needs-follow-up").length - handoffHistory.filter((item) => item.status === "needs-follow-up").length)
  };
  const latestTraceMap = buildLatestTraceMap(traces);
  const latestTraces = [...latestTraceMap.values()].sort(compareTrace);
  const latestAcceptedCount = latestTraces.filter((trace) => trace.outcome === "accepted").length;
  const latestRejectedCount = latestTraces.filter((trace) => trace.outcome === "rejected").length;
  const triagedCandidateCount = latestAcceptedCount + latestRejectedCount;
  const supersededTraceCount = Math.max(0, traces.length - latestTraces.length);
  const manualDecisionCount = artifact.mappingArtifacts.reduce(
    (count, item) => count + item.bindings.filter((binding) => binding.method === "manual").length,
    0
  );
  const unresolvedCount = artifact.mappingArtifacts.reduce((count, item) => count + item.unresolved.length, 0);
  const exactAutoBindingCount = artifact.mappingArtifacts.reduce(
    (count, item) => count + Number(item.metrics?.exactAutoBindingCount || 0),
    0
  );
  const softTriageCount = artifact.mappingArtifacts.reduce((count, item) => count + Number(item.metrics?.softTriageCount || 0), 0);
  const precisionBase = exactAutoBindingCount + softTriageCount;
  const precisionScore = precisionBase > 0 ? Number((exactAutoBindingCount / precisionBase).toFixed(3)) : 0;
  const triageCoverageBase = triagedCandidateCount + unresolvedCount;
  const triageCoverage = triageCoverageBase > 0 ? Number((triagedCandidateCount / triageCoverageBase).toFixed(3)) : 1;
  const verifyLines = formatSheetVerifySummary(artifact.summary, artifact.source, artifact.error, branch);
  const verifyClassification = classifySheetVerifySummary(artifact.summary, artifact.source, artifact.error);
  const sections = artifact.mappingArtifacts.map((item) => {
    const sectionTraces = latestTraces.filter((trace) => normalizeText(trace.sectionKey) === normalizeText(item.section.sectionKey));
    return {
      sectionKey: item.section.sectionKey,
      state: item.section.state,
      bindingCount: item.bindings.length,
      unresolvedCount: item.unresolved.length,
      exactAutoBindingCount: Number(item.metrics?.exactAutoBindingCount || 0),
      softTriageCount: Number(item.metrics?.softTriageCount || 0),
      precisionScore: Number(item.metrics?.precisionScore || 0),
      precisionGate: item.metrics?.precisionGate || "not-applicable",
      latestAcceptedCount: sectionTraces.filter((trace) => trace.outcome === "accepted").length,
      latestRejectedCount: sectionTraces.filter((trace) => trace.outcome === "rejected").length
    };
  });
  const precisionGate =
    sections.some((item) => item.precisionGate === "needs-review")
      ? "needs-review"
      : sections.some((item) => item.precisionGate === "ready")
        ? "ready"
        : "not-applicable";
  const precisionSectionsNeedingReview = sections.filter((item) => item.precisionGate === "needs-review").map((item) => item.sectionKey);
  const manifest = {
    runId: artifact.runId,
    branch,
    generatedAt: new Date().toISOString(),
    source: artifact.source || "unknown",
    verifyClassification,
    spreadsheetId: sheetRef.spreadsheetId,
    sheetName: sheetRef.sheetName,
    startDate: artifact.summary.startDate,
    endDate: artifact.summary.endDate,
    sectionCount: sections.length,
    unresolvedCount,
    exactAutoBindingCount,
    softTriageCount,
    precisionScore,
    precisionGate,
    triageCoverage,
    traceCount: traces.length,
    latestAcceptedCount,
    latestRejectedCount
  } satisfies OperatorExportManifest;
  const evidenceLineage = [
    `run:${artifact.runId}`,
    `branch:${branch}`,
    `verify:${verifyClassification}`,
    `source:${artifact.source || "unknown"}`
  ];
  const operatorLoopLines = buildOperatorLoopLines({
    branch,
    manifest,
    verifyLines,
    unresolvedCount,
    softTriageCount,
    precisionSectionsNeedingReview,
    latestAcceptedCount,
    latestRejectedCount,
    sections,
    latestTraces
  });

  const previewLines = [
    `run=${artifact.runId} branch=${branch}`,
    `sheet=${artifact.summary.sheetName} (${artifact.summary.spreadsheetId || "-"})`,
    `range=${artifact.summary.startDate}..${artifact.summary.endDate}`,
    `verify=${verifyClassification} source=${artifact.source || "unknown"} failure=${artifact.summary.failureCategory}`,
    `sections=${sections.length} manualDecisions=${manualDecisionCount} unresolved=${unresolvedCount} exactAuto=${exactAutoBindingCount} softTriage=${softTriageCount} precision=${precisionScore} gate=${precisionGate}`,
    `recommendations=accepted ${latestAcceptedCount} rejected ${latestRejectedCount} traces ${traces.length} superseded ${supersededTraceCount}`,
    `triageCoverage=${triageCoverage}`,
    `handoff-summary=total ${handoffSummary.totalCount} pending ${handoffSummary.pendingCount} needs-follow-up ${handoffSummary.needsFollowUpCount} confirmed ${handoffSummary.confirmedCount} hidden-follow-up ${handoffSummary.hiddenNeedsFollowUpCount}`,
    ...sections.map(
      (item) =>
        `section=${item.sectionKey} state=${item.state} bindings=${item.bindingCount} unresolved=${item.unresolvedCount} exactAuto=${item.exactAutoBindingCount} softTriage=${item.softTriageCount} precision=${item.precisionScore} gate=${item.precisionGate} accepted=${item.latestAcceptedCount} rejected=${item.latestRejectedCount}`
    ),
    ...latestTraces.slice(-5).map(
      (trace) =>
        `trace=${trace.outcome} ${trace.sectionKey || "global"} ${trace.rawHeader} -> ${trace.candidateId} @ ${trace.decidedAt}`
    ),
    ...handoffHistory.map(
      (item) =>
        `handoff=${item.target} ${item.format} ${item.fileName || "clipboard"} @ ${item.exportedAt} status=${item.status} bytes=${item.bytes}`
    ),
    ...followUpQueue.map(
      (item) => `follow-up-queue=${item.target} ${item.format} ${item.fileName || "clipboard"} @ ${item.exportedAt} status=${item.status}`
    ),
    ...verifyLines.map((line) => `verify-line=${line}`),
    ...operatorLoopLines.map((line) => `loop=${line}`)
  ];

  const bundle: OperatorExportBundle = {
    runId: artifact.runId,
    branch,
    generatedAt: manifest.generatedAt,
    sheetRef,
    dateRange: {
      startDate: artifact.summary.startDate,
      endDate: artifact.summary.endDate
    },
    verifyEvidence: {
      source: artifact.source || "unknown",
      classification: verifyClassification,
      failureCategory: artifact.summary.failureCategory,
      failureDetail: artifact.summary.failureDetail,
      summaryLines: verifyLines
    },
    metrics: {
      sectionCount: sections.length,
      manualDecisionCount,
      unresolvedCount,
      exactAutoBindingCount,
      softTriageCount,
      precisionScore,
      precisionGate,
      latestAcceptedCount,
      latestRejectedCount,
      triagedCandidateCount,
      triageCoverage,
      supersededTraceCount,
      traceCount: traces.length
    },
    sections,
    traces,
    manifest,
    evidenceLineage,
    operatorLoopLines,
    handoffSummary,
    handoffHistory,
    followUpQueue,
    handoff: {
      copyText: "",
      files: []
    },
    previewLines
  };
  bundle.handoff = buildOperatorExportHandoffPayloads(bundle);
  return bundle;
}
