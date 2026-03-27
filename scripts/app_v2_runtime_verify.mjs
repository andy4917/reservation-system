import fs from "node:fs/promises";
import os from "node:os";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  buildRuntimeVerifyEnv,
  resolveElectronLaunchPaths,
  shouldLaunchWindowsElectron,
  toPowerShellLiteral
} from "./app_v2_runtime_verify_support.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { electronCli, electronExe } = resolveElectronLaunchPaths(repoRoot);
const DEFAULT_VERIFY_TIMEOUT_MS = 30000;
const SETTINGS_FILE_NAME = "app-v2-settings.json";
const SPREADSHEET_ID_RE = /^[A-Za-z0-9_-]{40,120}$/;
const SPREADSHEET_URL_RE = /\/spreadsheets(?:\/u\/\d+)?\/d\/([A-Za-z0-9_-]{40,120})/i;

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseArgs(argv) {
  const options = {
    focus: "live-read",
    json: false,
    userDataDir: "",
    timeoutMs: DEFAULT_VERIFY_TIMEOUT_MS,
    googleTokenFile: ""
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (token === "--focus" && next) {
      options.focus = next === "sheet-live" ? "sheet-live" : "live-read";
      index += 1;
      continue;
    }
    if (token === "--json") {
      options.json = true;
      continue;
    }
    if (token === "--user-data-dir" && next) {
      options.userDataDir = next;
      index += 1;
      continue;
    }
    if (token === "--timeout-ms" && next) {
      const parsed = Number(next);
      if (Number.isFinite(parsed) && parsed > 0) {
        options.timeoutMs = parsed;
      }
      index += 1;
      continue;
    }
    if (token === "--google-token-file" && next) {
      options.googleTokenFile = next;
      index += 1;
    }
  }

  return options;
}

function extractSpreadsheetId(value) {
  const text = normalizeText(value || "");
  if (!text) return null;
  if (SPREADSHEET_ID_RE.test(text)) return text;
  const match = text.match(SPREADSHEET_URL_RE);
  return match?.[1] || null;
}

function resolveConfiguredSheetNames(config) {
  const tabs = config?.sheetTabs
    ? [config.sheetTabs.gangnam, config.sheetTabs.coex, config.sheetTabs.seolleung, config.sheetTabs.samseong]
    : [];
  const names = tabs.map((value) => normalizeText(value)).filter(Boolean);
  if (names.length > 0) {
    return names;
  }
  const fallback = normalizeText(config?.sheetName || "");
  return fallback ? [fallback] : [];
}

function buildSheetSnapshot(status, summary, options = {}) {
  return {
    checkedAt: new Date().toISOString(),
    status,
    summary,
    spreadsheetId: options.spreadsheetId ?? null,
    sheetName: options.sheetName ?? null,
    accessMode: options.accessMode ?? "none",
    lastError: options.lastError ?? null
  };
}

function buildSettingsSnapshot(storagePath, config, updatedAt) {
  const missingRequired = [];
  if (!normalizeText(config?.spreadsheet || "")) missingRequired.push("spreadsheet");
  const hasSheetTabs = Boolean(
    normalizeText(config?.sheetTabs?.gangnam || "") ||
      normalizeText(config?.sheetTabs?.coex || "") ||
      normalizeText(config?.sheetTabs?.seolleung || "") ||
      normalizeText(config?.sheetTabs?.samseong || "")
  );
  if (!normalizeText(config?.sheetName || "") && !hasSheetTabs) missingRequired.push("sheetName");
  return {
    config: config || null,
    isConfigured: missingRequired.length === 0,
    missingRequired,
    updatedAt: normalizeText(updatedAt || "") || null,
    storagePath
  };
}

async function readLocalSettingsSnapshot(options) {
  if (!normalizeText(options.userDataDir)) {
    return null;
  }

  const storagePath = path.join(options.userDataDir, SETTINGS_FILE_NAME);
  let payload = null;
  try {
    payload = JSON.parse(await fs.readFile(storagePath, "utf8"));
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }

  return buildSettingsSnapshot(storagePath, payload?.config || null, payload?.updatedAt || null);
}

function buildSheetOnlyResult(options, settings, sheet) {
  const overallReady = sheet.status === "ready";
  return {
    checkedAt: new Date().toISOString(),
    focus: options.focus,
    preflightStatus: settings.isConfigured ? (overallReady ? "ready" : "attention") : "needs-settings",
    overallReady,
    blockingSources: overallReady ? [] : [sheet.status === "needs-auth" ? "sheet-auth" : "sheet"],
    supportLevel: overallReady ? "sheet-live" : "offline-preview",
    v2Gate: overallReady && options.focus === "sheet-live" ? "open" : "locked",
    settings,
    sheet,
    preflight: null
  };
}

