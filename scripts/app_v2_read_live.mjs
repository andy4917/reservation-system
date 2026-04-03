import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const verifyScript = path.join(repoRoot, "scripts", "app_v2_runtime_verify.mjs");

function buildArgs(argv) {
  return [verifyScript, "--focus", "live-read", "--json", ...argv];
}

function runVerify(argv) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, buildArgs(argv), {
      cwd: repoRoot,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
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
    child.on("exit", (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

function normalizeResult(raw) {
  const parsed = JSON.parse(raw);
  return {
    preflightStatus: parsed.preflightStatus ?? "unknown",
    overallReady: parsed.overallReady === true,
    supportLevel: parsed.supportLevel ?? "unknown",
    blockingSources: Array.isArray(parsed.blockingSources) ? parsed.blockingSources : [],
    sheetStatus: parsed.sheet?.status ?? "unknown",
    sheetSummary: parsed.sheet?.summary ?? "",
  };
}

function formatVerdict(result) {
  const prefix = result.overallReady ? "read-live confirmed" : "read-live not ready";
  const parts = [
    prefix,
    `supportLevel=${result.supportLevel}`,
    `preflightStatus=${result.preflightStatus}`,
    `sheet=${result.sheetStatus}`,
  ];
  if (result.blockingSources.length > 0) {
    parts.push(`blockingSources=${result.blockingSources.join(",")}`);
  }
  if (result.sheetSummary) {
    parts.push(`sheetSummary=${result.sheetSummary}`);
  }
  return parts.join(" | ");
}

async function main() {
  const result = await runVerify(process.argv.slice(2));
  const raw = result.stdout.trim();
  if (!raw) {
    throw new Error(result.stderr.trim() || "read-live verify produced no output");
  }
  const parsed = normalizeResult(raw);
  process.stdout.write(`${formatVerdict(parsed)}\n`);
  if (result.stderr.trim()) {
    process.stderr.write(result.stderr);
  }
  process.exitCode = parsed.overallReady ? 0 : 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
