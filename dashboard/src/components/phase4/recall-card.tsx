import { Crosshair, Target } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SubsectionHeading } from "@/components/phase2/subsection-heading";
import { formatInt, formatPercent } from "@/lib/phase1";
import { formatScore, formatSignedDelta } from "@/lib/phase2";
import type { Phase4Evaluation } from "@/lib/phase4";

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const BAR_CLASS = "bg-emerald-500 dark:bg-emerald-400";

interface RecallCardProps {
  evaluation: Phase4Evaluation;
  /** Phase 3 logreg head test accuracy (fetched from phase3_summary.json) */
  phase3HeadTestAccuracy?: number;
}

/**
 * Subsection B — Recall@K on the held-out test openers: the headline Phase 4
 * metrics with a compact bar visualization, the val split as a sanity row,
 * and the honest secondary finding that majority-voting the retrieved
 * labels slightly beats the trained Phase 3 head on the same openers.
 */
export function RecallCard({
  evaluation,
  phase3HeadTestAccuracy,
}: RecallCardProps) {
  const test = evaluation.test ?? {};
  const val = evaluation.val ?? {};

  const metrics: Array<{
    key: string;
    label: string;
    value: number | undefined;
    hint: string;
  }> = [
    {
      key: "r1",
      label: "Recall@1",
      value: test.recall_at_1,
      hint: "same-intent case at rank 1",
    },
    {
      key: "r3",
      label: "Recall@3",
      value: test.recall_at_3,
      hint: "within the top 3 retrieved",
    },
    {
      key: "r5",
      label: "Recall@5",
      value: test.recall_at_5,
      hint: "within the top 5 retrieved",
    },
    {
      key: "mrr",
      label: "MRR@5",
      value: test.mrr_at_5,
      hint: "1 / rank of the first hit",
    },
  ];

  /* Plain-language headline derived from the artifact's own numbers:
     "of the 29 held-out test openers, 75.9% found a same-intent historical
     case within the top 5" — n and share both come from the JSON. */
  const nTest = test.n;
  const r5 = test.recall_at_5;
  const headline =
    isFiniteNumber(nTest) && isFiniteNumber(r5)
      ? `of the ${formatInt(nTest)} held-out test openers, ${formatPercent(
          r5,
        )} found a same-intent historical case within the top 5 retrieved pairs`
      : null;

  /* Majority-vote vs trained head — the Phase 3 accuracy arrives as a prop
     (fetched from phase3_summary.json); the delta is computed, never
     asserted. Derived correct-counts: 0.6897 × 29 ≈ 20, 0.6552 × 29 ≈ 19. */
  const majorityVote = test.majority_vote_accuracy;
  const delta =
    isFiniteNumber(majorityVote) && isFiniteNumber(phase3HeadTestAccuracy)
      ? majorityVote - phase3HeadTestAccuracy
      : undefined;
  const majorityCorrect =
    isFiniteNumber(majorityVote) && isFiniteNumber(nTest)
      ? Math.round(majorityVote * nTest)
      : undefined;
  const headCorrect =
    isFiniteNumber(phase3HeadTestAccuracy) && isFiniteNumber(nTest)
      ? Math.round(phase3HeadTestAccuracy * nTest)
      : undefined;

  const srSummary = [
    `Test openers (n=${formatInt(nTest)}): Recall@1 ${formatScore(test.recall_at_1)}, Recall@3 ${formatScore(test.recall_at_3)}, Recall@5 ${formatScore(test.recall_at_5)}, MRR@5 ${formatScore(test.mrr_at_5)}.`,
    `Validation openers (n=${formatInt(val.n)}): Recall@1 ${formatScore(val.recall_at_1)}, Recall@5 ${formatScore(val.recall_at_5)}, MRR@5 ${formatScore(val.mrr_at_5)}.`,
    `Majority-vote accuracy over the top-5 retrieved labels: ${formatScore(majorityVote)}${phase3HeadTestAccuracy !== undefined ? `, versus the Phase 3 head at ${formatScore(phase3HeadTestAccuracy)}` : ""}.`,
  ].join(" ");

  return (
    <section aria-labelledby="phase4-recall-heading" className="space-y-4">
      <SubsectionHeading
        id="phase4-recall-heading"
        icon={Target}
        title="Retrieval accuracy — Recall@K on the held-out openers"
        description="Each golden test opener is embedded and queried against the index; a hit means a retrieved pair whose predicted intent equals the opener's golden intent. The openers number in the tens, and the numbers are reported with that honesty."
      />

      <Card className="gap-0">
        <CardHeader className="border-b">
          <CardTitle className="text-sm">
            Test openers — Recall@1 / 3 / 5 and MRR@5
          </CardTitle>
          <CardDescription className="text-xs">
            {headline
              ? `Plain-language: ${headline}.`
              : "Recall@1/3/5 and MRR@5 on the untouched golden test openers."}
          </CardDescription>
        </CardHeader>
        <CardContent className="mt-4">
          <p className="sr-only">{srSummary}</p>
          <div className="min-w-0 space-y-4">
            {metrics.map((metric) => (
              <MetricBar
                key={metric.key}
                label={metric.label}
                value={metric.value}
                hint={metric.hint}
              />
            ))}
          </div>

          {/* Val sanity row — same layout language, deliberately quieter. */}
          <div className="mt-5 rounded-lg border border-zinc-200/80 bg-zinc-100/60 px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-900/60">
            <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Sanity check — validation openers (n={formatInt(val.n)})
            </p>
            <p className="mt-1 font-mono text-xs tabular-nums leading-relaxed text-zinc-600 dark:text-zinc-400">
              Recall@1 {formatScore(val.recall_at_1)} · Recall@3{" "}
              {formatScore(val.recall_at_3)} · Recall@5{" "}
              {formatScore(val.recall_at_5)} · MRR@5 {formatScore(val.mrr_at_5)}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
              The val split runs higher than test, exactly as in Phases 2 and 3
              — a consistent sanity signal, not a different system.
            </p>
          </div>

          {/* Secondary finding: kNN majority vote vs the trained head. */}
          <div className="mt-4 min-w-0 rounded-lg border border-zinc-100 bg-zinc-50/60 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
            <p className="flex flex-wrap items-center gap-2 text-xs font-medium text-zinc-700 dark:text-zinc-300">
              <Crosshair
                className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                aria-hidden="true"
              />
              Secondary finding — retrieval as a classifier
            </p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <div className="min-w-0">
                <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Majority vote over top-5 retrieved labels
                </p>
                <p className="mt-1 text-lg font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
                  {formatScore(majorityVote)}
                </p>
                <p className="mt-0.5 text-[10px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                  {isFiniteNumber(majorityCorrect) && isFiniteNumber(nTest)
                    ? `${formatInt(majorityCorrect)} of ${formatInt(nTest)} test openers correct`
                    : "kNN classification by retrieval"}
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Phase 3 logreg head (same openers)
                </p>
                <p className="mt-1 text-lg font-bold tabular-nums text-zinc-900 dark:text-zinc-100">
                  {formatScore(phase3HeadTestAccuracy)}
                </p>
                <p className="mt-0.5 text-[10px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                  {isFiniteNumber(headCorrect) && isFiniteNumber(nTest)
                    ? `${formatInt(headCorrect)} of ${formatInt(nTest)} test openers correct`
                    : "the trained classifier from Phase 3"}
                </p>
              </div>
            </div>
            <p className="mt-2.5 text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-400">
              {delta !== undefined ? (
                <>
                  Delta{" "}
                  <span className="font-mono font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
                    {formatSignedDelta(delta)}
                  </span>{" "}
                  — majority-voting the retrieved labels (a kNN classifier over
                  the indexed evidence pairs) slightly beats the trained head
                  on the same openers. Honest framing: one opener apart at
                  this sample size, so treat it as parity, not superiority —
                  but it means the retrieval evidence alone already classifies
                  as well as the Phase 3 head.
                </>
              ) : (
                <>
                  Majority-voting the retrieved labels is a kNN classifier over
                  the indexed evidence pairs — compare it against the Phase 3
                  logreg head card above (its test accuracy is rendered in the
                  Phase 3 section).
                </>
              )}
            </p>
            {isFiniteNumber(test.top1_agreement) ? (
              <p className="mt-1.5 font-mono text-[10px] tabular-nums text-zinc-500 dark:text-zinc-400">
                top-1 label agreement {formatScore(test.top1_agreement)} (=
                Recall@1: a top-1 hit is exactly a label agreement)
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* One metric row: label + bar + value                                 */
/* ------------------------------------------------------------------ */

function MetricBar({
  label,
  value,
  hint,
}: {
  label: string;
  value: number | undefined;
  hint: string;
}) {
  const width = isFiniteNumber(value)
    ? Math.min(Math.max(value, 0), 1) * 100
    : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs text-zinc-600 dark:text-zinc-400">
          {label}
          <span className="ml-2 text-[10px] text-zinc-400 dark:text-zinc-500">
            {hint}
          </span>
        </span>
        <span className="font-mono text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
          {formatScore(value)}
        </span>
      </div>
      <div
        className="relative mt-1.5 h-3 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
        role="img"
        aria-label={`${label}: ${formatScore(value)}`}
      >
        <div
          className={`h-full rounded-full ${BAR_CLASS}`}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}
