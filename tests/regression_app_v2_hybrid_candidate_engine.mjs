import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function read(root, relativePath) {
  const filePath = path.join(root, relativePath);
  assert.equal(fs.existsSync(filePath), true, `${relativePath} should exist`);
  return fs.readFileSync(filePath, "utf8");
}

function main() {
  const root = process.cwd();
  const pkg = read(root, "package.json");
  const engine = read(root, "app_v2/main/hybridCandidateEngine.ts");

  assert.match(pkg, /"flexsearch"/);
  assert.match(pkg, /"json-rules-engine"/);
  assert.match(engine, /buildHybridCandidateDecisions/);
  assert.match(engine, /from "flexsearch"/);
  assert.match(engine, /from "json-rules-engine"/);
  assert.match(engine, /Document/);
  assert.match(engine, /new Engine/);
  assert.match(engine, /decisionRules|buildDecisionEngine|hybridDecisionRule/);
  assert.match(engine, /candidateLookup|lookupCandidates|buildCandidateLookup/);
  assert.match(engine, /same_guest_name/);
  assert.match(engine, /same_phone/);
  assert.match(engine, /same_note_similarity|guest_name_similarity|note_head_similarity/);
  assert.match(engine, /contradiction/i);
  assert.match(engine, /identity_gap_conflict|channel_conflict/);
  assert.match(engine, /abstain/);
  assert.match(engine, /pairsToScore|scoreInputs/);

  console.log("regression_app_v2_hybrid_candidate_engine: OK");
}

main();
