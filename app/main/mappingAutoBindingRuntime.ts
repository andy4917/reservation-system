import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import type {
  FetchSheetSnapshotSummary,
  MappingArtifact,
  MappingTermBinding,
  MappingUnresolvedBinding,
  ProviderReservationRow
} from "../contracts/provider.js";
import { loadTruthCatalogRuntime, normalizeTruthBranchKey } from "./truthCatalogRuntime.js";
import { refreshMappingArtifactsMetrics } from "../services/bindingArtifacts.js";

type ReservationSummaryLike = Record<string, unknown>;
type ReservationPairLike = {
  sheet: ReservationSummaryLike;
  pms: ReservationSummaryLike;
  matchType: "exact" | "soft";
  reasons?: string[];
  score?: number;
  conditionCount?: number;
};

type ReservationVerificationModule = {
  buildSheetReservationVerificationSource: (
    snapshot: Record<string, unknown>,
    providerKey: string
  ) => { summaries?: ReservationSummaryLike[] };
  buildPmsReservationVerificationSource: (
    records: ProviderReservationRow[],
    query: { startDate: string; endDate: string }
  ) => { summaries?: ReservationSummaryLike[] };
  pairReservationSummaries: (
    sheetSummaries: ReservationSummaryLike[],
    pmsSummaries: ReservationSummaryLike[],
    options?: { activeOnly?: boolean }
  ) => { pairs?: ReservationPairLike[] };
};

interface ApplyMappingAutoBindingOptions {
  mappingArtifacts: MappingArtifact[];
  snapshot: Record<string, unknown> | null;
  summary: FetchSheetSnapshotSummary | null;
  providerReservations?: ProviderReservationRow[];
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const runtimeScriptPaths = [
  "src/scan/normalize.js",
  "src/engine/noteKey.js",
  "src/domain/reservationPolicy.js",
  "src/report/validator.js",
  "src/report/reservationVerification.js"
].map((relativePath) => path.join(repoRoot, relativePath));

let cachedReservationVerificationModule: ReservationVerificationModule | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function toArray<T = unknown>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === "object" && Symbol.iterator in value) {
    return Array.from(value as Iterable<T>);
  }
  return [];
}

function loadScript(filePath: string) {
  const code = fs.readFileSync(filePath, "utf8");
  vm.runInThisContext(code, { filename: filePath });
}

