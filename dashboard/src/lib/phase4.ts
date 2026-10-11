/**
 * Shared types and helpers for the Phase 4 dashboard section.
 *
 * The shape mirrors `hiver-support-agent/evaluation/results/phase4_summary.json`
 * (produced by scripts/build_retrieval_index.py). Every field is optional:
 * the dashboard must render gracefully when keys are missing ("—" fallback)
 * and must never fabricate numbers.
 *
 * Metric formatters (formatScore / formatSignedDelta / shortLabel) are
 * imported from @/lib/phase2 in the components — they are already exported
 * there and shared by the Phase 2/3/4 sections, so the panels can never
 * drift in formatting. INTENT_NAMES mirrors the human names the Phase 2
 * taxonomy assigns to the same machine labels.
 */

/* ------------------------------------------------------------------ */
/* Embedding model + evidence corpus                                   */
/* ------------------------------------------------------------------ */

export interface Phase4EmbeddingModel {
  /** e.g. "sentence-transformers/all-MiniLM-L6-v2" */
  id?: string;
  /** embedding dimensionality, e.g. 384 */
  dim?: number;
  /** e.g. "22.3M (frozen; retrieval embeds, it never trains)" */
  parameters?: string;
  /** e.g. "CPU, float32" */
  runtime?: string;
}

export interface Phase4Corpus {
  /** all historical evidence pairs, before golden isolation */
  total_pairs?: number;
  /** number of golden conversations excluded (200) */
  golden_excluded?: number;
  /** pairs actually indexed (total minus golden-conversation pairs) */
  indexed_pairs?: number;
  /** the embedded field, e.g. "customer_message" */
  embedded_field?: string;
  /** seconds to embed the whole corpus */
  embedding_seconds?: number;
  /** true when embeddings were served from cache instead of computed */
  embedding_cache_hit?: boolean;
  /** on-disk size of the FAISS index */
  index_size_mb?: number;
  /** seconds to build the FAISS index */
  index_build_seconds?: number;
  /** "PASS" when each corpus vector retrieves itself as rank 1 */
  self_retrieval_check?: string;
}

/* ------------------------------------------------------------------ */
/* Recall@K evaluation                                                 */
/* ------------------------------------------------------------------ */

export interface Phase4Top1Score {
  mean?: number;
  median?: number;
  min?: number;
  max?: number;
}

export interface Phase4RetrievalMetrics {
  recall_at_1?: number;
  recall_at_3?: number;
  recall_at_5?: number;
  mrr_at_5?: number;
  /** number of golden openers evaluated (test and val are both 29) */
  n?: number;
  /** share of openers whose top-1 predicted label equals the golden label */
  top1_agreement?: number;
  /** accuracy of the majority vote over the top-5 retrieved labels */
  majority_vote_accuracy?: number;
  /** cosine-score distribution of the top-1 retrieved pair */
  top1_score?: Phase4Top1Score;
}

export interface Phase4ThresholdPreview {
  /** the configured RETRIEVAL_THRESHOLD (0.65) */
  threshold?: number;
  /** what the preview measures, verbatim from the artifact */
  note?: string;
  /** share of test openers whose top-1 cosine is >= threshold */
  share_top1_above?: number;
  /** absolute number of test openers above the threshold */
  n_above?: number;
  /** Recall@5 among the openers above the threshold */
  recall_at_5_when_above?: number;
}

export interface Phase4Evaluation {
  val?: Phase4RetrievalMetrics;
  test?: Phase4RetrievalMetrics;
  threshold_preview?: Phase4ThresholdPreview;
}

/* ------------------------------------------------------------------ */
/* Qualitative examples + live service                                 */
/* ------------------------------------------------------------------ */

export interface Phase4QualitativeTop1 {
  /** cosine similarity between query and the top-1 retrieved pair */
  score?: number;
  predicted_label?: string;
  customer_message?: string;
  support_response?: string;
}

export interface Phase4QualitativeExample {
  /** the golden test opener used as the retrieval query */
  query?: string;
  /** the opener's hand-labelled golden intent */
  golden_label?: string;
  /** "hit" (a same-intent pair within top-K) or "no hit" */
  outcome?: string;
  top1?: Phase4QualitativeTop1;
}

export interface Phase4LiveService {
  /** mini-service port (3030), reached through the gateway */
  port?: number;
  search_endpoint?: string;
  health_endpoint?: string;
  note?: string;
}

/* ------------------------------------------------------------------ */
/* Top-level summary + API contract                                    */
/* ------------------------------------------------------------------ */

/** Shape of hiver-support-agent/evaluation/results/phase4_summary.json */
export interface Phase4Summary {
  phase?: number;
  generated_at?: string;
  random_seed?: number;
  embedding_model?: Phase4EmbeddingModel;
  corpus?: Phase4Corpus;
  /** how a "hit" is defined, verbatim from the artifact */
  relevance_definition?: string;
  /** predicted-intent label -> pair count over the indexed corpus */
  corpus_label_distribution?: Record<string, number>;
  evaluation?: Phase4Evaluation;
  qualitative_examples?: Phase4QualitativeExample[];
  /** paths relative to hiver-support-agent/ */
  artifacts?: string[];
  live_service?: Phase4LiveService;
}

/** Response contract of GET /api/phase4/status */
export interface Phase4StatusResponse {
  ok: boolean;
  status: "READY" | "NOT_RUN" | (string & Record<never, never>);
  data?: Phase4Summary;
  message?: string;
}