function resolveLocalSheetPrecheck(settings, runtimeEnv) {
  if (!settings.isConfigured || !settings.config) {
    return buildSheetSnapshot("needs-settings", "스프레드시트와 시트명을 먼저 저장해야 합니다.");
  }

  const spreadsheetId = extractSpreadsheetId(settings.config.spreadsheet);
  const configuredSheetNames = resolveConfiguredSheetNames(settings.config);
  const primarySheetName = configuredSheetNames[0] || null;
  if (!spreadsheetId || configuredSheetNames.length === 0) {
    return buildSheetSnapshot("invalid-settings", "저장된 시트 설정이 유효하지 않습니다.", {
      spreadsheetId,
      sheetName: primarySheetName
    });
  }

  const accessToken = normalizeText(runtimeEnv.UHS_GOOGLE_ACCESS_TOKEN || runtimeEnv.GOOGLE_ACCESS_TOKEN || "");
  if (accessToken) {
    return null;
  }

  const refreshToken = normalizeText(runtimeEnv.UHS_GOOGLE_REFRESH_TOKEN || runtimeEnv.GOOGLE_REFRESH_TOKEN || "");
  const clientId = normalizeText(runtimeEnv.UHS_GOOGLE_CLIENT_ID || runtimeEnv.GOOGLE_CLIENT_ID || "");
  const clientSecret = normalizeText(runtimeEnv.UHS_GOOGLE_CLIENT_SECRET || runtimeEnv.GOOGLE_CLIENT_SECRET || "");
  if (!refreshToken || !clientId || !clientSecret) {
    return buildSheetSnapshot("needs-auth", "Google Sheets 인증이 없어 sheet-live를 확인할 수 없습니다.", {
      spreadsheetId,
      sheetName: primarySheetName,
      accessMode: "none"
    });
  }

  return null;
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: { ...process.env, ...options.env },
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      resolve({ code: code ?? 1, signal, stdout, stderr });
    });
  });
}

async function readWindowsPath(linuxPath) {
  const result = await runCommand("wslpath", ["-w", linuxPath]);
  if (result.code !== 0) {
    throw new Error(`wslpath failed for ${linuxPath}\n${result.stderr}`);
  }
  return normalizeText(result.stdout);
}

function printResult(result, asJson) {
  if (asJson) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }

  const lines = [
    `focus=${result.focus}`,
    `preflightStatus=${result.preflightStatus}`,
    `overallReady=${String(result.overallReady)}`,
    `blockingSources=${JSON.stringify(result.blockingSources)}`,
    `supportLevel=${result.supportLevel}`,
    `v2Gate=${result.v2Gate}`,
    `sheet.status=${result.sheet?.status || "unknown"}`,
    `sheet.summary=${result.sheet?.summary || ""}`
  ];
  process.stdout.write(`${lines.join("\n")}\n`);
}

async function hasExistingBuildArtifacts() {
  try {
    await fs.access(path.join(repoRoot, "dist-app", "app_v2", "main", "main.js"));
    return true;
  } catch {
    return false;
  }
}

function buildRuntimeVerifyFailureResult(options, message) {
  const checkedAt = new Date().toISOString();
  return {
    checkedAt,
    focus: options.focus,
    preflightStatus: "attention",
    overallReady: false,
    blockingSources: ["runtime-error"],
    supportLevel: "offline-preview",
    v2Gate: "locked",
    sheet: {
      checkedAt,
      status: "error",
      summary: message,
      spreadsheetId: null,
      sheetName: null,
      accessMode: "none",
      lastError: message,
    },
    settings: {
      config: null,
      isConfigured: false,
      missingRequired: ["spreadsheet", "sheetName"],
      updatedAt: null,
      storagePath: options.userDataDir || "",
    },
    preflight: null,
  };
}

