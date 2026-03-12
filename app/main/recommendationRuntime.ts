import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import {
  DEFAULT_RECOMMENDATION_SETTINGS,
  type RecommendationModelVariant,
  type RecommendationRuntimePreflight,
  type RecommendationRuntimeDiagnostics,
  type RecommendationSampleEmbedResult,
  type RecommendationScoreRequest,
  type RecommendationScoreResponse,
  type RecommendationSettings,
  type RecommendationRuntimeStatus,
  type RecommendationWarmupFailureCode
} from "../contracts/recommendation.js";

const require = createRequire(import.meta.url);
const dynamicImport = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<any>;

type FeatureExtractor = (input: string | string[], options?: Record<string, unknown>) => Promise<unknown>;

let extractorCache:
  | {
      cacheKey: string;
      extractor: Promise<FeatureExtractor>;
    }
  | null = null;

const embeddingCache = new Map<string, number[]>();
const DEFAULT_WARMUP_SAMPLE = "객실 매핑 warmup multilingual e5";
const DEFAULT_SAMPLE_EMBED_TEXT = "디럭스 더블룸 샘플 임베딩 테스트";

type WarmupAttemptState = {
  attemptAt: string | null;
  successAt: string | null;
  failureAt: string | null;
  failureCode: RecommendationWarmupFailureCode | null;
  failureMessage: string | null;
};

const warmupAttemptState = new Map<string, WarmupAttemptState>();

function normalizeText(value: unknown) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .toLowerCase();
}

export function applyE5InputPrefix(text: string, mode: "query" | "passage") {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return `${mode}:`;
  const prefix = `${mode}:`;
  return trimmed.toLowerCase().startsWith(prefix) ? trimmed : `${prefix} ${trimmed}`;
}

function toTokenKey(value: unknown) {
  return normalizeText(value).replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function tokenize(value: unknown) {
  return toTokenKey(value)
    .split(/\s+/)
    .filter(Boolean);
}

function detectRoomFamily(value: unknown) {
  const text = normalizeText(value)
    .replace(/\([^)]*\)/g, " ")
    .replace(/더\s*(강남|코엑스|선릉)|삼성점|the\s+(gangnam|coex|seolleung|samsung)/gi, " ")
    .replace(/객실명\s*미정|spa|suite|room|city/g, " ")
    .replace(/\s+/g, " ");
  if (!text.trim()) return "";
  if (/grand|8\s*인/.test(text)) return "grand";
  if (/double|twin|4\s*인/.test(text)) return "double";
  if (/urban|6\s*인/.test(text)) return "urban";
  return "";
}

function clampScore(value: number) {
  return Math.max(0, Math.min(1, Number(value.toFixed(4))));
}

function lexicalScore(rawValue: string, candidate: string) {
  const rawKey = toTokenKey(rawValue);
  const candidateKey = toTokenKey(candidate);
  if (!rawKey || !candidateKey) return 0;
  if (rawKey === candidateKey) return 1;
  if (candidateKey.includes(rawKey) || rawKey.includes(candidateKey)) return 0.82;

  const rawTokens = tokenize(rawValue);
  const candidateTokens = tokenize(candidate);
  if (rawTokens.length === 0 || candidateTokens.length === 0) return 0;
  const overlap = rawTokens.filter((token) => candidateTokens.includes(token)).length;
  let score = overlap / Math.max(rawTokens.length, candidateTokens.length);

  const rawFamily = detectRoomFamily(rawValue);
  const candidateFamily = detectRoomFamily(candidate);
  if (rawFamily && candidateFamily && rawFamily === candidateFamily) {
    score = Math.max(score, 0.86);
  }

  return score;
}

function cosineSimilarity(left: number[], right: number[]) {
  if (left.length === 0 || right.length === 0 || left.length !== right.length) return 0;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index];
    const rightValue = right[index];
    dot += leftValue * rightValue;
    leftNorm += leftValue * leftValue;
    rightNorm += rightValue * rightValue;
  }
  if (leftNorm === 0 || rightNorm === 0) return 0;
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

