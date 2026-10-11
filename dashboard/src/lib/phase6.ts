/**
 * Shared types and helpers for the Phase 6 dashboard section.
 *
 * The shape mirrors `hiver-support-agent/evaluation/results/phase6_summary.json`
 * (produced by scripts/evaluate_escalation.py). Every field is optional: the
 * dashboard must render gracefully when keys are missing ("—" fallback) and
 * must never fabricate numbers.
 *
 * Metric formatters (formatScore / formatInt / formatPercent / orDash) are
 * imported from @/lib/phase1 and @/lib/phase2 in the components — they are
 * already exported there and shared by the Phase 1–5 sections, so the panels
 * can never drift in formatting. INTENT_NAMES / intentName and the custom
 * scrollbar constant are re-exported from the Phase 4/5 libs for the same
 * reason.
 */

/* ------------------------------------------------------------------ */
/* The policy                                                          */
/* ------------------------------------------------------------------ */

export interface Phase6Rule {
  /** E2 / E3 / E4 / G1 / G2 */
  id?: string;
  /** private_state_domain, unmatched_intent, … */
  name?: string;
  /** verbatim firing condition */
  fires_when?: string;
  /** verbatim rationale */
  why?: string;
  /** verbatim provenance note */
  provenance?: string;
}

export interface Phase6Policy {
  /** "rule-based, explainable (no learned component)" */
  type?: string;
  /** "escalate if ANY rule fires; auto_handle only when all rules pass" */
  decision?: string;
  /** verbatim safety-asymmetry statement */
  safety_asymmetry?: string;
  rules?: Phase6Rule[];
  /** the runtime signals the policy consumes, verbatim */
  inputs?: string[];
}

/* ------------------------------------------------------------------ */
/* Ground truth                                                        */
/* ------------------------------------------------------------------ */

export interface Phase6GroundTruth {
  /** "evaluation/escalation_labels.json" */
  source?: string;
  /** the five written labelling criteria, verbatim */
  criteria?: string[];
  /** who labelled, verbatim (single annotator) */
  annotator?: string;
  /** 10 */
  escalate_n?: number;
  /** 19 */
  auto_n?: number;
}

/* ------------------------------------------------------------------ */
/* Evaluation                                                          */
/* ------------------------------------------------------------------ */

/** A rate with its exact Clopper-Pearson 95% confidence interval. */
export interface Phase6Rate {
  value?: number;
  numerator?: number;
  denominator?: number;
  ci95?: [number, number] | number[];
  ci_method?: string;
}

export interface Phase6Confusion {
  /** policy=escalate, truth=escalate (10) */
  true_escalate?: number;
  /** policy=escalate, truth=auto (4) */
  over_escalation?: number;
  /** policy=auto, truth=escalate (0) — the safety-critical cell */
  false_auto?: number;
  /** policy=auto, truth=auto (15) */
  true_auto?: number;
}

export interface Phase6DecisionDelta {
  /** index into the 29 golden test openers */
  index?: number;
  message?: string;
  was_auto_now_escalated?: boolean;
  /** rule ids + names that fired, e.g. "E2 private_state_domain" */
  reasons?: string[];
  ground_truth?: string;
}

export interface Phase6Ablation {
  /** what the ablation isolates, verbatim */
  description?: string;
  /** Phase 5 gates-only auto-eligible count (16) */
  gates_only_auto_n?: number;
  /** Phase 6 policy auto-handle count (15) */
  policy_auto_n?: number;
  decision_deltas?: Phase6DecisionDelta[];
}

export interface Phase6OverEscalation {
  index?: number;
  message?: string;
  predicted_intent?: string;
  intent_confidence?: number;
  top1_score?: number;
  /** rule ids + names that fired on this message */
  reasons_fired?: string[];
  /** why the ground truth says auto_ok, verbatim */
  rationale?: string;
}

