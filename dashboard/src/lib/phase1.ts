/**
 * Shared types and helpers for the Phase 1 dashboard.
 *
 * The shape mirrors `hiver-support-agent/data/processed/eda_summary.json`
 * (produced by scripts/run_eda.py). Every field is optional: the dashboard
 * must render gracefully when keys are missing ("—" fallback) and must never
 * fabricate numbers.
 */

export interface Phase1Source {
  file?: string;
  path?: string;
  /** true = the pipeline ran on a synthetic sample instead of the real twcs.csv */
  synthetic?: boolean;
  apple_support_author_id?: string;
}

export interface Phase1Dataset {
  total_tweets?: number;
  total_conversations?: number;
  apple_conversations?: number;
  apple_tweets?: number;
  apple_inbound?: number;
  apple_outbound?: number;
  support_pairs?: number;
  avg_conversation_turns?: number;
  median_conversation_turns?: number;
  max_conversation_turns?: number;
  avg_message_chars?: number;
  avg_message_words?: number;
  date_start?: string;
  date_end?: string;
}

export interface Phase1InboundDistribution {
  inbound?: number;
  outbound?: number;
}

export interface Phase1TurnsBin {
  turns?: number;
  count?: number;
}

export interface Phase1BucketBin {
  bucket?: string;
  count?: number;
}

export interface Phase1TermCount {
  term?: string;
  count?: number;
}

export interface Phase1Topic {
  topic?: string;
  matched?: number;
  /** fraction (0–1) of customer messages matching the topic */
  share?: number;
}

export interface Phase1Stage {
  name?: string;
  /** "OK" or "WARN" */
  status?: string;
  detail?: string;
}

export interface Phase1SampleConversation {
  conversation_id?: string;
  turns?: number;
  created_at?: string;
  customer_message?: string;
  support_response?: string;
}

export interface EdaSummary {
  generated_at?: string;
  source?: Phase1Source;
  dataset?: Phase1Dataset;
  inbound_distribution?: Phase1InboundDistribution;
  conversation_length_histogram?: Phase1TurnsBin[];
  message_length_histogram?: Phase1BucketBin[];
  top_terms?: Phase1TermCount[];
  top_bigrams?: Phase1TermCount[];
  provisional_topics?: Phase1Topic[];
  /** fraction (0–1) of customer messages matching >= 2 provisional topics */
  multi_topic_share?: number;
  pipeline_stages?: Phase1Stage[];
  sample_conversations?: Phase1SampleConversation[];
}

/** Response contract of GET /api/phase1/status */
export interface Phase1StatusResponse {
  ok: boolean;
  status: "READY" | "NOT_RUN" | (string & Record<never, never>);
  data?: EdaSummary;
  message?: string;
}

/* ------------------------------------------------------------------ */
/* Pipeline run detail (pipeline_run.json)                             */
/* ------------------------------------------------------------------ */

export interface PipelineInput {
  file?: string;
  path?: string;
  size_bytes?: number;
  synthetic?: boolean;
}

export interface PipelineSettings {
  random_seed?: number;
  chunk_size?: number;
  closure_max_passes?: number;
  note?: string;
}

export interface PipelineAuthorStat {
  author_id?: string;
  tweets?: number;
}

export interface PipelineScanStats {
  total_rows?: number;
  unique_tweet_ids?: number;
  duplicate_tweet_ids?: number;
  inbound_rows?: number;
  outbound_rows?: number;
  malformed_inbound?: number;
  conversation_starters?: number;
  file_size_bytes?: number;
  top_outbound_authors?: PipelineAuthorStat[];
}

export interface PipelineCleaningReport {
  rows_in?: number;
  rows_out?: number;
  dropped_missing_tweet_id?: number;
  dropped_missing_author_id?: number;
  dropped_empty_text?: number;
  dropped_duplicate_tweet_id?: number;
  decoded_html_entities?: number;
  removed_rt_prefix?: number;
  removed_urls?: number;
  removed_leading_mention?: number;
  collapsed_whitespace?: number;
}

export interface PipelineReconstructionStats {
  tweets_in?: number;
  conversations?: number;
  tweets_in_conversations?: number;
  partial_roots?: number;
  cyclic_tweets_skipped?: number;
  parent_link_mismatches?: number;
  dangling_child_links?: number;
}

export interface PipelineValidation {
  name?: string;
  passed?: boolean;
  detail?: string;
}

export interface PipelineOutputFile {
  rows?: number;
  path?: string;
}

/** Shape of hiver-support-agent/data/processed/pipeline_run.json */
export interface PipelineRun {
  generated_at?: string;
  phase?: number;
  mode?: string;
  input?: PipelineInput;
  apple_support_author_id?: string;
  settings?: PipelineSettings;
  scan_stats?: PipelineScanStats;
  cleaning_report?: PipelineCleaningReport;
  reconstruction_stats?: PipelineReconstructionStats;
  /** keyed by output file name, e.g. "conversations.csv" */
  outputs?: Record<string, PipelineOutputFile>;
  stages?: Phase1Stage[];
  validations?: PipelineValidation[];
  duration_seconds?: number;
}

