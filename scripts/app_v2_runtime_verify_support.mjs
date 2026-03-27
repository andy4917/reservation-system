import fs from "node:fs";
import path from "node:path";

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function resolveGoogleTokenFile(inputPath = "") {
  const direct = normalizeText(inputPath);
  if (direct) return direct;
  const defaultPath = path.join(process.cwd(), ".google_oauth_token.json");
  return fs.existsSync(defaultPath) ? defaultPath : "";
}

export function buildRuntimeVerifyEnv({ env = process.env, googleTokenFile = "" } = {}) {
  const resolvedFile = resolveGoogleTokenFile(googleTokenFile);
  const nextEnv = { ...env };

  if (
    normalizeText(nextEnv.UHS_GOOGLE_ACCESS_TOKEN || nextEnv.GOOGLE_ACCESS_TOKEN) ||
    normalizeText(nextEnv.UHS_GOOGLE_REFRESH_TOKEN || nextEnv.GOOGLE_REFRESH_TOKEN)
  ) {
    return nextEnv;
  }

  if (!resolvedFile || !fs.existsSync(resolvedFile)) {
    return nextEnv;
  }

  let payload;
  try {
    payload = JSON.parse(fs.readFileSync(resolvedFile, "utf8"));
  } catch {
    return nextEnv;
  }

  const refreshToken = normalizeText(payload?.refresh_token || "");
  const clientId = normalizeText(payload?.client_id || "");
  const clientSecret = normalizeText(payload?.client_secret || "");

  if (refreshToken) nextEnv.UHS_GOOGLE_REFRESH_TOKEN = refreshToken;
  if (clientId) nextEnv.UHS_GOOGLE_CLIENT_ID = clientId;
  if (clientSecret) nextEnv.UHS_GOOGLE_CLIENT_SECRET = clientSecret;
  return nextEnv;
}

export function toPowerShellLiteral(value = "") {
  return `'${String(value).replace(/'/g, "''")}'`;
}

export function resolveElectronLaunchPaths(repoRoot) {
  const electronCli = path.join(repoRoot, "node_modules", "electron", "cli.js");
  const electronDist = path.join(repoRoot, "node_modules", "electron", "dist");
  const windowsExe = path.join(electronDist, "electron.exe");
  const linuxExe = path.join(electronDist, "electron");

  if (process.platform === "linux") {
    if (fs.existsSync(windowsExe)) {
      return { electronCli, electronExe: windowsExe };
    }
    if (fs.existsSync(linuxExe)) {
      return { electronCli, electronExe: linuxExe };
    }
  }

  return {
    electronCli,
    electronExe: process.platform === "win32" ? windowsExe : linuxExe,
  };
}

export function shouldLaunchWindowsElectron(electronExe) {
  return process.platform === "linux" && electronExe.endsWith(".exe") && fs.existsSync(electronExe);
}
