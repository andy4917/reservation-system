import { spawn } from "node:child_process";
import process from "node:process";

function run(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: process.cwd(),
      stdio: options.captureOutput ? ["ignore", "pipe", "pipe"] : "inherit",
      shell: options.shell ?? process.platform === "win32",
      env: {
        ...process.env,
        UHS_BRIDGE_SHARED_SECRET: process.env.UHS_BRIDGE_SHARED_SECRET || "uhs-bridge-local-20260319",
      },
    });
    let stdout = "";
    let stderr = "";
    if (options.captureOutput) {
      child.stdout?.on("data", (chunk) => {
        stdout += String(chunk);
      });
      child.stderr?.on("data", (chunk) => {
        stderr += String(chunk);
      });
    }
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({
          stdout: stdout.trim(),
          stderr: stderr.trim(),
        });
        return;
      }
      reject(new Error(`${cmd} ${args.join(" ")} failed with ${code}`));
    });
  });
}

function isWsl() {
  return process.platform === "linux" && Boolean(process.env.WSL_DISTRO_NAME);
}

async function readWindowsPath(targetPath) {
  const result = await run("wslpath", ["-w", targetPath], { captureOutput: true });
  if (!result.stdout) {
    throw new Error("wslpath conversion failed");
  }
  return result.stdout;
}

async function runElectronBuilderForWindows() {
  if (!isWsl()) {
    await run("npx", ["electron-builder", "--win", "portable", "--publish", "never"]);
    return;
  }

  const windowsCwd = await readWindowsPath(process.cwd());
  const windowsCliPath = `${windowsCwd}\\node_modules\\electron-builder\\out\\cli\\cli.js`;
  const command = [
    '$ErrorActionPreference = "Stop"',
    `$project = ${JSON.stringify(windowsCwd)}`,
    '$node = ""',
    '$windowsNode = [Environment]::GetEnvironmentVariable("WINDOWS_NODE_EXE")',
    'if (-not [string]::IsNullOrWhiteSpace($windowsNode)) { $node = $windowsNode }',
    '$nodeFromPath = (Get-Command node -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source)',
    'if ($nodeFromPath) { $node = $nodeFromPath }',
    'if (-not $node -and (Test-Path "C:\\Program Files\\nodejs\\node.exe")) { $node = "C:\\Program Files\\nodejs\\node.exe" }',
    'if (-not $node -and (Test-Path "C:\\Program Files (x86)\\nodejs\\node.exe")) { $node = "C:\\Program Files (x86)\\nodejs\\node.exe" }',
    'if (-not $node) { throw "node executable not found. Set WINDOWS_NODE_EXE or ensure node is on PATH." }',
    `$cli = ${JSON.stringify(windowsCliPath)}`,
    "Set-Location -LiteralPath $project",
    "& $node $cli --win portable --publish never",
    "if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }",
  ].join("; ");
  await run("powershell.exe", ["-NoProfile", "-Command", command], { shell: false });
}

async function main() {
  await run("npm", ["run", "app:icons:regen"]);
  await run("npm", ["run", "app:build"]);
  await runElectronBuilderForWindows();
}

await main();
