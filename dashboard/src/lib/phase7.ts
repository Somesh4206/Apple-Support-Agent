/**
 * Shared types and helpers for the Phase 7 dashboard section.
 *
 * The shape mirrors `hiver-support-agent/evaluation/results/phase7_summary.json`
 * (produced by scripts/evaluate_agent.py through the live retrieval service's
 * /api/phase7/agent endpoint). Every field is optional: the dashboard must
 * render gracefully when keys are missing ("—" fallback) and must never
 * fabricate numbers.
 *
 * Metric formatters are imported from @/lib/phase1 and @/lib/phase2 in the
 * components (shared since Phase 1, so the panels cannot drift). INTENT_NAMES /
 * intentName, the retrieval-health contract and the custom scrollbar constant
 * are re-exported from the Phase 4/5 libs for the same reason — the unified
 * agent runs inside the same mini-service as the Phase 4/5 pipeline.
 */

/* ------------------------------------------------------------------ */
/* Run configuration                                                   */
/* ------------------------------------------------------------------ */

export interface Phase7Config {
  top_k?: number;
  intent_confidence_threshold?: number;
  retrieval_threshold?: number;
  /** the live endpoint the evaluation drove, verbatim */
  endpoint?: string;
  /** e.g. "glm-4-plus via z-ai-web-dev-sdk (backend-only)" */
  llm?: string;
}

/* ------------------------------------------------------------------ */
/* The policy (same rule set as Phase 6, mirrored in TypeScript)        */
/* ------------------------------------------------------------------ */

export type Phase7Rule = {
  id?: string;
  name?: string;
  fires_when?: string;
  why?: string;
  provenance?: string;
};

export interface Phase7Policy {
  type?: string;
  decision?: string;
  safety_asymmetry?: string;
  rules?: Phase7Rule[];
  inputs?: string[];
}

/* ------------------------------------------------------------------ */
/* Evaluation                                                          */
/* ------------------------------------------------------------------ */

export interface Phase7Consistency {
  /** what is compared, verbatim */
  description?: string;
  agreed_n?: number;
  total_n?: number;
  all_agree?: boolean;
  mismatches?: string[];
}

export interface Phase7Decisions {
  auto_handle_n?: number;
  escalate_n?: number;
  auto_rate?: number;
}

export interface Phase7EndToEndQuality {
  confusion?: {
    true_escalate?: number;
    over_escalation?: number;
    false_auto?: number;
    true_auto?: number;
  };
  false_auto_rate?: number;
  precision_escalate?: number;
  recall_escalate?: number;
  note?: string;
}

export interface Phase7Cost {
  llm_calls_made?: number;
  llm_calls_skipped_by_policy?: number;
  llm_call_saving_rate?: number;
  mean_llm_ms_auto?: number;
  phase5_mean_llm_ms_per_reply?: number;
  estimated_llm_ms_saved?: number;
}

export interface Phase7Latency {
  mean_total_ms_auto?: number;
  mean_total_ms_escalate?: number;
  note?: string;
}

export interface Phase7AutoReplyQuality {
  n?: number;
  mean_grounding_overlap?: number;
  note?: string;
}

export interface Phase7Evaluation {
  n_test?: number;
  n_success?: number;
  failures?: string[];
  consistency?: Phase7Consistency;
  structure_ok_n?: number;
  decisions?: Phase7Decisions;
  end_to_end_quality?: Phase7EndToEndQuality;
  cost?: Phase7Cost;
  latency?: Phase7Latency;
  auto_reply_quality?: Phase7AutoReplyQuality;
  honest_caveats?: string[];
}

/* ------------------------------------------------------------------ */
/* Top-level summary + API contract                                    */
/* ------------------------------------------------------------------ */

export interface Phase7Artifacts {
  results?: string;
  summary?: string;
}

export interface Phase7LiveService {
  port?: number;
  agent_endpoint?: string;
  health_endpoint?: string;
  note?: string;
}

/** Shape of hiver-support-agent/evaluation/results/phase7_summary.json */
export interface Phase7Summary {
  phase?: number;
  generated_at?: string;
  random_seed?: number;
  config?: Phase7Config;
  /** the five agent steps, in order, verbatim */
  agent_steps?: string[];
  policy?: Phase7Policy;
  evaluation?: Phase7Evaluation;
  wall_clock_seconds?: number;
  artifacts?: Phase7Artifacts;
  live_service?: Phase7LiveService;
}

