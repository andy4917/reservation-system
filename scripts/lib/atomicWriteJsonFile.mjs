import fs from "node:fs/promises";
import path from "node:path";

export async function atomicWriteJsonFile(targetPath, value, dependencies = {}) {
  const writeFile = dependencies.writeFile || fs.writeFile;
  const rename = dependencies.rename || fs.rename;
  const unlink = dependencies.unlink || fs.unlink;
  const mkdir = dependencies.mkdir || fs.mkdir;
  const tempPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
  const json = `${JSON.stringify(value, null, 2)}\n`;

  await mkdir(path.dirname(targetPath), { recursive: true });

  try {
    await writeFile(tempPath, json, "utf8");
    await rename(tempPath, targetPath);
  } catch (error) {
    await unlink(tempPath).catch(() => {});
    throw error;
  }
}
