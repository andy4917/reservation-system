import type {
  IndexWorkspaceSearchRequest,
  QueryWorkspaceSearchRequest,
  SearchDocument,
  SearchDocumentKind,
  SearchHit,
  WorkspaceSearchIndexInput
} from "../contracts/provider.js";

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

function buildLineDocuments(
  runId: string,
  kind: Extract<SearchDocumentKind, "artifact-line" | "evidence" | "ops" | "validation" | "log">,
  lines: string[],
  task: "inventory-compare" | "reservation-audit" | "settings",
  panel: "evidence" | "ops" | "validation" | "logs"
) {
  return lines.map((line, index) => ({
    docId: `${kind}:${runId}:${index}`,
    runId,
    kind,
    sourceSystem: panel,
    sourceLineIndex: index,
    rawText: clipText(line),
    canonicalFields: [clipText(line)],
    candidateBasis: [],
    signals: [],
    tags: [panel],
    jumpTarget: {
      runId,
      task,
      panel,
      lineIndex: index
    }
  } satisfies SearchDocument));
}

function buildSearchDocuments(input: WorkspaceSearchIndexInput) {
  const documents: SearchDocument[] = [];

  input.inventoryRows.forEach((row, index) => {
    pushDocument(documents, {
      docId: `inventory:${input.runId}:${row.id || index}`,
      runId: input.runId,
      kind: "inventory-row",
      sourceSystem: "inventory-compare",
      sourceLineIndex: index,
      rawText: clipText(`${row.date} ${row.roomType} ${row.channel} ${row.siteRaw} ${row.sheetRaw} ${row.reason} ${row.action}`),
      canonicalFields: [row.date, row.roomType, row.channel, row.reason, row.action].map(clipText),
      candidateBasis: [row.siteRaw, row.sheetRaw].map(clipText),
      signals: [],
      tags: [input.branch, row.channel],
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
      kind: "audit-row",
      sourceSystem: "reservation-audit",
      sourceLineIndex: index,
      rawText: clipText(
        `${row.reservationNo} ${row.guestName} ${row.channel} ${row.checkin} ${row.checkout} ${row.status} ${row.auditStatus} ${row.reason} ${row.action}`
      ),
      canonicalFields: [row.reservationNo, row.guestName, row.channel, row.status, row.auditStatus].map(clipText),
      candidateBasis: [row.checkin, row.checkout, row.reason, row.action].map(clipText),
      signals: [],
      tags: [input.branch, row.channel, row.status],
      jumpTarget: {
        runId: input.runId,
        task: "reservation-audit",
        rowId: row.id
      }
    });
  });

  input.mappingArtifacts.forEach((artifact, artifactIndex) => {
    artifact.unresolved.forEach((item, unresolvedIndex) => {
      pushDocument(documents, {
        docId: `unresolved:${input.runId}:${artifact.section.sectionKey}:${unresolvedIndex}`,
        runId: input.runId,
        kind: "unresolved",
        sourceSystem: "sheet-mapping",
        sourceLineIndex: unresolvedIndex,
        rawText: clipText(
          `${artifact.section.sectionKey} ${item.rawHeader} ${item.reason} ${item.sampleValues.join(" ")} ${item.candidateTerms.join(" ")}`
        ),
        canonicalFields: [artifact.section.sectionKey, item.rawHeader, item.reason].map(clipText),
        candidateBasis: item.candidateTerms.map((term) => clipText(term)),
        signals: item.sampleValues.map((value) => clipText(value)),
        tags: [artifact.section.sectionKey, artifact.section.state, `artifact:${artifactIndex}`],
        jumpTarget: {
          runId: input.runId,
          task: "settings",
          sectionKey: artifact.section.sectionKey
        }
      });
    });
  });

  buildLineDocuments(input.runId, "artifact-line", input.artifactLines, "settings", "logs").forEach((doc) => {
    pushDocument(documents, doc);
  });
  buildLineDocuments(input.runId, "evidence", input.evidenceLines, "inventory-compare", "evidence").forEach((doc) => {
    pushDocument(documents, doc);
  });
  buildLineDocuments(input.runId, "ops", input.opsLines, "inventory-compare", "ops").forEach((doc) => {
    pushDocument(documents, doc);
  });
  buildLineDocuments(input.runId, "validation", input.validationLines, "inventory-compare", "validation").forEach((doc) => {
    pushDocument(documents, doc);
  });
  buildLineDocuments(input.runId, "log", input.logs, "inventory-compare", "logs").forEach((doc) => {
    pushDocument(documents, doc);
  });

  return documents;
}

function scoreDocument(queryTokens: string[], document: SearchDocument) {
  if (queryTokens.length === 0) return null;
  const haystacks = [document.rawText, ...document.canonicalFields, ...document.candidateBasis, ...document.signals, ...document.tags]
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
    "inventory-row": 4,
    "audit-row": 4,
    unresolved: 5,
    "artifact-line": 2,
    evidence: 2,
    ops: 1,
    validation: 2,
    log: 1
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
        score: scored.score,
        matchReason: scored.matchReason,
        excerpt: document.rawText,
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
