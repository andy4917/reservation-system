import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const bridgeSecret = "uhs-bridge-local-20260319";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const electronCli = path.join(repoRoot, "node_modules", "electron", "cli.js");
const appTarget = process.argv[2] || ".";

const child = spawn(process.execPath, [electronCli, appTarget], {
  stdio: "inherit",
  cwd: process.cwd(),
  env: {
    ...process.env,
    UHS_BRIDGE_SHARED_SECRET: process.env.UHS_BRIDGE_SHARED_SECRET || bridgeSecret
  }
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});
