import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

async function main() {
  const root = process.cwd();
  const modulePath = path.join(root, "scripts", "lib", "atomicWriteJsonFile.mjs");
  const run = new Function(
    "modulePath",
    `
      return import(modulePath);
    `
  );

  const { atomicWriteJsonFile } = await run(modulePath);

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "dist-app-package-json-atomic-"));
  const targetFile = path.join(tempDir, "package.json");
  await fs.writeFile(targetFile, '{\n  "type": "module"\n}\n', "utf8");

  let renameAttempted = false;
  await assert.rejects(
    atomicWriteJsonFile(targetFile, { type: "commonjs" }, {
      writeFile: async (filePath, content, encoding) => {
        await fs.writeFile(filePath, content.slice(0, 4), encoding);
        throw new Error("simulated short write");
      },
      rename: async () => {
        renameAttempted = true;
      }
    }),
    /simulated short write/
  );
  assert.equal(renameAttempted, false, "rename should not happen when temp write fails");
  assert.equal(
    await fs.readFile(targetFile, "utf8"),
    '{\n  "type": "module"\n}\n',
    "existing package.json should remain intact after failed temp write"
  );

  await atomicWriteJsonFile(targetFile, { type: "commonjs" });
  assert.deepEqual(JSON.parse(await fs.readFile(targetFile, "utf8")), { type: "commonjs" });

  console.log("regression_dist_app_package_json_atomic_write: OK");
}

await main();
