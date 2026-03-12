import fs from "node:fs/promises";
import path from "node:path";

const rootDir = process.cwd();
const distDir = path.join(rootDir, "dist-app");
const packageJsonPath = path.join(distDir, "package.json");

await fs.mkdir(distDir, { recursive: true });
await fs.writeFile(
  packageJsonPath,
  `${JSON.stringify({ type: "module" }, null, 2)}\n`,
  "utf8"
);
