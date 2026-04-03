import assert from "node:assert/strict";
import handoff, {
  applyHandoffDelta,
  renderCodexReviewChecklist,
  renderGptInstructionPrompt,
  renderReentryPrompt,
  validateHandoff,
} from "../docs/architecture/gpt_handoff.mjs";

function main() {
  const validated = validateHandoff(handoff);
  assert.equal(validated.ok, true);
  assert.equal(validated.normalized.ground_truth.canonical_doc.length > 0, true);
  assert.equal(validated.normalized.gpt_output_contract.sections.length > 0, true);

  const next = applyHandoffDelta(handoff, {
    priorities: ["close_runtime_truth"],
    ground_truth: {
      constraints: ["runtime_truth_must_win"],
    },
  });
  assert.deepEqual(next.priorities, ["close_runtime_truth"]);
  assert.deepEqual(next.ground_truth.constraints, ["runtime_truth_must_win"]);

  const gptPrompt = renderGptInstructionPrompt(handoff);
  const review = renderCodexReviewChecklist(handoff);
  const reentry = renderReentryPrompt(handoff);

  assert.match(gptPrompt, /Codex is the only implementation authority/);
  assert.match(gptPrompt, /canonical_doc=/);
  assert.match(review, /Codex review checklist/);
  assert.match(review, /Verdicts:/);
  assert.match(reentry, /Refine the previous GPT answer/);
  assert.match(reentry, /Sections:/);

  console.log("regression_gpt_handoff_module: OK");
}

main();