function flattenNumericArray(value: unknown): number[] {
  if (Array.isArray(value)) {
    return value.flat(Infinity).filter((item): item is number => typeof item === "number" && Number.isFinite(item));
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.tolist === "function") {
      return flattenNumericArray(record.tolist());
    }
    if (ArrayBuffer.isView(record.data)) {
      return Array.from(record.data as unknown as Iterable<number>).filter((item) => Number.isFinite(item));
    }
  }
  return [];
}

function normalizeSettings(settings?: RecommendationSettings): RecommendationSettings {
  return {
    ...DEFAULT_RECOMMENDATION_SETTINGS,
    enabled: settings?.enabled ?? DEFAULT_RECOMMENDATION_SETTINGS.enabled,
    modelId: settings?.modelId?.trim() || DEFAULT_RECOMMENDATION_SETTINGS.modelId,
    runtimePreference: settings?.runtimePreference || DEFAULT_RECOMMENDATION_SETTINGS.runtimePreference,
    localModelPath: settings?.localModelPath?.trim() || "",
    cacheDir: settings?.cacheDir?.trim() || "",
    scoreThreshold:
      typeof settings?.scoreThreshold === "number" && Number.isFinite(settings.scoreThreshold)
        ? settings.scoreThreshold
        : DEFAULT_RECOMMENDATION_SETTINGS.scoreThreshold
  };
}

function resolveExistingPath(candidatePath: string) {
  if (!candidatePath) return "";
  const resolved = path.resolve(candidatePath);
  return fs.existsSync(resolved) ? resolved : "";
}

function pathLooksLikeModelBundle(candidatePath: string) {
  if (!candidatePath || !fs.existsSync(candidatePath)) return false;
  const stats = fs.statSync(candidatePath);
  if (stats.isFile()) {
    return path.basename(candidatePath).toLowerCase() === "config.json";
  }
  const requiredMarkers = ["config.json", "tokenizer.json"];
  const hasCoreFiles = requiredMarkers.every((fileName) => fs.existsSync(path.join(candidatePath, fileName)));
  const hasOnnxWeights =
    fs.existsSync(path.join(candidatePath, "onnx", "model.onnx")) ||
    fs.existsSync(path.join(candidatePath, "onnx", "model_quantized.onnx")) ||
    fs.existsSync(path.join(candidatePath, "model.onnx")) ||
    fs.existsSync(path.join(candidatePath, "model_quantized.onnx"));
  return hasCoreFiles && hasOnnxWeights;
}

function listSnapshotDirs(baseDir: string) {
  if (!baseDir || !fs.existsSync(baseDir)) return [];
  const snapshotsDir = path.join(baseDir, "snapshots");
  if (!fs.existsSync(snapshotsDir)) return [];
  return fs
    .readdirSync(snapshotsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(snapshotsDir, entry.name));
}

function buildAutoDetectCandidates(modelId: string) {
  const normalizedModelId = modelId.trim();
  if (!normalizedModelId) return [];
  const modelLeaf = normalizedModelId.split("/").filter(Boolean).pop() || normalizedModelId;
  const hubDirName = `models--${normalizedModelId.replace(/\//g, "--")}`;
  const homeDir = process.env.HOME || process.env.USERPROFILE || os.homedir();
  const cwd = process.cwd();
  const baseCandidates = [
    path.join(cwd, "models", normalizedModelId),
    path.join(cwd, "models", modelLeaf),
    path.join(homeDir, "models", normalizedModelId),
    path.join(homeDir, "models", modelLeaf),
    path.join(homeDir, ".cache", "huggingface", "hub", hubDirName),
    path.join(homeDir, ".cache", "huggingface", hubDirName),
    path.join(homeDir, "AppData", "Local", "huggingface", "hub", hubDirName)
  ];
  const expanded = baseCandidates.flatMap((candidate) => [candidate, ...listSnapshotDirs(candidate)]);
  return Array.from(new Set(expanded));
}

function resolveLocalModelPath(settings?: RecommendationSettings) {
  const explicitPath = resolveExistingPath(settings?.localModelPath?.trim() || "");
  if (explicitPath) return explicitPath;

  const candidates = buildAutoDetectCandidates(settings?.modelId?.trim() || DEFAULT_RECOMMENDATION_SETTINGS.modelId);
  return candidates.find((candidate) => pathLooksLikeModelBundle(candidate)) || "";
}