/* ------------------------------------------------------------------ */
/* Live retrieval mini-service contract (port 3030, via the gateway)   */
/* ------------------------------------------------------------------ */

/** Response of GET /api/phase4/health?XTransformPort=3030 */
export interface RetrievalHealthResponse {
  ok?: boolean;
  service?: string;
  /** "idle" | "loading" | "ready" | "dead" — the retrieval engine serving requests */
  worker?: string;
  /** raw Python FAISS child state ("idle" while the built-in engine serves) */
  python_worker?: string;
  /** "faiss-ml" (full ML backend) | "builtin-lexical" (durable fallback) */
  retrieval_backend?: string;
  /** live dataset connection state — answers "is the dataset loaded?" at a glance */
  dataset?: {
    connected?: boolean;
    corpus_pairs?: number;
    backend?: string;
    source?: string;
    python_artifacts_present?: boolean;
  };
  corpus_size?: number;
  model?: string;
  index?: string;
  uptime_s?: number;
  hint?: string;
}

export interface RetrievalQueryIntent {
  /** the Phase 3 logreg head's prediction for the query itself */
  label?: string;
  confidence?: number;
  runner_up?: string;
  runner_up_confidence?: number;
}

export interface RetrievalSearchResult {
  rank?: number;
  /** cosine similarity, 0..1 */
  score?: number;
  pair_id?: string;
  conversation_id?: string;
  turn?: number;
  customer_message?: string;
  support_response?: string;
  predicted_intent?: string;
  predicted_confidence?: number;
}

/** Response of POST /api/phase4/search?XTransformPort=3030 */
export interface RetrievalSearchResponse {
  ok?: boolean;
  query?: string;
  k?: number;
  query_intent?: RetrievalQueryIntent;
  results?: RetrievalSearchResult[];
  timings?: {
    embed_ms?: number;
    faiss_search_ms?: number;
  };
  meta?: {
    corpus_size?: number;
    model?: string;
    index?: string;
    worker_state?: string;
  };
  /** present on 400 (bad input) / 503 (worker failed or timed out) */
  error?: string;
  worker?: string;
}

/* ------------------------------------------------------------------ */
/* Display constants                                                   */
/* ------------------------------------------------------------------ */

/**
 * Human names for the ten intent labels, mirroring the Phase 2 taxonomy
 * (machine label -> name) so the corpus distribution and demo badges use
 * the same vocabulary as the Phase 2/3 panels. Labels missing from this
 * map fall back to the raw machine label.
 */
export const INTENT_NAMES: Record<string, string> = {
  software_bug: "Software / OS bug",
  device_hardware: "Device / hardware fault",
  account_icloud: "Account / Apple ID / iCloud",
  connectivity: "Connectivity",
  billing_purchases: "Billing / purchases / orders",
  repair_warranty: "Repair / warranty",
  security_privacy: "Security / privacy",
  general_complaint: "General complaint / venting",
  support_process: "Support-process problem",
  other: "Other / out of scope",
};

/** Machine label -> display name (falls back to the raw label). */
export function intentName(label: string | undefined): string {
  if (!label) return "—";
  return INTENT_NAMES[label] ?? label;
}

/** The k values offered by the live demo (the service accepts 1..10). */
export const DEMO_K_OPTIONS: number[] = [3, 5, 10];

/** Default k for the live demo search. */
export const DEMO_K_DEFAULT = 5;

/** Example queries for the demo chips (historical-corpus-flavoured). */
export const DEMO_EXAMPLE_QUERIES: string[] = [
  "my iphone battery drains crazy fast since the update",
  "app store wont load",
  "forgot my apple id password",
  "cracked my screen how much to fix",
  "wifi keeps dropping at home",
  "charged twice for apple music",
];

/** Query length cap enforced by the retrieval service. */
export const DEMO_QUERY_MAX_CHARS = 500;

/* ------------------------------------------------------------------ */
/* Static content (Phase 4 setup guidance for the NOT_RUN state)       */
/* ------------------------------------------------------------------ */

export interface Phase4SetupStep {
  title: string;
  detail: string;
  commands?: string[];
}

/** Guidance shown when /api/phase4/status reports NOT_RUN. */
export const PHASE4_SETUP_STEPS: Phase4SetupStep[] = [
  {
    title: "Install the Phase 4 dependencies",
    detail:
      "Inside hiver-support-agent/, install the pinned requirements — this adds faiss-cpu, the exact nearest-neighbour index used over the MiniLM embeddings.",
    commands: ["pip install -r requirements.txt"],
  },
  {
    title: "Check that Phases 1–3 exist",
    detail:
      "Retrieval embeds the Phase 1 conversation pairs, excludes the 200 golden conversations via the Phase 2 isolation manifest (evaluation/golden_conversation_ids.json) and labels retrieved pairs with the Phase 3 logreg head — so those artifacts must already exist.",
  },
  {
    title: "Build the retrieval index and measure Recall@K",
    detail:
      "Embeds every historical evidence pair (customer_message) with the frozen all-MiniLM-L6-v2 encoder, builds a faiss.IndexFlatIP (exact cosine) index over the non-golden corpus, verifies self-retrieval, evaluates Recall@1/3/5 + MRR@5 on the golden test openers and writes evaluation/results/phase4_summary.json — the file this dashboard reads.",
    commands: ["python scripts/build_retrieval_index.py"],
  },
];
