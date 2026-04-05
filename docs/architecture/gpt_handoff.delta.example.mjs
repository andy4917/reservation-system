export const gptHandoffDelta = {
  meta: {
    update_mode: "delta-preferred",
  },
  ground_truth: {
    current_state: [
      "electron_app_shell",
      "thin_renderer",
      "main_owned_runtime_truth",
      "google_sheet_live_read_exists",
      "assistive_embedding_exists",
    ],
    not_yet_closed: [
      "pms_live_read",
      "ota_live_read",
      "real_source_bundle_for_compare_reconcile_apply",
    ],
    constraints: [
      "runtime_truth_must_win_over_design_draft",
      "compare_reconcile_apply_need_real_source_bundle",
    ],
  },
  priorities: [
    "close_real_pms_ota_source_reads",
    "unify_real_source_bundle_input",
  ],
};

export default gptHandoffDelta;
