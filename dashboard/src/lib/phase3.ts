/**
 * Shared types and helpers for the Phase 3 dashboard section.
 *
 * The shape mirrors `hiver-support-agent/evaluation/results/phase3_summary.json`
 * (produced by scripts/train_embedding_classifier.py). Every field is
 * optional: the dashboard must render gracefully when keys are missing
 * ("—" fallback) and must never fabricate numbers.
 *
 * Metric formatters (formatScore / formatSignedDelta / shortLabel) are
 * imported from @/lib/phase2 — they are already exported there and shared by
 * both sections, so the two panels can never drift in formatting.
 */

/* ------------------------------------------------------------------ */
/* Embedding model                                                     */
/* ------------------------------------------------------------------ */

export interface Phase3EmbeddingModel {
  /** e.g. "sentence-transformers/all-MiniLM-L6-v2" */
  id?: string;
  /** embedding dimensionality, e.g. 384 */
  dim?: number;
  /** e.g. "22.3M (frozen; only the head is trained)" */
  parameters?: string;
  /** pre-training corpus note, e.g. "external public corpus …" */
  trained_on?: string;
  /** e.g. "CPU, float32" */
  runtime?: string;
  /** seconds to embed the full golden set (0 = embedding cache hit) */
  embedding_seconds_for_golden_set?: number;
}

/* ------------------------------------------------------------------ */
/* Metrics + per-class reports                                         */
/* ------------------------------------------------------------------ */

export interface Phase3Metrics {
  accuracy?: number;
  macro_f1?: number;
  weighted_f1?: number;
}

export interface Phase3PerClassRow {
  label?: string;
  precision?: number;
  recall?: number;
  f1?: number;
  support?: number;
}

export interface Phase3ConfusionMatrix {
  /** class labels in row/column order (true label = row) */
  labels?: string[];
  /** matrix[trueIndex][predictedIndex] */
  matrix?: number[][];
}

/* ------------------------------------------------------------------ */
/* Classifier heads                                                    */
/* ------------------------------------------------------------------ */

export interface Phase3SelectedHyperparameters {
  C?: number;
  class_weight?: string;
}

/** One candidate of the logreg_head 5-fold CV selection grid. */
export interface Phase3GridCandidate {
  C?: number;
  /** null = class_weight None (unweighted) */
  class_weight?: string | null;
  cv_train_accuracy?: number;
  cv_train_macro_f1?: number;
  cv_train_mean_score?: number;
}

export interface Phase3LogregHead {
  description?: string;
  selected_hyperparameters?: Phase3SelectedHyperparameters;
  selection_criterion?: string;
  selection_grid?: Phase3GridCandidate[];
  val?: Phase3Metrics;
  test?: Phase3Metrics;
  per_class_test?: Phase3PerClassRow[];
  confusion_matrix_test?: Phase3ConfusionMatrix;
}

export interface Phase3PrototypeHead {
  description?: string;
  val?: Phase3Metrics;
  test?: Phase3Metrics;
  per_class_test?: Phase3PerClassRow[];
  confusion_matrix_test?: Phase3ConfusionMatrix;
}

export interface Phase3Heads {
  logreg_head?: Phase3LogregHead;
  prototype?: Phase3PrototypeHead;
}

/* ------------------------------------------------------------------ */
/* Five-model comparison (same golden test split as Phase 2)            */
/* ------------------------------------------------------------------ */

export interface Phase3ComparisonEntry {
  accuracy?: number;
  macro_f1?: number;
  weighted_f1?: number;
  classes_evaluated?: string[];
  per_class?: Phase3PerClassRow[];
  confusion_matrix?: Phase3ConfusionMatrix;
}

export interface Phase3ComparisonTest {
  keyword_rules?: Phase3ComparisonEntry;
  majority?: Phase3ComparisonEntry;
  tfidf_logreg?: Phase3ComparisonEntry;
  logreg_head?: Phase3ComparisonEntry;
  prototype?: Phase3ComparisonEntry;
}

/* ------------------------------------------------------------------ */
/* Deltas, oversampling note, confidence preview, errors               */
/* ------------------------------------------------------------------ */

export interface Phase3DeltaPair {
  accuracy?: number;
  macro_f1?: number;
}

export interface Phase3DeltasTest {
  logreg_head_vs_tfidf_logreg?: Phase3DeltaPair;
  logreg_head_vs_majority?: Phase3DeltaPair;
  logreg_head_vs_keywords?: Phase3DeltaPair;
  prototype_vs_majority?: Phase3DeltaPair;
}

export interface Phase3OversamplingNote {
  question?: string;
  best_unweighted_cv?: Phase3GridCandidate;
  best_balanced_cv?: Phase3GridCandidate;
  verdict?: string;
}

