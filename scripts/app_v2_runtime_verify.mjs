import fs from "node:fs/promises";
import os from "node:os";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { buildRuntimeVerifyEnv, toPowerShellLiteral } from "./app_v2_runtime_verify_support.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const electronCli = path.join(repoRoot, "node_modules", "electron", "cli.js");
const electronExe = path.join(repoRoot, "node_modules", "electron", "dist", "electron.exe");
const DEFAULT_VERIFY_TIMEOUT_MS = 30000;

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

async function spawnProbe(options, probeFile) {
  const runtimeEnv = buildRuntimeVerifyEnv({ env: process.env, googleTokenFile: options.googleTokenFile });
  if (process.platform === "linux" && electronExe.endsWith(".exe")) {
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
  const build = await runCommand("npm", ["run", "app:build:main"]);
  if (build.code !== 0) {
    throw new Error(`app build:main failed before runtime verify\n${build.stderr}`);
  }

  const probeDir = await fs.mkdtemp(path.join(os.tmpdir(), "app-v2-runtime-verify-"));
  const probeFile = path.join(probeDir, "probe.json");
  const probeChild = await spawnProbe(options, probeFile);

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
    throw new Error(`runtime verify did not produce probe output\nstdout:\n${stdout}\nstderr:\n${stderr}`);
  }

  const result = JSON.parse(raw);
  printResult(result, options.json);

  process.exitCode = result.overallReady ? 0 : 1;
  if (childResult.code !== process.exitCode && !options.json) {
    process.stderr.write(`probe child exit=${childResult.code}\n`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
