/**
 * Shared types and helpers for the Phase 5 dashboard section.
 *
 * The shape mirrors `hiver-support-agent/evaluation/results/phase5_summary.json`
 * (produced by scripts/evaluate_generation.py through the live retrieval
 * service). Every field is optional: the dashboard must render gracefully
 * when keys are missing ("—" fallback) and must never fabricate numbers.
 *
 * Metric formatters (formatScore / formatInt / formatPercent / formatFloat /
 * orDash) are imported from @/lib/phase1 and @/lib/phase2 in the components —
 * they are already exported there and shared by the Phase 1–4 sections, so
 * the panels can never drift in formatting. INTENT_NAMES / intentName are
 * re-exported from @/lib/phase4 (which mirrors the Phase 2 taxonomy display
 * names) for the same reason.
 */

/* ------------------------------------------------------------------ */
/* Run configuration                                                   */
/* ------------------------------------------------------------------ */

export interface Phase5Config {
  /** evidence pairs fed into the grounded prompt (5) */
  top_k?: number;
  /** Phase 3 head confidence gate (0.60) */
  intent_confidence_threshold?: number;
  /** Phase 4 top-1 cosine gate (0.65) */
  retrieval_threshold?: number;
  /** z-ai LLM model id, e.g. "glm-4-plus" */
  llm?: string;
  /** max customer-message length accepted by the generator (500) */
  max_input_chars?: number;
  /** Twitter-length reply budget (280) */
  max_reply_chars?: number;
}

/* ------------------------------------------------------------------ */
/* Prompt design                                                       */
/* ------------------------------------------------------------------ */

export interface Phase5PromptExemplar {
  /** the customer message the exemplar prompt was built for */
  message?: string;
  /** the verbatim system prompt sent to the LLM */
  system_prompt?: string;
  /** the verbatim user prompt built around the message + evidence */
  user_prompt?: string;
}

export interface Phase5PromptDesign {
  /** length of the system prompt in words (198) */
  system_prompt_words?: number;
  /** what the user prompt template assembles, verbatim from the artifact */
  user_prompt_template?: string;
  /** a full recorded prompt pair, shown in the disclosure */
  exemplar?: Phase5PromptExemplar;
}

/* ------------------------------------------------------------------ */
/* Evaluation (test split — the 29 golden TEST openers)                */
/* ------------------------------------------------------------------ */

export interface Phase5GroundingOverlap {
  mean?: number;
  median?: number;
  min?: number;
  max?: number;
  /** how the metric is computed, verbatim from the artifact */
  definition?: string;
}

export interface Phase5UnsupportedSpecifics {
  /** replies with zero unsupported specifics (29) */
  replies_clean?: number;
  clean_rate?: number;
  total_violations?: number;
  /** what is checked, verbatim from the artifact */
  definition?: string;
}

export interface Phase5EscalationConsistency {
  /** replies whose Phase 6 gates fail (29 − 16 = 13) */
  gated_n?: number;
  /** gated replies that asked a clarifying question or redirected to DMs */
  consistent_n?: number;
  rate?: number;
  /** what is measured, verbatim from the artifact */
  definition?: string;
}

export interface Phase5Gates {
  /** test openers passing the intent-confidence gate (19) */
  intent_pass_n?: number;
  /** test openers passing the retrieval-score gate (23) */
  retrieval_pass_n?: number;
  /** test openers passing both gates (16) */
  auto_eligible_n?: number;
  auto_eligible_rate?: number;
}

export interface Phase5Length {
  mean_chars?: number;
  mean_words?: number;
  /** the 2017-era corpus support-reply averages the replies are compared to */
  corpus_avg_chars?: number;
  corpus_avg_words?: number;
  within_280_rate?: number;
}

export interface Phase5Latency {
  mean_llm_ms?: number;
  mean_total_ms?: number;
  max_total_ms?: number;
}

export interface Phase5TestEvaluation {
  n_total?: number;
  n_success?: number;
  success_rate?: number;
  grounding_overlap?: Phase5GroundingOverlap;
  unsupported_specifics?: Phase5UnsupportedSpecifics;
  framing_compliance_rate?: number;
  clarifying_rate?: number;
  dm_redirect_rate?: number;
  personal_data_solicited_count?: number;
  escalation_consistency?: Phase5EscalationConsistency;
  gates?: Phase5Gates;
  length?: Phase5Length;
  latency?: Phase5Latency;
  /** generation failure descriptions (empty in the recorded run) */
  failures?: string[];
}

