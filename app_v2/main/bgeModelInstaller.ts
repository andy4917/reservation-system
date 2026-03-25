import fs from "node:fs/promises";
import path from "node:path";
import electron from "electron";
import type { AppBgeInstallSnapshot, AppSettingsSnapshot } from "../../src/desktop/app-v2-contracts.js";
import { loadSettingsSnapshot, saveSettings } from "./settingsStore.js";

const { app } = electron;

const DEFAULT_BGE_MODEL_ID = "Xenova/bge-m3";

function nowIso() {
  return new Date().toISOString();
}

function normalizeModelId(value: string | null | undefined) {
  const text = String(value || "").trim();
  return text || DEFAULT_BGE_MODEL_ID;
}

function getInstallRoot() {
  return path.join(app.getPath("userData"), "models");
}

function resolveModelPathFromRoot(installRoot: string, modelId: string) {
  const segments = modelId.split("/").filter(Boolean);
  return path.join(installRoot, ...segments);
}

async function listInstalledFiles(modelPath: string) {
  const interesting = [
    "config.json",
    "tokenizer.json",
    "tokenizer_config.json",
    "onnx/sentence_transformers_quantized.onnx",
    "onnx/sentence_transformers_int8.onnx",
    "onnx/sentence_transformers.onnx",
    "onnx/model_quantized.onnx",
    "onnx/model_int8.onnx",
    "onnx/model.onnx",
  ];
  const files: string[] = [];
  for (const relativePath of interesting) {
    try {
      await fs.access(path.join(modelPath, relativePath));
      files.push(relativePath);
    } catch {
      continue;
    }
  }
  return files;
}

async function buildSnapshotFromSettings(settingsSnapshot: AppSettingsSnapshot): Promise<AppBgeInstallSnapshot> {
  const modelId = normalizeModelId(settingsSnapshot.config?.bgeM3?.modelId);
  const installRoot = getInstallRoot();
  const configuredPath = settingsSnapshot.config?.bgeM3?.modelPath?.trim() || resolveModelPathFromRoot(installRoot, modelId);
  const files = await listInstalledFiles(configuredPath);
  const installed = files.some((item) => item.endsWith(".onnx"));
  return {
    checkedAt: nowIso(),
    status: installed ? "installed" : "ready",
    modelId,
    installRoot,
    modelPath: configuredPath,
    installed,
    summary: installed ? "BGE-M3 로컬 모델이 준비되었습니다." : "BGE-M3 로컬 모델 설치가 필요합니다.",
    files,
  };
}

export async function getBgeInstallSnapshot() {
  const settingsSnapshot = await loadSettingsSnapshot();
  return buildSnapshotFromSettings(settingsSnapshot);
}

export async function installBgeM3Model(): Promise<AppBgeInstallSnapshot> {
  const settingsSnapshot = await loadSettingsSnapshot();
  const modelId = normalizeModelId(settingsSnapshot.config?.bgeM3?.modelId);
  const installRoot = getInstallRoot();
  const modelPath = resolveModelPathFromRoot(installRoot, modelId);
  await fs.mkdir(installRoot, { recursive: true });

  const transformers = (await import("@huggingface/transformers")) as any;
  transformers.env.allowLocalModels = true;
  transformers.env.allowRemoteModels = true;
  transformers.env.cacheDir = installRoot;

  const extractor = await transformers.pipeline("feature-extraction", modelId, {
    model_file_name: "sentence_transformers",
    dtype: "q8",
  });
  await extractor(["BGE-M3 설치 확인", "예약 매핑 후보"], {
    pooling: "mean",
    normalize: true,
  });

  const updatedSettings = await saveSettings({
    ...(settingsSnapshot.config ?? {}),
    bgeM3: {
      enabled: true,
      modelId,
      runtime: "local-path",
      modelPath,
      topK: settingsSnapshot.config?.bgeM3?.topK,
      scoreThreshold: settingsSnapshot.config?.bgeM3?.scoreThreshold,
    },
  });
  return buildSnapshotFromSettings(updatedSettings);
}
