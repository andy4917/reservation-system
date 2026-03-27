import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const electronDistDir = path.join(root, "node_modules", "electron", "dist");
const outDir = path.join(root, "dist", "uhs-desktop-portable");
const appResourceRelativePath = "resources/app";
const appDir = path.join(outDir, "resources", "app");
const portableDesktopIconName = "desktop-icon.ico";
const runtimeJsAssets = [
  "src/constants.js",
  "src/scan/normalize.js",
  "src/report/report.format.js",
  "src/engine/rules.js",
  "src/pms/wings.adapter.js",
  "src/io/pms.fetch.js",
];
const runtimePythonAssets = ["app_v2_live_sheet_bridge.py", "app_v2_reservation_management_bridge.py"];

async function copyRuntimeSupportTree() {
  await fs.cp(path.join(root, "src"), path.join(appDir, "src"), { recursive: true, force: true });
  await copyRuntimeAsset(path.join(root, "reservation_sheet_audit.py"), "reservation_sheet_audit.py");
}

async function copyRuntimeAsset(sourcePath, fileName) {
  const source = sourcePath;
  const destination = path.join(appDir, fileName);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.cp(source, destination, { force: true });
}

function run(cmd, args, cwd = root) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      stdio: "inherit",
      env: {
        ...process.env,
        UHS_BRIDGE_SHARED_SECRET: process.env.UHS_BRIDGE_SHARED_SECRET || "uhs-bridge-local-20260319",
      },
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${cmd} ${args.join(" ")} failed with ${code}`));
    });
  });
}

async function writeText(filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf8");
}

async function main() {
  await run("npm", ["run", "app:icons:regen"]);
  await run("npm", ["run", "app:build"]);

  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(outDir, { recursive: true });
  await fs.cp(electronDistDir, outDir, { recursive: true });
  await fs.mkdir(appDir, { recursive: true });

  await writeText(
    path.join(appDir, "package.json"),
    JSON.stringify(
      {
        name: "uhs-desktop-portable",
        productName: "UHS Reservation Desktop",
        private: true,
        main: "dist-app/app_v2/main/main.js",
        type: "module",
      },
      null,
      2,
    ),
  );

  await fs.cp(path.join(root, "dist-app"), path.join(appDir, "dist-app"), { recursive: true, force: true });
  await fs.cp(path.join(root, "icons"), path.join(appDir, "icons"), { recursive: true, force: true });
  await copyRuntimeSupportTree();
  for (const asset of runtimeJsAssets) {
    await copyRuntimeAsset(path.join(root, asset), asset);
  }
  for (const script of runtimePythonAssets) {
    await copyRuntimeAsset(path.join(root, "scripts", script), path.join("scripts", script));
  }

  const launchCmd = [
    "@echo off",
    "setlocal",
    "if \"%UHS_BRIDGE_SHARED_SECRET%\"==\"\" set UHS_BRIDGE_SHARED_SECRET=uhs-bridge-local-20260319",
    "start \"\" \"%~dp0electron.exe\"",
    "",
  ].join("\r\n");
  await writeText(path.join(outDir, "Launch UHS Desktop.cmd"), launchCmd);

  const readme = [
    "# UHS Reservation Desktop Portable",
    "",
    "1. Run `Launch UHS Desktop.cmd`.",
    "2. Keep your browser extension logged in if you need live bridge capture.",
    `3. Use \`icons/${portableDesktopIconName}\` when you need a desktop shortcut icon.`,
    `4. The packaged Electron app lives under \`${appResourceRelativePath}\`.`,
    "5. Distribute the whole `uhs-desktop-portable` folder as a zip or shared folder artifact.",
    "",
    "Built from `npm run app:dist:portable`.",
    "",
  ].join("\n");
  await writeText(path.join(outDir, "README.txt"), readme);

  console.log(`build_app_v2_portable: OK -> ${outDir}`);
}

await main();
