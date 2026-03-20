import fs from "node:fs/promises";
import os from "node:os";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const electronCli = path.join(repoRoot, "node_modules", "electron", "cli.js");
const electronExe = path.join(repoRoot, "node_modules", "electron", "dist", "electron.exe");

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
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(text);
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
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
  return result.stdout.trim();
}

async function main() {
  const build = await runCommand("npm", ["run", "app:build"]);
  if (build.code !== 0) {
    throw new Error(`app build failed before smoke run\n${build.stderr}`);
  }

  const smokeTimeoutMs = Number(process.env.UHS_APP_V2_SMOKE_TIMEOUT_MS || "20000");
  const smokeDir = await fs.mkdtemp(path.join(os.tmpdir(), "app-v2-smoke-"));
  const smokeFile = path.join(smokeDir, "markers.log");

  let smokeChild;
  if (process.platform === "linux" && electronExe.endsWith(".exe")) {
    const repoRootWin = await readWindowsPath(repoRoot);
    const electronExeWin = await readWindowsPath(electronExe);
    const smokeFileWin = await readWindowsPath(smokeFile);
    smokeChild = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        `$env:UHS_APP_V2_SMOKE_TEST='1'; $env:UHS_APP_V2_SMOKE_FILE='${smokeFileWin}'; Set-Location '${repoRootWin}'; $p = Start-Process -FilePath '${electronExeWin}' -ArgumentList @('.','--headless','--disable-gpu','--no-sandbox') -Wait -PassThru; exit $p.ExitCode`
      ],
      {
        cwd: repoRoot,
        env: {
          ...process.env
        },
        stdio: ["ignore", "pipe", "pipe"]
      }
    );
  } else {
    smokeChild = spawn(
      process.execPath,
      [electronCli, ".", "--headless", "--disable-gpu", "--no-sandbox"],
      {
        cwd: repoRoot,
        env: {
          ...process.env,
          UHS_APP_V2_SMOKE_TEST: "1",
          UHS_APP_V2_SMOKE_FILE: smokeFile
        },
        stdio: ["ignore", "pipe", "pipe"]
      }
    );
  }

  let stdout = "";
  let stderr = "";
  const timeout = setTimeout(() => {
    smokeChild.kill("SIGTERM");
  }, smokeTimeoutMs);

  smokeChild.stdout.on("data", (chunk) => {
    const text = chunk.toString();
    stdout += text;
    process.stdout.write(text);
  });
  smokeChild.stderr.on("data", (chunk) => {
    const text = chunk.toString();
    stderr += text;
    process.stderr.write(text);
  });

  const result = await new Promise((resolve, reject) => {
    smokeChild.on("error", reject);
    smokeChild.on("exit", (code, signal) => {
      clearTimeout(timeout);
      resolve({ code: code ?? 1, signal, stdout, stderr });
    });
  });

  if (result.code !== 0) {
    throw new Error(`electron smoke failed\nstdout:\n${stdout}\nstderr:\n${stderr}`);
  }
  const markers = await fs.readFile(smokeFile, "utf8").catch(() => "");
  if (
    !markers.includes("app-v2-smoke:window-created") ||
    !markers.includes("app-v2-smoke:renderer-loaded") ||
    !markers.includes("app-v2-smoke:end-user-shell")
  ) {
    throw new Error(`electron smoke markers missing\nmarkers:\n${markers}\nstdout:\n${stdout}\nstderr:\n${stderr}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