export interface Phase5Evaluation {
  test?: Phase5TestEvaluation;
}

/* ------------------------------------------------------------------ */
/* Qualitative examples                                                */
/* ------------------------------------------------------------------ */

export interface Phase5ExampleScores {
  grounding_overlap?: number;
  /** numbers/version-like tokens/URLs absent from the evidence ([]) */
  unsupported_specifics?: string[];
  framing_compliant?: boolean;
  clarifying_question?: boolean;
  dm_redirect?: boolean;
  personal_data_solicited?: boolean;
  length_chars?: number;
  length_words?: number;
}

export interface Phase5ExampleGates {
  intent_confidence?: number;
  top1_score?: number;
  intent_pass?: boolean;
  retrieval_pass?: boolean;
  auto_handle_eligible?: boolean;
}

export interface Phase5EvidenceItem {
  rank?: number;
  /** cosine similarity to the message (0.7355 …) */
  score?: number;
  pair_id?: string;
  conversation_id?: string;
  predicted_intent?: string;
  customer_message?: string;
  support_response?: string;
}

export interface Phase5QualitativeExample {
  /** the golden test opener the reply was generated for */
  message?: string;
  golden_label?: string;
  /** the Phase 3 head's prediction for the message */
  predicted_intent?: string;
  intent_confidence?: number;
  /** top-1 cosine similarity from the Phase 4 index */
  top1_score?: number;
  gates?: Phase5ExampleGates;
  /** the generated reply, verbatim */
  reply?: string;
  scores?: Phase5ExampleScores;
  /** the three highest-scored evidence pairs behind the reply */
  evidence_top3?: Phase5EvidenceItem[];
  /** duplicated at the example level for convenience by the writer */
  grounding_overlap?: number;
}

/* ------------------------------------------------------------------ */
/* Top-level summary + API contract                                    */
/* ------------------------------------------------------------------ */

export interface Phase5Artifacts {
  /** path of the per-opener generation results, relative to hiver-support-agent/ */
  results?: string;
  /** path of this summary, relative to hiver-support-agent/ */
  summary?: string;
}

export interface Phase5LiveService {
  /** mini-service port (3030), reached through the gateway */
  port?: number;
  generate_endpoint?: string;
  health_endpoint?: string;
  note?: string;
}

/** Shape of hiver-support-agent/evaluation/results/phase5_summary.json */
export interface Phase5Summary {
  phase?: number;
  generated_at?: string;
  random_seed?: number;
  config?: Phase5Config;
  /** the five pipeline steps, in order, verbatim */
  pipeline?: string[];
  /** the six non-negotiable safety rules, verbatim (assignment §16) */
  safety_rules?: string[];
  prompt_design?: Phase5PromptDesign;
  evaluation?: Phase5Evaluation;
  qualitative_examples?: Phase5QualitativeExample[];
  /** measurement-honesty notes, verbatim */
  honest_caveats?: string[];
  wall_clock_seconds?: number;
  artifacts?: Phase5Artifacts;
  live_service?: Phase5LiveService;
}

/** Response contract of GET /api/phase5/status */
export interface Phase5StatusResponse {
  ok: boolean;
  status: "READY" | "NOT_RUN" | (string & Record<never, never>);
  data?: Phase5Summary;
  message?: string;
}

/* ------------------------------------------------------------------ */
/* Live generation mini-service contract (port 3030, via the gateway)  */
/* ------------------------------------------------------------------ */

export interface GenerateQueryIntent {
  label?: string;
  confidence?: number;
  runner_up?: string | null;
  runner_up_confidence?: number | null;
}

export interface GenerateGates {
  intent_confidence?: number;
  top1_score?: number;
  intent_pass?: boolean;
  retrieval_pass?: boolean;
  auto_handle_eligible?: boolean;
  thresholds?: {
    intent?: number;
    retrieval?: number;
  };
}

export interface GenerateEvidenceItem {
  rank?: number;
  /** cosine similarity, 0..1 */
  score?: number;
  pair_id?: string;
  conversation_id?: number | string | null;
  turn?: number | null;
  customer_message?: string;
  support_response?: string;
  predicted_intent?: string | null;
  predicted_confidence?: number | null;
}

