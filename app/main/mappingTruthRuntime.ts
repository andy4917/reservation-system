import type { MappingArtifact, MappingTruthArtifactLink } from "../contracts/provider.js";
import {
  __resetTruthCatalogRuntimeForTests,
  loadTruthCatalogRuntime,
  normalizeTruthBranchKey
} from "./truthCatalogRuntime.js";

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function buildTruthSignalsForArtifact(artifact: MappingArtifact): MappingTruthArtifactLink[] {
  const truthCatalog = loadTruthCatalogRuntime();
  const branch = normalizeTruthBranchKey(artifact.section.sectionKey);
  const roomAliasSamples = truthCatalog.roomAliasSamplesByBranch[branch] || [];
  const roomAliasNodeCount = truthCatalog.roomAliasNodeCountByBranch[branch] || 0;
  const branchMapping = truthCatalog.branchProviderMapping.branches[branch] || null;
  const taxonomyBranch = truthCatalog.providerTaxonomy.branches[branch] || null;
  const taxonomyProviders = truthCatalog.providerTaxonomy.providers;
  const identityScoring = Object.keys(truthCatalog.reservationIdentity.scoring);

  return [
    {
      kind: "room-alias-graph",
      version: truthCatalog.roomAliasGraphVersion,
      source: "truth_dataset/room_alias_graph_v1.json",
      available: roomAliasNodeCount > 0,
      confidence: roomAliasNodeCount > 0 ? 1 : 0,
      detail: roomAliasNodeCount > 0 ? `branch=${branch} nodes=${roomAliasNodeCount}` : `branch=${branch} nodes=0`,
      signals: roomAliasSamples.length > 0 ? roomAliasSamples.map((sample) => `alias:${sample}`) : [`branch:${branch}`]
    },
    {
      kind: "reservation-identity-graph",
      version: truthCatalog.reservationIdentityGraphVersion,
      source: "truth_dataset/reservation_identity_graph_v1.json",
      available: identityScoring.length > 0 || truthCatalog.reservationIdentity.blockingRules.length > 0,
      confidence: identityScoring.length > 0 || truthCatalog.reservationIdentity.blockingRules.length > 0 ? 1 : 0,
      detail: identityScoring.length > 0 ? `branch=${branch} scoring=${identityScoring.join(",")}` : `branch=${branch} scoring=none`,
      signals: identityScoring.length > 0 ? identityScoring.map((key) => `score:${key}`) : [`branch:${branch}`]
    },
    {
      kind: "provider-taxonomy",
      version: truthCatalog.channelTaxonomyVersion,
      source: "truth_dataset/provider_channel_taxonomy_v1.json",
      available: taxonomyProviders.length > 0,
      confidence: taxonomyProviders.length > 0 ? 1 : 0,
      detail: taxonomyBranch ? `branch=${branch} taxonomy-branch=present` : `branch=${branch} taxonomy-branch=missing`,
      signals: taxonomyProviders.slice(0, 4).map((provider) => `provider:${normalizeText(provider.provider)}`)
    },
    {
      kind: "branch-provider-mapping",
      version: truthCatalog.branchProviderMappingVersion,
      source: "truth_dataset/branch_provider_mapping_v1.json",
      available: Boolean(branchMapping),
      confidence: branchMapping ? 1 : 0,
      detail: branchMapping
        ? `branch=${branch} ota=${Object.keys((branchMapping.ota_profiles as Record<string, unknown>) || {}).length} wings=${Array.isArray(branchMapping.wings_profiles) ? branchMapping.wings_profiles.length : 0}`
        : `branch=${branch} mapping=missing`,
      signals: branchMapping
        ? [
            `sheet:${normalizeText((branchMapping.sheet_scope as Record<string, unknown>)?.sheet_name) || "unknown"}`,
            `ota:${Object.keys((branchMapping.ota_profiles as Record<string, unknown>) || {}).join(",") || "none"}`,
            `wingsProfiles:${Array.isArray(branchMapping.wings_profiles) ? branchMapping.wings_profiles.length : 0}`
          ]
        : [`branch:${branch}`]
    }
  ];
}

function enrichUnresolvedSignals(artifact: MappingArtifact, truthSignals: MappingTruthArtifactLink[]) {
  return artifact.unresolved.map((item) => {
    const nextSignals = Array.isArray(item.evidenceSignals) ? [...item.evidenceSignals] : [];
    if (item.candidateTerms.includes("inventory.room-alias")) {
      const roomAliasSignal = truthSignals.find((signal) => signal.kind === "room-alias-graph");
      if (roomAliasSignal) {
        nextSignals.push(`truth:${roomAliasSignal.version}`);
        nextSignals.push(...roomAliasSignal.signals.slice(0, 3));
      }
    }
    if (item.candidateTerms.includes("reservation.identity")) {
      const identitySignal = truthSignals.find((signal) => signal.kind === "reservation-identity-graph");
      if (identitySignal) {
        nextSignals.push(`truth:${identitySignal.version}`);
        nextSignals.push(...identitySignal.signals.slice(0, 3));
      }
    }
    return {
      ...item,
      evidenceSignals: Array.from(new Set(nextSignals))
    };
  });
}

export function enrichMappingArtifactsWithTruthData(mappingArtifacts: MappingArtifact[]) {
  return mappingArtifacts.map((artifact) => {
    const truthSignals = buildTruthSignalsForArtifact(artifact);
    return {
      ...artifact,
      unresolved: enrichUnresolvedSignals(artifact, truthSignals),
      truthSignals
    };
  });
}

export function __resetMappingTruthRuntimeForTests() {
  __resetTruthCatalogRuntimeForTests();
}
