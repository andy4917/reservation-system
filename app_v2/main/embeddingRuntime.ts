import type { AppSettingsSnapshot } from "../../src/desktop/app-v2-contracts.js";

interface PairScoreInput {
  id: string;
  left: string;
  right: string;
}

interface PairScoreResult {
  id: string;
  score: number;
}

interface EmbeddingAvailability {
  enabled: boolean;
  reason: string;
}

let extractorPromise: Promise<any> | null = null;
let extractorKey = "";

function dot(left: number[], right: number[]) {
  let total = 0;
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    total += left[index] * right[index];
  }
  return total;
}

function magnitude(value: number[]) {
  let total = 0;
  for (const item of value) total += item * item;
  return Math.sqrt(total);
}

function cosine(left: number[], right: number[]) {
  const leftMagnitude = magnitude(left);
  const rightMagnitude = magnitude(right);
  if (!leftMagnitude || !rightMagnitude) return 0;
  return dot(left, right) / (leftMagnitude * rightMagnitude);
}

function toMatrix(output: any, rowCount: number): number[][] {
  if (!output) return [];
  if (Array.isArray(output)) return output as number[][];
  const raw = Array.isArray(output.tolist?.()) ? output.tolist() : null;
  if (raw) return raw as number[][];
  const data = Array.isArray(output.data) ? output.data : Array.from(output.data ?? []);
  const dims = rowCount > 0 ? Math.floor(data.length / rowCount) : 0;
  if (!dims) return [];
  const rows: number[][] = [];
  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    rows.push(data.slice(rowIndex * dims, (rowIndex + 1) * dims));
  }
  return rows;
}

async function loadExtractor(settingsSnapshot: AppSettingsSnapshot) {
  const bge = settingsSnapshot.config?.bgeM3;
  const modelPath = bge?.modelPath?.trim() ?? "";
  const runtime = bge?.runtime ?? "local-path";
  const cacheKey = `${runtime}:${modelPath || bge?.modelId || "Xenova/bge-m3"}`;
  if (extractorPromise && extractorKey === cacheKey) {
    return extractorPromise;
  }
  extractorKey = cacheKey;
  extractorPromise = (async () => {
    const transformers = (await import("@huggingface/transformers")) as any;
    transformers.env.allowLocalModels = true;
    transformers.env.allowRemoteModels = runtime === "download-if-missing";
    const modelRef = modelPath || bge?.modelId || "Xenova/bge-m3";
    return transformers.pipeline("feature-extraction", modelRef, {
      model_file_name: "sentence_transformers",
      dtype: "q8",
      local_files_only: runtime !== "download-if-missing",
    });
  })();
  return extractorPromise;
}

export function describeEmbeddingAvailability(settingsSnapshot: AppSettingsSnapshot): EmbeddingAvailability {
  const bge = settingsSnapshot.config?.bgeM3;
  if (!bge?.enabled) return { enabled: false, reason: "BGE-M3 비활성화" };
  if (bge.runtime === "local-path" && !bge.modelPath?.trim()) {
    return { enabled: false, reason: "BGE-M3 경로 미설정" };
  }
  return { enabled: true, reason: "BGE-M3 사용 가능" };
}

export async function scoreTextPairs(
  settingsSnapshot: AppSettingsSnapshot,
  pairs: PairScoreInput[],
): Promise<PairScoreResult[]> {
  const availability = describeEmbeddingAvailability(settingsSnapshot);
  if (!availability.enabled || pairs.length === 0) return [];
  const extractor = await loadExtractor(settingsSnapshot);
  const joined = pairs.flatMap((pair) => [pair.left, pair.right]);
  const output = await extractor(joined, { pooling: "mean", normalize: true });
  const matrix = toMatrix(output, joined.length);
  if (matrix.length !== joined.length) return [];
  const scores: PairScoreResult[] = [];
  for (let index = 0; index < pairs.length; index += 1) {
    const left = matrix[index * 2] ?? [];
    const right = matrix[index * 2 + 1] ?? [];
    scores.push({
      id: pairs[index].id,
      score: Number(cosine(left, right).toFixed(4)),
    });
  }
  return scores;
}
