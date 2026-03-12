export type RecommendationFieldType = "roomType" | "channel" | "range" | "inventoryValue";

export type RecommendationRuntimePreference = "transformers-js-local" | "lexical-fallback";
export type RecommendationModelVariant = "quantized" | "full" | "none";
export type RecommendationWarmupFailureCode =
  | "not_found"
  | "variant_mismatch"
  | "runtime_init_failed"
  | "onnx_load_failed"
  | "inference_failed";

export interface RecommendationSettings {
  enabled: boolean;
  modelId: string;
  runtimePreference: RecommendationRuntimePreference;
  localModelPath: string;
  cacheDir: string;
  scoreThreshold: number;
}

export const DEFAULT_RECOMMENDATION_SETTINGS: RecommendationSettings = {
  enabled: true,
  modelId: "intfloat/multilingual-e5-small",
  runtimePreference: "transformers-js-local",
  localModelPath: "",
  cacheDir: "",
  scoreThreshold: 0.58
};

export interface RecommendationRuntimeStatus {
  enabled: boolean;
  ready: boolean;
  activeRuntime: RecommendationRuntimePreference;
  modelId: string;
  localModelPath: string;
  cacheDir: string;
  reason: string;
  scoreThreshold: number;
  runtimeBackend: string;
  runtimeProvider: string;
  resolvedVariant: RecommendationModelVariant;
}

export interface RecommendationRuntimePreflight {
  ok: boolean;
  status: "ready" | "not_found" | "variant_mismatch";
  requestedModelPath: string;
  resolvedModelPath: string;
  modelRoot: string;
  quantizedAvailable: boolean;
  fullAvailable: boolean;
  resolvedVariant: RecommendationModelVariant;
  runtimeBackend: string;
  runtimeProvider: string;
  message: string;
}

export interface RecommendationRuntimeDiagnostics {
  status: RecommendationRuntimeStatus;
  preflight: RecommendationRuntimePreflight;
  warmedUp: boolean;
  warmupSample: string;
  extractorCached: boolean;
  embeddingCacheSize: number;
  lastWarmupAttemptAt: string | null;
  lastWarmupSuccessAt: string | null;
  lastWarmupFailureAt: string | null;
  lastWarmupFailureCode: RecommendationWarmupFailureCode | null;
  lastWarmupErrorMessage: string | null;
  lastWarmupError: string | null;
}

export interface RecommendationSampleEmbedResult {
  ok: boolean;
  text: string;
  vectorLength: number;
  diagnostics: RecommendationRuntimeDiagnostics;
  errorCode: RecommendationWarmupFailureCode | null;
  errorMessage: string | null;
}

export interface RecommendationCandidateRequest {
  source: string;
  rawValue: string;
  provider: string;
  fieldType: RecommendationFieldType;
  candidates: string[];
}

export interface RecommendationScoreRequest {
  items: RecommendationCandidateRequest[];
  settings?: RecommendationSettings;
}

export interface RecommendationScoredCandidate {
  value: string;
  score: number;
  reason: string;
}

export interface RecommendationScoreResult {
  source: string;
  fieldType: RecommendationFieldType;
  candidates: RecommendationScoredCandidate[];
}

export interface RecommendationScoreResponse {
  ok: true;
  runtime: RecommendationRuntimeStatus;
  results: RecommendationScoreResult[];
}
