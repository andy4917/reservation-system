import fs from "node:fs/promises";
import path from "node:path";
import electron from "electron";
import type {
  BindingDecisionSheetRef,
  OperatorExportHandoffFormat,
  OperatorExportHandoffPayload,
  OperatorExportHandoffHistoryItem
} from "../contracts/provider.js";

interface OperatorHandoffStoreFile {
  schemaVersion: 1;
  history: Record<string, OperatorExportHandoffHistoryItem>;
}

interface SaveOperatorHandoffHistoryInput {
  runId: string;
  branch: string;
  sheetRef: BindingDecisionSheetRef;
  target: "clipboard" | "file";
  format: OperatorExportHandoffFormat;
  fileName: string | null;
  filePath: string | null;
  bytes: number;
  verifyClassification: OperatorExportHandoffHistoryItem["verifyClassification"];
  source: string;
  startDate: string;
  endDate: string;
  evidenceLineage: string[];
  impactScope: OperatorExportHandoffHistoryItem["impactScope"];
  impactReasons: string[];
  payload: OperatorExportHandoffPayload;
  status?: OperatorExportHandoffHistoryItem["status"];
  repeatedFromHandoffId?: string | null;
}

const OPERATOR_HANDOFF_STORE_FILE = "operator-handoffs.v1.json";
const OPERATOR_HANDOFF_STORE_SCHEMA_VERSION = 1 as const;
const { app } = electron;

let operatorHandoffStoreDirOverride: string | null = null;

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeKeyPart(value: unknown) {
  return normalizeText(value).toLowerCase();
}

function normalizeStringArray(value: unknown) {
  return Array.isArray(value) ? value.map((entry) => normalizeText(entry)).filter(Boolean) : [];
}

