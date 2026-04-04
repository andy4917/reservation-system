import { spawn } from "node:child_process";
import path from "node:path";
import type { AppOpsSheetApplyInput, AppOpsSheetApplySnapshot } from "../../src/desktop/app-v2-contracts.js";

const PYTHON_COMMAND = process.env.PYTHON_BIN || "python3";

function runPythonJson(args: string[], cwd: string) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(PYTHON_COMMAND, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }
      reject(new Error(stderr.trim() || stdout.trim() || `python exited with ${code}`));
    });
  });
}

export async function applyOpsSheetOutput(input: AppOpsSheetApplyInput): Promise<AppOpsSheetApplySnapshot> {
  const cwd = process.cwd();
  const scriptPath = path.join(cwd, "scripts", "app_v2_apply_ops_sheet.py");
  const args = [
    scriptPath,
    "--action",
    input.action,
    "--spreadsheet",
    input.spreadsheet,
    "--branch",
    input.branch,
    "--start-date",
    input.startDate,
    "--end-date",
    input.endDate,
  ];
  for (const sheetName of input.sheetNames) {
    args.push("--sheet-name", sheetName);
  }
  if (input.reportDate?.trim()) {
    args.push("--report-date", input.reportDate.trim());
  }
  const stdout = await runPythonJson(args, cwd);
  return JSON.parse(stdout) as AppOpsSheetApplySnapshot;
}
