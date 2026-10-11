import { ClipboardList } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SubsectionHeading } from "@/components/phase2/subsection-heading";
import { formatInt, orDash } from "@/lib/phase1";
import { TriangleAlert } from "lucide-react";
import type { Phase6Evaluation, Phase6GroundTruth } from "@/lib/phase6";

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/**
 * Subsection G — how the ground truth was made and what it cannot claim:
 * the five written labelling criteria (verbatim), the single-annotator
 * disclosure, the 10 escalate / 19 auto-safe split, and the n=29 caveats.
 * Every rate above this card is only as good as these labels.
 */
export function GroundTruthCard({
  groundTruth,
  evaluation,
}: {
  groundTruth: Phase6GroundTruth | undefined;
  evaluation: Phase6Evaluation;
}) {
  const criteria = groundTruth?.criteria ?? [];
  const caveats = evaluation.honest_caveats ?? [];

  const srSummary = [
    `Ground truth: ${
      isFiniteNumber(groundTruth?.escalate_n)
        ? formatInt(groundTruth.escalate_n)
        : "—"
    } escalate, ${
      isFiniteNumber(groundTruth?.auto_n) ? formatInt(groundTruth.auto_n) : "—"
    } auto-safe, single annotator (${orDash(groundTruth?.annotator)}).`,
    `${formatInt(criteria.length)} written criteria; ${formatInt(caveats.length)} honest caveats.`,
  ].join(" ");

  return (
    <section aria-labelledby="phase6-groundtruth-heading" className="space-y-4">
      <SubsectionHeading
        id="phase6-groundtruth-heading"
        icon={ClipboardList}
        title="How the ground truth was made"
        description="The policy was judged against hand-written labels with fixed criteria — recorded here because every rate above depends on them."
      />

      <Card className="gap-0">
        <CardHeader className="border-b">
          <CardTitle className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
            <span>
              {orDash(groundTruth?.source)}
            </span>
            <span className="font-mono text-xs font-normal tabular-nums text-zinc-500 dark:text-zinc-400">
              {isFiniteNumber(groundTruth?.escalate_n)
                ? formatInt(groundTruth.escalate_n)
                : "—"}{" "}
              escalate ·{" "}
              {isFiniteNumber(groundTruth?.auto_n)
                ? formatInt(groundTruth.auto_n)
                : "—"}{" "}
              auto-safe
            </span>
          </CardTitle>
          <CardDescription className="text-xs">
            Annotated by {orDash(groundTruth?.annotator)}.
          </CardDescription>
        </CardHeader>
        <CardContent className="mt-4 space-y-4">
          <p className="sr-only">{srSummary}</p>

          {/* ---- the written criteria ---- */}
          {criteria.length > 0 ? (
            <div className="min-w-0">
              <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                The fixed labelling criteria, verbatim
              </p>
              <ol className="mt-2 space-y-2">
                {criteria.map((criterion, index) => (
                  <li
                    key={index}
                    className="min-w-0 rounded-lg border border-zinc-100 bg-zinc-50/60 p-2.5 text-xs leading-relaxed text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-400"
                  >
                    <span className="mr-1.5 font-mono text-[10px] font-semibold text-zinc-400 dark:text-zinc-500">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    {criterion}
                  </li>
                ))}
              </ol>
            </div>
          ) : (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              No labelling criteria recorded.
            </p>
          )}

          {/* ---- the honest caveats ---- */}
          {caveats.length > 0 ? (
            <div className="min-w-0 rounded-lg border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-900/60 dark:bg-amber-950/20">
              <p className="flex items-center gap-1.5 text-xs font-medium text-amber-900 dark:text-amber-200">
                <TriangleAlert
                  className="size-3.5 shrink-0 text-amber-500 dark:text-amber-400"
                  aria-hidden="true"
                />
                Measurement honesty — {formatInt(caveats.length)} caveats,
                verbatim from the artifact
              </p>
              <ul className="mt-2 space-y-1.5">
                {caveats.map((caveat, index) => (
                  <li
                    key={index}
                    className="flex gap-2 text-[11px] leading-relaxed text-amber-800/90 dark:text-amber-300/80"
                  >
                    <span aria-hidden="true" className="mt-0.5 shrink-0">
                      –
                    </span>
                    <span className="min-w-0">{caveat}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}