function loadReservationVerificationModule() {
  if (cachedReservationVerificationModule) return cachedReservationVerificationModule;

  const root = globalThis as typeof globalThis & {
    App?: {
      report?: { reservationVerification?: ReservationVerificationModule };
    };
  };

  root.App = root.App || {};
  runtimeScriptPaths.forEach((filePath) => {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Reservation verification runtime script not found: ${filePath}`);
    }
    loadScript(filePath);
  });

  const reservationVerification = root.App?.report?.reservationVerification;
  if (
    !reservationVerification?.buildSheetReservationVerificationSource ||
    !reservationVerification?.buildPmsReservationVerificationSource ||
    !reservationVerification?.pairReservationSummaries
  ) {
    throw new Error("Reservation verification runtime is not available.");
  }

  cachedReservationVerificationModule = reservationVerification;
  return reservationVerification;
}

function buildAutoAnchorId(artifact: MappingArtifact, kind: "room-alias" | "reservation-identity", scope: string) {
  return `${artifact.section.spreadsheetId || "unknown"}:${artifact.section.sheetName || "unknown"}:${artifact.section.sectionKey}:auto:${kind}:${scope}`;
}

function collectRoomAliasBindings(artifact: MappingArtifact, snapshot: Record<string, unknown>) {
  const readHints = isRecord(snapshot.readHints) ? snapshot.readHints : {};
  const hintedMap = isRecord(readHints.roomTypeByRoomNo) ? readHints.roomTypeByRoomNo : {};
  const localMap = isRecord(readHints.localRoomTypeByRoomNo) ? readHints.localRoomTypeByRoomNo : {};
  const mergedRoomMap = {
    ...hintedMap,
    ...localMap
  };
  const truthCatalog = loadTruthCatalogRuntime();
  const branchKey = normalizeTruthBranchKey(artifact.section.sectionKey);
  const branchAliasIndex = truthCatalog.roomAliasIndex[branchKey] || {};

  const bindings: MappingTermBinding[] = [];
  const unresolved: MappingUnresolvedBinding[] = [];
  const seenBindingKeys = new Set<string>();
  const seenUnresolvedKeys = new Set<string>();
  const decidedAt = new Date().toISOString();

  for (const [roomNoRaw, roomTypeRaw] of Object.entries(mergedRoomMap)) {
    const aliasKey = normalizeTruthBranchKey(roomNoRaw);
    if (!aliasKey) continue;
    const sourceKind = Object.prototype.hasOwnProperty.call(localMap, roomNoRaw) ? "local-room-map" : "sheet-hint-room-map";
    const candidates = Array.from(
      new Set((branchAliasIndex[aliasKey] || []).map((entry) => normalizeText(entry.canonicalRoomId)).filter(Boolean))
    );
    const scope = `${aliasKey}`;

    if (candidates.length === 1) {
      const canonicalId = candidates[0];
      const dedupeKey = `${aliasKey}:${canonicalId}`;
      if (seenBindingKeys.has(dedupeKey)) continue;
      seenBindingKeys.add(dedupeKey);
      bindings.push({
        anchorId: buildAutoAnchorId(artifact, "room-alias", scope),
        termId: "inventory.room-alias",
        confidence: sourceKind === "local-room-map" ? 0.97 : 0.95,
        method: "rule",
        decidedAt,
        resolvedCanonicalId: canonicalId,
        mappingDomain: "inventory",
        evidenceSource: sourceKind,
        evidenceSignals: [
          `branch:${branchKey}`,
          `roomNo:${normalizeText(roomNoRaw)}`,
          `roomType:${normalizeText(roomTypeRaw)}`,
          `canonical:${canonicalId}`
        ],
        ruleId: "rule:auto-room-alias:v1",
        evidenceLineage: [`truth:room-alias:${branchKey}:${aliasKey}`],
        rawHeader: `ROOM_ALIAS:${normalizeText(roomNoRaw)}`
      });
      continue;
    }

    if (candidates.length > 1) {
      const unresolvedKey = `${aliasKey}:${candidates.join("|")}`;
      if (seenUnresolvedKeys.has(unresolvedKey)) continue;
      seenUnresolvedKeys.add(unresolvedKey);
      unresolved.push({
        anchorId: buildAutoAnchorId(artifact, "room-alias", scope),
        rawHeader: `ROOM_ALIAS_AMBIGUOUS:${normalizeText(roomNoRaw)}`,
        sampleValues: [
          `roomNo:${normalizeText(roomNoRaw)}`,
          `roomType:${normalizeText(roomTypeRaw)}`,
          ...candidates.map((candidate) => `candidate:${candidate}`)
        ],
        candidateTerms: ["inventory.room-alias"],
        reason: "room-alias-ambiguous",
        status: "open",
        mappingDomain: "inventory",
        severity: "medium",
        confidence: 0.42,
        evidenceSource: sourceKind,
        evidenceSignals: [`branch:${branchKey}`, `roomNo:${normalizeText(roomNoRaw)}`],
        ruleId: "rule:auto-room-alias-ambiguous:v1"
      });
    }
  }

  return { bindings, unresolved };
}

function summaryMatchesBranch(summary: ReservationSummaryLike, branchKey: string) {
  const branches = toArray(summary.branches)
    .map((value) => normalizeTruthBranchKey(value))
    .filter(Boolean);
  return branches.length === 0 || branches.includes(branchKey);
}

function buildReservationCanonicalId(summary: ReservationSummaryLike) {
  const reservationNo = normalizeText(summary.reservationNo || "");
  if (reservationNo) return `reservation:${reservationNo}`;
  const summaryKey = normalizeText(summary.summaryKey || "");
  return summaryKey ? `reservation-summary:${summaryKey}` : "";
}

function buildReservationIdentityBindings(
  artifact: MappingArtifact,
  snapshot: Record<string, unknown>,
  summary: FetchSheetSnapshotSummary,
  providerReservations: ProviderReservationRow[]
) {
  const query = {
    startDate: normalizeText(summary.startDate || ""),
    endDate: normalizeText(summary.endDate || "")
  };
  if (!query.startDate || !query.endDate || providerReservations.length <= 0) {
    return { bindings: [] as MappingTermBinding[], unresolved: [] as MappingUnresolvedBinding[] };
  }

  const reservationVerification = loadReservationVerificationModule();
  const sheetSource = reservationVerification.buildSheetReservationVerificationSource(snapshot, "wings-pms");
  const pmsSource = reservationVerification.buildPmsReservationVerificationSource(providerReservations, query);
  const branchKey = normalizeTruthBranchKey(artifact.section.sectionKey);
  const sheetSummaries = (Array.isArray(sheetSource.summaries) ? sheetSource.summaries : []).filter((item) =>
    summaryMatchesBranch(item, branchKey)
  );
  const pmsSummaries = (Array.isArray(pmsSource.summaries) ? pmsSource.summaries : []).filter((item) =>
    summaryMatchesBranch(item, branchKey)
  );
  if (sheetSummaries.length <= 0 || pmsSummaries.length <= 0) {
    return { bindings: [] as MappingTermBinding[], unresolved: [] as MappingUnresolvedBinding[] };
  }

  const pairing = reservationVerification.pairReservationSummaries(sheetSummaries, pmsSummaries, { activeOnly: true });
  const bindings: MappingTermBinding[] = [];
  const unresolved: MappingUnresolvedBinding[] = [];
  const decidedAt = new Date().toISOString();
  const seenBindingKeys = new Set<string>();
  const seenUnresolvedKeys = new Set<string>();

  for (const pair of Array.isArray(pairing.pairs) ? pairing.pairs : []) {
    const sheetSummary = isRecord(pair.sheet) ? pair.sheet : {};
    const pmsSummary = isRecord(pair.pms) ? pair.pms : {};
    const summaryKey = normalizeText(sheetSummary.summaryKey || "") || normalizeText(pmsSummary.summaryKey || "");
    const reasons = Array.isArray(pair.reasons) ? pair.reasons.filter((entry): entry is string => typeof entry === "string") : [];
    const primaryReason = reasons[0] || "";
    const canonicalId = buildReservationCanonicalId(pmsSummary);
    const anchorId = buildAutoAnchorId(artifact, "reservation-identity", summaryKey || canonicalId || "unscoped");

    if (pair.matchType === "exact" && canonicalId) {
      const bindingKey = `${anchorId}:${canonicalId}`;
      if (seenBindingKeys.has(bindingKey)) continue;
      seenBindingKeys.add(bindingKey);
      const confidence =
        primaryReason === "reservation_no" ? 0.99 :
          primaryReason === "reservation_ref" ? 0.97 :
            primaryReason === "soft_key" ? 0.93 :
              0.9;
      bindings.push({
        anchorId,
        termId: "reservation.identity",
        confidence,
        method: "rule",
        decidedAt,
        resolvedCanonicalId: canonicalId,
        mappingDomain: "reservation",
        evidenceSource: "pms-sheet-identity-pairing",
        evidenceSignals: [
          `branch:${branchKey}`,
          `match:${primaryReason || "exact"}`,
          `sheet:${normalizeText(sheetSummary.summaryKey || "")}`,
          `pms:${normalizeText(pmsSummary.summaryKey || "")}`
        ],
        ruleId: "rule:auto-reservation-identity:v1",
        evidenceLineage: [`pair:${normalizeText(pair.matchType)}`, ...reasons.map((reason) => `reason:${reason}`)],
        rawHeader: `RESERVATION_IDENTITY:${normalizeText(sheetSummary.summaryKey || canonicalId)}`
      });
      continue;
    }

    if (pair.matchType === "soft") {
      const unresolvedKey = `${anchorId}:${normalizeText(pmsSummary.summaryKey || "")}`;
      if (seenUnresolvedKeys.has(unresolvedKey)) continue;
      seenUnresolvedKeys.add(unresolvedKey);
      unresolved.push({
        anchorId,
        rawHeader: `RESERVATION_IDENTITY_SOFT:${normalizeText(sheetSummary.summaryKey || "")}`,
        sampleValues: [
          `sheet:${normalizeText(sheetSummary.summaryKey || "")}`,
          `pms:${normalizeText(pmsSummary.summaryKey || "")}`,
          `score:${Number(pair.score || 0)}`
        ],
        candidateTerms: ["reservation.identity"],
        reason: "reservation-identity-soft-match",
        status: "open",
        mappingDomain: "reservation",
        severity: "medium",
        confidence: 0.58,
        evidenceSource: "pms-sheet-identity-pairing",
        evidenceSignals: [`branch:${branchKey}`, ...reasons.map((reason) => `reason:${reason}`)],
        ruleId: "rule:auto-reservation-identity-soft-match:v1"
      });
    }
  }

  return { bindings, unresolved };
}

function mergeBindings(artifact: MappingArtifact, nextBindings: MappingTermBinding[]) {
  const existingKeys = new Set(
    artifact.bindings.map((binding) => `${binding.anchorId}:${binding.termId}:${binding.resolvedCanonicalId || ""}`)
  );
  const merged = [...artifact.bindings];
  for (const binding of nextBindings) {
    const key = `${binding.anchorId}:${binding.termId}:${binding.resolvedCanonicalId || ""}`;
    if (existingKeys.has(key)) continue;
    existingKeys.add(key);
    merged.push(binding);
  }
  return merged;
}

function mergeUnresolved(artifact: MappingArtifact, nextUnresolved: MappingUnresolvedBinding[]) {
  const existingKeys = new Set(
    artifact.unresolved.map((item) => `${item.anchorId}:${item.reason}:${item.rawHeader}`)
  );
  const merged = [...artifact.unresolved];
  for (const item of nextUnresolved) {
    const key = `${item.anchorId}:${item.reason}:${item.rawHeader}`;
    if (existingKeys.has(key)) continue;
    existingKeys.add(key);
    merged.push(item);
  }
  return merged;
}

export function applyMappingAutoBindings(options: ApplyMappingAutoBindingOptions) {
  const { mappingArtifacts, snapshot, summary } = options;
  const providerReservations = Array.isArray(options.providerReservations) ? options.providerReservations : [];
  if (!snapshot || !summary || mappingArtifacts.length <= 0) {
    return refreshMappingArtifactsMetrics(mappingArtifacts);
  }

  const nextArtifacts = mappingArtifacts.map((artifact) => {
    const roomAlias = collectRoomAliasBindings(artifact, snapshot);
    const reservationIdentity = buildReservationIdentityBindings(artifact, snapshot, summary, providerReservations);
    return {
      ...artifact,
      bindings: mergeBindings(artifact, [...roomAlias.bindings, ...reservationIdentity.bindings]),
      unresolved: mergeUnresolved(artifact, [...roomAlias.unresolved, ...reservationIdentity.unresolved])
    };
  });

  return refreshMappingArtifactsMetrics(nextArtifacts);
}

export function __resetMappingAutoBindingRuntimeForTests() {
  cachedReservationVerificationModule = null;
}