function resolveModelSource(localModelPath: string, modelId: string) {
  if (!localModelPath || !fs.existsSync(localModelPath)) {
    return {
      modelSource: modelId,
      localModelRoot: ""
    };
  }

  const stats = fs.statSync(localModelPath);
  if (stats.isDirectory()) {
    return {
      modelSource: path.basename(localModelPath),
      localModelRoot: path.dirname(localModelPath)
    };
  }

  const modelDir = path.dirname(localModelPath);
  return {
    modelSource: path.basename(modelDir),
    localModelRoot: path.dirname(modelDir)
  };
}

function resolvePreferredDtype(localModelPath: string) {
  if (!localModelPath || !fs.existsSync(localModelPath)) return undefined;
  const modelDir = fs.statSync(localModelPath).isDirectory() ? localModelPath : path.dirname(localModelPath);
  const hasQuantized =
    fs.existsSync(path.join(modelDir, "onnx", "model_quantized.onnx")) ||
    fs.existsSync(path.join(modelDir, "model_quantized.onnx"));
  const hasFp32 =
    fs.existsSync(path.join(modelDir, "onnx", "model.onnx")) ||
    fs.existsSync(path.join(modelDir, "model.onnx"));
  if (hasQuantized && !hasFp32) return "q8";
  return undefined;
}

function resolveModelRoot(localModelPath: string) {
  if (!localModelPath || !fs.existsSync(localModelPath)) return "";
  const stats = fs.statSync(localModelPath);
  return stats.isDirectory() ? localModelPath : path.dirname(localModelPath);
}

function inspectModelVariants(localModelPath: string) {
  const modelRoot = resolveModelRoot(localModelPath);
  if (!modelRoot) {
    return {
      modelRoot: "",
      hasConfig: false,
      hasTokenizer: false,
      quantizedAvailable: false,
      fullAvailable: false
    };
  }

  return {
    modelRoot,
    hasConfig: fs.existsSync(path.join(modelRoot, "config.json")),
    hasTokenizer: fs.existsSync(path.join(modelRoot, "tokenizer.json")),
    quantizedAvailable:
      fs.existsSync(path.join(modelRoot, "onnx", "model_quantized.onnx")) ||
      fs.existsSync(path.join(modelRoot, "model_quantized.onnx")),
    fullAvailable:
      fs.existsSync(path.join(modelRoot, "onnx", "model.onnx")) ||
      fs.existsSync(path.join(modelRoot, "model.onnx"))
  };
}

function resolveVariant(localModelPath: string): RecommendationModelVariant {
  const preferredDtype = resolvePreferredDtype(localModelPath);
  if (preferredDtype === "q8") return "quantized";
  const variants = inspectModelVariants(localModelPath);
  if (variants.fullAvailable) return "full";
  if (variants.quantizedAvailable) return "quantized";
  return "none";
}

function createPreflight(settings?: RecommendationSettings): RecommendationRuntimePreflight {
  const normalized = normalizeSettings(settings);
  const resolvedModelPath = resolveLocalModelPath(normalized);
  const inspected = inspectModelVariants(resolvedModelPath);
  const resolvedVariant = resolveVariant(resolvedModelPath);

  if (!resolvedModelPath) {
    return {
      ok: false,
      status: "not_found",
      requestedModelPath: normalized.localModelPath,
      resolvedModelPath: "",
      modelRoot: "",
      quantizedAvailable: false,
      fullAvailable: false,
      resolvedVariant: "none",
      runtimeBackend: "onnxruntime-node",
      runtimeProvider: "cpu",
      message: "Local model path could not be resolved to a valid bundle."
    };
  }

  if (!inspected.quantizedAvailable && !inspected.fullAvailable) {
    return {
      ok: false,
      status: "variant_mismatch",
      requestedModelPath: normalized.localModelPath,
      resolvedModelPath,
      modelRoot: inspected.modelRoot,
      quantizedAvailable: false,
      fullAvailable: false,
      resolvedVariant: "none",
      runtimeBackend: "onnxruntime-node",
      runtimeProvider: "cpu",
      message:
        inspected.hasConfig || inspected.hasTokenizer
          ? "Model path exists, but the ONNX variant files do not match a usable quantized/full bundle."
          : "Model path exists, but required bundle markers are missing."
    };
  }

  return {
    ok: true,
    status: "ready",
    requestedModelPath: normalized.localModelPath,
    resolvedModelPath,
    modelRoot: inspected.modelRoot,
    quantizedAvailable: inspected.quantizedAvailable,
    fullAvailable: inspected.fullAvailable,
    resolvedVariant,
    runtimeBackend: "onnxruntime-node",
    runtimeProvider: "cpu",
    message:
      resolvedVariant === "quantized"
        ? "Quantized ONNX bundle resolved for local warm-up."
        : "Full ONNX bundle resolved for local warm-up."
  };
}

