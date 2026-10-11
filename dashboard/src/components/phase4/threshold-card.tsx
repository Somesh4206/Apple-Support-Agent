import { Gauge, TriangleAlert } from "lucide-react";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SubsectionHeading } from "@/components/phase2/subsection-heading";
import { formatInt, formatPercent } from "@/lib/phase1";
import { formatScore } from "@/lib/phase2";
import type {
  Phase4RetrievalMetrics,
  Phase4ThresholdPreview,
} from "@/lib/phase4";

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const EMERALD_CLASS = "bg-emerald-500 dark:bg-emerald-400";
const ZINC_CLASS = "bg-zinc-300 dark:bg-zinc-600";

interface ThresholdCardProps {
  preview: Phase4ThresholdPreview;
  /** test metrics — supplies n and the top-1 score distribution */
  test?: Phase4RetrievalMetrics;
}

/**
 * Subsection E — the retrieval threshold preview: the share of test openers
 * whose top-1 cosine clears the configured RETRIEVAL_THRESHOLD (0.65), and
 * the Recall@5 among them. This is the grounding gate Phase 5/6 will
 * consume: below-threshold queries should not be answered from retrieved
 * evidence. Indicative at n=29, exactly as the artifact says.
 */
export function ThresholdCard({ preview, test }: ThresholdCardProps) {
  const threshold = preview.threshold;
  const share = preview.share_top1_above;
  const nAbove = preview.n_above;
  const nTest = test?.n;
  const recallWhenAbove = preview.recall_at_5_when_above;
  const scores = test?.top1_score;

  /* Derived below-threshold share (1 − share), like the Phase 3 confidence
     preview's derived segments — computed from the artifact, never asserted. */
  const belowShare = isFiniteNumber(share) ? 1 - share : undefined;

  const srSummary = [
    isFiniteNumber(threshold)
      ? `Retrieval threshold preview at ${threshold.toFixed(2)}:`
      : "Retrieval threshold preview:",
    `${formatPercent(share)} of test openers (${formatInt(nAbove)} of ${formatInt(nTest)}) have a top-1 cosine at or above the threshold,`,
    `with Recall@5 ${formatScore(recallWhenAbove)} among them.`,
  ].join(" ");

  return (
    <section aria-labelledby="phase4-threshold-heading" className="space-y-4">
      <SubsectionHeading
        id="phase4-threshold-heading"
        icon={Gauge}
        title="The retrieval threshold — the Phase 5/6 grounding gate"
        description="Before generated answers may cite retrieved evidence, the top-1 cosine must clear the configured RETRIEVAL_THRESHOLD. This preview reads the gate on the test openers — indicative only at this sample size."
      />

      <Card className="gap-0">
        <CardHeader className="border-b">
          <CardTitle className="text-sm">
            {isFiniteNumber(threshold)
              ? `Top-1 cosine ≥ ${threshold.toFixed(2)} — who clears the gate`
              : "Top-1 cosine threshold preview"}
          </CardTitle>
          <CardDescription className="text-xs">
            The same frozen cosine scores the Recall@K card above is built on,
            now read as a gate: above the cut, retrieved evidence is trusted
            enough to ground a reply; below it, Phase 5/6 should fall back.
          </CardDescription>
        </CardHeader>
        <CardContent className="mt-4">
          <p className="sr-only">{srSummary}</p>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Left: gate stats + segmented split of the test openers */}
            <div className="min-w-0 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="min-w-0 rounded-lg border border-zinc-100 bg-zinc-50/60 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Above the threshold
                  </p>
                  <p className="mt-1 text-lg font-bold tabular-nums text-emerald-700 sm:text-xl dark:text-emerald-300">
                    {formatPercent(share)}
                  </p>
                  <p className="mt-0.5 text-[10px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                    {isFiniteNumber(nAbove) && isFiniteNumber(nTest)
                      ? `${formatInt(nAbove)} of ${formatInt(nTest)} test openers`
                      : "test openers clear the gate"}
                  </p>
                </div>
                <div className="min-w-0 rounded-lg border border-zinc-100 bg-zinc-50/60 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Recall@5 among them
                  </p>
                  <p className="mt-1 text-lg font-bold tabular-nums text-zinc-900 sm:text-xl dark:text-zinc-100">
                    {formatScore(recallWhenAbove)}
                  </p>
                  <p className="mt-0.5 text-[10px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                    label-agreement recall when the gate is cleared
                  </p>
                </div>
              </div>

              {/* Segmented bar: the test split split by the gate */}
              <div>
                <div
                  className="flex h-3 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
                  aria-hidden="true"
                >
                  {isFiniteNumber(share) ? (
                    <div
                      className={EMERALD_CLASS}
                      style={{ width: `${share * 100}%` }}
                      title={`above threshold: ${formatPercent(share)} of test openers`}
                    />
                  ) : null}
                  {isFiniteNumber(belowShare) ? (
                    <div
                      className={ZINC_CLASS}
                      style={{ width: `${belowShare * 100}%` }}
                      title={`below threshold: ${formatPercent(belowShare)} of test openers`}
                    />
                  ) : null}
                </div>
                <ul className="mt-3 space-y-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                  <li className="flex items-center gap-1.5">
                    <span
                      className={`size-2.5 shrink-0 rounded-[3px] ${EMERALD_CLASS}`}
                      aria-hidden="true"
                    />
                    above {isFiniteNumber(threshold) ? threshold.toFixed(2) : "—"}{" "}
                    — evidence trusted for grounding — {formatPercent(share)} of
                    the test openers
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span
                      className={`size-2.5 shrink-0 rounded-[3px] ${ZINC_CLASS}`}
                      aria-hidden="true"
                    />
                    below — fall back / escalate — {formatPercent(belowShare)}{" "}
                    of the test openers
                  </li>
                </ul>
              </div>
            </div>

            {/* Right: the top-1 cosine score distribution vs the gate */}
            <div className="min-w-0 space-y-4">
              <div>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-xs text-zinc-600 dark:text-zinc-400">
                    Top-1 cosine scores across the test openers
                  </span>
                  {isFiniteNumber(threshold) ? (
                    <span className="shrink-0 font-mono text-xs font-semibold tabular-nums text-zinc-500 dark:text-zinc-400">
                      gate {threshold.toFixed(2)}
                    </span>
                  ) : null}
                </div>
                <div
                  className="relative mt-2 h-8 w-full rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/60"
                  role="img"
                  aria-label={`Top-1 cosine scores: min ${formatScore(scores?.min)}, median ${formatScore(scores?.median)}, mean ${formatScore(scores?.mean)}, max ${formatScore(scores?.max)}${isFiniteNumber(threshold) ? `, threshold ${threshold.toFixed(2)}` : ""}.`}
                >
                  {/* observed min–max band, scaled on the fixed 0–1 cosine axis */}
                  {isFiniteNumber(scores?.min) && isFiniteNumber(scores?.max) ? (
                    <div
                      className="absolute inset-y-2 rounded-full bg-emerald-500/25 dark:bg-emerald-400/25"
                      style={{
                        left: `${(scores?.min as number) * 100}%`,
                        width: `${((scores?.max as number) - (scores?.min as number)) * 100}%`,
                      }}
                      title={`observed range ${formatScore(scores?.min)} – ${formatScore(scores?.max)}`}
                    />
                  ) : null}
                  {/* threshold marker */}
                  {isFiniteNumber(threshold) ? (
                    <div
                      className="absolute inset-y-1 border-l-2 border-dashed border-zinc-500/70 dark:border-zinc-300/70"
                      style={{ left: `${threshold * 100}%` }}
                      title={`threshold ${threshold.toFixed(2)}`}
                    />
                  ) : null}
                  {/* median tick */}
                  {isFiniteNumber(scores?.median) ? (
                    <div
                      className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-zinc-800 ring-2 ring-zinc-50 dark:bg-zinc-200 dark:ring-zinc-900"
                      style={{ left: `${(scores?.median as number) * 100}%` }}
                      title={`median ${formatScore(scores?.median)}`}
                    />
                  ) : null}
                  {/* mean tick */}
                  {isFiniteNumber(scores?.mean) ? (
                    <div
                      className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-600 ring-2 ring-zinc-50 dark:bg-emerald-400 dark:ring-zinc-900"
                      style={{ left: `${(scores?.mean as number) * 100}%` }}
                      title={`mean ${formatScore(scores?.mean)}`}
                    />
                  ) : null}
                  {/* axis end labels */}
                  <span className="absolute -bottom-4 left-0 font-mono text-[9px] text-zinc-400 dark:text-zinc-500">
                    0.0
                  </span>
                  <span className="absolute -bottom-4 right-0 font-mono text-[9px] text-zinc-400 dark:text-zinc-500">
                    1.0
                  </span>
                </div>
                <p className="mt-6 font-mono text-[10px] leading-relaxed tabular-nums text-zinc-500 dark:text-zinc-400">
                  min {formatScore(scores?.min)} · median{" "}
                  {formatScore(scores?.median)} · mean{" "}
                  {formatScore(scores?.mean)} · max {formatScore(scores?.max)}{" "}
                  <span className="ml-1 text-zinc-400 dark:text-zinc-500">
                    (dark dot = median, emerald dot = mean, dashed = gate)
                  </span>
                </p>
              </div>
              <p className="text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                The distribution explains the gate&apos;s choice: most test
                openers retrieve a strongly similar pair, so a{" "}
                {isFiniteNumber(threshold) ? threshold.toFixed(2) : "—"} cut
                keeps most of the signal while flagging the long tail of weak
                matches — the ones a grounded answer should not rely on.
              </p>
            </div>
          </div>

          <Alert className="mt-5 border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-200">
            <TriangleAlert className="size-4" aria-hidden="true" />
            <AlertTitle>
              {isFiniteNumber(threshold)
                ? `Indicative only — threshold ${threshold.toFixed(2)} is the configured default, not a tuned policy`
                : "Indicative only — not a tuned policy"}
            </AlertTitle>
            <AlertDescription className="text-amber-800 dark:text-amber-300/90">
              {preview.note ??
                "Measured on the 29-example test split — numbers at this size are indicative only."}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </section>
  );
}
