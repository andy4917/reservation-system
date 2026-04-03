import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

function parseArgs(argv) {
  const options = {
    file: path.resolve("docs/architecture/gpt_handoff.mjs"),
    mode: "object",
    delta: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (token === "--file" && next) {
      options.file = path.resolve(next);
      index += 1;
      continue;
    }
    if (token === "--mode" && next) {
      options.mode = next;
      index += 1;
      continue;
    }
    if (token === "--delta" && next) {
      options.delta = path.resolve(next);
      index += 1;
    }
  }

  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const mod = await import(pathToFileURL(options.file).href);
  let handoff = mod.default ?? mod.gptHandoff;

  if (options.delta) {
    const deltaMod = await import(pathToFileURL(options.delta).href);
    const delta = deltaMod.default ?? deltaMod.gptHandoffDelta ?? deltaMod.delta;
    handoff = mod.applyHandoffDelta(handoff, delta);
  }

  if (options.mode === "validate") {
    const result = mod.validateHandoff(handoff);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = result.ok ? 0 : 1;
    return;
  }

  if (options.mode === "gpt") {
    process.stdout.write(`${mod.renderGptInstructionPrompt(handoff)}\n`);
    return;
  }

  if (options.mode === "review") {
    process.stdout.write(`${mod.renderCodexReviewChecklist(handoff)}\n`);
    return;
  }

  if (options.mode === "reentry") {
    process.stdout.write(`${mod.renderReentryPrompt(handoff)}\n`);
    return;
  }

  process.stdout.write(`${JSON.stringify(handoff, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
