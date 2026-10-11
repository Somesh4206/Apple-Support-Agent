/**
 * Shared types and helpers for the Phase 2 dashboard section.
 *
 * The shape mirrors `hiver-support-agent/evaluation/results/phase2_summary.json`
 * (produced by scripts/build_golden_set.py + scripts/train_baselines.py).
 * Every field is optional: the dashboard must render gracefully when keys are
 * missing ("—" fallback) and must never fabricate numbers.
 */

/* ------------------------------------------------------------------ */
/* Intent taxonomy                                                     */
/* ------------------------------------------------------------------ */

export interface Phase2IntentClass {
  /** machine label, e.g. "software_bug" */
  label?: string;
  /** human name, e.g. "Software / OS bug" */
  name?: string;
  description?: string;
  /** which Phase 1 EDA topic share the class was derived from */
  eda_anchor?: string;
  /** keyword signals that inspired the class (not shown to labellers) */
  signals?: string[];
  escalation_hint?: string;
  /** true = this class usually routes to a human agent */
  typically_escalated?: boolean;
  examples?: string[];
}

/* ------------------------------------------------------------------ */
/* Golden set                                                          */
/* ------------------------------------------------------------------ */

export interface Phase2Labeling {
  method?: string;
  labeler?: string;
  worksheet?: string;
  labels_file?: string;
  validation?: string;
}

export interface Phase2PerClassSplit {
  total?: number;
  train?: number;
  val?: number;
  test?: number;
}

export interface Phase2GoldenSet {
  total?: number;
  sampling_frame?: string;
  sampling_frame_size?: number;
  sampling?: string;
  labeling?: Phase2Labeling;
  /** golden-set example count per class label (software_bug: 128, …) */
  class_counts?: Record<string, number>;
  split_sizes?: {
    train?: number;
    val?: number;
    test?: number;
  };
  split_strategy?: string;
  per_class_splits?: Record<string, Phase2PerClassSplit>;
  date_range?: { start?: string; end?: string };
  period_note?: string;
  isolation_manifest?: string;
}

/* ------------------------------------------------------------------ */
/* Baselines                                                           */
/* ------------------------------------------------------------------ */

export interface Phase2Metrics {
  accuracy?: number;
  macro_f1?: number;
  weighted_f1?: number;
}

export interface Phase2KeywordBaseline {
  description?: string;
  test?: Phase2Metrics;
}

export interface Phase2MajorityBaseline {
  description?: string;
  test?: Phase2Metrics;
}

export interface Phase2SelectedHyperparameters {
  C?: number;
  class_weight?: string;
  min_df?: number;
}

export interface Phase2CvOnTrain {
  folds?: number;
  folds_attempted?: number;
  fold_count_reduced?: boolean;
  macro_f1_mean?: number;
  macro_f1_std?: number;
  fold_scores?: number[];
}

export interface Phase2PerClassTest {
  label?: string;
  precision?: number;
  recall?: number;
  f1?: number;
  support?: number;
}

export interface Phase2ConfusionMatrix {
  /** class labels in row/column order (true label = row) */
  labels?: string[];
  /** matrix[trueIndex][predictedIndex] */
  matrix?: number[][];
}

export interface Phase2TfidfBaseline {
  description?: string;
  selected_hyperparameters?: Phase2SelectedHyperparameters;
  selection_criterion?: string;
  cv_on_train?: Phase2CvOnTrain;
  val?: Phase2Metrics;
  test?: Phase2Metrics;
  per_class_test?: Phase2PerClassTest[];
  confusion_matrix_test?: Phase2ConfusionMatrix;
}

export interface Phase2DeltasTest {
  logreg_vs_majority_accuracy?: number;
  logreg_vs_majority_macro_f1?: number;
  logreg_vs_keywords_accuracy?: number;
  logreg_vs_keywords_macro_f1?: number;
}

export interface Phase2Baselines {
  keyword_rules?: Phase2KeywordBaseline;
  majority?: Phase2MajorityBaseline;
  tfidf_logreg?: Phase2TfidfBaseline;
  deltas_test?: Phase2DeltasTest;
}

