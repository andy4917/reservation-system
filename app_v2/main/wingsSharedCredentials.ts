import fs from "node:fs/promises";
import path from "node:path";
import type { AppBranch, AppWingsBranchCredential, AppWingsSharedCredentials } from "../../src/desktop/app-v2-contracts.js";

export const WINGS_SHARED_COMPANY_ID = "UHSUITE";
const WINGS_SHARED_FILE_NAME = "WINGS 지점 공용.txt";

const BRANCH_LABEL_MAP: Array<{ pattern: RegExp; branch: AppBranch }> = [
  { pattern: /선릉/i, branch: "SEOLLEUNG" },
  { pattern: /강남/i, branch: "GANGNAM" },
  { pattern: /코엑스/i, branch: "COEX" },
];

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function buildEmptyBranches(): Record<AppBranch, AppWingsBranchCredential | null> {
  return {
    COEX: null,
    GANGNAM: null,
    SEOLLEUNG: null,
    SAMSUNG: null,
  };
}

function resolveBranch(label: string): AppBranch | null {
  return BRANCH_LABEL_MAP.find((entry) => entry.pattern.test(label))?.branch ?? null;
}

export function parseWingsSharedCredentialsText(rawText: string): AppWingsSharedCredentials {
  const branches = buildEmptyBranches();
  const lines = rawText.split(/\r?\n/);
  let currentBranch: AppBranch | null = null;
  let loginId = "";
  let password = "";

  function flushCurrent() {
    if (!currentBranch || !loginId || !password) return;
    branches[currentBranch] = { loginId, password };
  }

  for (const rawLine of lines) {
    const line = normalizeText(rawLine);
    if (!line) continue;
    if (/^WINGS\b/i.test(line)) {
      flushCurrent();
      currentBranch = resolveBranch(line);
      loginId = "";
      password = "";
      continue;
    }
    const loginMatch = line.match(/^USER\s*ID\s*:\s*(.+)$/i);
    if (loginMatch) {
      loginId = normalizeText(loginMatch[1]);
      continue;
    }
    const passwordMatch = line.match(/^PASSWORD\s*:\s*(.+)$/i);
    if (passwordMatch) {
      password = normalizeText(passwordMatch[1]);
    }
  }
  flushCurrent();

  return {
    companyId: WINGS_SHARED_COMPANY_ID,
    branches,
  };
}

function normalizeEnvText(value: string | undefined | null) {
  return typeof value === "string" ? value.trim() : "";
}

function buildDesktopCandidate(baseDir: string) {
  return path.join(baseDir, "Desktop", WINGS_SHARED_FILE_NAME);
}

function getWindowsProfileCandidates() {
  const candidates: string[] = [];
  const userProfile = normalizeEnvText(process.env.USERPROFILE);
  if (userProfile) candidates.push(userProfile);
  const homeDrive = normalizeEnvText(process.env.HOMEDRIVE);
  const homePath = normalizeEnvText(process.env.HOMEPATH);
  if (homeDrive && homePath) candidates.push(path.join(homeDrive, homePath));
  const home = normalizeEnvText(process.env.HOME);
  if (process.platform === "win32" && home) candidates.push(home);
  return Array.from(new Set(candidates));
}

function isLikelySystemWindowsProfile(name: string) {
  return ["All Users", "Default", "Default User", "Public"].includes(name);
}

async function listWslWindowsDesktopCandidates() {
  const mountRoot = path.posix.join(path.posix.sep, "mnt");
  const usersRoot = path.posix.join(mountRoot, "c", "Users");
  const desktopCandidates: string[] = [];
  try {
    const entries = await fs.readdir(usersRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || isLikelySystemWindowsProfile(entry.name)) continue;
      desktopCandidates.push(path.posix.join(usersRoot, entry.name, "Desktop", WINGS_SHARED_FILE_NAME));
    }
  } catch {
    return [];
  }
  return desktopCandidates;
}

async function pathExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function getDefaultWingsSharedCredentialsPath() {
  const explicitCandidates = getWindowsProfileCandidates().map(buildDesktopCandidate);
  const wslCandidates = process.platform === "win32" ? [] : await listWslWindowsDesktopCandidates();
  const candidates = [...explicitCandidates, ...wslCandidates];
  for (const candidate of candidates) {
    if (await pathExists(candidate)) return candidate;
  }
  throw new Error(`${WINGS_SHARED_FILE_NAME} 파일을 Desktop에서 찾을 수 없습니다.`);
}

export async function loadDefaultWingsSharedCredentials(): Promise<AppWingsSharedCredentials> {
  const rawText = await fs.readFile(await getDefaultWingsSharedCredentialsPath(), "utf8");
  return parseWingsSharedCredentialsText(rawText);
}
