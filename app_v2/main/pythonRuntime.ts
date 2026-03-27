export interface PythonSpawnCommand {
  command: string;
  prefixArgs: string[];
  label: string;
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function resolvePythonSpawnCommand(): PythonSpawnCommand[] {
  const override = normalizeText(process.env.PYTHON_BIN);
  if (override) {
    return [{ command: override, prefixArgs: [], label: override }];
  }

  if (process.platform === "win32") {
    return [
      { command: "py.exe", prefixArgs: ["-3"], label: "py.exe -3" },
      { command: "py", prefixArgs: ["-3"], label: "py -3" },
      { command: "python.exe", prefixArgs: [], label: "python.exe" },
      { command: "python", prefixArgs: [], label: "python" },
      { command: "python3", prefixArgs: [], label: "python3" },
    ];
  }

  return [
    { command: "python3", prefixArgs: [], label: "python3" },
    { command: "python", prefixArgs: [], label: "python" },
  ];
}

export function isPythonCommandMissing(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code || "") : "";
  const message = String((error as { message?: unknown })?.message || error || "").toLowerCase();
  return code === "ENOENT" || message.includes("not found") || message.includes("is not recognized");
}