/* ------------------------------------------------------------------ */
/* Top-level summary + API contract                                    */
/* ------------------------------------------------------------------ */

/** Shape of hiver-support-agent/evaluation/results/phase2_summary.json */
export interface Phase2Summary {
  phase?: number;
  generated_at?: string;
  random_seed?: number;
  taxonomy?: Phase2IntentClass[];
  golden_set?: Phase2GoldenSet;
  baselines?: Phase2Baselines;
  /** paths relative to hiver-support-agent/ */
  artifacts?: string[];
}

/** Response contract of GET /api/phase2/status */
export interface Phase2StatusResponse {
  ok: boolean;
  status: "READY" | "NOT_RUN" | (string & Record<never, never>);
  data?: Phase2Summary;
  message?: string;
}

/* ------------------------------------------------------------------ */
/* Formatting helpers                                                  */
/* ------------------------------------------------------------------ */

/** 0.4828 -> "0.4828"; 0.08 -> "0.08"; missing/invalid -> "—" */
export function formatScore(
  value: number | null | undefined,
  digits = 4,
): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "—";
  }
  return String(Number(value.toFixed(digits)));
}

/** -0.0345 -> "-0.0345"; +0.1379 -> "+0.1379"; missing/invalid -> "—" */
export function formatSignedDelta(
  value: number | null | undefined,
  digits = 4,
): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "—";
  }
  const rounded = Number(value.toFixed(digits));
  return rounded > 0 ? `+${rounded}` : String(rounded);
}

/**
 * Example message shown on a taxonomy card. The Phase 2 summary writer
 * serialized single-string example tuples element-wise, so a one-example
 * class arrives as an array of single characters (["A","r","e",…]) — rejoin
 * those; otherwise take the first example. Missing -> "".
 */
export function taxonomyExample(examples: string[] | undefined): string {
  if (!examples || examples.length === 0) {
    return "";
  }
  const charSplit =
    examples.length > 3 && examples.every((example) => example.length <= 2);
  return charSplit ? examples.join("") : (examples[0] ?? "");
}

/** "general_complaint" -> "general_com…" (mobile table headers, title keeps the full label) */
export function shortLabel(label: string, max = 12): string {
  return label.length > max ? `${label.slice(0, Math.max(max - 1, 1))}…` : label;
}

/* ------------------------------------------------------------------ */
/* Static content (Phase 2 setup guidance for the NOT_RUN state)       */
/* ------------------------------------------------------------------ */

export interface Phase2SetupStep {
  title: string;
  detail: string;
  commands?: string[];
}

/** Guidance shown when /api/phase2/status reports NOT_RUN. */
export const PHASE2_SETUP_STEPS: Phase2SetupStep[] = [
  {
    title: "Draw the sampling frame",
    detail:
      "Inside hiver-support-agent/, sample 200 conversation openers deterministically (seed 42) and write the labelling worksheet. Requires the Phase 1 outputs (scripts/prepare_data.py).",
    commands: ["python scripts/build_golden_set.py sample"],
  },
  {
    title: "Label the worksheet by meaning",
    detail:
      "Every row of evaluation/labeling_worksheet.jsonl is read and labelled manually — the worksheet shows no keyword hints, so labels are not biased toward the Phase 1 keyword topics.",
  },
  {
    title: "Build the golden set",
    detail:
      "Validates the labels (every row labelled exactly once, labels restricted to taxonomy classes, no unknown ids — exits non-zero on failure) and writes the conversation-level stratified 70/15/15 split.",
    commands: ["python scripts/build_golden_set.py build"],
  },
  {
    title: "Measure the baselines",
    detail:
      "Trains keyword rules, majority and TF-IDF + LogReg (hyperparameters via 5-fold CV on train), evaluates on the untouched test split and writes evaluation/results/phase2_summary.json — the file this dashboard reads.",
    commands: ["python scripts/train_baselines.py"],
  },
];