function getRuntimeCacheKey(status: RecommendationRuntimeStatus) {
  return `${status.modelId}::${status.localModelPath}::${status.cacheDir}`;
}

function getWarmupKey(status: RecommendationRuntimeStatus) {
  return `${status.modelId}::${status.localModelPath}::${applyE5InputPrefix(DEFAULT_WARMUP_SAMPLE, "query")}`;
}

function getAttemptState(cacheKey: string): WarmupAttemptState {
  return (
    warmupAttemptState.get(cacheKey) || {
      attemptAt: null,
      successAt: null,
      failureAt: null,
      failureCode: null,
      failureMessage: null
    }
  );
}

function setAttemptState(cacheKey: string, patch: Partial<WarmupAttemptState>) {
  const nextState = {
    ...getAttemptState(cacheKey),
    ...patch
  };
  warmupAttemptState.set(cacheKey, nextState);
  return nextState;
}

function classifyRuntimeError(
  error: unknown,
  preflight: RecommendationRuntimePreflight,
  stage: "runtime_init" | "inference"
): RecommendationWarmupFailureCode {
  if (!preflight.resolvedModelPath) return "not_found";
  if (!preflight.quantizedAvailable && !preflight.fullAvailable) return "variant_mismatch";

  const message = error instanceof Error ? error.message : String(error);
  const normalized = normalizeText(message);
  if (normalized.includes("model_quantized.onnx") || normalized.includes("model.onnx") || normalized.includes(".onnx")) {
    return "onnx_load_failed";
  }
  if (normalized.includes("no such file") || normalized.includes("cannot find") || normalized.includes("not found")) {
    return stage === "runtime_init" ? "onnx_load_failed" : "inference_failed";
  }
  return stage === "runtime_init" ? "runtime_init_failed" : "inference_failed";
}

function buildRuntimeStatus(settings?: RecommendationSettings): RecommendationRuntimeStatus {
  const normalized = normalizeSettings(settings);
  const preflight = createPreflight(normalized);
  const localModelPath = preflight.resolvedModelPath;
  const cacheDir = resolveExistingPath(normalized.cacheDir);

  if (!normalized.enabled) {
    return {
      enabled: false,
      ready: false,
      activeRuntime: "lexical-fallback",
      modelId: normalized.modelId,
      localModelPath,
      cacheDir,
      reason: "Recommendation assist disabled. Lexical fallback only.",
      scoreThreshold: normalized.scoreThreshold,
      runtimeBackend: preflight.runtimeBackend,
      runtimeProvider: preflight.runtimeProvider,
      resolvedVariant: preflight.resolvedVariant
    };
  }

  if (normalized.runtimePreference === "lexical-fallback") {
    return {
      enabled: true,
      ready: false,
      activeRuntime: "lexical-fallback",
      modelId: normalized.modelId,
      localModelPath,
      cacheDir,
      reason: "Lexical fallback was selected in settings.",
      scoreThreshold: normalized.scoreThreshold,
      runtimeBackend: preflight.runtimeBackend,
      runtimeProvider: preflight.runtimeProvider,
      resolvedVariant: preflight.resolvedVariant
    };
  }

  if (!preflight.ok) {
    return {
      enabled: true,
      ready: false,
      activeRuntime: "lexical-fallback",
      modelId: normalized.modelId,
      localModelPath,
      cacheDir,
      reason: preflight.message,
      scoreThreshold: normalized.scoreThreshold,
      runtimeBackend: preflight.runtimeBackend,
      runtimeProvider: preflight.runtimeProvider,
      resolvedVariant: preflight.resolvedVariant
    };
  }

  try {
    require.resolve("@huggingface/transformers");
  } catch (_error) {
    return {
      enabled: true,
      ready: false,
      activeRuntime: "lexical-fallback",
      modelId: normalized.modelId,
      localModelPath,
      cacheDir,
      reason: "@huggingface/transformers is not installed, so lexical fallback remains active.",
      scoreThreshold: normalized.scoreThreshold,
      runtimeBackend: preflight.runtimeBackend,
      runtimeProvider: preflight.runtimeProvider,
      resolvedVariant: preflight.resolvedVariant
    };
  }

  return {
    enabled: true,
    ready: true,
    activeRuntime: "transformers-js-local",
    modelId: normalized.modelId,
    localModelPath,
    cacheDir,
    reason: "Local-only transformer runtime is available.",
    scoreThreshold: normalized.scoreThreshold,
    runtimeBackend: preflight.runtimeBackend,
    runtimeProvider: preflight.runtimeProvider,
    resolvedVariant: preflight.resolvedVariant
  };
}