/** Response contract of GET /api/phase1/pipeline */
export interface Phase1PipelineResponse {
  ok: boolean;
  status: "READY" | "NOT_RUN" | (string & Record<never, never>);
  data?: PipelineRun;
  message?: string;
}

/* ------------------------------------------------------------------ */
/* Conversation explorer (conversation_pairs.csv)                      */
/* ------------------------------------------------------------------ */

export interface Phase1ConversationPair {
  conversation_id: string;
  turn: number;
  customer_message: string;
  support_response: string;
  created_at: string;
  /**
   * Term-frequency relevance score (customer-message hits ×2 + support
   * hits) — present only when sort=relevance with a query, so the UI can
   * badge why a pair ranks where it does.
   */
  score?: number;
}

export interface Phase1ConversationsQuery {
  q?: string;
  minTurns?: number;
  maxTurns?: number;
  /**
   * "relevance" ranks term frequency (customer-message hits weigh double)
   * and is only meaningful together with q — without a search term the API
   * falls back to the deterministic id order.
   */
  sort?: "id" | "turns_desc" | "longest" | "relevance";
}

/** Response contract of GET /api/phase1/conversations */
export interface Phase1ConversationsResponse {
  ok: boolean;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  items: Phase1ConversationPair[];
  query?: Phase1ConversationsQuery;
  corpusRows?: number;
  cache?: "cold" | "warm";
  elapsedMs?: number;
  message?: string;
}

/**
 * Full-thread response for GET /api/phase1/conversations?conversationId=… —
 * every reconstructed pair of one conversation, ordered by turn index.
 */
export interface Phase1ThreadResponse {
  ok: boolean;
  conversationId: string;
  /** Number of customer↔support pairs in the thread (turns). */
  turns: number;
  /** Timestamp of the first pair, if any. */
  startedAt?: string;
  items: Phase1ConversationPair[];
  corpusRows?: number;
  cache?: "cold" | "warm";
  elapsedMs?: number;
  message?: string;
}

/* ------------------------------------------------------------------ */
/* Documentation viewer (README / report / decision log)               */
/* ------------------------------------------------------------------ */

/** One rendered markdown document served by GET /api/phase1/docs */
export interface Phase1Doc {
  slug: "report" | "readme" | "decision-log";
  title: string;
  description: string;
  /** Path relative to hiver-support-agent/, shown for provenance */
  path: string;
  bytes: number;
  /** Last modification time, ISO string */
  modifiedAt: string;
  /** Raw markdown source (rendered client-side with react-markdown) */
  content: string;
}

/** Response contract of GET /api/phase1/docs */
export interface Phase1DocsResponse {
  ok: boolean;
  status: "READY" | "NOT_RUN" | "UNREADABLE";
  docs?: Phase1Doc[];
  message?: string;
}

/* ------------------------------------------------------------------ */
/* Formatting helpers                                                  */
/* ------------------------------------------------------------------ */

/** 2811774 -> "2,811,774"; missing/invalid -> "—" */
export function formatInt(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toLocaleString("en-US")
    : "—";
}

/** 4.4 -> "4.4"; missing/invalid -> "—" */
export function formatFloat(
  value: number | null | undefined,
  digits = 1,
): string {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toFixed(digits)
    : "—";
}

/** 0.21 -> "21.0%"; missing/invalid -> "—" (input is a 0–1 fraction) */
export function formatPercent(
  value: number | null | undefined,
  digits = 1,
): string {
  return typeof value === "number" && Number.isFinite(value)
    ? `${(value * 100).toFixed(digits)}%`
    : "—";
}

/** 42200 -> "42.2K"; missing/invalid -> "—" (compact chart labels) */
export function formatCompact(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value)
    ? new Intl.NumberFormat("en-US", {
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(value)
    : "—";
}

/** Empty/whitespace-only string -> "—" */
export function orDash(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "—";
}

/** 516508641 -> "516.5 MB" (decimal units, as file browsers show); missing/invalid -> "—" */
export function formatBytes(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return "—";
  }
  const units = ["B", "KB", "MB", "GB"];
  let scaled = value;
  let unitIndex = 0;
  while (scaled >= 1000 && unitIndex < units.length - 1) {
    scaled /= 1000;
    unitIndex += 1;
  }
  return `${scaled.toFixed(scaled >= 100 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

/** 211.8 -> "3 min 32 s"; 41.2 -> "41 s"; missing/invalid -> "—" */
export function formatDuration(
  value: number | null | undefined,
): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return "—";
  }
  const totalSeconds = Math.round(value);
  if (totalSeconds < 60) {
    return `${totalSeconds} s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds === 0
    ? `${minutes} min`
    : `${minutes} min ${seconds} s`;
}

