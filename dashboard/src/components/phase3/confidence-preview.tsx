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
import type { Phase3ConfidencePreview } from "@/lib/phase3";

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const pct = (value: number | undefined, digits = 1): string =>
  isFiniteNumber(value) ? `${(value * 100).toFixed(digits)}%` : "—";

const ratio = (value: number | undefined): string =>
  isFiniteNumber(value) ? value.toFixed(4) : "—";

/** Emerald (correct), rose (wrong) and zinc (escalated) bar colors. */
const EMERALD_CLASS =
  "bg-emerald-500 dark:bg-emerald-400";
const ROSE_CLASS = "bg-rose-500 dark:bg-rose-400";
const ZINC_CLASS = "bg-zinc-300 dark:bg-zinc-600";

/**
 * Subsection E — the Phase 6 escalation preview: the classifier's confidence
 * separates correct from wrong predictions, and a first (untuned) threshold
 * reading. Every number comes straight from confidence_preview_test.
 */
export function ConfidencePreview({
  preview,
}: {
  preview: Phase3ConfidencePreview;
}) {
  const threshold = preview.threshold;
  const correctConf = preview.mean_confidence_correct;
  const wrongConf = preview.mean_confidence_wrong;
  const share = preview.share_above_threshold;
  const accAbove = preview.accuracy_above_threshold;

  /* Derived shares (computed from the artifact's two values, never asserted):
     above-threshold correct / above-threshold wrong / below threshold. */
  const correctShare =
    isFiniteNumber(share) && isFiniteNumber(accAbove) ? share * accAbove : undefined;
  const wrongShare =
    isFiniteNumber(share) && isFiniteNumber(accAbove)
      ? share * (1 - accAbove)
      : undefined;
  const belowShare = isFiniteNumber(share) ? 1 - share : undefined;

  const srSummary = [
    `Confidence preview on the golden test split: mean confidence ${ratio(
      correctConf,
    )} on correct predictions versus ${ratio(wrongConf)} on wrong ones.`,
    isFiniteNumber(threshold)
      ? `At a threshold of ${threshold.toFixed(2)}, ${pct(share)} of test predictions sit above the threshold, with ${pct(
          accAbove,
        )} accuracy among them.`
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <section aria-labelledby="phase3-confidence-heading" className="space-y-4">
      <SubsectionHeading
        id="phase3-confidence-heading"
        icon={Gauge}
        title="Confidence preview — the Phase 6 escalation signal"
        description="The same logreg_head also outputs a calibrated-ish confidence per prediction. This is the signal Phase 6 will threshold: predictions above the cut are auto-handled, the rest escalate to a human."
      />

      <Card className="gap-0">
        <CardHeader className="border-b">
          <CardTitle className="text-sm">
            Confidence separates correct from wrong
          </CardTitle>
          <CardDescription className="text-xs">
            Mean confidence of correct vs wrong test predictions, with the
            first (untuned) threshold reading.
          </CardDescription>
        </CardHeader>
        <CardContent className="mt-4">
          <p className="sr-only">{srSummary}</p>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Left: the two contrast bars with the threshold marker */}
            <div className="min-w-0 space-y-5">
              <ContrastBar
                label="Mean confidence — correct predictions"
                value={correctConf}
                barClassName={EMERALD_CLASS}
                threshold={threshold}
                srValue={`mean confidence on correct predictions: ${ratio(correctConf)}`}
              />
              <ContrastBar
                label="Mean confidence — wrong predictions"
                value={wrongConf}
                barClassName={ROSE_CLASS}
                threshold={threshold}
                srValue={`mean confidence on wrong predictions: ${ratio(wrongConf)}`}
              />
              <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                A{" "}
                <span className="font-mono tabular-nums">
                  {isFiniteNumber(correctConf) && isFiniteNumber(wrongConf)
                    ? (correctConf - wrongConf).toFixed(4)
                    : "—"}
                </span>{" "}
                gap between the two means — the model is measurably less sure
                when it is wrong, which is exactly what a threshold can act
                on.
              </p>
            </div>

            {/* Right: what happens at the threshold */}
            <div className="min-w-0 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="min-w-0 rounded-lg border border-zinc-100 bg-zinc-50/60 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Above threshold
                  </p>
                  <p className="mt-1 text-lg font-bold tabular-nums text-zinc-900 sm:text-xl dark:text-zinc-100">
                    {pct(share)}
                  </p>
                  <p className="mt-0.5 text-[10px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                    of test predictions would be auto-handled
                  </p>
                </div>
                <div className="min-w-0 rounded-lg border border-zinc-100 bg-zinc-50/60 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Accuracy among them
                  </p>
                  <p className="mt-1 text-lg font-bold tabular-nums text-emerald-700 sm:text-xl dark:text-emerald-300">
                    {pct(accAbove)}
                  </p>
                  <p className="mt-0.5 text-[10px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                    auto-handled answers that are right
                  </p>
                </div>
              </div>

              {/* Segmented bar: the whole test split by Phase 6 outcome */}
              <div>
                <div
                  className="flex h-3 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
                  aria-hidden="true"
                >
                  {isFiniteNumber(correctShare) ? (
                    <div
                      className={EMERALD_CLASS}
                      style={{ width: `${correctShare * 100}%` }}
                      title={`auto-handled & correct: ${pct(correctShare)} of all test predictions`}
                    />
                  ) : null}
                  {isFiniteNumber(wrongShare) ? (
                    <div
                      className={ROSE_CLASS}
                      style={{ width: `${wrongShare * 100}%` }}
                      title={`auto-handled & wrong (false-auto): ${pct(wrongShare)} of all test predictions`}
                    />
                  ) : null}
                  {isFiniteNumber(belowShare) ? (
                    <div
                      className={ZINC_CLASS}
                      style={{ width: `${belowShare * 100}%` }}
                      title={`below threshold, escalated: ${pct(belowShare)} of all test predictions`}
                    />
                  ) : null}
                </div>
                <ul className="mt-3 space-y-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                  <li className="flex items-center gap-1.5">
                    <span
                      className={`size-2.5 shrink-0 rounded-[3px] ${EMERALD_CLASS}`}
                      aria-hidden="true"
                    />
                    auto-handled &amp; correct — {pct(correctShare)} of the
                    test split
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span
                      className={`size-2.5 shrink-0 rounded-[3px] ${ROSE_CLASS}`}
                      aria-hidden="true"
                    />
                    auto-handled &amp; wrong (false-auto) — {pct(wrongShare)}{" "}
                    of the test split
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span
                      className={`size-2.5 shrink-0 rounded-[3px] ${ZINC_CLASS}`}
                      aria-hidden="true"
                    />
                    below threshold → escalated — {pct(belowShare)} of the
                    test split
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <Alert className="mt-5 border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-200">
            <TriangleAlert className="size-4" aria-hidden="true" />
            <AlertTitle>
              {isFiniteNumber(threshold)
                ? `Indicative only — threshold ${threshold.toFixed(2)} is a preview, not a policy`
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

/* ------------------------------------------------------------------ */
/* One labelled horizontal bar on the 0–1 confidence scale             */
/* ------------------------------------------------------------------ */

function ContrastBar({
  label,
  value,
  barClassName,
  threshold,
  srValue,
}: {
  label: string;
  value: number | undefined;
  barClassName: string;
  threshold: number | undefined;
  srValue: string;
}) {
  const width = isFiniteNumber(value) ? Math.min(Math.max(value, 0), 1) * 100 : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs text-zinc-600 dark:text-zinc-400">{label}</span>
        <span className="font-mono text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
          {ratio(value)}
        </span>
      </div>
      <div
        className="relative mt-1.5 h-3 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
        role="img"
        aria-label={srValue}
      >
        <div
          className={`h-full rounded-full ${barClassName}`}
          style={{ width: `${width}%` }}
        />
        {isFiniteNumber(threshold) ? (
          <div
            className="absolute inset-y-0 border-l-2 border-dashed border-zinc-500/70 dark:border-zinc-300/70"
            style={{ left: `${threshold * 100}%` }}
            aria-hidden="true"
            title={`threshold ${threshold.toFixed(2)}`}
          />
        ) : null}
      </div>
    </div>
  );
}
