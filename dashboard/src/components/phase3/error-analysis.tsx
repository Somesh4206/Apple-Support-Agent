import { FileWarning, MoveRight } from "lucide-react";

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
import { formatInt } from "@/lib/phase1";
import { shortLabel } from "@/lib/phase2";
import type { Phase3ErrorAnalysis } from "@/lib/phase3";
import { cn } from "@/lib/utils";

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/** Confidence grading thresholds (the preview threshold is 0.60). */
const HIGH_CONFIDENCE = 0.6;
const MID_CONFIDENCE = 0.45;

interface ErrorAnalysisProps {
  analysis: Phase3ErrorAnalysis;
  /** the escalation preview threshold, reused for the badge grading + titles */
  confidenceThreshold?: number;
}

/**
 * Subsection F — every test error of the selected logreg_head, one row each:
 * the message (line-clamped), true → predicted, the confidence badge
 * (color-graded — a highly confident wrong answer is the false-auto risk
 * Phase 6 must manage) and the runner-up label. Scrollable with the shared
 * custom scrollbar styling; the table itself scrolls horizontally on phones.
 */
export function ErrorAnalysis({
  analysis,
  confidenceThreshold,
}: ErrorAnalysisProps) {
  const errors = analysis.errors ?? [];
  const nTest = analysis.n_test;
  const nErrors = analysis.n_errors ?? errors.length;
  const runnerUpCorrect = errors.filter(
    (error) =>
      error.runner_up !== undefined &&
      error.runner_up === error.true_label,
  ).length;
  const highConfidence = errors.filter(
    (error) => isFiniteNumber(error.confidence) && error.confidence >= HIGH_CONFIDENCE,
  ).length;

  const threshold =
    isFiniteNumber(confidenceThreshold) ? confidenceThreshold : HIGH_CONFIDENCE;

  const srSummary = [
    `${formatInt(nErrors)} of ${formatInt(nTest)} test examples were misclassified by the selected logreg head.`,
    ...errors.map(
      (error) =>
        `"${error.text ?? ""}" — true label ${error.true_label ?? "?"}, predicted ${
          error.predicted_label ?? "?"
        } with confidence ${
          isFiniteNumber(error.confidence) ? error.confidence.toFixed(4) : "—"
        }; runner-up ${error.runner_up ?? "?"} at ${
          isFiniteNumber(error.runner_up_confidence)
            ? error.runner_up_confidence.toFixed(4)
            : "—"
        }.`,
    ),
  ].join(" ");

  return (
    <section aria-labelledby="phase3-errors-heading" className="space-y-4">
      <SubsectionHeading
        id="phase3-errors-heading"
        icon={FileWarning}
        title="Every test error, one row each"
        description="The selected logreg_head's misclassifications with per-example confidence — the cases Phase 6's escalation policy exists to catch. Highly confident wrong answers (rose badges) are the dangerous ones."
      />

      <Card className="gap-0">
        <CardHeader className="border-b">
          <CardTitle className="text-sm">
            {formatInt(nErrors)} of {formatInt(nTest)} test examples
            misclassified
          </CardTitle>
          <CardDescription className="text-xs">
            {formatInt(highConfidence)} at confidence ≥{" "}
            {threshold.toFixed(2)} (would be auto-handled wrongly at the
            preview threshold) · {formatInt(runnerUpCorrect)} had the correct
            label as runner-up.
          </CardDescription>
        </CardHeader>
        <CardContent className="mt-4">
          <p className="sr-only">{srSummary}</p>
          {errors.length === 0 ? (
            <p className="py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
              No error rows available.
            </p>
          ) : (
            <div className="max-h-96 overflow-auto rounded-lg border border-zinc-200 dark:border-zinc-800 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-zinc-300 dark:[&::-webkit-scrollbar-thumb]:bg-zinc-700 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-zinc-100 dark:[&::-webkit-scrollbar-track]:bg-zinc-800/80">
              <Table className="min-w-[40rem] text-xs">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="sticky top-0 z-10 h-8 bg-zinc-50 px-3 text-left text-[10px] dark:bg-zinc-900">
                      Test message
                    </TableHead>
                    <TableHead className="sticky top-0 z-10 h-8 bg-zinc-50 px-2 text-left text-[10px] dark:bg-zinc-900">
                      True → predicted
                    </TableHead>
                    <TableHead className="sticky top-0 z-10 h-8 bg-zinc-50 px-2 text-right text-[10px] dark:bg-zinc-900">
                      Confidence
                    </TableHead>
                    <TableHead className="sticky top-0 z-10 h-8 bg-zinc-50 px-2 text-left text-[10px] dark:bg-zinc-900">
                      Runner-up
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {errors.map((error) => {
                    const confidence = error.confidence;
                    const grade = !isFiniteNumber(confidence)
                      ? "unknown"
                      : confidence >= HIGH_CONFIDENCE
                        ? "high"
                        : confidence >= MID_CONFIDENCE
                          ? "mid"
                          : "low";
                    const runnerWasCorrect =
                      error.runner_up !== undefined &&
                      error.runner_up === error.true_label;
                    return (
                      <TableRow key={error.conversation_id ?? error.text}>
                        <TableCell className="max-w-[24rem] px-3 py-2 align-top">
                          <p
                            className="line-clamp-2 text-xs leading-relaxed text-zinc-700 dark:text-zinc-300"
                            title={error.text}
                          >
                            {error.text ?? "—"}
                          </p>
                        </TableCell>
                        <TableCell className="whitespace-nowrap px-2 py-2 align-top font-mono text-[10px]">
                          <span
                            className="text-zinc-600 dark:text-zinc-400"
                            title={error.true_label}
                          >
                            <span className="hidden 2xl:inline">
                              {error.true_label}
                            </span>
                            <span className="2xl:hidden">
                              {shortLabel(error.true_label ?? "—")}
                            </span>
                          </span>
                          <MoveRight
                            className="mx-1 inline size-3 text-zinc-400 dark:text-zinc-500"
                            aria-hidden="true"
                          />
                          <span
                            className="font-medium text-rose-600 dark:text-rose-400"
                            title={error.predicted_label}
                          >
                            <span className="hidden 2xl:inline">
                              {error.predicted_label}
                            </span>
                            <span className="2xl:hidden">
                              {shortLabel(error.predicted_label ?? "—")}
                            </span>
                          </span>
                        </TableCell>
                        <TableCell className="px-2 py-2 align-top text-right">
                          <ConfidenceBadge
                            confidence={confidence}
                            grade={grade}
                            threshold={threshold}
                          />
                        </TableCell>
                        <TableCell className="whitespace-nowrap px-2 py-2 align-top font-mono text-[10px]">
                          <span
                            className={cn(
                              "text-zinc-600 dark:text-zinc-400",
                              runnerWasCorrect &&
                                "font-medium text-emerald-700 dark:text-emerald-300",
                            )}
                            title={
                              runnerWasCorrect
                                ? "The runner-up was the correct label"
                                : undefined
                            }
                          >
                            <span className="hidden 2xl:inline">
                              {error.runner_up}
                            </span>
                            <span className="2xl:hidden">
                              {shortLabel(error.runner_up ?? "—")}
                            </span>
                          </span>
                          <span className="ml-1.5 tabular-nums text-zinc-400 dark:text-zinc-500">
                            {isFiniteNumber(error.runner_up_confidence)
                              ? error.runner_up_confidence.toFixed(4)
                              : "—"}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
            <li className="flex items-center gap-1.5">
              <span
                className="inline-flex rounded-full border border-rose-200 bg-rose-100 px-1.5 py-px text-[9px] font-semibold text-rose-700 dark:border-rose-900 dark:bg-rose-950/60 dark:text-rose-300"
                aria-hidden="true"
              >
                ≥ {threshold.toFixed(2)}
              </span>
              confident &amp; wrong — the false-auto risk
            </li>
            <li className="flex items-center gap-1.5">
              <span
                className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-1.5 py-px text-[9px] font-semibold text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
                aria-hidden="true"
              >
                {MID_CONFIDENCE.toFixed(2)}+
              </span>
              mid confidence
            </li>
            <li className="flex items-center gap-1.5">
              <span
                className="inline-flex rounded-full border border-zinc-200 bg-zinc-50 px-1.5 py-px text-[9px] font-semibold text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400"
                aria-hidden="true"
              >
                &lt; {MID_CONFIDENCE.toFixed(2)}
              </span>
              low confidence
            </li>
            <li>emerald runner-up = the correct label came second</li>
          </ul>
        </CardContent>
      </Card>
    </section>
  );
}

function ConfidenceBadge({
  confidence,
  grade,
  threshold,
}: {
  confidence: number | undefined;
  grade: "high" | "mid" | "low" | "unknown";
  threshold: number;
}) {
  const label = isFiniteNumber(confidence)
    ? confidence.toFixed(4)
    : "—";
  const title =
    grade === "high"
      ? `confidence ${label} — above the ${threshold.toFixed(2)} preview threshold, this wrong answer would be auto-handled`
      : `confidence ${label} on a wrong prediction`;
  return (
    <Badge
      title={title}
      className={cn(
        "font-mono text-[10px] tabular-nums",
        grade === "high" &&
          "border-rose-200 bg-rose-100 text-rose-700 dark:border-rose-900 dark:bg-rose-950/60 dark:text-rose-300",
        grade === "mid" &&
          "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300",
        grade === "low" &&
          "border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400",
        grade === "unknown" && "border-zinc-200 text-zinc-400",
      )}
    >
      {label}
    </Badge>
  );
}