/* ------------------------------------------------------------------ */
/* Static content (roadmap + setup guidance)                           */
/* ------------------------------------------------------------------ */

export interface RoadmapPhase {
  n: number;
  title: string;
  description: string;
}

export const ROADMAP_PHASES: RoadmapPhase[] = [
  {
    n: 1,
    title: "Data Foundation",
    description:
      "Dataset loading, AppleSupport filtering, conversation reconstruction and exploratory data analysis.",
  },
  {
    n: 2,
    title: "Intent Taxonomy & Baselines",
    description: "Intent taxonomy, golden set, baselines.",
  },
  {
    n: 3,
    title: "Embedding Intent Classifier",
    description: "Embedding classifier + intent evaluation.",
  },
  {
    n: 4,
    title: "Historical Retrieval",
    description: "Historical retrieval (FAISS) + Recall@K.",
  },
  {
    n: 5,
    title: "Grounded Generation",
    description: "Evidence-grounded reply generation + reply-quality scoring.",
  },
  {
    n: 6,
    title: "Escalation & Safety",
    description: "Escalation policy + false-auto evaluation.",
  },
  {
    n: 7,
    title: "Agent Orchestration",
    description: "Unified agent orchestration.",
  },
  {
    n: 8,
    title: "Streamlit App",
    description: "Streamlit app.",
  },
  {
    n: 9,
    title: "Report & Evaluation",
    description: "Final report & evaluation.",
  },
];

export interface SetupStep {
  title: string;
  detail: string;
  commands?: string[];
}

/* ------------------------------------------------------------------ */
/* EDA chart catalog (matplotlib PNGs in data/processed/charts/)        */
/* ------------------------------------------------------------------ */

export interface ChartMeta {
  /** whitelisted file stem served by /api/phase1/chart?name=… */
  name: string;
  title: string;
  description: string;
  alt: string;
}

export const CHART_CATALOG: ChartMeta[] = [
  {
    name: "inbound_outbound",
    title: "Inbound vs outbound",
    description: "Tweet direction split within the AppleSupport corpus.",
    alt: "Bar chart comparing inbound customer tweets and outbound AppleSupport tweets.",
  },
  {
    name: "conversation_lengths",
    title: "Conversation length",
    description: "Distribution of turn counts across reconstructed conversations.",
    alt: "Histogram of the number of tweets per reconstructed conversation.",
  },
  {
    name: "message_lengths",
    title: "Message length",
    description: "Character-count distribution across corpus messages.",
    alt: "Histogram of message lengths in characters.",
  },
  {
    name: "top_terms",
    title: "Top terms",
    description: "Most frequent terms in customer messages.",
    alt: "Horizontal bar chart of the most frequent terms in customer messages.",
  },
  {
    name: "top_bigrams",
    title: "Top bigrams",
    description: "Most frequent two-word sequences in customer messages.",
    alt: "Horizontal bar chart of the most frequent two-word sequences in customer messages.",
  },
  {
    name: "provisional_topics",
    title: "Provisional topics",
    description: "Keyword-based topic clusters (final taxonomy arrives in Phase 2).",
    alt: "Horizontal bar chart of provisional keyword-based topic shares.",
  },
];

export const CHART_NAMES: string[] = CHART_CATALOG.map((chart) => chart.name);

/** Guidance shown when /api/phase1/status reports NOT_RUN. */
export const SETUP_STEPS: SetupStep[] = [
  {
    title: "Add the raw dataset",
    detail:
      "Place twcs.csv in hiver-support-agent/data/raw/. Download options (Kaggle CLI or manual) are documented in hiver-support-agent/data/README.md.",
    commands: [
      "kaggle datasets download -d thoughtvector/customer-support-on-twitter -p data/raw --unzip",
    ],
  },
  {
    title: "Configure the support account",
    detail:
      "Inside hiver-support-agent/, run the author-id probe, then set APPLE_SUPPORT_AUTHOR_ID in hiver-support-agent/.env.",
    commands: [
      "python scripts/find_author_ids.py",
      "# then in hiver-support-agent/.env →  APPLE_SUPPORT_AUTHOR_ID=AppleSupport",
    ],
  },
  {
    title: "Build the Phase 1 artifacts",
    detail:
      "Filters AppleSupport conversations and reconstructs customer ↔ support threads into hiver-support-agent/data/processed/.",
    commands: ["python scripts/prepare_data.py"],
  },
  {
    title: "Run the EDA",
    detail:
      "Writes hiver-support-agent/data/processed/eda_summary.json — the file this dashboard reads.",
    commands: ["python scripts/run_eda.py"],
  },
];
