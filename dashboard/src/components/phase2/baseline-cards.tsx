import {
  CheckCircle2,
  Crown,
  FlaskConical,
  Lightbulb,
  Regex,
  Sigma,
  Sparkles,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SubsectionHeading } from "@/components/phase2/subsection-heading";
import { formatInt, orDash } from "@/lib/phase1";
import {
  formatScore,
  formatSignedDelta,
  type Phase2Metrics,
  type Phase2Summary,
  type Phase2TfidfBaseline,
} from "@/lib/phase2";
import { cn } from "@/lib/utils";

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/**
 * Subsection C — the three measured baselines (keyword rules / majority /
 * TF-IDF + LogReg) with test metrics as big numbers, the learned model's
 * hyperparameter + CV + validation detail, and an honest plain-language
 * reading of the result.
 */
export function BaselineCards({ summary }: { summary: Phase2Summary }) {
  const baselines = summary.baselines;
  const keyword = baselines?.keyword_rules;
  const majority = baselines?.majority;
  const tfidf = baselines?.tfidf_logreg;

  const accuracyValues = [
    keyword?.test?.accuracy,
    majority?.test?.accuracy,
    tfidf?.test?.accuracy,
  ].filter(isFiniteNumber);
  const macroValues = [
    keyword?.test?.macro_f1,
    majority?.test?.macro_f1,
    tfidf?.test?.macro_f1,
  ].filter(isFiniteNumber);
  const weightedValues = [
    keyword?.test?.weighted_f1,
    majority?.test?.weighted_f1,
    tfidf?.test?.weighted_f1,
  ].filter(isFiniteNumber);
  const bestAccuracy =
    accuracyValues.length > 0 ? Math.max(...accuracyValues) : undefined;
  const bestMacro =
    macroValues.length > 0 ? Math.max(...macroValues) : undefined;
  const bestWeighted =
    weightedValues.length > 0 ? Math.max(...weightedValues) : undefined;

  if (!keyword && !majority && !tfidf) {
    return (
      <section aria-labelledby="phase2-baselines-heading" className="space-y-4">
        <SubsectionHeading
          id="phase2-baselines-heading"
          icon={FlaskConical}
          title="Baselines"
          description="Three measured baselines on the untouched test split."
        />
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No baseline results available.
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="phase2-baselines-heading" className="space-y-4">
      <SubsectionHeading
        id="phase2-baselines-heading"
        icon={FlaskConical}
        title="Baselines"
        description="Three baselines measured on the untouched 29-example test split. “Best” marks the winning model per metric — computed from the data below, not asserted."
      />
      <div className="grid gap-4 md:grid-cols-2">
        {keyword ? (
          <CompactModelCard
            icon={Regex}
            title="Keyword rules"
            badgeText={
              keyword.test?.macro_f1 === bestMacro ? "best macro-F1" : undefined
            }
            description={keyword.description}
            test={keyword.test}
            bestAccuracy={bestAccuracy}
            bestMacro={bestMacro}
            bestWeighted={bestWeighted}
          />
        ) : null}
        {majority ? (
          <CompactModelCard
            icon={Crown}
            title="Majority class"
            badgeText={
              majority.test?.accuracy === bestAccuracy
                ? "best test accuracy"
                : undefined
            }
            description={majority.description}
            test={majority.test}
            bestAccuracy={bestAccuracy}
            bestMacro={bestMacro}
            bestWeighted={bestWeighted}
          />
        ) : null}
        {tfidf ? (
          <TfidfModelCard
            model={tfidf}
            valCount={summary.golden_set?.split_sizes?.val}
            bestAccuracy={bestAccuracy}
            bestMacro={bestMacro}
            bestWeighted={bestWeighted}
          />
        ) : null}
        <WhatThisMeansCard summary={summary} />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Metric blocks                                                       */
/* ------------------------------------------------------------------ */

function MetricBlock({
  label,
  value,
  best,
  sub,
}: {
  label: string;
  value: number | undefined;
  best: boolean;
  sub?: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-zinc-100 bg-zinc-50/60 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
      <div className="flex flex-wrap items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        <span className="truncate">{label}</span>
        {best ? (
          <span className="inline-flex items-center gap-0.5 rounded-full border border-emerald-300 bg-emerald-100 px-1.5 py-px text-[9px] font-semibold normal-case tracking-normal text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
            <CheckCircle2 className="size-2.5" aria-hidden="true" />
            best
          </span>
        ) : null}
      </div>
      <p
        className={cn(
          "mt-1 truncate text-lg font-bold tabular-nums sm:text-xl",
          best
            ? "text-emerald-700 dark:text-emerald-300"
            : "text-zinc-900 dark:text-zinc-100",
        )}
      >
        {formatScore(value)}
      </p>
      {sub ? (
        <p className="mt-0.5 text-[10px] leading-relaxed text-zinc-500 dark:text-zinc-400">
          {sub}
        </p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Keyword rules + majority cards                                      */
/* ------------------------------------------------------------------ */

function CompactModelCard({
  icon: Icon,
  title,
  badgeText,
  description,
  test,
  bestAccuracy,
  bestMacro,
  bestWeighted,
}: {
  icon: typeof Regex;
  title: string;
  badgeText?: string;
  description?: string;
  test?: Phase2Metrics;
  bestAccuracy?: number;
  bestMacro?: number;
  bestWeighted?: number;
}) {
  return (
    <Card className="h-full gap-0 p-4 transition-all duration-200 hover:shadow-md motion-safe:hover:-translate-y-0.5 dark:hover:shadow-emerald-500/10">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100/80 text-emerald-700 ring-1 ring-emerald-200/60 dark:bg-emerald-900/40 dark:text-emerald-300 dark:ring-emerald-800/60"
            aria-hidden="true"
          >
            <Icon className="size-4" />
          </span>
          <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {title}
          </h4>
        </div>
        {badgeText ? (
          <Badge className="shrink-0 border border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
            {badgeText}
          </Badge>
        ) : null}
      </div>
      {description ? (
        <p className="mt-2.5 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
          {description}
        </p>
      ) : null}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <MetricBlock
          label="Test accuracy"
          value={test?.accuracy}
          best={isFiniteNumber(test?.accuracy) && test?.accuracy === bestAccuracy}
        />
        <MetricBlock
          label="Macro-F1"
          value={test?.macro_f1}
          best={isFiniteNumber(test?.macro_f1) && test?.macro_f1 === bestMacro}
        />
        <MetricBlock
          label="Weighted-F1"
          value={test?.weighted_f1}
          best={
            isFiniteNumber(test?.weighted_f1) &&
            test?.weighted_f1 === bestWeighted
          }
        />
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* TF-IDF + LogReg card (detailed)                                     */
/* ------------------------------------------------------------------ */

function TfidfModelCard({
  model,
  valCount,
  bestAccuracy,
  bestMacro,
  bestWeighted,
}: {
  model: Phase2TfidfBaseline;
  /** held-out validation size, from golden_set.split_sizes.val */
  valCount?: number;
  bestAccuracy?: number;
  bestMacro?: number;
  bestWeighted?: number;
}) {
  const hyper = model.selected_hyperparameters;
  const cv = model.cv_on_train;
  const foldScores = cv?.fold_scores ?? [];
  const foldsRan =
    typeof cv?.folds === "number" && typeof cv?.folds_attempted === "number"
      ? `${cv.folds}/${cv.folds_attempted} folds ran`
      : undefined;

  return (
    <Card className="h-full gap-0 md:col-span-2">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2.5 text-sm">
          <span
            className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100/80 text-emerald-700 ring-1 ring-emerald-200/60 dark:bg-emerald-900/40 dark:text-emerald-300 dark:ring-emerald-800/60"
            aria-hidden="true"
          >
            <Sigma className="size-4" />
          </span>
          TF-IDF + Logistic Regression
          <span className="text-xs font-normal text-zinc-500 dark:text-zinc-400">
            the learned baseline
          </span>
        </CardTitle>
        <CardDescription className="text-xs">
          {orDash(model.description)}
        </CardDescription>
      </CardHeader>
      <CardContent className="mt-4 space-y-4">
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <MetricBlock
            label="Test accuracy"
            value={model.test?.accuracy}
            best={
              isFiniteNumber(model.test?.accuracy) &&
              model.test?.accuracy === bestAccuracy
            }
          />
          <MetricBlock
            label="Macro-F1"
            value={model.test?.macro_f1}
            best={
              isFiniteNumber(model.test?.macro_f1) &&
              model.test?.macro_f1 === bestMacro
            }
          />
          <MetricBlock
            label="Weighted-F1"
            value={model.test?.weighted_f1}
            best={
              isFiniteNumber(model.test?.weighted_f1) &&
              model.test?.weighted_f1 === bestWeighted
            }
          />
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          {/* selected hyperparameters */}
          <div className="min-w-0 rounded-lg border border-zinc-100 bg-zinc-50/60 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
            <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Selected hyperparameters
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[
                typeof hyper?.C === "number" ? `C = ${hyper.C.toFixed(1)}` : null,
                hyper?.class_weight
                  ? `class_weight = ${hyper.class_weight}`
                  : null,
                typeof hyper?.min_df === "number" ? `min_df = ${hyper.min_df}` : null,
              ]
                .filter((chip): chip is string => chip !== null)
                .map((chip) => (
                  <code
                    key={chip}
                    className="rounded-md bg-zinc-100 px-2 py-1 font-mono text-[11px] text-zinc-700 ring-1 ring-zinc-200/70 dark:bg-zinc-900 dark:text-zinc-300 dark:ring-zinc-800"
                  >
                    {chip}
                  </code>
                ))}
            </div>
            <p className="mt-2.5 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
              {orDash(model.selection_criterion)}
            </p>
          </div>

          {/* CV on train */}
          <div className="min-w-0 rounded-lg border border-zinc-100 bg-zinc-50/60 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
            <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              {formatInt(cv?.folds)}-fold CV on train — macro-F1
            </p>
            <p className="mt-1 text-lg font-bold tabular-nums text-zinc-900 dark:text-zinc-100 sm:text-xl">
              {formatScore(cv?.macro_f1_mean)}
              <span className="ml-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                ± {formatScore(cv?.macro_f1_std)}
              </span>
            </p>
            {foldsRan ? (
              <p className="mt-0.5 text-[10px] text-zinc-500 dark:text-zinc-400">
                {foldsRan}
                {cv?.fold_count_reduced === false
                  ? " · fold count not reduced"
                  : ""}
              </p>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {foldScores.map((score, index) => (
                <code
                  key={index}
                  className="rounded-md bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-zinc-600 ring-1 ring-zinc-200/70 dark:bg-zinc-900 dark:text-zinc-300 dark:ring-zinc-800"
                  title={`Fold ${index + 1} macro-F1`}
                >
                  F{index + 1} {formatScore(score)}
                </code>
              ))}
            </div>
          </div>

          {/* validation */}
          <div className="min-w-0 rounded-lg border border-zinc-100 bg-zinc-50/60 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
            <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Validation — held-out sanity check
            </p>
            <div className="mt-1.5 space-y-1">
              <CompactStatRow label="Accuracy" value={formatScore(model.val?.accuracy)} />
              <CompactStatRow label="Macro-F1" value={formatScore(model.val?.macro_f1)} />
              <CompactStatRow label="Weighted-F1" value={formatScore(model.val?.weighted_f1)} />
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
              n = {formatInt(valCount)} examples; too small for stable tuning,
              so it is kept untouched as a sanity check.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CompactStatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-zinc-100 pb-1 last:border-b-0 last:pb-0 dark:border-zinc-800">
      <span className="text-xs text-zinc-600 dark:text-zinc-400">{label}</span>
      <span className="font-mono text-xs font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
        {value}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Plain-language reading                                              */
/* ------------------------------------------------------------------ */

function WhatThisMeansCard({ summary }: { summary: Phase2Summary }) {
  const golden = summary.golden_set;
  const baselines = summary.baselines;
  const keyword = baselines?.keyword_rules;
  const majority = baselines?.majority;
  const tfidf = baselines?.tfidf_logreg;
  const confusion = tfidf?.confusion_matrix_test;
  const matrix = confusion?.matrix ?? [];

  /* Story numbers computed from the artifact (never hardcoded). */
  const goldenTotal = golden?.total;
  const softwareBugCount = golden?.class_counts?.["software_bug"];
  const softwareBugShare =
    goldenTotal && softwareBugCount
      ? `${((softwareBugCount / goldenTotal) * 100).toFixed(0)}%`
      : undefined;
  const softwareBugTrain = golden?.per_class_splits?.["software_bug"]?.train;
  const softwareBugTest = golden?.per_class_splits?.["software_bug"]?.test;
  const trainTotal = golden?.split_sizes?.train;
  const testTotal = matrix.reduce(
    (sum, row) => sum + row.reduce((rowSum, cell) => rowSum + cell, 0),
    0,
  );
  const predictedMajority = matrix.reduce(
    (sum, row) => sum + (row[0] ?? 0),
    0,
  );
  const correctTotal = matrix.reduce(
    (sum, row, index) => sum + (row[index] ?? 0),
    0,
  );
  const deltas = baselines?.deltas_test;

  return (
    <Card className="h-full gap-0 border-amber-200/80 bg-amber-50/40 md:col-span-2 dark:border-amber-900/60 dark:bg-amber-950/20">
      <CardHeader className="border-b border-amber-200/60 dark:border-amber-900/40">
        <CardTitle className="flex items-center gap-2 text-sm text-zinc-900 dark:text-zinc-100">
          <Lightbulb
            className="size-4 shrink-0 text-amber-500 dark:text-amber-400"
            aria-hidden="true"
          />
          What this means — the honest headline
        </CardTitle>
        <CardDescription className="text-xs">
          At 200 golden examples no learned TF-IDF configuration beats the
          majority baseline on test accuracy, and keyword rules win macro-F1.
          Read plainly, per model:
        </CardDescription>
      </CardHeader>
      <CardContent className="mt-4">
        <ul className="space-y-3.5">
          <li className="flex gap-3">
            <Crown
              className="mt-0.5 size-4 shrink-0 text-amber-500 dark:text-amber-400"
              aria-hidden="true"
            />
            <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
              <span className="font-medium text-zinc-800 dark:text-zinc-200">
                Majority wins accuracy because the data is imbalanced.
              </span>{" "}
              software_bug dominates the golden set —{" "}
              {formatInt(softwareBugCount)} of {formatInt(goldenTotal)}{" "}
              examples ({softwareBugShare ?? "—"}) — so always predicting it is
              right {formatInt(softwareBugTest)} of {formatInt(testTotal)}{" "}
              times on test ({formatScore(majority?.test?.accuracy)}). That
              number is class imbalance, not classification skill.
            </p>
          </li>
          <li className="flex gap-3">
            <Regex
              className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
              aria-hidden="true"
            />
            <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
              <span className="font-medium text-zinc-800 dark:text-zinc-200">
                Keyword rules win macro-F1 because they predict several
                classes.
              </span>{" "}
              Macro-F1 averages F1 over all ten classes, so a one-class
              predictor scores 0 on the other nine — which is exactly what
              happened to majority and the learned baseline (
              {formatScore(majority?.test?.macro_f1)} and{" "}
              {formatScore(tfidf?.test?.macro_f1)}, against{" "}
              {formatScore(keyword?.test?.macro_f1)} for the rules).
            </p>
          </li>
          <li className="flex gap-3">
            <Sigma
              className="mt-0.5 size-4 shrink-0 text-zinc-500 dark:text-zinc-400"
              aria-hidden="true"
            />
            <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
              <span className="font-medium text-zinc-800 dark:text-zinc-200">
                The learned baseline collapses to the majority class at this
                data size.
              </span>{" "}
              With {formatInt(trainTotal)} training examples (
              {formatInt(softwareBugTrain)} of them software_bug), the model
              predicted software_bug for {formatInt(predictedMajority)} of{" "}
              {formatInt(testTotal)} test messages — {formatInt(correctTotal)}{" "}
              of them correctly; see the confusion matrix below. CV on train
              already averaged only{" "}
              {formatScore(tfidf?.cv_on_train?.macro_f1_mean)} ±{" "}
              {formatScore(tfidf?.cv_on_train?.macro_f1_std)} macro-F1.
            </p>
          </li>
          <li className="flex gap-3">
            <Sparkles
              className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
              aria-hidden="true"
            />
            <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
              <span className="font-medium text-zinc-800 dark:text-zinc-200">
                This is the measured motivation for Phase 3.
              </span>{" "}
              At 200 golden examples the learned baseline trails majority on
              test accuracy (
              {formatSignedDelta(deltas?.logreg_vs_majority_accuracy)}) and
              trails keyword rules on macro-F1 (
              {formatSignedDelta(deltas?.logreg_vs_keywords_macro_f1)}).
              Sparse bag-of-words features cannot separate classes that share
              vocabulary at this sample size; Phase 3 replaces them with dense
              sentence embeddings, evaluated against these same baselines on
              this same golden set.
            </p>
          </li>
        </ul>

        <div className="mt-4 grid gap-2 rounded-lg border border-zinc-200/80 bg-white/60 p-3 dark:border-zinc-800 dark:bg-zinc-900/60 sm:grid-cols-2">
          <DeltaRow
            label="Δ test accuracy · logreg − majority"
            value={deltas?.logreg_vs_majority_accuracy}
          />
          <DeltaRow
            label="Δ test macro-F1 · logreg − majority"
            value={deltas?.logreg_vs_majority_macro_f1}
          />
          <DeltaRow
            label="Δ test accuracy · logreg − keywords"
            value={deltas?.logreg_vs_keywords_accuracy}
          />
          <DeltaRow
            label="Δ test macro-F1 · logreg − keywords"
            value={deltas?.logreg_vs_keywords_macro_f1}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function DeltaRow({
  label,
  value,
}: {
  label: string;
  value: number | undefined;
}) {
  const negative =
    typeof value === "number" && Number.isFinite(value) && value < 0;
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
        {label}
      </span>
      <span
        className={cn(
          "font-mono text-xs font-semibold tabular-nums",
          negative
            ? "text-rose-600 dark:text-rose-400"
            : "text-emerald-700 dark:text-emerald-300",
        )}
      >
        {formatSignedDelta(value)}
      </span>
    </div>
  );
}
