import fs from "node:fs/promises";
import path from "node:path";
import electron from "electron";
import type {
  BindingDecisionSheetRef,
  ManualScanAnchorValues,
  SavedManualScanAnchor
} from "../contracts/provider.js";

interface ScanAnchorStoreFile {
  schemaVersion: 1;
  anchors: Record<string, SavedManualScanAnchor>;
}

const { app } = electron;
const SCAN_ANCHOR_STORE_FILE = "manual-scan-anchors.v1.json";
const SCAN_ANCHOR_STORE_SCHEMA_VERSION = 1 as const;
const MANUAL_SCAN_ANCHOR_KEYS = [
  "dateRow",
  "roomStartRow",
  "inventorySearchStartRow",
  "naverInventoryRow",
  "stationInventoryRow"
] as const;

let scanAnchorStoreDirOverride: string | null = null;

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeKeyPart(value: unknown) {
  return normalizeText(value).toLowerCase();
}

function normalizeSheetRef(sheetRef: BindingDecisionSheetRef): BindingDecisionSheetRef {
  return {
    spreadsheetId: normalizeText(sheetRef.spreadsheetId),
    sheetName: normalizeText(sheetRef.sheetName),
    sheetId: normalizeText(sheetRef.sheetId) || null,
    timezone: normalizeText(sheetRef.timezone) || null
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function createEmptyScanAnchorStore(): ScanAnchorStoreFile {
  return {
    schemaVersion: SCAN_ANCHOR_STORE_SCHEMA_VERSION,
    anchors: {}
  };
}

function getScanAnchorStoreDir() {
  return scanAnchorStoreDirOverride || app.getPath("userData");
}

function getScanAnchorStorePath() {
  return path.join(getScanAnchorStoreDir(), SCAN_ANCHOR_STORE_FILE);
}

async function ensureScanAnchorStoreDir() {
  await fs.mkdir(getScanAnchorStoreDir(), { recursive: true });
}

async function quarantineCorruptScanAnchorStore(filePath: string) {
  const corruptPath = `${filePath}.corrupt-${Date.now()}`;
  try {
    await fs.rename(filePath, corruptPath);
  } catch (_error) {
    return;
  }
}

function buildAnchorKey(input: { branch: string; sheetRef: BindingDecisionSheetRef }) {
  return [
    normalizeKeyPart(input.branch),
    normalizeKeyPart(input.sheetRef.spreadsheetId),
    normalizeKeyPart(input.sheetRef.sheetName)
  ].join("|");
}

function normalizePositiveInt(value: unknown) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function normalizeManualScanAnchorValues(value: unknown): ManualScanAnchorValues {
  const input = isPlainObject(value) ? value : {};
  const out: ManualScanAnchorValues = {};
  for (const key of MANUAL_SCAN_ANCHOR_KEYS) {
    const normalized = normalizePositiveInt(input[key]);
    if (normalized !== null) out[key] = normalized;
  }
  return out;
}

function hasManualScanAnchorValues(value: ManualScanAnchorValues) {
  return MANUAL_SCAN_ANCHOR_KEYS.some((key) => typeof value[key] === "number");
}

function normalizeSavedManualScanAnchor(value: unknown): SavedManualScanAnchor | null {
  if (!isPlainObject(value) || !isPlainObject(value.sheetRef)) return null;
  const branch = normalizeText(value.branch);
  const sheetRef = normalizeSheetRef({
    spreadsheetId: normalizeText(value.sheetRef.spreadsheetId),
    sheetName: normalizeText(value.sheetRef.sheetName),
    sheetId: normalizeText(value.sheetRef.sheetId) || null,
    timezone: normalizeText(value.sheetRef.timezone) || null
  });
  const scan = normalizeManualScanAnchorValues(value.scan);
  const updatedAt = normalizeText(value.updatedAt);
  if (!branch || !sheetRef.spreadsheetId || !sheetRef.sheetName || !updatedAt || !hasManualScanAnchorValues(scan)) {
    return null;
  }
  return {
    anchorKey: buildAnchorKey({ branch, sheetRef }),
    branch,
    sheetRef,
    scan,
    updatedAt
  };
}

async function readScanAnchorStore(): Promise<ScanAnchorStoreFile> {
  const filePath = getScanAnchorStorePath();
  try {
    const raw = await fs.readFile(filePath, "utf8");
    if (!raw.trim()) return createEmptyScanAnchorStore();
    const parsed = JSON.parse(raw);
    if (!isPlainObject(parsed) || parsed.schemaVersion !== SCAN_ANCHOR_STORE_SCHEMA_VERSION || !isPlainObject(parsed.anchors)) {
      await quarantineCorruptScanAnchorStore(filePath);
      return createEmptyScanAnchorStore();
    }
    const anchors: Record<string, SavedManualScanAnchor> = {};
    for (const [anchorKey, value] of Object.entries(parsed.anchors)) {
      const normalized = normalizeSavedManualScanAnchor(value);
      if (!normalized) continue;
      anchors[anchorKey] = normalized;
    }
    return {
      schemaVersion: SCAN_ANCHOR_STORE_SCHEMA_VERSION,
      anchors
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      return createEmptyScanAnchorStore();
    }
    await quarantineCorruptScanAnchorStore(filePath);
    return createEmptyScanAnchorStore();
  }
}

async function writeScanAnchorStore(store: ScanAnchorStoreFile) {
  await ensureScanAnchorStoreDir();
  const filePath = getScanAnchorStorePath();
  const tempPath = `${filePath}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(store, null, 2), "utf8");
  await fs.rename(tempPath, filePath);
}

export async function loadManualScanAnchor(query: { branch: string; sheetRef: BindingDecisionSheetRef }) {
  const branch = normalizeText(query.branch);
  const sheetRef = normalizeSheetRef(query.sheetRef);
  if (!branch || !sheetRef.spreadsheetId || !sheetRef.sheetName) return null;
  const store = await readScanAnchorStore();
  return store.anchors[buildAnchorKey({ branch, sheetRef })] || null;
}

export async function saveManualScanAnchor(input: {
  branch: string;
  sheetRef: BindingDecisionSheetRef;
  scan: ManualScanAnchorValues;
}) {
  const branch = normalizeText(input.branch);
  const sheetRef = normalizeSheetRef(input.sheetRef);
  const scan = normalizeManualScanAnchorValues(input.scan);
  if (!branch || !sheetRef.spreadsheetId || !sheetRef.sheetName || !hasManualScanAnchorValues(scan)) {
    throw new Error("Manual scan anchor is missing required fields.");
  }
  const anchor: SavedManualScanAnchor = {
    anchorKey: buildAnchorKey({ branch, sheetRef }),
    branch,
    sheetRef,
    scan,
    updatedAt: new Date().toISOString()
  };
  const store = await readScanAnchorStore();
  store.anchors[anchor.anchorKey] = anchor;
  await writeScanAnchorStore(store);
  return anchor;
}

export async function deleteManualScanAnchor(query: { branch: string; sheetRef: BindingDecisionSheetRef }) {
  const branch = normalizeText(query.branch);
  const sheetRef = normalizeSheetRef(query.sheetRef);
  if (!branch || !sheetRef.spreadsheetId || !sheetRef.sheetName) return false;
  const anchorKey = buildAnchorKey({ branch, sheetRef });
  const store = await readScanAnchorStore();
  if (!store.anchors[anchorKey]) return false;
  delete store.anchors[anchorKey];
  await writeScanAnchorStore(store);
  return true;
}

export function applyManualScanAnchorToSyncConfig(
  syncConfig: Record<string, unknown>,
  anchor: SavedManualScanAnchor | null
) {
  if (!anchor) return syncConfig;
  const nextScan = isPlainObject(syncConfig.scan) ? { ...syncConfig.scan } : {};
  for (const key of MANUAL_SCAN_ANCHOR_KEYS) {
    const value = anchor.scan[key];
    if (typeof value === "number" && Number.isInteger(value) && value > 0) {
      nextScan[key] = value;
    }
  }
  nextScan.mode = "manual";
  return {
    ...syncConfig,
    scan: nextScan
  };
}

export function __setScanAnchorStoreDirForTests(dir: string | null) {
  scanAnchorStoreDirOverride = dir;
}

export function __getScanAnchorStorePathForTests() {
  return getScanAnchorStorePath();
}
