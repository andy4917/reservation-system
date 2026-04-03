export const gptHandoff = {
  version: "1",
  meta: {
    owner: "codex",
    format: "js-object",
    primary_mode: "object-first",
    update_mode: "delta-preferred",
  },
  role_boundary: {
    codex_is_implementation_authority: true,
    gpt_is_support_only: true,
    forbid_invented_runtime_truth: true,
    forbid_draft_equals_repo_state: true,
  },
  ground_truth: {
    canonical_doc: "docs/architecture/APP_SINGLE_SOURCE_BLUEPRINT.md",
    current_state: [
      "electron_app_shell",
      "thin_renderer",
      "main_owned_runtime_truth",
      "provider_readiness_boundary_exists",
      "google_sheet_live_read_exists",
      "python_bridge_backed_readonly_preview_export_exists",
      "assistive_embedding_exists",
      "order_list_arrival_validate_edit_readonly_surfaces_exist",
    ],
    not_yet_closed: [
      "pms_live_read",
      "ota_live_read",
      "real_source_bundle_for_compare_reconcile_apply",
      "full_core_decision_engine_contract",
      "spreadsheet_workspace_architecture",
      "local_db_backed_canonical_state",
      "production_apply_write_path",
      "full_app_facing_branch_model",
    ],
    constraints: [
      "compare_reconcile_apply_need_real_source_bundle",
      "app_facing_branch_scope_is_currently_limited_to_coex_and_gangnam",
      "proposed_grid_db_queue_stack_is_not_active_dependency_today",
      "apply_write_is_not_v1_default_path",
      "runtime_truth_must_win_over_design_draft",
    ],
  },
  priorities: [
    "close_real_pms_ota_source_reads",
    "unify_real_source_bundle_input",
    "freeze_core_decision_engine_contracts",
    "defer_workspace_db_expansion_until_runtime_truth_is_closed",
  ],
  gpt_output_contract: {
    sections: [
      "required_information_inventory",
      "responsibility_split",
      "collection_order",
      "questions_for_codex",
      "questions_for_gpt",
      "questions_for_human",
      "premature_decisions",
      "next_implementation_focus",
    ],
    rules: [
      "use_english",
      "no_code",
      "no_final_implementation_plan",
      "mark_unknowns_explicitly",
      "do_not_override_codex_authority",
      "do_not_claim_repo_access_beyond_provided_facts",
      "optimize_for_fastest_real_implementation_progress",
    ],
  },
  codex_review_contract: {
    checks: [
      "authority_discipline",
      "source_priority",
      "current_state_accuracy",
      "prematurity_control",
      "implementation_usefulness",
      "runtime_first_ordering",
      "no_ui_first_recommendation_while_runtime_is_incomplete",
      "no_db_first_recommendation_while_source_closure_is_incomplete",
    ],
    verdicts: ["PASS", "PASS_WITH_EDITS", "FAIL"],
  },
  reentry_contract: {
    sections: [
      "confirmed_facts",
      "remaining_unknowns",
      "decisions_codex_can_make_now",
      "decisions_that_must_wait",
      "information_codex_should_gather_next",
      "information_gpt_can_still_help_structure",
      "tight_next_step_recommendation",
    ],
    rules: [
      "refine_previous_answer",
      "remove_broad_architecture_prose",
      "keep_codex_final_decision_maker",
      "no_code",
      "mark_unknowns_explicitly",
      "preserve_codex_ground_truth",
      "compress_for_reuse",
    ],
  },
};

function ensureStringArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string" && item.trim()) : [];
}

export function applyHandoffDelta(base, delta) {
  const merged = {
    ...base,
    ...delta,
    meta: {
      ...base.meta,
      ...delta?.meta,
    },
    role_boundary: {
      ...base.role_boundary,
      ...delta?.role_boundary,
    },
    ground_truth: {
      ...base.ground_truth,
      ...delta?.ground_truth,
    },
    gpt_output_contract: {
      ...base.gpt_output_contract,
      ...delta?.gpt_output_contract,
    },
    codex_review_contract: {
      ...base.codex_review_contract,
      ...delta?.codex_review_contract,
    },
    reentry_contract: {
      ...base.reentry_contract,
      ...delta?.reentry_contract,
    },
  };
  return normalizeHandoff(merged);
}

