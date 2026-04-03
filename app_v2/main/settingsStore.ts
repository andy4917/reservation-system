import fs from "node:fs/promises";
import path from "node:path";
import electron from "electron";
import type {
  AppBgeM3Settings,
  AppOpsViewSettings,
  AppSettings,
  AppSettingsSnapshot,
  AppSheetTabSettings,
} from "../../src/desktop/app-v2-contracts.js";

const { app } = electron;

interface StoredSettingsPayload {
  config: AppSettings | null;
  updatedAt: string | null;
}

const SETTINGS_FILE_NAME = "app-v2-settings.json";

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getSettingsPath() {
  return path.join(app.getPath("userData"), SETTINGS_FILE_NAME);
}

function normalizeSheetTabs(input: unknown): AppSheetTabSettings {
  const tabs = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  return {
    coexMain: normalizeText(tabs.coexMain),
    coexAnnex: normalizeText(tabs.coexAnnex),
    gangnam: normalizeText(tabs.gangnam),
    seolleung: normalizeText(tabs.seolleung),
    samsung: normalizeText(tabs.samsung),
  };
}

function normalizeOpsView(input: unknown): AppOpsViewSettings {
  const opsView = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  return {
    excludeRoomMakeup: opsView.excludeRoomMakeup === true,
    flagContinuationCandidates: opsView.flagContinuationCandidates !== false,
  };
}

function normalizeSettings(input: Partial<AppSettings>): AppSettings {
  const bge = input.bgeM3;
  const normalizedBgeM3: AppBgeM3Settings | null =
    bge && typeof bge === "object"
      ? {
          enabled: bge.enabled === true,
          modelId: normalizeText(bge.modelId) || "Xenova/bge-m3",
          runtime: bge.runtime === "download-if-missing" ? "download-if-missing" : "local-path",
          modelPath: normalizeText(bge.modelPath),
          topK: Number.isFinite(Number(bge.topK)) ? Number(bge.topK) : 5,
          scoreThreshold: Number.isFinite(Number(bge.scoreThreshold)) ? Number(bge.scoreThreshold) : 0.72
        }
      : null;
  return {
    spreadsheet: normalizeText(input.spreadsheet),
    sheetName: normalizeText(input.sheetName),
    sheetTabs: normalizeSheetTabs(input.sheetTabs),
    opsView: normalizeOpsView(input.opsView),
    reportWindowDays: Number.isFinite(Number(input.reportWindowDays))
      ? Math.min(Math.max(Math.round(Number(input.reportWindowDays)), 1), 14)
      : 5,
    bgeM3: normalizedBgeM3
  };
}

function buildSnapshot(config: AppSettings | null, updatedAt: string | null): AppSettingsSnapshot {
  const missingRequired: Array<keyof AppSettings> = [];
  const hasSheetTabs = Boolean(
    config?.sheetTabs?.coexMain ||
      config?.sheetTabs?.coexAnnex ||
      config?.sheetTabs?.gangnam ||
      config?.sheetTabs?.seolleung ||
      config?.sheetTabs?.samsung
  );
  if (!config?.spreadsheet) missingRequired.push("spreadsheet");
  if (!config?.sheetName && !hasSheetTabs) missingRequired.push("sheetName");
  return {
    config,
    isConfigured: missingRequired.length === 0,
    missingRequired,
    updatedAt,
    storagePath: getSettingsPath()
  };
}

async function readStoredSettings(): Promise<StoredSettingsPayload> {
  const filePath = getSettingsPath();
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as StoredSettingsPayload;
    const config = parsed?.config ? normalizeSettings(parsed.config) : null;
    return {
      config,
      updatedAt: normalizeText(parsed?.updatedAt) || null
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { config: null, updatedAt: null };
    }
    throw error;
  }
}

export async function loadSettingsSnapshot(): Promise<AppSettingsSnapshot> {
  const stored = await readStoredSettings();
  return buildSnapshot(stored.config, stored.updatedAt);
}

export async function saveSettings(input: Partial<AppSettings>): Promise<AppSettingsSnapshot> {
  const normalized = normalizeSettings(input);
  const hasAnySettings = Boolean(
    normalized.spreadsheet ||
      normalized.sheetName ||
      normalized.reportWindowDays ||
      normalized.bgeM3 ||
      normalized.sheetTabs ||
      normalized.opsView
  );
  const nextConfig = hasAnySettings ? normalized : null;
  const updatedAt = new Date().toISOString();
  await fs.mkdir(path.dirname(getSettingsPath()), { recursive: true });
  await fs.writeFile(
    getSettingsPath(),
    `${JSON.stringify({ config: nextConfig, updatedAt }, null, 2)}\n`,
    "utf8"
  );
  return buildSnapshot(nextConfig, updatedAt);
}
