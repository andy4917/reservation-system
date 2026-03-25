import type {
  AppLiveReadBundleSnapshot,
  AppLiveReadBundleSupportLevel,
  AppLiveReadInput,
  AppLiveReadSnapshot,
} from "../../src/desktop/app-v2-contracts.js";
import { runOtaRead, runPmsRead, runSheetRead } from "./liveReadActions.js";

function nowIso() {
  return new Date().toISOString();
}

function isSourceReady(snapshot: AppLiveReadSnapshot) {
  return snapshot.status === "done" && !snapshot.blockedReason;
}

function summarizeSupportLevel(sources: AppLiveReadSnapshot[]): AppLiveReadBundleSupportLevel {
  if (sources.length === 0) return "blocked";
  const readyCount = sources.filter(isSourceReady).length;
  if (readyCount === sources.length) return "read-live";
  if (readyCount > 0) return "partial-live";
  if (sources.every((source) => source.status === "error")) return "offline-preview";
  return "blocked";
}

function summarizeBundleMessage(supportLevel: AppLiveReadBundleSupportLevel, sources: AppLiveReadSnapshot[]) {
  const labels = sources.map((source) => `${source.source}:${source.status}`).join(", ");
  if (supportLevel === "read-live") {
    return `live read bundle ready (${labels})`;
  }
  if (supportLevel === "partial-live") {
    return `live read bundle partially ready (${labels})`;
  }
  if (supportLevel === "offline-preview") {
    return `live read bundle is still offline-preview (${labels})`;
  }
  return `live read bundle is blocked (${labels})`;
}

export async function runLiveReadBundle(input: AppLiveReadInput): Promise<AppLiveReadBundleSnapshot> {
  // These readers share runtime-global fetch/module state, so keep bundle execution ordered.
  const sources = [
    await runPmsRead(input),
    await runOtaRead(input),
    await runSheetRead(input),
  ];
  const supportLevel = summarizeSupportLevel(sources);
  return {
    query: input,
    checkedAt: nowIso(),
    supportLevel,
    summary: summarizeBundleMessage(supportLevel, sources),
    sources,
    evidence: [
      `branch:${input.branch}`,
      `window:${input.startDate}..${input.endDate}`,
      `supportLevel:${supportLevel}`,
      ...sources.flatMap((source) => source.evidence.map((entry) => `${source.source}:${entry}`)),
    ],
  };
}
