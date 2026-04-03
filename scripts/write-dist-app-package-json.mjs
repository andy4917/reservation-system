import fs from "node:fs/promises";
import path from "node:path";
import { atomicWriteJsonFile } from "./lib/atomicWriteJsonFile.mjs";

const rootDir = process.cwd();
const distDir = path.join(rootDir, "dist-app");
const packageJsonPath = path.join(distDir, "package.json");
const truthDatasetFiles = ["branch_provider_mapping_v1.json"];

async function pruneExtensionlessDuplicates(targetDir) {
  const entries = await fs.readdir(targetDir, { withFileTypes: true });
  await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(targetDir, entry.name);
      if (entry.isDirectory()) {
        await pruneExtensionlessDuplicates(entryPath);
        return;
      }
      if (path.extname(entry.name)) return;
      try {
        await fs.access(`${entryPath}.js`);
        await fs.unlink(entryPath);
      } catch {
        // Keep extensionless assets that do not have a generated .js sibling.
      }
    })
  );
}

async function syncTruthDatasetFiles() {
  const targetDir = path.join(distDir, "truth_dataset");
  await fs.mkdir(targetDir, { recursive: true });
  await Promise.all(
    truthDatasetFiles.map(async (fileName) => {
      const sourcePath = path.join(rootDir, "truth_dataset", fileName);
      const targetPath = path.join(targetDir, fileName);
      await fs.copyFile(sourcePath, targetPath);
    })
  );
}

await fs.mkdir(distDir, { recursive: true });
await pruneExtensionlessDuplicates(distDir);
await syncTruthDatasetFiles();
await atomicWriteJsonFile(packageJsonPath, { type: "module" });