/** Response contract of GET /api/phase7/status */
export interface Phase7StatusResponse {
  ok: boolean;
  status: "READY" | "NOT_RUN" | (string & Record<never, never>);
  data?: Phase7Summary;
  message?: string;
}

/* ------------------------------------------------------------------ */
/* Live agent console contract (POST /api/phase7/agent, port 3030)      */
/* ------------------------------------------------------------------ */

export interface AgentQueryIntent {
  label?: string;
  confidence?: number;
  runner_up?: string | null;
  runner_up_confidence?: number | null;
}

export interface AgentGates {
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

export interface AgentPolicy {
  /** "auto_handle" | "escalate" */
  action?: string;
  reasons?: {
    rule?: string;
    name?: string;
    detail?: string;
  }[];
  thresholds?: {
    intent?: number;
    retrieval?: number;
  };
  provenance?: string;
}

export interface AgentEvidenceItem {
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

export interface AgentScores {
  grounding_overlap?: number;
  unsupported_specifics?: string[];
  framing_compliant?: boolean;
  clarifying_question?: boolean;
  dm_redirect?: boolean;
  personal_data_solicited?: boolean;
  length_chars?: number;
  length_words?: number;
}

export interface AgentHandoff {
  next_step?: string;
  reasons?: {
    rule?: string;
    name?: string;
    detail?: string;
  }[];
  suggested_public_acknowledgment?: string;
  ack_kind?: "greeting" | "self_service" | "clarify" | "secure_continue";
  note_for_agent?: string;
  evidence_for_review?: AgentEvidenceItem[];
}

/** Response of POST /api/phase7/agent?XTransformPort=3030 */
export interface AgentResponse {
  ok?: boolean;
  message?: string;
  k?: number;
  query_intent?: AgentQueryIntent;
  gates?: AgentGates;
  policy?: AgentPolicy;
  evidence?: AgentEvidenceItem[];
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
  /** "auto_handle" | "escalate" */
  decision?: string;
  /** grounded LLM draft on the auto path; the deterministic safe reply on the escalate path */
  reply?: string | null;
  /** "ready_to_send" (auto) | "handoff_acknowledgment" (escalate, safe reply auto-sent) */
  reply_status?: string;
  /** auto path only */
  scores?: AgentScores;
  llm?: {
    model?: string;
    attempts?: number;
    max_reply_chars?: number;
  };
  /** escalate path only */
  handoff?: AgentHandoff;
  /** present on 400 (bad input) / 503 (worker or LLM failure) */
  error?: string;
  worker?: string;
}

/* ------------------------------------------------------------------ */
/* Display constants                                                   */
/* ------------------------------------------------------------------ */

export { INTENT_NAMES, intentName } from "@/lib/phase4";
export type { RetrievalHealthResponse } from "@/lib/phase4";
export { CUSTOM_SCROLLBAR } from "@/lib/phase5";

/**
 * Example messages for the live agent console chips — drawn from the golden
 * test set so every chip exercises a known path (auto, escalate, gate fires).
 */
export const AGENT_EXAMPLE_MESSAGES: string[] = [
  "my App Store is not working!!!!",
  "do you have a price quote on getting a screen fixed for iPhone 7 Plus?",
  "Why does my iPad keep asking me to sign into iCloud every 30 seconds?",
  "Ever since I updated my phone, it's been sooo slow and keeps crashing!",
  "someone hacked my itunes account",
];

/** Message length cap enforced by the agent service (500 chars). */
export const AGENT_MAX_INPUT_CHARS = 500;

/* ------------------------------------------------------------------ */
/* Static content (Phase 7 setup guidance for the NOT_RUN state)        */
/* ------------------------------------------------------------------ */

export interface Phase7SetupStep {
  title: string;
  detail: string;
  commands?: string[];
}

/** Guidance shown when /api/phase7/status reports NOT_RUN. */
export const PHASE7_SETUP_STEPS: Phase7SetupStep[] = [
  {
    title: "Start the live retrieval service",
    detail:
      "From the project root, start the mini-service that hosts the unified agent (port 3030, reached through the gateway). The worker loads its ~600 MB of artifacts lazily on the first request (~15 s).",
    commands: ["cd mini-services/retrieval-service && bun run dev"],
  },
  {
    title: "Run the agent evaluation",
    detail:
      "Drives all 29 golden TEST openers through the live /api/phase7/agent endpoint, asserts the TypeScript policy mirror agrees with the Python policy on every message, and writes evaluation/results/phase7_summary.json — the file this dashboard reads.",
    commands: ["python scripts/evaluate_agent.py"],
  },
];
