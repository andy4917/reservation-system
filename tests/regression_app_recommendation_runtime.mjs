import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

async function main() {
  const root = process.cwd();
  const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "uhs-rec-runtime-"));
  const bundledModelDir = path.join(root, "models", "intfloat", "multilingual-e5-small");
  const autoDetectedModelDir = path.join(
    tempHome,
    ".cache",
    "huggingface",
    "hub",
    "models--intfloat--multilingual-e5-small",
    "snapshots",
    "local-model"
  );
  await fs.mkdir(path.join(autoDetectedModelDir, "onnx"), { recursive: true });
  await fs.writeFile(path.join(autoDetectedModelDir, "config.json"), "{}");
  await fs.writeFile(path.join(autoDetectedModelDir, "tokenizer.json"), "{}");
  await fs.writeFile(path.join(autoDetectedModelDir, "onnx", "model_quantized.onnx"), "fake");

  process.env.HOME = tempHome;
  const runtime = await import(path.join(root, "dist-app/main/recommendationRuntime.js"));

  const status = runtime.getRecommendationRuntimeStatus({
    enabled: true,
    modelId: "intfloat/multilingual-e5-small",
    runtimePreference: "lexical-fallback",
    localModelPath: "",
    cacheDir: "",
    scoreThreshold: 0.58
  });

  assert.equal(status.ready, false);
  assert.equal(status.activeRuntime, "lexical-fallback");

  const autoDetectedStatus = runtime.getRecommendationRuntimeStatus({
    enabled: true,
    modelId: "intfloat/multilingual-e5-small",
    runtimePreference: "transformers-js-local",
    localModelPath: "",
    cacheDir: "",
    scoreThreshold: 0.58
  });

  assert.equal(autoDetectedStatus.ready, true);
  assert.equal(autoDetectedStatus.activeRuntime, "transformers-js-local");
  assert.equal(Boolean(autoDetectedStatus.localModelPath), true);
  const beforeWarmup = runtime.getRecommendationRuntimeDiagnostics({
    enabled: true,
    modelId: "intfloat/multilingual-e5-small",
    runtimePreference: "transformers-js-local",
    localModelPath: "",
    cacheDir: "",
    scoreThreshold: 0.58
  });
  assert.equal(beforeWarmup.status.ready, true);
  assert.equal(beforeWarmup.warmedUp, false);
  assert.equal(beforeWarmup.lastWarmupError, null);
  assert.equal(runtime.applyE5InputPrefix("Spa 4인", "query"), "query: Spa 4인");
  assert.equal(runtime.applyE5InputPrefix("query: Spa 4인", "query"), "query: Spa 4인");
  assert.equal(runtime.applyE5InputPrefix("passage: Double Twin", "passage"), "passage: Double Twin");

  const scored = await runtime.scoreRecommendationCandidates({
    settings: {
      enabled: true,
      modelId: "intfloat/multilingual-e5-small",
      runtimePreference: "lexical-fallback",
      localModelPath: "",
      cacheDir: "",
      scoreThreshold: 0.2
    },
    items: [
      {
        source: "row-1",
        rawValue: "Urban Double",
        provider: "naver-partner",
        fieldType: "roomType",
        candidates: ["Urban", "Grand Suite"]
      }
    ]
  });

  assert.equal(scored.runtime.activeRuntime, "lexical-fallback");
  assert.equal(scored.results[0].candidates[0].value, "Urban");
  assert.equal(scored.results[0].candidates[0].score > scored.results[0].candidates[1].score, true);

  const semanticScored = await runtime.scoreRecommendationCandidates({
    settings: {
      enabled: true,
      modelId: "intfloat/multilingual-e5-small",
      runtimePreference: "lexical-fallback",
      localModelPath: "",
      cacheDir: "",
      scoreThreshold: 0.2
    },
    items: [
      {
        source: "row-2",
        rawValue: "Spa 4인",
        provider: "admin-station",
        fieldType: "roomType",
        candidates: ["Urban Spa Suite 6인", "Double Twin Spa Room 4인", "Grand Spa Suite 8인"]
      }
    ]
  });

  assert.equal(semanticScored.results[0].candidates[0].value, "Double Twin Spa Room 4인");
  assert.equal(semanticScored.results[0].candidates[0].score >= 0.86, true);

  const warmupModelPath = (await fs
    .access(path.join(bundledModelDir, "config.json"))
    .then(() => bundledModelDir)
    .catch(() => null)) || "";
  const warmed = await runtime.warmRecommendationRuntime({
    enabled: true,
    modelId: "intfloat/multilingual-e5-small",
    runtimePreference: "transformers-js-local",
    localModelPath: warmupModelPath,
    cacheDir: "",
    scoreThreshold: 0.58
  });
  assert.equal(warmed.status.ready, true);
  if (warmupModelPath) {
    assert.equal(typeof warmed.warmedUp, "boolean");
    assert.equal(typeof warmed.extractorCached, "boolean");
    assert.equal(typeof warmed.embeddingCacheSize, "number");
  }

  console.log("regression_app_recommendation_runtime: OK");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
