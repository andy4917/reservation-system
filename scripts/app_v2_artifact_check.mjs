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
  const rendererRoot = path.join(root, "dist-app", "app_v2", "renderer");
  const indexHtmlPath = path.join(rendererRoot, "index.html");
  const builtFiles = [
    "dist-app/app_v2/main/main.js",
    "dist-app/app_v2/main/ipc.js",
    "dist-app/app_v2/main/preflight.js",
    "dist-app/app_v2/main/settingsStore.js",
    "dist-app/app_v2/renderer/index.html"
  ];
  const removedLegacyEntries = [
    "dist-app/contracts",
    "dist-app/fixtures",
    "dist-app/main",
    "dist-app/renderer",
    "dist-app/services",
    "dist-app/src",
    "dist-app/vite.config",
    "dist-app/vite.config.js"
  ];

  const fileChecks = builtFiles.map((relativePath) => ({
    path: relativePath,
    exists: fs.existsSync(path.join(root, relativePath))
  }));
  const legacyChecks = removedLegacyEntries.map((relativePath) => ({
    path: relativePath,
    exists: fs.existsSync(path.join(root, relativePath))
  }));
  const indexHtml = fs.existsSync(indexHtmlPath) ? fs.readFileSync(indexHtmlPath, "utf8") : "";
  const referencedAssetFiles = Array.from(indexHtml.matchAll(/\.\/assets\/([^"']+)/g)).map((match) => match[1]);
  const assetDir = path.join(rendererRoot, "assets");
  const rendererAssetFiles = fs.existsSync(assetDir) ? fs.readdirSync(assetDir).sort() : [];
  const orphanedAssetFiles = rendererAssetFiles.filter((fileName) => !referencedAssetFiles.includes(fileName));
  const allPresent = fileChecks.every((entry) => entry.exists) &&
    legacyChecks.every((entry) => entry.exists === false) &&
    referencedAssetFiles.length > 0 &&
    orphanedAssetFiles.length === 0 &&
    referencedAssetFiles.every((fileName) => fs.existsSync(path.join(assetDir, fileName)));

  console.log(
    JSON.stringify(
      {
        ok: allPresent,
        focus: options.focus,
        summary: allPresent ? "app_v2 build artifacts are clean." : "app_v2 build artifacts are missing or stale.",
        files: fileChecks,
        removedLegacyEntries: legacyChecks,
        referencedAssetFiles,
        rendererAssetFiles,
        orphanedAssetFiles
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
