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
const DEFAULT_TIMEOUT_MS = 30000;

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseTasks(raw) {
  const allowed = ["bundle", "pms", "ota", "sheet", "action"];
  const requested = normalizeText(raw)
    .split(",")
    .map((task) => task.trim().toLowerCase())
    .filter((task) => allowed.includes(task));
  if (requested.length === 0) {
    return allowed.join(",");
  }
  return [...new Set(requested)].join(",");
}

function parseArgs(argv) {
  const options = {
    tasks: "bundle,action",
    branch: "GANGNAM",
    startDate: "",
    endDate: "",
    action: "compare",
    approvePlanToken: "",
    executeApply: false,
    outputFile: "",
    json: false,
    userDataDir: "",
    timeoutMs: DEFAULT_TIMEOUT_MS,
    googleTokenFile: ""
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];

    if (token === "--tasks" && next) {
      options.tasks = parseTasks(next);
      index += 1;
      continue;
    }
    if (token === "--branch" && next) {
      options.branch = next;
      index += 1;
      continue;
    }
    if (token === "--start-date" && next) {
      options.startDate = next;
      index += 1;
      continue;
    }
    if (token === "--end-date" && next) {
      options.endDate = next;
      index += 1;
      continue;
    }
    if (token === "--action" && next) {
      options.action = next;
      index += 1;
      continue;
    }
    if (token === "--approve-plan-token" && next) {
      options.approvePlanToken = next;
      index += 1;
      continue;
    }
    if (token === "--output-file" && next) {
      options.outputFile = next;
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
      continue;
    }
    if (token === "--execute-apply") {
      options.executeApply = true;
      continue;
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
    `mode=${result.mode}`,
    `overallStatus=${String(result.overallStatus)}`,
    `branch=${result.branch}`,
    `tasks=${JSON.stringify(result.executedTasks)}`
  ];
  process.stdout.write(`${lines.join("\n")}\n`);
}

function buildProbeEnv(options, probeFile) {
  return {
    ...buildRuntimeVerifyEnv({ env: process.env, googleTokenFile: options.googleTokenFile }),
    UHS_APP_V2_RUNTIME_PROBE: "1",
    UHS_APP_V2_PROBE_TASKS: options.tasks,
    UHS_APP_V2_PROBE_BRANCH: options.branch,
    UHS_APP_V2_PROBE_START_DATE: options.startDate,
    UHS_APP_V2_PROBE_END_DATE: options.endDate,
    UHS_APP_V2_PROBE_RESERVATION_ACTION: options.action,
    UHS_APP_V2_PROBE_APPROVE_PLAN_TOKEN: options.approvePlanToken,
    UHS_APP_V2_PROBE_EXECUTE_APPLY: options.executeApply ? "1" : "",
    UHS_APP_V2_PROBE_OUTPUT_FILE: probeFile,
    UHS_APP_V2_USER_DATA_DIR: options.userDataDir
  };
}

async function spawnProbe(options, probeFile) {
  const runtimeEnv = buildProbeEnv(options, probeFile);

  if (shouldLaunchWindowsElectron(electronExe)) {
    const repoRootWin = await readWindowsPath(repoRoot);
    const electronExeWin = await readWindowsPath(electronExe);
    const probeFileWin = await readWindowsPath(probeFile);
    const userDataDirWin = options.userDataDir ? await readWindowsPath(options.userDataDir) : "";
    const branchCmd = options.branch ? `$env:UHS_APP_V2_PROBE_BRANCH=${toPowerShellLiteral(options.branch)}` : "";
    const startDateCmd = options.startDate ? `$env:UHS_APP_V2_PROBE_START_DATE=${toPowerShellLiteral(options.startDate)}` : "";
    const endDateCmd = options.endDate ? `$env:UHS_APP_V2_PROBE_END_DATE=${toPowerShellLiteral(options.endDate)}` : "";
    return spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        [
          `$env:UHS_APP_V2_RUNTIME_PROBE=${toPowerShellLiteral("1")}`,
          `$env:UHS_APP_V2_PROBE_TASKS=${toPowerShellLiteral(options.tasks)}`,
          `$env:UHS_APP_V2_PROBE_RESERVATION_ACTION=${toPowerShellLiteral(options.action)}`,
          `$env:UHS_APP_V2_PROBE_APPROVE_PLAN_TOKEN=${toPowerShellLiteral(options.approvePlanToken)}`,
          options.executeApply ? "$env:UHS_APP_V2_PROBE_EXECUTE_APPLY='1'" : "",
          normalizeText(runtimeEnv.UHS_GOOGLE_ACCESS_TOKEN) ? `$env:UHS_GOOGLE_ACCESS_TOKEN=${toPowerShellLiteral(runtimeEnv.UHS_GOOGLE_ACCESS_TOKEN)}` : "",
          normalizeText(runtimeEnv.UHS_GOOGLE_REFRESH_TOKEN) ? `$env:UHS_GOOGLE_REFRESH_TOKEN=${toPowerShellLiteral(runtimeEnv.UHS_GOOGLE_REFRESH_TOKEN)}` : "",
          normalizeText(runtimeEnv.UHS_GOOGLE_CLIENT_ID) ? `$env:UHS_GOOGLE_CLIENT_ID=${toPowerShellLiteral(runtimeEnv.UHS_GOOGLE_CLIENT_ID)}` : "",
          normalizeText(runtimeEnv.UHS_GOOGLE_CLIENT_SECRET) ? `$env:UHS_GOOGLE_CLIENT_SECRET=${toPowerShellLiteral(runtimeEnv.UHS_GOOGLE_CLIENT_SECRET)}` : "",
          userDataDirWin ? `$env:UHS_APP_V2_USER_DATA_DIR=${toPowerShellLiteral(userDataDirWin)}` : "$env:UHS_APP_V2_USER_DATA_DIR=''",
          branchCmd,
          startDateCmd,
          endDateCmd,
          `$env:UHS_APP_V2_PROBE_OUTPUT_FILE=${toPowerShellLiteral(probeFileWin)}`,
          `Set-Location '${repoRootWin}'`,
          `$p = Start-Process -FilePath '${electronExeWin}' -ArgumentList @('.') -Wait -PassThru`,
          "exit $p.ExitCode"
        ].filter(Boolean).join("; "),
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
    env: runtimeEnv,
    stdio: ["ignore", "pipe", "pipe"]
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const probeFile = normalizeText(options.outputFile) || path.join(await fs.mkdtemp(path.join(os.tmpdir(), "app-v2-runtime-probe-")), "probe.json");

  const probeChild = await spawnProbe(options, probeFile);

  let stdout = "";
  let stderr = "";
  const timeout = setTimeout(() => {
    probeChild.kill("SIGTERM");
  }, options.timeoutMs);

  probeChild.stdout.on("data", (chunk) => {
    const text = chunk.toString();
    stdout += text;
  });
  probeChild.stderr.on("data", (chunk) => {
    const text = chunk.toString();
    stderr += text;
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
    throw new Error(`runtime probe did not produce output\nstdout:\n${stdout}\nstderr:\n${stderr}`);
  }

  const result = JSON.parse(raw);
  printResult(result, options.json);

  process.exitCode = result.overallStatus ? 0 : 1;
  if (childResult.code !== process.exitCode && !options.json) {
    process.stderr.write(`probe child exit=${childResult.code}\n`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
