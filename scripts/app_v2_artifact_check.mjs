import fs from "node:fs";
import path from "node:path";
import process from "node:process";

function parseArgs(argv) {
  const options = {
    focus: "artifacts"
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (token === "--focus" && next) {
      options.focus = next;
      index += 1;
    }
  }

  return options;
}

async function main() {
  const root = process.cwd();
  const options = parseArgs(process.argv.slice(2));
  const builtFiles = [
    "dist-app/app_v2/main/main.js",
    "dist-app/app_v2/main/ipc.js",
    "dist-app/app_v2/main/preflight.js",
    "dist-app/app_v2/main/settingsStore.js",
    "dist-app/app_v2/renderer/index.html"
  ];

  const fileChecks = builtFiles.map((relativePath) => ({
    path: relativePath,
    exists: fs.existsSync(path.join(root, relativePath))
  }));
  const allPresent = fileChecks.every((entry) => entry.exists);

  console.log(
    JSON.stringify(
      {
        ok: allPresent,
        focus: options.focus,
        summary: allPresent ? "app_v2 build artifacts exist." : "app_v2 build artifacts are missing.",
        files: fileChecks
      },
      null,
      2
    )
  );

  if (!allPresent) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
