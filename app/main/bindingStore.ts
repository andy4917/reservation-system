import fs from "node:fs/promises";
import path from "node:path";
import electron from "electron";
import type {
  BindingDecisionSheetRef,
  SaveBindingDecisionInput,
  SavedBindingDecision
} from "../contracts/provider.js";

interface BindingStoreFile {
  schemaVersion: 1;
  decisions: Record<string, SavedBindingDecision>;
}

const BINDING_STORE_FILE = "binding-decisions.v1.json";
const BINDING_STORE_SCHEMA_VERSION = 1 as const;
const { app } = electron;

let bindingStoreDirOverride: string | null = null;

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

function getBindingStoreDir() {
  return bindingStoreDirOverride || app.getPath("userData");
}

function getBindingStorePath() {
  return path.join(getBindingStoreDir(), BINDING_STORE_FILE);
}

async function ensureBindingStoreDir() {
  await fs.mkdir(getBindingStoreDir(), { recursive: true });
}

function createEmptyBindingStore(): BindingStoreFile {
  return {
    schemaVersion: BINDING_STORE_SCHEMA_VERSION,
    decisions: {}
  };
}

async function quarantineCorruptBindingStore(filePath: string) {
  const corruptPath = `${filePath}.corrupt-${Date.now()}`;
  try {
    await fs.rename(filePath, corruptPath);
  } catch (_error) {
    return;
  }
}

function buildDecisionKey(input: {
  branch: string;
  sheetRef: BindingDecisionSheetRef;
  sectionKey?: string | null;
  anchorId: string;
  rawHeader: string;
}) {
  const keyParts = [
    normalizeKeyPart(input.branch),
    normalizeKeyPart(input.sheetRef.spreadsheetId),
    normalizeKeyPart(input.sheetRef.sheetName),
  ];
  const normalizedSectionKey = normalizeKeyPart(input.sectionKey);
  if (normalizedSectionKey) keyParts.push(normalizedSectionKey);
  keyParts.push(normalizeKeyPart(input.anchorId), normalizeKeyPart(input.rawHeader));
  return keyParts.join("|");
}

function normalizeSavedBindingDecision(input: SaveBindingDecisionInput): SavedBindingDecision {
  const sheetRef = normalizeSheetRef(input.sheetRef);
  const branch = normalizeText(input.branch);
  const sectionKey = normalizeText(input.sectionKey) || null;
  const anchorId = normalizeText(input.anchorId);
  const rawHeader = normalizeText(input.rawHeader);
  const termId = normalizeText(input.termId);
  if (!branch || !sheetRef.spreadsheetId || !sheetRef.sheetName || !anchorId || !rawHeader || !termId) {
    throw new Error("Binding decision is missing required fields.");
  }
  return {
    decisionKey: buildDecisionKey({ branch, sheetRef, sectionKey, anchorId, rawHeader }),
    branch,
    sheetRef,
    sectionKey,
    anchorId,
    rawHeader,
    termId,
    method: "manual",
    decidedAt: new Date().toISOString(),
    confidence: typeof input.confidence === "number" ? Math.max(0, Math.min(1, input.confidence)) : 1
  };
}

function normalizePersistedDecision(value: unknown): SavedBindingDecision | null {
  if (!isPlainObject(value)) return null;
  const sheetRef = isPlainObject(value.sheetRef)
    ? normalizeSheetRef({
        spreadsheetId: normalizeText(value.sheetRef.spreadsheetId),
        sheetName: normalizeText(value.sheetRef.sheetName),
        sheetId: normalizeText(value.sheetRef.sheetId) || null,
        timezone: normalizeText(value.sheetRef.timezone) || null
      })
    : null;
  const branch = normalizeText(value.branch);
  const sectionKey = normalizeText(value.sectionKey) || null;
  const anchorId = normalizeText(value.anchorId);
  const rawHeader = normalizeText(value.rawHeader);
  const termId = normalizeText(value.termId);
  const method = normalizeText(value.method);
  const decidedAt = normalizeText(value.decidedAt);
  const confidence = typeof value.confidence === "number" ? value.confidence : Number(value.confidence);
  if (!sheetRef || !branch || !anchorId || !rawHeader || !termId || method !== "manual" || !decidedAt || !Number.isFinite(confidence)) {
    return null;
  }
  return {
    decisionKey: buildDecisionKey({ branch, sheetRef, sectionKey, anchorId, rawHeader }),
    branch,
    sheetRef,
    sectionKey,
    anchorId,
    rawHeader,
    termId,
    method: "manual",
    decidedAt,
    confidence: Math.max(0, Math.min(1, confidence))
  };
}

async function readBindingStore(): Promise<BindingStoreFile> {
  const filePath = getBindingStorePath();
  try {
    const raw = await fs.readFile(filePath, "utf8");
    if (!raw.trim()) {
      return createEmptyBindingStore();
    }
    const parsed = JSON.parse(raw);
    if (!isPlainObject(parsed) || parsed.schemaVersion !== BINDING_STORE_SCHEMA_VERSION || !isPlainObject(parsed.decisions)) {
      await quarantineCorruptBindingStore(filePath);
      return createEmptyBindingStore();
    }
    const decisions: Record<string, SavedBindingDecision> = {};
    for (const [decisionKey, value] of Object.entries(parsed.decisions)) {
      const normalized = normalizePersistedDecision(value);
      if (!normalized) continue;
      decisions[decisionKey] = normalized;
    }
    return {
      schemaVersion: BINDING_STORE_SCHEMA_VERSION,
      decisions
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      return createEmptyBindingStore();
    }
    if (message) {
      await quarantineCorruptBindingStore(filePath);
    }
    return createEmptyBindingStore();
  }
}

async function writeBindingStore(store: BindingStoreFile) {
  await ensureBindingStoreDir();
  const filePath = getBindingStorePath();
  const tempPath = `${filePath}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(store, null, 2), "utf8");
  await fs.rename(tempPath, filePath);
}

function matchesSheetRef(left: BindingDecisionSheetRef, right: BindingDecisionSheetRef) {
  return (
    normalizeKeyPart(left.spreadsheetId) === normalizeKeyPart(right.spreadsheetId) &&
    normalizeKeyPart(left.sheetName) === normalizeKeyPart(right.sheetName)
  );
}

export async function loadBindingDecisions(query: { branch: string; sheetRef: BindingDecisionSheetRef }) {
  const branch = normalizeText(query.branch);
  const sheetRef = normalizeSheetRef(query.sheetRef);
  if (!branch || !sheetRef.spreadsheetId || !sheetRef.sheetName) return [];
  const store = await readBindingStore();
  return Object.values(store.decisions).filter(
    (decision) => normalizeKeyPart(decision.branch) === normalizeKeyPart(branch) && matchesSheetRef(decision.sheetRef, sheetRef)
  );
}

export async function saveBindingDecision(input: SaveBindingDecisionInput) {
  const decision = normalizeSavedBindingDecision(input);
  const store = await readBindingStore();
  store.decisions[decision.decisionKey] = decision;
  await writeBindingStore(store);
  return decision;
}

export async function deleteBindingDecision(decisionKey: string) {
  const normalizedKey = normalizeText(decisionKey);
  if (!normalizedKey) return false;
  const store = await readBindingStore();
  if (!store.decisions[normalizedKey]) {
    return false;
  }
  delete store.decisions[normalizedKey];
  await writeBindingStore(store);
  return true;
}

export function __setBindingStoreDirForTests(dir: string | null) {
  bindingStoreDirOverride = dir;
}

export function __getBindingStorePathForTests() {
  return getBindingStorePath();
}
