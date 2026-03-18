import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type JsonRecord = Record<string, unknown>;

export interface TruthRoomAliasIndexEntry {
  canonicalRoomId: string;
  branch: string;
  aliases: string[];
}

export interface TruthProviderTaxonomySnapshot {
  branches: Record<string, JsonRecord>;
  providers: JsonRecord[];
}

export interface TruthBranchProviderMappingSnapshot {
  branches: Record<string, JsonRecord>;
}

export interface TruthCatalogRuntimeSnapshot {
  roomAliasGraphVersion: string;
  reservationIdentityGraphVersion: string;
  channelTaxonomyVersion: string;
  branchProviderMappingVersion: string;
  roomAliasIndex: Record<string, Record<string, TruthRoomAliasIndexEntry[]>>;
  roomAliasSamplesByBranch: Record<string, string[]>;
  roomAliasNodeCountByBranch: Record<string, number>;
  reservationIdentity: {
    scoring: Record<string, number>;
    blockingRules: string[];
  };
  providerTaxonomy: TruthProviderTaxonomySnapshot;
  branchProviderMapping: TruthBranchProviderMappingSnapshot;
}

interface TruthCatalogCache {
  key: string;
  snapshot: TruthCatalogRuntimeSnapshot;
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const truthDatasetRoot = path.join(repoRoot, "truth_dataset");
const roomAliasPath = path.join(truthDatasetRoot, "room_alias_graph_v1.json");
const reservationIdentityPath = path.join(truthDatasetRoot, "reservation_identity_graph_v1.json");
const channelTaxonomyPath = path.join(truthDatasetRoot, "provider_channel_taxonomy_v1.json");
const branchProviderMappingPath = path.join(truthDatasetRoot, "branch_provider_mapping_v1.json");

let cachedTruthCatalog: TruthCatalogCache | null = null;

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeKey(value: unknown) {
  return normalizeText(value).toUpperCase().replace(/[\s-]+/g, "");
}

export function normalizeTruthBranchKey(value: unknown) {
  return normalizeKey(value);
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readJsonFile(filePath: string) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function buildCacheKey(paths: string[]) {
  return paths
    .map((filePath) => {
      try {
        const stat = fs.statSync(filePath);
        return `${filePath}:${stat.mtimeMs}:${stat.size}`;
      } catch {
        return `${filePath}:missing`;
      }
    })
    .join("|");
}

function buildRoomAliasIndex(roomAliasGraph: JsonRecord) {
  const index: Record<string, Record<string, TruthRoomAliasIndexEntry[]>> = {};
  const nodes = Array.isArray(roomAliasGraph.nodes) ? roomAliasGraph.nodes : [];

  for (const node of nodes) {
    if (!isRecord(node)) continue;
    const branch = normalizeText(node.branch);
    const canonicalRoomId = normalizeText(node.canonical_room_id);
    if (!branch || !canonicalRoomId) continue;
    const normalizedBranch = normalizeTruthBranchKey(branch);
    if (!normalizedBranch) continue;

    const aliasValues = new Set<string>();
    const derivedAliases = Array.isArray(node.derived_aliases) ? node.derived_aliases : [];
    for (const alias of derivedAliases) {
      const normalized = normalizeKey(alias);
      if (normalized) aliasValues.add(normalized);
    }

    const aliases = Array.isArray(node.aliases) ? node.aliases : [];
    for (const aliasEntry of aliases) {
      if (!isRecord(aliasEntry)) continue;
      const normalized = normalizeKey(aliasEntry.raw_value);
      if (normalized) aliasValues.add(normalized);
    }

    if (!index[normalizedBranch]) index[normalizedBranch] = {};
    const entry: TruthRoomAliasIndexEntry = {
      canonicalRoomId,
      branch,
      aliases: [...aliasValues]
    };

    for (const alias of aliasValues) {
      if (!index[normalizedBranch][alias]) index[normalizedBranch][alias] = [];
      index[normalizedBranch][alias].push(entry);
    }
  }

  return index;
}

function buildRoomAliasBranchMeta(roomAliasGraph: JsonRecord) {
  const samplesByBranch: Record<string, string[]> = {};
  const nodeCountByBranch: Record<string, number> = {};
  const nodes = Array.isArray(roomAliasGraph.nodes) ? roomAliasGraph.nodes : [];

  for (const node of nodes) {
    if (!isRecord(node)) continue;
    const branchKey = normalizeTruthBranchKey(node.branch);
    if (!branchKey) continue;
    const derived = Array.isArray(node.derived_aliases) ? node.derived_aliases : [];
    const normalizedAliases = derived
      .map((alias) => normalizeText(alias))
      .filter((alias): alias is string => Boolean(alias));
    nodeCountByBranch[branchKey] = (nodeCountByBranch[branchKey] || 0) + 1;
    if (!samplesByBranch[branchKey]) samplesByBranch[branchKey] = [];
    for (const alias of normalizedAliases) {
      if (samplesByBranch[branchKey].length >= 4) break;
      if (!samplesByBranch[branchKey].includes(alias)) {
        samplesByBranch[branchKey].push(alias);
      }
    }
  }

  return {
    samplesByBranch,
    nodeCountByBranch
  };
}

function buildBranchRecordIndex(collection: unknown) {
  const index: Record<string, JsonRecord> = {};
  if (!Array.isArray(collection)) return index;
  for (const entry of collection) {
    if (!isRecord(entry)) continue;
    const branchKey = normalizeTruthBranchKey(entry.branch);
    if (!branchKey) continue;
    index[branchKey] = entry;
  }
  return index;
}

export function loadTruthCatalogRuntime(): TruthCatalogRuntimeSnapshot {
  const filePaths = [roomAliasPath, reservationIdentityPath, channelTaxonomyPath, branchProviderMappingPath];
  const cacheKey = buildCacheKey(filePaths);
  if (cachedTruthCatalog?.key === cacheKey) {
    return cachedTruthCatalog.snapshot;
  }

  const roomAliasGraph = readJsonFile(roomAliasPath);
  const reservationIdentityGraph = readJsonFile(reservationIdentityPath);
  const channelTaxonomy = readJsonFile(channelTaxonomyPath);
  const branchProviderMapping = readJsonFile(branchProviderMappingPath);
  const roomAliasMeta = buildRoomAliasBranchMeta(roomAliasGraph);

  const snapshot: TruthCatalogRuntimeSnapshot = {
    roomAliasGraphVersion: normalizeText(roomAliasGraph.graph_version || "room-alias-graph-v1"),
    reservationIdentityGraphVersion: normalizeText(
      reservationIdentityGraph.graph_version || "reservation-identity-graph-v1"
    ),
    channelTaxonomyVersion: normalizeText(channelTaxonomy.taxonomy_version || "provider-channel-taxonomy-v1"),
    branchProviderMappingVersion: normalizeText(
      branchProviderMapping.mapping_version || "branch-provider-mapping-v1"
    ),
    roomAliasIndex: buildRoomAliasIndex(roomAliasGraph),
    roomAliasSamplesByBranch: roomAliasMeta.samplesByBranch,
    roomAliasNodeCountByBranch: roomAliasMeta.nodeCountByBranch,
    reservationIdentity: {
      scoring: isRecord(reservationIdentityGraph.scoring)
        ? Object.fromEntries(
            Object.entries(reservationIdentityGraph.scoring).map(([key, value]) => [key, Number(value) || 0])
          )
        : {},
      blockingRules: Array.isArray(reservationIdentityGraph.blocking_rules)
        ? reservationIdentityGraph.blocking_rules.filter((entry): entry is string => typeof entry === "string")
        : []
    },
    providerTaxonomy: {
      branches: buildBranchRecordIndex(channelTaxonomy.branches),
      providers: Array.isArray(channelTaxonomy.providers)
        ? channelTaxonomy.providers.filter((entry): entry is JsonRecord => isRecord(entry))
        : []
    },
    branchProviderMapping: {
      branches: buildBranchRecordIndex(branchProviderMapping.branches)
    }
  };

  cachedTruthCatalog = {
    key: cacheKey,
    snapshot
  };

  return snapshot;
}

export function __resetTruthCatalogRuntimeForTests() {
  cachedTruthCatalog = null;
}
