import type {
  IndexWorkspaceSearchRequest,
  QueryWorkspaceSearchRequest,
  SearchDocument,
  SearchDocumentKind,
  SearchHit,
  WorkspaceSearchIndexInput
} from "../contracts/provider.js";
import { formatSheetVerifySummary } from "../services/sheetVerifySummary.js";

const MAX_INDEXED_RUNS = 20;
const MAX_RESULTS = 12;

const indexedRuns = new Map<string, SearchDocument[]>();

function normalizeText(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function tokenize(value: string) {
  return normalizeText(value)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function clipText(value: unknown, max = 220) {
  const text = String(value ?? "").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function pushDocument(target: SearchDocument[], document: SearchDocument) {
  if (!document.rawText.trim()) return;
  target.push(document);
}

function buildLineDocuments(input: {
  runId: string;
  kind: Extract<SearchDocumentKind, "inventory-explanation" | "reservation-explanation" | "settings-explanation" | "validation-summary" | "structural-summary">;
  lines: string[];
  task: "inventory-compare" | "reservation-audit" | "settings";
  panel?: "evidence" | "ops" | "validation" | "logs";
  source: string;
  sectionKey?: string | null;
  evidenceLineage?: string[];
}) {
  return input.lines.map((line, index) => ({
    docId: `${input.kind}:${input.runId}:${index}:${input.source}`,
    runId: input.runId,
    kind: input.kind,
    sectionKey: input.sectionKey || null,
    source: input.source,
    sourceLineIndex: index,
    rawText: clipText(line),
    canonicalFields: [clipText(line)],
    candidateBasis: [],
    signals: [],
    tags: [input.source],
    evidenceLineage: [...(input.evidenceLineage || [])],
    jumpTarget: {
      runId: input.runId,
      task: input.task,
      panel: input.panel,
      lineIndex: index
    }
  } satisfies SearchDocument));
}

function buildDecisionTraceDocuments(input: WorkspaceSearchIndexInput) {
  return input.savedDecisions.map((decision, index) => ({
    docId: `decision:${input.runId}:${decision.decisionKey || index}`,
    runId: input.runId,
    kind: "decision-trace",
    sectionKey: decision.sectionKey || null,
    source: "binding-store",
    sourceLineIndex: index,
    rawText: clipText(
      `${decision.branch} ${decision.sectionKey || ""} ${decision.rawHeader} ${decision.termId} ${decision.decidedAt} confidence=${decision.confidence}`
    ),
    canonicalFields: [decision.branch, decision.sectionKey || "", decision.rawHeader, decision.termId].map(clipText),
    candidateBasis: [decision.termId],
    signals: [decision.anchorId],
    tags: [decision.branch, decision.sectionKey || "global", "manual"],
    evidenceLineage: [
      `decisionKey:${decision.decisionKey}`,
      `anchor:${decision.anchorId}`,
      `sheet:${decision.sheetRef.spreadsheetId}:${decision.sheetRef.sheetName}`
    ],
    jumpTarget: {
      runId: input.runId,
      task: "settings",
      anchorId: decision.anchorId,
      sectionKey: decision.sectionKey || null
    }
  } satisfies SearchDocument));
}

function buildAcceptanceTraceDocuments(input: WorkspaceSearchIndexInput) {
  return input.recommendationTraces.map((trace, index) => ({
    docId: `acceptance:${input.runId}:${trace.traceKey || index}`,
    runId: input.runId,
    kind: "acceptance-trace",
    sectionKey: trace.sectionKey || null,
    source: `recommendation:${trace.outcome}`,
    sourceLineIndex: index,
    rawText: clipText(
      `${trace.outcome} ${trace.candidateId} ${trace.rawHeader} ${trace.sectionKey || ""} ${trace.decidedAt} ${trace.modelVersion}`
    ),
    canonicalFields: [trace.candidateId, trace.rawHeader, trace.sectionKey || "", trace.outcome].map(clipText),
    candidateBasis: trace.candidateBasis.map(clipText),
    signals: [],
    tags: [trace.outcome, trace.modelVersion, trace.branch],
    evidenceLineage: [...trace.evidenceLineage],
    jumpTarget: {
      runId: input.runId,
      task: "settings",
      anchorId: trace.anchorId,
      sectionKey: trace.sectionKey || null
    }
  } satisfies SearchDocument));
}

function buildSearchDocuments(input: WorkspaceSearchIndexInput) {
  const documents: SearchDocument[] = [];

  input.inventoryRows.forEach((row, index) => {
    pushDocument(documents, {
      docId: `inventory:${input.runId}:${row.id || index}`,
      runId: input.runId,
      kind: "inventory-explanation",
      sectionKey: input.branch,
      source: "inventory-compare",
      sourceLineIndex: index,
      rawText: clipText(`${row.date} ${row.roomType} ${row.channel} ${row.siteRaw} ${row.sheetRaw} ${row.reason} ${row.action}`),
      canonicalFields: [row.date, row.roomType, row.channel, row.reason, row.action].map(clipText),
      candidateBasis: [row.siteRaw, row.sheetRaw].map(clipText),
      signals: [],
      tags: [input.branch, row.channel],
      evidenceLineage: [`inventory-row:${row.id}`, `branch:${input.branch}`],
      jumpTarget: {
        runId: input.runId,
        task: "inventory-compare",
        rowId: row.id
      }
    });
  });

  input.reservationRows.forEach((row, index) => {
    pushDocument(documents, {
      docId: `audit:${input.runId}:${row.id || index}`,
      runId: input.runId,
      kind: "reservation-explanation",
      sectionKey: input.branch,
      source: "reservation-audit",
      sourceLineIndex: index,
      rawText: clipText(
        `${row.reservationNo} ${row.guestName} ${row.channel} ${row.checkin} ${row.checkout} ${row.status} ${row.auditStatus} ${row.reason} ${row.action}`
      ),
      canonicalFields: [row.reservationNo, row.guestName, row.channel, row.status, row.auditStatus].map(clipText),
      candidateBasis: [row.checkin, row.checkout, row.reason, row.action].map(clipText),
      signals: [],
      tags: [input.branch, row.channel, row.status],
      evidenceLineage: [`reservation-row:${row.id}`, `branch:${input.branch}`],
      jumpTarget: {
        runId: input.runId,
        task: "reservation-audit",
        rowId: row.id
      }
    });
  });

  input.mappingArtifacts.forEach((artifact, artifactIndex) => {
    const metrics = artifact.metrics;
    const exactAutoBindings = artifact.bindings.filter((binding) => normalizeText(binding.resolvedCanonicalId));
    pushDocument(documents, {
      docId: `binding-summary:${input.runId}:${artifact.section.sectionKey}`,
      runId: input.runId,
      kind: "binding-summary",
      sectionKey: artifact.section.sectionKey,
      source: "mapping-binding-summary",
      sourceLineIndex: null,
      rawText: clipText(
        `${artifact.section.sectionKey} ${artifact.section.state} exactAuto=${metrics?.exactAutoBindingCount || 0} roomAlias=${metrics?.roomAliasBindingCount || 0} reservationIdentity=${metrics?.reservationIdentityBindingCount || 0} softTriage=${metrics?.softTriageCount || 0} targetedUnresolved=${metrics?.targetedUnresolvedCount || 0} precisionScore=${metrics?.precisionScore || 0} precisionGate=${metrics?.precisionGate || "not-applicable"}`
      ),
      canonicalFields: [
        artifact.section.sectionKey,
        artifact.section.state,
        metrics?.precisionGate || "not-applicable",
        `precisionScore=${metrics?.precisionScore || 0}`,
        `exactAuto=${metrics?.exactAutoBindingCount || 0}`,
        `softTriage=${metrics?.softTriageCount || 0}`
      ].map(clipText),
      candidateBasis: [
        "inventory.room-alias",
        "reservation.identity",
        ...exactAutoBindings.map((binding) => binding.termId),
        ...exactAutoBindings.map((binding) => binding.resolvedCanonicalId || "")
      ].map(clipText),
      signals: exactAutoBindings.flatMap((binding) =>
        [`binding:${binding.anchorId}:${binding.termId}`, `canonical:${binding.resolvedCanonicalId || ""}`].map(clipText)
      ),
      tags: [
        artifact.section.state,
        `precision:${metrics?.precisionGate || "not-applicable"}`,
        `artifact:${artifactIndex}`,
        "auto-binding"
      ],
      evidenceLineage: [
        `section:${artifact.section.sectionKey}`,
        `metric:exactAutoBindingCount:${metrics?.exactAutoBindingCount || 0}`,
        `metric:softTriageCount:${metrics?.softTriageCount || 0}`,
        `metric:precisionScore:${metrics?.precisionScore || 0}`,
        `metric:precisionGate:${metrics?.precisionGate || "not-applicable"}`
      ],
      jumpTarget: {
        runId: input.runId,
        task: "settings",
        sectionKey: artifact.section.sectionKey
      }
    });

    artifact.unresolved.forEach((item, unresolvedIndex) => {
      const mappingDomain = item.mappingDomain || "validation";
      const severity = item.severity || "medium";
      const confidence = Number(item.confidence ?? 0);
      const ruleId = item.ruleId || "none";
      const evidenceSignals = Array.isArray(item.evidenceSignals) ? item.evidenceSignals : [];
      pushDocument(documents, {
        docId: `unresolved:${input.runId}:${artifact.section.sectionKey}:${unresolvedIndex}`,
        runId: input.runId,
        kind: "unresolved-binding",
        sectionKey: artifact.section.sectionKey,
        source: "sheet-mapping",
        sourceLineIndex: unresolvedIndex,
        rawText: clipText(
          `${artifact.section.sectionKey} ${item.rawHeader} ${item.reason} ${item.sampleValues.join(" ")} ${item.candidateTerms.join(" ")} confidence=${confidence} domain=${mappingDomain} severity=${severity} rule=${ruleId} signals=${evidenceSignals.join(" ") || "none"}`
        ),
        canonicalFields: [
          artifact.section.sectionKey,
          item.rawHeader,
          item.reason,
          mappingDomain,
          severity,
          `confidence=${confidence}`,
          `rule=${ruleId}`
        ].map(clipText),
        candidateBasis: item.candidateTerms.map((term) => clipText(term)),
        signals: [...item.sampleValues, ...evidenceSignals].map((value) => clipText(value)),
        tags: [
          artifact.section.sectionKey,
          artifact.section.state,
          `artifact:${artifactIndex}`,
          `domain:${mappingDomain}`,
          `severity:${severity}`,
          `rule:${ruleId}`,
          item.reason === "reservation-identity-soft-match"
            ? "precision:soft-triage"
            : item.reason === "room-alias-ambiguous"
              ? "precision:alias-ambiguous"
              : "precision:unresolved"
        ],
        evidenceLineage: [
          `anchor:${item.anchorId}`,
          `section:${artifact.section.sectionKey}`,
          `rule:${ruleId}`,
          `confidence:${confidence}`,
          ...item.sampleValues.slice(0, 3).map((value) => `value:${clipText(value)}`),
          ...evidenceSignals.slice(0, 3).map((value) => `signal:${clipText(value)}`)
        ],
        jumpTarget: {
          runId: input.runId,
          task: "settings",
          anchorId: item.anchorId,
          sectionKey: artifact.section.sectionKey
        }
      });
    });

    artifact.structuralSummary.forEach((item, structuralIndex) => {
      pushDocument(documents, {
        docId: `structural:${input.runId}:${artifact.section.sectionKey}:${structuralIndex}`,
        runId: input.runId,
        kind: "structural-summary",
        sectionKey: artifact.section.sectionKey,
        source: "mapping-structural-summary",
        sourceLineIndex: structuralIndex,
        rawText: clipText(`${artifact.section.sectionKey} ${item.kind} ${String(item.value ?? "")} ${item.detail}`),
        canonicalFields: [artifact.section.sectionKey, item.kind, String(item.value ?? "")].map(clipText),
        candidateBasis: [item.detail].map(clipText),
        signals: [],
        tags: [artifact.section.state, item.kind],
        evidenceLineage: [`section:${artifact.section.sectionKey}`, `structural:${item.kind}`],
        jumpTarget: {
          runId: input.runId,
          task: "settings",
          sectionKey: artifact.section.sectionKey
        }
      });
    });

    if (artifact.validationSummary.physicalOrderVariant) {
      pushDocument(documents, {
        docId: `structural:${input.runId}:${artifact.section.sectionKey}:physical-order`,
        runId: input.runId,
        kind: "structural-summary",
        sectionKey: artifact.section.sectionKey,
        source: "mapping-validation-structural",
        sourceLineIndex: null,
        rawText: clipText(`${artifact.section.sectionKey} physicalOrderVariant=true row order differs but warning is not hidden`),
        canonicalFields: [artifact.section.sectionKey, "physicalOrderVariant", "true"].map(clipText),
        candidateBasis: ["row-order-variance", artifact.validationSummary.providerKey].map(clipText),
        signals: [],
        tags: [artifact.validationSummary.providerKey, "physicalOrderVariant"],
        evidenceLineage: [`section:${artifact.section.sectionKey}`, "structural:physicalOrderVariant"],
        jumpTarget: {
          runId: input.runId,
          task: "settings",
          sectionKey: artifact.section.sectionKey
        }
      });
    }

    artifact.validationSummary.issueCodes.forEach((issueCode, validationIndex) => {
      pushDocument(documents, {
        docId: `validation:${input.runId}:${artifact.section.sectionKey}:${validationIndex}`,
        runId: input.runId,
        kind: "validation-summary",
        sectionKey: artifact.section.sectionKey,
        source: "mapping-validation-summary",
        sourceLineIndex: validationIndex,
        rawText: clipText(
          `${artifact.section.sectionKey} ${issueCode} warning=${artifact.validationSummary.warningCount} error=${artifact.validationSummary.errorCount}`
        ),
        canonicalFields: [artifact.section.sectionKey, issueCode].map(clipText),
        candidateBasis: [artifact.validationSummary.providerKey, artifact.validationSummary.providerValueSourceReason].map(clipText),
        signals: [],
        tags: [artifact.validationSummary.providerKey, "validation"],
        evidenceLineage: [`section:${artifact.section.sectionKey}`, `issue:${issueCode}`],
        jumpTarget: {
          runId: input.runId,
          task: "settings",
          sectionKey: artifact.section.sectionKey
        }
      });
    });
  });

  buildLineDocuments({
    runId: input.runId,
    kind: "structural-summary",
    lines: input.artifactLines,
    task: "settings",
    panel: "logs",
    source: "artifact-lines",
    evidenceLineage: ["artifact-lines"]
  }).forEach((doc) => {
    pushDocument(documents, doc);
  });
  const explanationKind =
    input.activeTask === "reservation-audit"
      ? "reservation-explanation"
      : input.activeTask === "settings"
        ? "settings-explanation"
        : "inventory-explanation";
  const explanationTask = input.activeTask === "reservation-audit" ? "reservation-audit" : input.activeTask === "settings" ? "settings" : "inventory-compare";
  buildLineDocuments({
    runId: input.runId,
    kind: explanationKind,
    lines: input.evidenceLines,
    task: explanationTask,
    panel: "evidence",
    source: "panel:evidence",
    sectionKey: input.branch,
    evidenceLineage: ["panel:evidence"]
  }).forEach((doc) => {
    pushDocument(documents, doc);
  });
  buildLineDocuments({
    runId: input.runId,
    kind: explanationKind,
    lines: input.opsLines,
    task: explanationTask,
    panel: "ops",
    source: "panel:ops",
    sectionKey: input.branch,
    evidenceLineage: ["panel:ops"]
  }).forEach((doc) => {
    pushDocument(documents, doc);
  });
  buildLineDocuments({
    runId: input.runId,
    kind: "validation-summary",
    lines: input.validationLines,
    task: explanationTask,
    panel: "validation",
    source: "panel:validation",
    sectionKey: input.branch,
    evidenceLineage: ["panel:validation"]
  }).forEach((doc) => {
    pushDocument(documents, doc);
  });
  buildLineDocuments({
    runId: input.runId,
    kind: explanationKind,
    lines: input.logs,
    task: explanationTask,
    panel: "logs",
    source: "panel:logs",
    sectionKey: input.branch,
    evidenceLineage: ["panel:logs"]
  }).forEach((doc) => {
    pushDocument(documents, doc);
  });

  formatSheetVerifySummary(input.sheetSummary, input.sheetSource, input.sheetError, input.branch).forEach((line, index) => {
    pushDocument(documents, {
      docId: `verify:${input.runId}:${index}`,
      runId: input.runId,
      kind: "verify-output",
      sectionKey: input.branch,
      source: "repo-local-verify-shared-summary",
      sourceLineIndex: index,
      rawText: clipText(line),
      canonicalFields: [clipText(line)],
      candidateBasis: [],
      signals: [],
      tags: [input.branch, input.sheetSummary?.failureCategory || "none"],
      evidenceLineage: [
        `sheet-source:${input.sheetSource || "unknown"}`,
        `failure:${input.sheetSummary?.failureCategory || "none"}`
      ],
      jumpTarget: {
        runId: input.runId,
        task: "settings",
        sectionKey: input.branch
      }
    });
  });

  buildDecisionTraceDocuments(input).forEach((doc) => pushDocument(documents, doc));
  buildAcceptanceTraceDocuments(input).forEach((doc) => pushDocument(documents, doc));

  return documents;
}

function scoreDocument(queryTokens: string[], document: SearchDocument) {
  if (queryTokens.length === 0) return null;
  const haystacks = [
    document.rawText,
    ...document.canonicalFields,
    ...document.candidateBasis,
    ...document.signals,
    ...document.tags,
    ...document.evidenceLineage
  ]
    .map(normalizeText)
    .filter(Boolean);

  let score = 0;
  const matches: string[] = [];
  for (const token of queryTokens) {
    let matched = false;
    for (const haystack of haystacks) {
      if (haystack === token) {
        score += 8;
        matched = true;
        break;
      }
      if (haystack.includes(token)) {
        score += 4;
        matched = true;
        break;
      }
    }
    if (matched) {
      matches.push(token);
    } else {
      return null;
    }
  }

  const bonusByKind: Record<SearchDocumentKind, number> = {
    "inventory-explanation": 4,
    "reservation-explanation": 4,
    "settings-explanation": 4,
    "binding-summary": 5,
    "unresolved-binding": 6,
    "decision-trace": 4,
    "validation-summary": 4,
    "structural-summary": 3,
    "verify-output": 3,
    "acceptance-trace": 5
  };
  return {
    score: score + bonusByKind[document.kind],
    matchReason: matches.join(", ")
  };
}

function pruneIndexedRuns() {
  while (indexedRuns.size > MAX_INDEXED_RUNS) {
    const oldestKey = indexedRuns.keys().next().value;
    if (!oldestKey) break;
    indexedRuns.delete(oldestKey);
  }
}

export function indexWorkspaceSearch(request: IndexWorkspaceSearchRequest) {
  const payload = request.payload;
  const documents = buildSearchDocuments(payload);
  indexedRuns.set(payload.runId, documents);
  pruneIndexedRuns();
  return {
    ok: true as const,
    runId: payload.runId,
    documentCount: documents.length
  };
}

export function queryWorkspaceSearch(request: QueryWorkspaceSearchRequest) {
  const documents = indexedRuns.get(request.runId) || [];
  const queryTokens = tokenize(request.query);
  if (queryTokens.length === 0) {
    return {
      ok: true as const,
      runId: request.runId,
      hits: [] as SearchHit[]
    };
  }

  const hits = documents
    .map((document) => {
      const scored = scoreDocument(queryTokens, document);
      if (!scored) return null;
      return {
        docId: document.docId,
        kind: document.kind,
        sectionKey: document.sectionKey,
        source: document.source,
        score: scored.score,
        matchReason: scored.matchReason,
        excerpt: document.rawText,
        candidateBasis: [...document.candidateBasis],
        evidenceLineage: [...document.evidenceLineage],
        jumpTarget: document.jumpTarget
      } satisfies SearchHit;
    })
    .filter((hit): hit is SearchHit => Boolean(hit))
    .sort((left, right) => right.score - left.score || left.docId.localeCompare(right.docId))
    .slice(0, Math.max(1, Math.trunc(request.limit ?? MAX_RESULTS)));

  return {
    ok: true as const,
    runId: request.runId,
    hits
  };
}

export function __resetSearchRuntimeForTests() {
  indexedRuns.clear();
}
