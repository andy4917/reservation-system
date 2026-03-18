import fs from "node:fs/promises";
import path from "node:path";

const rootDir = process.cwd();
const distDir = path.join(rootDir, "dist-app");
const packageJsonPath = path.join(distDir, "package.json");

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

await fs.mkdir(distDir, { recursive: true });
await pruneExtensionlessDuplicates(distDir);
await fs.writeFile(
  packageJsonPath,
  `${JSON.stringify({ type: "module" }, null, 2)}\n`,
  "utf8"
);