async function getFeatureExtractor(status: RecommendationRuntimeStatus): Promise<FeatureExtractor> {
  const cacheKey = getRuntimeCacheKey(status);
  if (extractorCache?.cacheKey === cacheKey) {
    return extractorCache.extractor;
  }

  const extractor = (async () => {
    const transformers = await dynamicImport("@huggingface/transformers");
    const { env, pipeline } = transformers;
    const modelSource = resolveModelSource(status.localModelPath, status.modelId);
    env.allowRemoteModels = false;
    env.allowLocalModels = true;
    if (status.cacheDir) env.cacheDir = status.cacheDir;
    if (modelSource.localModelRoot) env.localModelPath = modelSource.localModelRoot;
    return pipeline("feature-extraction", modelSource.modelSource, {
      local_files_only: true,
      dtype: resolvePreferredDtype(status.localModelPath)
    }) as Promise<FeatureExtractor>;
  })();

  extractorCache = { cacheKey, extractor };
  return extractor;
}

async function embedText(status: RecommendationRuntimeStatus, text: string): Promise<number[]> {
  const key = `${status.modelId}::${status.localModelPath}::${text}`;
  const cached = embeddingCache.get(key);
  if (cached) return cached;
  const extractor = await getFeatureExtractor(status);
  const output = await extractor(text, { pooling: "mean", normalize: true });
  const vector = flattenNumericArray(output);
  if (vector.length > 0) {
    embeddingCache.set(key, vector);
  }
  return vector;
}

async function scoreCandidateWithRuntime(
  status: RecommendationRuntimeStatus,
  rawValue: string,
  candidate: string
) {
  if (!status.ready || status.activeRuntime !== "transformers-js-local") {
    return clampScore(lexicalScore(rawValue, candidate));
  }

  try {
    const [queryVector, candidateVector] = await Promise.all([
      embedText(status, applyE5InputPrefix(rawValue, "query")),
      embedText(status, applyE5InputPrefix(candidate, "passage"))
    ]);
    const similarity = cosineSimilarity(queryVector, candidateVector);
    return clampScore(similarity);
  } catch (_error) {
    return clampScore(lexicalScore(rawValue, candidate));
  }
}

export function getRecommendationRuntimeStatus(settings?: RecommendationSettings) {
  return buildRuntimeStatus(settings);
}

export function getRecommendationRuntimeDiagnostics(settings?: RecommendationSettings): RecommendationRuntimeDiagnostics {
  const status = buildRuntimeStatus(settings);
  const preflight = createPreflight(settings);
  const cacheKey = getRuntimeCacheKey(status);
  const warmupKey = getWarmupKey(status);
  const attemptState = getAttemptState(cacheKey);
  return {
    status,
    preflight,
    warmedUp: embeddingCache.has(warmupKey),
    warmupSample: DEFAULT_WARMUP_SAMPLE,
    extractorCached: extractorCache?.cacheKey === cacheKey,
    embeddingCacheSize: embeddingCache.size,
    lastWarmupAttemptAt: attemptState.attemptAt,
    lastWarmupSuccessAt: attemptState.successAt,
    lastWarmupFailureAt: attemptState.failureAt,
    lastWarmupFailureCode: attemptState.failureCode,
    lastWarmupErrorMessage: attemptState.failureMessage,
    lastWarmupError: attemptState.failureMessage
  };
}

