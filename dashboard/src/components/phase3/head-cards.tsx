import { CheckCircle2, Scale, Sigma, Target } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SubsectionHeading } from "@/components/phase2/subsection-heading";
import { orDash } from "@/lib/phase1";
import { formatScore } from "@/lib/phase2";
import {
  COMPARISON_ORDER,
  type Phase3ComparisonTest,
  type Phase3GridCandidate,
  type Phase3Heads,
  type Phase3Metrics,
} from "@/lib/phase3";
import { cn } from "@/lib/utils";

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

interface HeadCardsProps {
  heads: Phase3Heads;
  comparison: Phase3ComparisonTest;
}

/**
 * Subsection C — the two Phase 3 heads. The LogReg card shows the full CV
 * selection grid (measurement, not assumption); the prototype card is honest
 * about having zero hyperparameters. Neither card claims an overall win the
 * data does not support.
 */
export function HeadCards({ heads, comparison }: HeadCardsProps) {
  const logreg = heads.logreg_head;
  const prototype = heads.prototype;

  /* "Best" markers computed across ALL five models (keyword rules included). */
  const bestAccuracy = bestOf(comparison, "accuracy");
  const bestMacro = bestOf(comparison, "macro_f1");
  const bestWeighted = bestOf(comparison, "weighted_f1");
  /* Best macro-F1 among learned models only (rules are hand-written, not
     learned) — the prototype's honest claim to fame. */
  const learnedMacro = bestOfLearned(comparison, "macro_f1");

  const logregTest = logreg?.test;
  const protoTest = prototype?.test;

  return (
    <section aria-labelledby="phase3-heads-heading" className="space-y-4">
      <SubsectionHeading
        id="phase3-heads-heading"
        icon={Sigma}
        title="The two heads"
        description="Both heads fit on the train split only, on top of the same frozen embeddings. The honest result: neither dominates — the LogReg head wins accuracy and weighted-F1, the prototype head wins macro-F1."
      />

      <div className="grid gap-4 md:grid-cols-2">
        {logreg ? (
          <LogregHeadCard
            head={logreg}
            test={logregTest}
            val={logreg.val}
            bestAccuracy={bestAccuracy}
            bestMacro={bestMacro}
            bestWeighted={bestWeighted}
          />
        ) : null}

        {prototype ? (
          <PrototypeHeadCard
            head={prototype}
            test={protoTest}
            val={prototype.val}
            bestAccuracy={bestAccuracy}
            bestMacro={bestMacro}
            bestWeighted={bestWeighted}
            bestLearnedMacro={learnedMacro}
          />
        ) : null}
      </div>

      {logregTest && protoTest ? (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-200/80 bg-amber-50/40 px-3 py-2.5 text-xs leading-relaxed text-zinc-600 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-zinc-400">
          <Scale
            className="mt-0.5 size-4 shrink-0 text-amber-500 dark:text-amber-400"
            aria-hidden="true"
          />
          <p>
            <span className="font-medium text-zinc-800 dark:text-zinc-200">
              Neither head dominates.
            </span>{" "}
            The LogReg head wins accuracy (
            <span className="font-mono tabular-nums">
              {formatScore(logregTest.accuracy)}
            </span>
            ) and weighted-F1 (
            <span className="font-mono tabular-nums">
              {formatScore(logregTest.weighted_f1)}
            </span>
            ); the prototype head wins macro-F1 (
            <span className="font-mono tabular-nums">
              {formatScore(protoTest.macro_f1)}
            </span>
            ) with zero hyperparameters. Both are far above the learned
            Phase 2 baseline&apos;s macro-F1 — the embedding, not the head,
            is what fixed the collapse.
          </p>
        </div>
      ) : null}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Metric block (local sibling of phase2's MetricBlock)                 */
/* ------------------------------------------------------------------ */

function MetricBlock({
  label,
  value,
  badge,
}: {
  label: string;
  value: number | undefined;
  /** text of the emerald "best" chip, if this metric is a winner */
  badge?: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-zinc-100 bg-zinc-50/60 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
      <div className="flex flex-wrap items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        <span className="truncate">{label}</span>
        {badge ? (
          <span className="inline-flex items-center gap-0.5 rounded-full border border-emerald-300 bg-emerald-100 px-1.5 py-px text-[9px] font-semibold normal-case tracking-normal text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
            <CheckCircle2 className="size-2.5" aria-hidden="true" />
            {badge}
          </span>
        ) : null}
      </div>
      <p
        className={cn(
          "mt-1 truncate text-lg font-bold tabular-nums sm:text-xl",
          badge
            ? "text-emerald-700 dark:text-emerald-300"
            : "text-zinc-900 dark:text-zinc-100",
        )}
      >
        {formatScore(value)}
      </p>
    </div>
  );
}

function ValRows({ val }: { val: Phase3Metrics | undefined }) {
  return (
    <div className="min-w-0 rounded-lg border border-zinc-100 bg-zinc-50/60 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
      <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Validation — held-out sanity check
      </p>
      <div className="mt-1.5 space-y-1">
        <StatRow label="Accuracy" value={formatScore(val?.accuracy)} />
        <StatRow label="Macro-F1" value={formatScore(val?.macro_f1)} />
        <StatRow label="Weighted-F1" value={formatScore(val?.weighted_f1)} />
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
        n = 29; too small for tuning, so it is kept untouched as a sanity
        check.
      </p>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
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
/* LogReg head card                                                     */
/* ------------------------------------------------------------------ */

interface HeadCardProps {
  test: Phase3Metrics | undefined;
  val: Phase3Metrics | undefined;
  bestAccuracy?: number;
  bestMacro?: number;
  bestWeighted?: number;
}

function LogregHeadCard({
  head,
  test,
  val,
  bestAccuracy,
  bestMacro,
  bestWeighted,
}: HeadCardProps & { head: NonNullable<Phase3Heads["logreg_head"]> }) {
  const hyper = head.selected_hyperparameters;
  const grid = head.selection_grid ?? [];
  const selectedC = hyper?.C;
  const selectedWeight = hyper?.class_weight;

  return (
    <Card className="h-full min-w-0 gap-0">      {/* min-w-0: grid item must be able to shrink below content min-width
        (round-8 lesson); the CV table then scrolls inside overflow-x-auto */}
      <CardHeader className="min-w-0 border-b">
        <CardTitle className="flex flex-wrap items-center gap-2.5 text-sm">
          <span
            className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100/80 text-emerald-700 ring-1 ring-emerald-200/60 dark:bg-emerald-900/40 dark:text-emerald-300 dark:ring-emerald-800/60"
            aria-hidden="true"
          >
            <Sigma className="size-4" />
          </span>
          LogReg head
          <span className="text-xs font-normal text-zinc-500 dark:text-zinc-400">
            MiniLM embeddings + logistic regression
          </span>
          <Badge className="ml-auto shrink-0 border border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
            {isFiniteNumber(selectedC) ? `C = ${selectedC.toFixed(1)}` : "—"}
            {selectedWeight ? ` · ${selectedWeight}` : ""}
          </Badge>
        </CardTitle>
        <CardDescription className="text-xs">
          {orDash(head.description)}
        </CardDescription>
      </CardHeader>
      <CardContent className="mt-4 min-w-0 space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <MetricBlock
            label="Test accuracy"
            value={test?.accuracy}
            badge={
              isFiniteNumber(test?.accuracy) && test?.accuracy === bestAccuracy
                ? "best (tied)"
                : undefined
            }
          />
          <MetricBlock
            label="Macro-F1"
            value={test?.macro_f1}
            badge={
              isFiniteNumber(test?.macro_f1) && test?.macro_f1 === bestMacro
                ? "best"
                : undefined
            }
          />
          <MetricBlock
            label="Weighted-F1"
            value={test?.weighted_f1}
            badge={
              isFiniteNumber(test?.weighted_f1) &&
              test?.weighted_f1 === bestWeighted
                ? "best"
                : undefined
            }
          />
        </div>

        <ValRows val={val} />

        {grid.length > 0 ? (
          <div className="min-w-0 rounded-lg border border-zinc-100 dark:border-zinc-800">
            <p className="border-b border-zinc-100 px-3 py-2 text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
              5-fold CV on train — the full selection grid (
              {grid.length} candidates)
            </p>
            <div className="overflow-x-auto">
              <Table className="text-[10px]">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="h-7 px-2 py-1 text-[10px]">C</TableHead>
                    <TableHead className="h-7 px-2 py-1 text-[10px]">
                      class_weight
                    </TableHead>
                    <TableHead className="h-7 px-2 py-1 text-right text-[10px]">
                      CV acc
                    </TableHead>
                    <TableHead className="h-7 px-2 py-1 text-right text-[10px]">
                      CV macro-F1
                    </TableHead>
                    <TableHead className="h-7 px-2 py-1 text-right text-[10px]">
                      CV mean
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {grid.map((candidate, index) => (
                    <GridRow
                      key={`${candidate.C ?? "?"}-${candidate.class_weight ?? "none"}-${index}`}
                      candidate={candidate}
                      selected={
                        candidate.C === selectedC &&
                        (candidate.class_weight ?? null) ===
                          (selectedWeight ?? null)
                      }
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="border-t border-zinc-100 px-3 py-2 text-[11px] leading-relaxed text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
              {orDash(head.selection_criterion)}
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function GridRow({
  candidate,
  selected,
}: {
  candidate: Phase3GridCandidate;
  selected: boolean;
}) {
  return (
    <TableRow
      className={cn(
        "font-mono tabular-nums",
        selected
          ? "bg-emerald-50 font-semibold text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
          : "text-zinc-600 dark:text-zinc-400",
      )}
      aria-label={
        selected
          ? `Selected configuration: C ${candidate.C}, class_weight ${candidate.class_weight ?? "None"}`
          : undefined
      }
    >
      <TableCell className="px-2 py-1">
        {isFiniteNumber(candidate.C) ? candidate.C.toFixed(1) : "—"}
      </TableCell>
      <TableCell className="px-2 py-1">
        {candidate.class_weight ?? "None"}
      </TableCell>
      <TableCell className="px-2 py-1 text-right">
        {formatScore(candidate.cv_train_accuracy)}
      </TableCell>
      <TableCell className="px-2 py-1 text-right">
        {formatScore(candidate.cv_train_macro_f1)}
      </TableCell>
      <TableCell className="px-2 py-1 text-right">
        {formatScore(candidate.cv_train_mean_score)}
      </TableCell>
    </TableRow>
  );
}

/* ------------------------------------------------------------------ */
/* Prototype head card                                                  */
/* ------------------------------------------------------------------ */

function PrototypeHeadCard({
  head,
  test,
  val,
  bestAccuracy,
  bestMacro,
  bestWeighted,
  bestLearnedMacro,
}: HeadCardProps & {
  head: NonNullable<Phase3Heads["prototype"]>;
  bestLearnedMacro?: number;
}) {
  return (
    <Card className="h-full min-w-0 gap-0">      {/* min-w-0: same grid-item shrink fix as the LogReg card */}
      <CardHeader className="min-w-0 border-b">
        <CardTitle className="flex flex-wrap items-center gap-2.5 text-sm">
          <span
            className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100/80 text-emerald-700 ring-1 ring-emerald-200/60 dark:bg-emerald-900/40 dark:text-emerald-300 dark:ring-emerald-800/60"
            aria-hidden="true"
          >
            <Target className="size-4" />
          </span>
          Prototype head
          <span className="text-xs font-normal text-zinc-500 dark:text-zinc-400">
            nearest cosine class centroid
          </span>
          <Badge className="ml-auto shrink-0 border border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
            zero hyperparameters
          </Badge>
        </CardTitle>
        <CardDescription className="text-xs">
          {orDash(head.description)}
        </CardDescription>
      </CardHeader>
      <CardContent className="mt-4 min-w-0 space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <MetricBlock
            label="Test accuracy"
            value={test?.accuracy}
            badge={
              isFiniteNumber(test?.accuracy) && test?.accuracy === bestAccuracy
                ? "best (tied)"
                : undefined
            }
          />
          <MetricBlock
            label="Macro-F1"
            value={test?.macro_f1}
            badge={
              isFiniteNumber(test?.macro_f1) && test?.macro_f1 === bestLearnedMacro
                ? "best of learned"
                : undefined
            }
          />
          <MetricBlock
            label="Weighted-F1"
            value={test?.weighted_f1}
            badge={
              isFiniteNumber(test?.weighted_f1) &&
              test?.weighted_f1 === bestWeighted
                ? "best"
                : undefined
            }
          />
        </div>

        <ValRows val={val} />

        <ul className="space-y-2.5 rounded-lg border border-zinc-100 bg-zinc-50/60 p-3 text-xs leading-relaxed text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-400">
          <li className="flex gap-2">
            <CheckCircle2
              className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
              aria-hidden="true"
            />
            <span>
              <span className="font-medium text-zinc-800 dark:text-zinc-200">
                Nothing to tune.
              </span>{" "}
              One L2-normalised mean embedding per class (fit on train),
              cosine similarity at inference — no grid, no CV, no knobs, so
              no risk of over-fitting a 142-example train split.
            </span>
          </li>
          <li className="flex gap-2">
            <CheckCircle2
              className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
              aria-hidden="true"
            />
            <span>
              <span className="font-medium text-zinc-800 dark:text-zinc-200">
                Naturally handles 2-example classes.
              </span>{" "}
              A centroid exists as soon as a class has one example — rare
              classes are not squeezed out by a decision boundary dominated
              by software_bug.
            </span>
          </li>
          <li className="flex gap-2">
            <CheckCircle2
              className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
              aria-hidden="true"
            />
            <span>
              <span className="font-medium text-zinc-800 dark:text-zinc-200">
                Best macro-F1 of all learned models (
                {formatScore(test?.macro_f1)}
                {isFiniteNumber(bestMacro)
                  ? `, vs ${formatScore(bestMacro)} for the hand-written keyword rules`
                  : ""}
                ).
              </span>{" "}
              It trades raw accuracy for balanced per-class behaviour — the
              trade-off Phase 6&apos;s escalation policy cares about.
            </span>
          </li>
        </ul>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Best-of helpers (computed, never asserted)                           */
/* ------------------------------------------------------------------ */

function bestOf(
  comparison: Phase3ComparisonTest,
  metric: "accuracy" | "macro_f1" | "weighted_f1",
): number | undefined {
  const values = COMPARISON_ORDER.map(
    (key) => comparison[key]?.[metric],
  ).filter(isFiniteNumber);
  return values.length > 0 ? Math.max(...values) : undefined;
}

function bestOfLearned(
  comparison: Phase3ComparisonTest,
  metric: "accuracy" | "macro_f1" | "weighted_f1",
): number | undefined {
  /* learned models only — the keyword rules are hand-written, not learned */
  const learned = (["majority", "tfidf_logreg", "logreg_head", "prototype"] as const).map(
    (key) => comparison[key]?.[metric],
  );
  const values = learned.filter(isFiniteNumber);
  return values.length > 0 ? Math.max(...values) : undefined;
}