async function spawnProbe(options, probeFile, runtimeEnv) {
  if (shouldLaunchWindowsElectron(electronExe)) {
    const repoRootWin = await readWindowsPath(repoRoot);
    const electronExeWin = await readWindowsPath(electronExe);
    const probeFileWin = await readWindowsPath(probeFile);
    const userDataDirWin = options.userDataDir ? await readWindowsPath(options.userDataDir) : "";
    return spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        [
          `$env:UHS_APP_V2_RUNTIME_VERIFY='1'`,
          `$env:UHS_APP_V2_VERIFY_OUTPUT_FILE='${probeFileWin}'`,
          `$env:UHS_APP_V2_VERIFY_FOCUS='${options.focus}'`,
          normalizeText(runtimeEnv.UHS_GOOGLE_ACCESS_TOKEN) ? `$env:UHS_GOOGLE_ACCESS_TOKEN=${toPowerShellLiteral(runtimeEnv.UHS_GOOGLE_ACCESS_TOKEN)}` : "",
          normalizeText(runtimeEnv.UHS_GOOGLE_REFRESH_TOKEN) ? `$env:UHS_GOOGLE_REFRESH_TOKEN=${toPowerShellLiteral(runtimeEnv.UHS_GOOGLE_REFRESH_TOKEN)}` : "",
          normalizeText(runtimeEnv.UHS_GOOGLE_CLIENT_ID) ? `$env:UHS_GOOGLE_CLIENT_ID=${toPowerShellLiteral(runtimeEnv.UHS_GOOGLE_CLIENT_ID)}` : "",
          normalizeText(runtimeEnv.UHS_GOOGLE_CLIENT_SECRET) ? `$env:UHS_GOOGLE_CLIENT_SECRET=${toPowerShellLiteral(runtimeEnv.UHS_GOOGLE_CLIENT_SECRET)}` : "",
          userDataDirWin ? `$env:UHS_APP_V2_USER_DATA_DIR='${userDataDirWin}'` : "$env:UHS_APP_V2_USER_DATA_DIR=''",
          `Set-Location '${repoRootWin}'`,
          `$p = Start-Process -FilePath '${electronExeWin}' -ArgumentList @('.') -Wait -PassThru`,
          "exit $p.ExitCode"
        ].filter(Boolean).join("; ")
      ],
      {
        cwd: repoRoot,
        env: { ...runtimeEnv },
        stdio: ["ignore", "pipe", "pipe"]
      }
    );
  }

  return spawn(process.execPath, [electronCli, "."], {
    cwd: repoRoot,
    env: {
      ...runtimeEnv,
      UHS_APP_V2_RUNTIME_VERIFY: "1",
      UHS_APP_V2_VERIFY_OUTPUT_FILE: probeFile,
      UHS_APP_V2_VERIFY_FOCUS: options.focus,
      UHS_APP_V2_USER_DATA_DIR: options.userDataDir
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const runtimeEnv = buildRuntimeVerifyEnv({ env: process.env, googleTokenFile: options.googleTokenFile });
  const build = await runCommand("npm", ["run", "app:build:main"]);
  if (build.code !== 0) {
    if (!(await hasExistingBuildArtifacts())) {
      const message = `app build:main failed before runtime verify\n${build.stderr || build.stdout}`;
      if (options.json) {
        printResult(buildRuntimeVerifyFailureResult(options, message.trim()), true);
        process.exitCode = 1;
        return;
      }
      throw new Error(message);
    }
    process.stderr.write("app build:main failed, reusing existing dist-app artifacts for runtime verify\n");
  }

  const localSettings = await readLocalSettingsSnapshot(options);
  if (localSettings) {
    const localSheet = resolveLocalSheetPrecheck(localSettings, runtimeEnv);
    if (!localSettings.isConfigured || (options.focus === "sheet-live" && localSheet)) {
      const localResult = buildSheetOnlyResult(
        options,
        localSettings,
        localSheet || buildSheetSnapshot("ready", "Google Sheets read-only 접근이 준비되었습니다.", { accessMode: "access-token" })
      );
      printResult(localResult, options.json);
      process.exitCode = localResult.overallReady ? 0 : 1;
      return;
    }
  }

  const probeDir = await fs.mkdtemp(path.join(os.tmpdir(), "app-v2-runtime-verify-"));
  const probeFile = path.join(probeDir, "probe.json");
  const probeChild = await spawnProbe(options, probeFile, runtimeEnv);

  let stdout = "";
  let stderr = "";
  const timeout = setTimeout(() => {
    probeChild.kill("SIGTERM");
  }, options.timeoutMs);

  probeChild.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });
  probeChild.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  const childResult = await new Promise((resolve, reject) => {
    probeChild.on("error", reject);
    probeChild.on("exit", (code, signal) => {
      clearTimeout(timeout);
      resolve({ code: code ?? 1, signal });
    });
  });

  const raw = await fs.readFile(probeFile, "utf8").catch(() => "");
  if (!raw) {
    const message = `runtime verify did not produce probe output\nstdout:\n${stdout}\nstderr:\n${stderr}`;
    if (options.json) {
      printResult(buildRuntimeVerifyFailureResult(options, message.trim()), true);
      process.exitCode = 1;
      return;
    }
    throw new Error(message);
  }

  const result = JSON.parse(raw);
  printResult(result, options.json);

  process.exitCode = result.overallReady ? 0 : 1;
  if (childResult.code !== process.exitCode && !options.json) {
    process.stderr.write(`probe child exit=${childResult.code}\n`);
  }
  }

const cliOptions = parseArgs(process.argv.slice(2));
main(cliOptions).catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  if (cliOptions.json) {
    printResult(buildRuntimeVerifyFailureResult(cliOptions, message), true);
  } else {
    console.error(message);
  }
  process.exitCode = 1;
});