export async function warmRecommendationRuntime(settings?: RecommendationSettings): Promise<RecommendationRuntimeDiagnostics> {
  const status = buildRuntimeStatus(settings);
  const preflight = createPreflight(settings);
  const cacheKey = getRuntimeCacheKey(status);
  const attemptAt = new Date().toISOString();
  setAttemptState(cacheKey, { attemptAt });

  if (!status.ready || status.activeRuntime !== "transformers-js-local") {
    if (!preflight.ok) {
      setAttemptState(cacheKey, {
        failureAt: attemptAt,
        failureCode: preflight.status === "not_found" ? "not_found" : "variant_mismatch",
        failureMessage: preflight.message
      });
    }
    return getRecommendationRuntimeDiagnostics(settings);
  }

  try {
    await getFeatureExtractor(status);
    await Promise.all([
      embedText(status, applyE5InputPrefix(DEFAULT_WARMUP_SAMPLE, "query")),
      embedText(status, applyE5InputPrefix("Double Twin Spa Room 4인", "passage"))
    ]);
    setAttemptState(cacheKey, {
      successAt: new Date().toISOString(),
      failureAt: null,
      failureCode: null,
      failureMessage: null
    });
  } catch (error) {
    setAttemptState(cacheKey, {
      failureAt: new Date().toISOString(),
      failureCode: classifyRuntimeError(error, preflight, extractorCache?.cacheKey === cacheKey ? "inference" : "runtime_init"),
      failureMessage: error instanceof Error ? error.message : String(error)
    });
  }

  return getRecommendationRuntimeDiagnostics(settings);
}

export async function sampleRecommendationEmbed(
  settings?: RecommendationSettings,
  text = DEFAULT_SAMPLE_EMBED_TEXT
): Promise<RecommendationSampleEmbedResult> {
  const status = buildRuntimeStatus(settings);
  const diagnosticsBefore = getRecommendationRuntimeDiagnostics(settings);

  if (!status.ready || status.activeRuntime !== "transformers-js-local") {
    return {
      ok: false,
      text,
      vectorLength: 0,
      diagnostics: diagnosticsBefore,
      errorCode: diagnosticsBefore.lastWarmupFailureCode,
      errorMessage: diagnosticsBefore.lastWarmupErrorMessage || diagnosticsBefore.status.reason
    };
  }

  try {
    await getFeatureExtractor(status);
    const vector = await embedText(status, applyE5InputPrefix(text, "query"));
    const diagnostics = getRecommendationRuntimeDiagnostics(settings);
    return {
      ok: vector.length > 0,
      text,
      vectorLength: vector.length,
      diagnostics,
      errorCode: vector.length > 0 ? null : "inference_failed",
      errorMessage: vector.length > 0 ? null : "Embedding returned an empty vector."
    };
  } catch (error) {
    const preflight = createPreflight(settings);
    const cacheKey = getRuntimeCacheKey(status);
    const failureMessage = error instanceof Error ? error.message : String(error);
    const failureCode = classifyRuntimeError(error, preflight, "inference");
    setAttemptState(cacheKey, {
      attemptAt: new Date().toISOString(),
      failureAt: new Date().toISOString(),
      failureCode,
      failureMessage
    });
    return {
      ok: false,
      text,
      vectorLength: 0,
      diagnostics: getRecommendationRuntimeDiagnostics(settings),
      errorCode: failureCode,
      errorMessage: failureMessage
    };
  }
}

export async function scoreRecommendationCandidates(
  request: RecommendationScoreRequest
): Promise<RecommendationScoreResponse> {
  const runtime = buildRuntimeStatus(request.settings);
  const results = await Promise.all(
    request.items.map(async (item) => {
      const candidates = await Promise.all(
        item.candidates.map(async (value) => ({
          value,
          score: await scoreCandidateWithRuntime(runtime, item.rawValue, value),
          reason:
            runtime.activeRuntime === "transformers-js-local" && runtime.ready
              ? "local multilingual embedding similarity"
              : runtime.reason
        }))
      );
      return {
        source: item.source,
        fieldType: item.fieldType,
        candidates: candidates.sort((left, right) => right.score - left.score)
      };
    })
  );

  return {
    ok: true,
    runtime,
    results
  };
}