export interface GenerateScores {
  grounding_overlap?: number;
  unsupported_specifics?: string[];
  framing_compliant?: boolean;
  clarifying_question?: boolean;
  dm_redirect?: boolean;
  personal_data_solicited?: boolean;
  length_chars?: number;
  length_words?: number;
}

/** Response of POST /api/phase5/generate?XTransformPort=3030 */
export interface GenerateResponse {
  ok?: boolean;
  message?: string;
  k?: number;
  /** the generated reply text */
  reply?: string;
  query_intent?: GenerateQueryIntent;
  gates?: GenerateGates;
  evidence?: GenerateEvidenceItem[];
  scores?: GenerateScores;
  prompt?: {
    system?: string;
    user?: string;
  };
  llm?: {
    model?: string;
    attempts?: number;
    max_reply_chars?: number;
  };
  timings?: {
    embed_ms?: number;
    faiss_search_ms?: number;
    llm_ms?: number;
    total_ms?: number;
  };
  meta?: {
    corpus_size?: number;
    worker_state?: string;
    disclaimer?: string;
  };
  /** present on 400 (bad input) / 503 (worker or LLM failure) */
  error?: string;
  worker?: string;
}

/* ------------------------------------------------------------------ */
/* Display constants                                                   */
/* ------------------------------------------------------------------ */

/** Human names for the ten intent labels — reused from the Phase 4 lib,
 *  which mirrors the Phase 2 taxonomy display names, so every panel shows
 *  the same vocabulary. The retrieval health contract is reused too: the
 *  Phase 5 generator runs inside the same mini-service. */
export { INTENT_NAMES, intentName } from "@/lib/phase4";
export type { RetrievalHealthResponse } from "@/lib/phase4";

/** Example customer messages for the demo chips (typed like a customer). */
export const EXAMPLE_MESSAGES: string[] = [
  "my iphone battery drains way too fast since the new update",
  "someone hacked my itunes account",
  "why does my phone keep restarting on its own",
  "can't download apps from the app store",
  "my macbook won't charge anymore",
  "apple music keeps skipping songs",
];

/** Message length cap enforced by the generation service (500 chars). */
export const MAX_INPUT_CHARS = 500;

/** The k values offered by the live demo (the service accepts 1..10). */
export const DEMO_K_OPTIONS: number[] = [3, 5, 10];

/** Default k for the live demo (the artifact's config.top_k, i.e. 5). */
export const DEMO_K_DEFAULT = 5;

/**
 * The custom-scrollbar styling every scrollable list in this section uses —
 * the same classes the Phase 4 components apply inline. Declared once so the
 * panels cannot drift.
 */
export const CUSTOM_SCROLLBAR =
  "[&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-zinc-300 dark:[&::-webkit-scrollbar-thumb]:bg-zinc-700 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-zinc-100 dark:[&::-webkit-scrollbar-track]:bg-zinc-800/80";

/* ------------------------------------------------------------------ */
/* Static content (Phase 5 setup guidance for the NOT_RUN state)       */
/* ------------------------------------------------------------------ */

export interface Phase5SetupStep {
  title: string;
  detail: string;
  commands?: string[];
}

/** Guidance shown when /api/phase5/status reports NOT_RUN. */
export const PHASE5_SETUP_STEPS: Phase5SetupStep[] = [
  {
    title: "Start the live retrieval service",
    detail:
      "From the project root, start the mini-service that hosts both the Phase 4 FAISS search and the Phase 5 generator (port 3030, reached through the gateway). The worker loads its ~600 MB of artifacts lazily on the first request (~15 s).",
    commands: ["cd mini-services/retrieval-service && bun run dev"],
  },
  {
    title: "Check that Phases 1–4 exist",
    detail:
      "Generation consumes the Phase 3 logreg head (intent + confidence), the Phase 4 FAISS index (top-K evidence pairs) and the z-ai LLM through that live service, and evaluates on the 29 golden TEST openers from the Phase 2 golden set — so those artifacts must already exist.",
  },
  {
    title: "Run the generation evaluation",
    detail:
      "Generates evidence-grounded replies for the golden TEST openers through the live service (Phase 3 head + Phase 4 index + z-ai LLM), scores every reply with transparent lexical heuristics and writes evaluation/results/phase5_summary.json — the file this dashboard reads.",
    commands: ["python scripts/evaluate_generation.py"],
  },
];