export function normalizeHandoff(handoff) {
  return {
    ...handoff,
    version: String(handoff?.version || "1"),
    priorities: ensureStringArray(handoff?.priorities),
    ground_truth: {
      canonical_doc: String(handoff?.ground_truth?.canonical_doc || ""),
      current_state: ensureStringArray(handoff?.ground_truth?.current_state),
      not_yet_closed: ensureStringArray(handoff?.ground_truth?.not_yet_closed),
      constraints: ensureStringArray(handoff?.ground_truth?.constraints),
    },
    gpt_output_contract: {
      sections: ensureStringArray(handoff?.gpt_output_contract?.sections),
      rules: ensureStringArray(handoff?.gpt_output_contract?.rules),
    },
    codex_review_contract: {
      checks: ensureStringArray(handoff?.codex_review_contract?.checks),
      verdicts: ensureStringArray(handoff?.codex_review_contract?.verdicts),
    },
    reentry_contract: {
      sections: ensureStringArray(handoff?.reentry_contract?.sections),
      rules: ensureStringArray(handoff?.reentry_contract?.rules),
    },
  };
}

export function validateHandoff(handoff) {
  const normalized = normalizeHandoff(handoff);
  const errors = [];

  if (!normalized.ground_truth.canonical_doc) {
    errors.push("ground_truth.canonical_doc is required");
  }
  if (normalized.ground_truth.current_state.length === 0) {
    errors.push("ground_truth.current_state must not be empty");
  }
  if (normalized.priorities.length === 0) {
    errors.push("priorities must not be empty");
  }
  if (normalized.gpt_output_contract.sections.length === 0) {
    errors.push("gpt_output_contract.sections must not be empty");
  }
  if (normalized.codex_review_contract.checks.length === 0) {
    errors.push("codex_review_contract.checks must not be empty");
  }
  if (normalized.reentry_contract.sections.length === 0) {
    errors.push("reentry_contract.sections must not be empty");
  }

  return {
    ok: errors.length === 0,
    errors,
    normalized,
  };
}

export function renderGptInstructionPrompt(handoff) {
  const { normalized } = validateHandoff(handoff);
  const facts = [
    `canonical_doc=${normalized.ground_truth.canonical_doc}`,
    `current_state=${normalized.ground_truth.current_state.join(",")}`,
    `not_yet_closed=${normalized.ground_truth.not_yet_closed.join(",")}`,
    `constraints=${normalized.ground_truth.constraints.join(",")}`,
    `priorities=${normalized.priorities.join(",")}`,
  ];
  return [
    "Codex is the only implementation authority.",
    "GPT is support only.",
    "Do not invent runtime truth.",
    "Do not treat a planning draft as equal to repository state.",
    "",
    "Use these Codex-grounded inputs:",
    ...facts,
    "",
    `Produce sections: ${normalized.gpt_output_contract.sections.join(", ")}`,
    `Rules: ${normalized.gpt_output_contract.rules.join(", ")}`,
  ].join("\n");
}

export function renderCodexReviewChecklist(handoff) {
  const { normalized } = validateHandoff(handoff);
  return [
    "Codex review checklist",
    ...normalized.codex_review_contract.checks.map((item, index) => `${index + 1}. ${item}`),
    `Verdicts: ${normalized.codex_review_contract.verdicts.join(", ")}`,
  ].join("\n");
}

export function renderReentryPrompt(handoff) {
  const { normalized } = validateHandoff(handoff);
  return [
    "Refine the previous GPT answer into a tighter Codex support artifact.",
    "Keep Codex as final decision-maker.",
    "Remove broad architecture prose and repetition.",
    "",
    `Sections: ${normalized.reentry_contract.sections.join(", ")}`,
    `Rules: ${normalized.reentry_contract.rules.join(", ")}`,
  ].join("\n");
}

export default gptHandoff;