export interface Phase6Evaluation {
  /** 29 */
  n_test?: number;
  confusion?: Phase6Confusion;
  false_auto_rate?: Phase6Rate;
  false_auto_rate_overall?: Phase6Rate;
  precision_escalate?: Phase6Rate;
  recall_escalate?: Phase6Rate;
  f1_escalate?: number;
  over_escalation_rate?: Phase6Rate;
  auto_handle_rate?: Phase6Rate;
  /** fires per rule id over the test set (E2:3, E3:2, E4:1, G1:10, G2:6) */
  rule_fire_counts?: Record<string, number>;
  ablation_vs_phase5_gates?: Phase6Ablation;
  qualitative_over_escalations?: Phase6OverEscalation[];
  honest_caveats?: string[];
}

/* ------------------------------------------------------------------ */
/* Top-level summary + API contract                                    */
/* ------------------------------------------------------------------ */

export interface Phase6Artifacts {
  results?: string;
  labels?: string;
  summary?: string;
}

/** Shape of hiver-support-agent/evaluation/results/phase6_summary.json */
export interface Phase6Summary {
  phase?: number;
  generated_at?: string;
  random_seed?: number;
  policy?: Phase6Policy;
  ground_truth?: Phase6GroundTruth;
  evaluation?: Phase6Evaluation;
  wall_clock_seconds?: number;
  artifacts?: Phase6Artifacts;
}

/** Response contract of GET /api/phase6/status */
export interface Phase6StatusResponse {
  ok: boolean;
  status: "READY" | "NOT_RUN" | (string & Record<never, never>);
  data?: Phase6Summary;
  message?: string;
  /** per-example records from escalation_results.json, matched to the
   *  ablation's decision-delta indices (optional — the status route attaches
   *  them best-effort so the ablation card can show the exact runtime
   *  signals behind each flip) */
  ablation_details?: Phase6PerExample[];
}

/* ------------------------------------------------------------------ */
/* Per-example records (escalation_results.json, delta-matched)         */
/* ------------------------------------------------------------------ */

export interface Phase6PerExample {
  index?: number;
  message?: string;
  golden_intent?: string;
  predicted_intent?: string;
  intent_confidence?: number;
  top1_score?: number;
  ground_truth?: string;
  ground_truth_rationale?: string;
  policy_action?: string;
  policy_reasons?: {
    rule?: string;
    name?: string;
    detail?: string;
  }[];
  outcome?: string;
  /** what the Phase 5 gates-only preview would have done (true = auto) */
  phase5_gates_only_auto?: boolean;
}

/* ------------------------------------------------------------------ */
/* Display constants                                                   */
/* ------------------------------------------------------------------ */

export { INTENT_NAMES, intentName } from "@/lib/phase4";
export { CUSTOM_SCROLLBAR } from "@/lib/phase5";

/** The rule-id display order used wherever rule counts/badges are listed. */
export const RULE_ORDER: string[] = ["E2", "E3", "E4", "G1", "G2"];

/** Human labels for the two ground-truth outcomes. */
export const GROUND_TRUTH_LABELS: Record<string, string> = {
  escalate: "escalate",
  auto_ok: "auto-safe",
};

/* ------------------------------------------------------------------ */
/* Static content (Phase 6 setup guidance for the NOT_RUN state)        */
/* ------------------------------------------------------------------ */

export interface Phase6SetupStep {
  title: string;
  detail: string;
  commands?: string[];
}

/** Guidance shown when /api/phase6/status reports NOT_RUN. */
export const PHASE6_SETUP_STEPS: Phase6SetupStep[] = [
  {
    title: "Check that Phases 1–5 exist",
    detail:
      "The policy consumes the recorded Phase 5 runtime signals (predicted intent, confidence, top-1 retrieval score) for the 29 golden TEST openers, so phase5_summary.json and the Phase 3/4 artifacts it was built on must already exist inside hiver-support-agent/.",
  },
  {
    title: "Run the escalation evaluation",
    detail:
      "Applies the five-rule policy to the recorded Phase 5 signals, compares every decision against the hand-labelled ground truth (evaluation/escalation_labels.json) and writes evaluation/results/phase6_summary.json — the file this dashboard reads. The script also prints the exact Clopper-Pearson confidence intervals shown here.",
    commands: ["python scripts/evaluate_escalation.py"],
  },
];