function normalizeImpactScope(value: unknown): OperatorExportHandoffHistoryItem["impactScope"] {
  if (value === "operations" || value === "implementation" || value === "mixed") return value;
  return "implementation";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeSheetRef(sheetRef: BindingDecisionSheetRef): BindingDecisionSheetRef {
  return {
    spreadsheetId: normalizeText(sheetRef.spreadsheetId),
    sheetName: normalizeText(sheetRef.sheetName),
    sheetId: normalizeText(sheetRef.sheetId) || null,
    timezone: normalizeText(sheetRef.timezone) || null
  };
}

function getOperatorHandoffStoreDir() {
  return operatorHandoffStoreDirOverride || app.getPath("userData");
}

function getOperatorHandoffStorePath() {
  return path.join(getOperatorHandoffStoreDir(), OPERATOR_HANDOFF_STORE_FILE);
}

async function ensureOperatorHandoffStoreDir() {
  await fs.mkdir(getOperatorHandoffStoreDir(), { recursive: true });
}

async function quarantineCorruptOperatorHandoffStore(filePath: string) {
  const corruptPath = `${filePath}.corrupt-${Date.now()}`;
  try {
    await fs.rename(filePath, corruptPath);
  } catch (_error) {
    return;
  }
}

function createEmptyOperatorHandoffStore(): OperatorHandoffStoreFile {
  return {
    schemaVersion: OPERATOR_HANDOFF_STORE_SCHEMA_VERSION,
    history: {}
  };
}

function buildHandoffId(input: {
  runId: string;
  branch: string;
  sheetRef: BindingDecisionSheetRef;
  target: "clipboard" | "file";
  format: OperatorExportHandoffFormat;
  exportedAt: string;
}) {
  return [
    normalizeKeyPart(input.runId),
    normalizeKeyPart(input.branch),
    normalizeKeyPart(input.sheetRef.spreadsheetId),
    normalizeKeyPart(input.sheetRef.sheetName),
    normalizeKeyPart(input.target),
    normalizeKeyPart(input.format),
    normalizeKeyPart(input.exportedAt)
  ].join("|");
}

function matchesSheetRef(left: BindingDecisionSheetRef, right: BindingDecisionSheetRef) {
  return (
    normalizeKeyPart(left.spreadsheetId) === normalizeKeyPart(right.spreadsheetId) &&
    normalizeKeyPart(left.sheetName) === normalizeKeyPart(right.sheetName)
  );
}

function normalizePersistedHistoryItem(value: unknown): OperatorExportHandoffHistoryItem | null {
  if (!isPlainObject(value) || !isPlainObject(value.sheetRef)) return null;
  const runId = normalizeText(value.runId);
  const branch = normalizeText(value.branch);
  const target = value.target === "clipboard" || value.target === "file" ? value.target : null;
  const format = value.format === "copy-text" || value.format === "json" || value.format === "csv" ? value.format : null;
  const exportedAt = normalizeText(value.exportedAt);
  const verifyClassification =
    value.verifyClassification === "live-success" ||
    value.verifyClassification === "sheet-unconfigured" ||
    value.verifyClassification === "failure" ||
    value.verifyClassification === "unavailable"
      ? value.verifyClassification
      : null;
  const source = normalizeText(value.source);
  const startDate = normalizeText(value.startDate);
  const endDate = normalizeText(value.endDate);
  const bytes = typeof value.bytes === "number" ? value.bytes : Number(value.bytes);
  const status =
    value.status === "sent" || value.status === "confirmed" || value.status === "needs-follow-up" ? value.status : "sent";
  const impactScope = normalizeImpactScope(value.impactScope);
  const sheetRef = normalizeSheetRef({
    spreadsheetId: normalizeText(value.sheetRef.spreadsheetId),
    sheetName: normalizeText(value.sheetRef.sheetName),
    sheetId: normalizeText(value.sheetRef.sheetId) || null,
    timezone: normalizeText(value.sheetRef.timezone) || null
  });
  if (!runId || !branch || !target || !format || !exportedAt || !verifyClassification || !source || !startDate || !endDate || !Number.isFinite(bytes)) {
    return null;
  }
  const payload =
    isPlainObject(value.payload) &&
    (value.payload.format === "copy-text" || value.payload.format === "json" || value.payload.format === "csv") &&
    typeof value.payload.fileName === "string" &&
    typeof value.payload.mimeType === "string" &&
    typeof value.payload.content === "string"
      ? {
          format: value.payload.format,
          fileName: normalizeText(value.payload.fileName),
          mimeType: normalizeText(value.payload.mimeType),
          content: value.payload.content
        } satisfies OperatorExportHandoffPayload
      : null;
  if (!payload || !payload.fileName || !payload.mimeType) return null;
  const handoffId =
    normalizeText(value.handoffId) ||
    buildHandoffId({
      runId,
      branch,
      sheetRef,
      target,
      format,
      exportedAt
    });
  return {
    handoffId,
    runId,
    branch,
    sheetRef,
    target,
    format,
    exportedAt,
    fileName: normalizeText(value.fileName) || null,
    filePath: normalizeText(value.filePath) || null,
    bytes: Math.max(0, bytes),
    verifyClassification,
    source,
    startDate,
    endDate,
    evidenceLineage: normalizeStringArray(value.evidenceLineage),
    status,
    impactScope,
    impactReasons: normalizeStringArray(value.impactReasons),
    repeatedFromHandoffId: normalizeText(value.repeatedFromHandoffId) || null,
    payload
  };
}

async function readOperatorHandoffStore(): Promise<OperatorHandoffStoreFile> {
  const filePath = getOperatorHandoffStorePath();
  try {
    const raw = await fs.readFile(filePath, "utf8");
    if (!raw.trim()) return createEmptyOperatorHandoffStore();
    const parsed = JSON.parse(raw);
    if (!isPlainObject(parsed) || parsed.schemaVersion !== OPERATOR_HANDOFF_STORE_SCHEMA_VERSION || !isPlainObject(parsed.history)) {
      await quarantineCorruptOperatorHandoffStore(filePath);
      return createEmptyOperatorHandoffStore();
    }
    const history: Record<string, OperatorExportHandoffHistoryItem> = {};
    for (const [handoffId, value] of Object.entries(parsed.history)) {
      const normalized = normalizePersistedHistoryItem(value);
      if (!normalized) continue;
      history[handoffId] = normalized;
    }
    return {
      schemaVersion: OPERATOR_HANDOFF_STORE_SCHEMA_VERSION,
      history
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return createEmptyOperatorHandoffStore();
    await quarantineCorruptOperatorHandoffStore(filePath);
    return createEmptyOperatorHandoffStore();
  }
}

async function writeOperatorHandoffStore(store: OperatorHandoffStoreFile) {
  await ensureOperatorHandoffStoreDir();
  const filePath = getOperatorHandoffStorePath();
  const tempPath = `${filePath}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(store, null, 2), "utf8");
  await fs.rename(tempPath, filePath);
}

export async function loadOperatorHandoffHistory(query: { branch: string; sheetRef: BindingDecisionSheetRef }) {
  const branch = normalizeText(query.branch);
  const sheetRef = normalizeSheetRef(query.sheetRef);
  if (!branch || !sheetRef.spreadsheetId || !sheetRef.sheetName) return [];
  const store = await readOperatorHandoffStore();
  return Object.values(store.history)
    .filter((item) => normalizeKeyPart(item.branch) === normalizeKeyPart(branch) && matchesSheetRef(item.sheetRef, sheetRef))
    .sort(
      (left, right) =>
        normalizeText(right.exportedAt).localeCompare(normalizeText(left.exportedAt)) || right.handoffId.localeCompare(left.handoffId)
    );
}

export async function saveOperatorHandoffHistory(input: SaveOperatorHandoffHistoryInput) {
  const exportedAt = new Date().toISOString();
  const sheetRef = normalizeSheetRef(input.sheetRef);
  const item: OperatorExportHandoffHistoryItem = {
    handoffId: buildHandoffId({
      runId: normalizeText(input.runId),
      branch: normalizeText(input.branch),
      sheetRef,
      target: input.target,
      format: input.format,
      exportedAt
    }),
    runId: normalizeText(input.runId),
    branch: normalizeText(input.branch),
    sheetRef,
    target: input.target,
    format: input.format,
    exportedAt,
    fileName: normalizeText(input.fileName) || null,
    filePath: normalizeText(input.filePath) || null,
    bytes: Math.max(0, Math.trunc(input.bytes)),
    verifyClassification: input.verifyClassification,
    source: normalizeText(input.source),
    startDate: normalizeText(input.startDate),
    endDate: normalizeText(input.endDate),
    evidenceLineage: normalizeStringArray(input.evidenceLineage),
    status: input.status === "confirmed" || input.status === "needs-follow-up" ? input.status : "sent",
    impactScope: normalizeImpactScope(input.impactScope),
    impactReasons: normalizeStringArray(input.impactReasons),
    repeatedFromHandoffId: normalizeText(input.repeatedFromHandoffId) || null,
    payload: {
      format: input.payload.format,
      fileName: normalizeText(input.payload.fileName),
      mimeType: normalizeText(input.payload.mimeType),
      content: input.payload.content
    }
  };
  if (
    !item.runId ||
    !item.branch ||
    !item.sheetRef.spreadsheetId ||
    !item.sheetRef.sheetName ||
    !item.source ||
    !item.startDate ||
    !item.endDate ||
    !item.payload.fileName ||
    !item.payload.mimeType
  ) {
    throw new Error("Operator handoff history is missing required fields.");
  }
  const store = await readOperatorHandoffStore();
  store.history[item.handoffId] = item;
  await writeOperatorHandoffStore(store);
  return item;
}

export async function loadOperatorHandoffById(handoffId: string) {
  const normalizedId = normalizeText(handoffId);
  if (!normalizedId) return null;
  const store = await readOperatorHandoffStore();
  return store.history[normalizedId] || null;
}

export async function updateOperatorHandoffStatus(input: { handoffId: string; status: OperatorExportHandoffHistoryItem["status"] }) {
  const normalizedId = normalizeText(input.handoffId);
  if (!normalizedId) return null;
  const store = await readOperatorHandoffStore();
  const existing = store.history[normalizedId];
  if (!existing) return null;
  const nextStatus = input.status === "confirmed" || input.status === "needs-follow-up" ? input.status : "sent";
  store.history[normalizedId] = {
    ...existing,
    status: nextStatus
  };
  await writeOperatorHandoffStore(store);
  return store.history[normalizedId];
}

export function __setOperatorHandoffStoreDirForTests(dir: string | null) {
  operatorHandoffStoreDirOverride = dir;
}

export function __getOperatorHandoffStorePathForTests() {
  return getOperatorHandoffStorePath();
}