export interface Phase3ConfidencePreview {
  threshold?: number;
  note?: string;
  mean_confidence_correct?: number;
  mean_confidence_wrong?: number;
  share_above_threshold?: number;
  accuracy_above_threshold?: number;
}

export interface Phase3TestError {
  conversation_id?: string;
  text?: string;
  true_label?: string;
  predicted_label?: string;
  confidence?: number;
  runner_up?: string;
  runner_up_confidence?: number;
}

export interface Phase3ErrorAnalysis {
  n_test?: number;
  n_errors?: number;
  errors?: Phase3TestError[];
}

/* ------------------------------------------------------------------ */
/* Top-level summary + API contract                                    */
/* ------------------------------------------------------------------ */

/** Shape of hiver-support-agent/evaluation/results/phase3_summary.json */
export interface Phase3Summary {
  phase?: number;
  generated_at?: string;
  random_seed?: number;
  embedding_model?: Phase3EmbeddingModel;
  protocol?: string;
  heads?: Phase3Heads;
  comparison_test?: Phase3ComparisonTest;
  deltas_test?: Phase3DeltasTest;
  oversampling_note?: Phase3OversamplingNote;
  confidence_preview_test?: Phase3ConfidencePreview;
  error_analysis_test?: Phase3ErrorAnalysis;
  /** paths relative to hiver-support-agent/ */
  artifacts?: string[];
}

/** Response contract of GET /api/phase3/status */
export interface Phase3StatusResponse {
  ok: boolean;
  status: "READY" | "NOT_RUN" | (string & Record<never, never>);
  data?: Phase3Summary;
  message?: string;
}

/* ------------------------------------------------------------------ */
/* Display constants                                                   */
/* ------------------------------------------------------------------ */

/** The two Phase 3 heads, in toggle/display order. */
export type Phase3HeadKey = "logreg_head" | "prototype";

export const HEAD_ORDER: Phase3HeadKey[] = ["logreg_head", "prototype"];

/** Short display names for the two heads (used in tabs + narration). */
export const HEAD_LABELS: Record<Phase3HeadKey, string> = {
  logreg_head: "LogReg head",
  prototype: "Prototype head",
};

/** The five comparison models, in chart x-axis order (Phase 2 → Phase 3). */
export type Phase3ComparisonKey =
  | "keyword_rules"
  | "majority"
  | "tfidf_logreg"
  | "logreg_head"
  | "prototype";

export const COMPARISON_ORDER: Phase3ComparisonKey[] = [
  "keyword_rules",
  "majority",
  "tfidf_logreg",
  "logreg_head",
  "prototype",
];

/** Full display names for the five comparison models. */
export const COMPARISON_LABELS: Record<Phase3ComparisonKey, string> = {
  keyword_rules: "Keyword rules",
  majority: "Majority class",
  tfidf_logreg: "TF-IDF + LogReg",
  logreg_head: "MiniLM + LogReg head",
  prototype: "MiniLM prototype head",
};

/** Compact x-axis tick labels for the comparison chart. */
export const COMPARISON_TICKS: Record<Phase3ComparisonKey, string> = {
  keyword_rules: "Keyword",
  majority: "Majority",
  tfidf_logreg: "TF-IDF",
  logreg_head: "MiniLM+LR",
  prototype: "Prototype",
};

/** The two models introduced in Phase 3 (styled to stand out in the chart). */
export const PHASE3_COMPARISON_KEYS: Phase3ComparisonKey[] = [
  "logreg_head",
  "prototype",
];

/* ------------------------------------------------------------------ */
/* Static content (Phase 3 setup guidance for the NOT_RUN state)       */
/* ------------------------------------------------------------------ */

export interface Phase3SetupStep {
  title: string;
  detail: string;
  commands?: string[];
}

/** Guidance shown when /api/phase3/status reports NOT_RUN. */
export const PHASE3_SETUP_STEPS: Phase3SetupStep[] = [
  {
    title: "Install the Phase 3 dependencies",
    detail:
      "Inside hiver-support-agent/, install the pinned requirements — this adds sentence-transformers, which ships the frozen all-MiniLM-L6-v2 encoder used as the feature extractor.",
    commands: ["pip install -r requirements.txt"],
  },
  {
    title: "Check that Phase 2 exists",
    detail:
      "Phase 3 is evaluated on the exact same golden set and 70/15/15 split as Phase 2, so evaluation/golden_set.csv and the split must already exist (scripts/build_golden_set.py, see the Phase 2 panel above).",
  },
  {
    title: "Train the embedding classifier",
    detail:
      "Embeds the golden set (cached under models/embedding_cache/), fits the LogReg head (hyperparameters selected by the same 5-fold CV-on-train protocol as Phase 2) and the zero-hyperparameter prototype head, evaluates both on the untouched test split against the three Phase 2 baselines, and writes evaluation/results/phase3_summary.json — the file this dashboard reads.",
    commands: ["python scripts/train_embedding_classifier.py"],
  },
];
