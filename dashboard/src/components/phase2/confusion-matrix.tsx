import { Table2 } from "lucide-react";
import type { CSSProperties } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SubsectionHeading } from "@/components/phase2/subsection-heading";
import { formatInt } from "@/lib/phase1";
import {
  formatScore,
  shortLabel,
  type Phase2ConfusionMatrix,
} from "@/lib/phase2";
import { cn } from "@/lib/utils";

/** Emerald (correct) and rose (error) cell tints, rgb triplets. */
const EMERALD_RGB = "16, 185, 129";
const ROSE_RGB = "244, 63, 94";

/**
 * Subsection D — the 10×10 test confusion matrix of the TF-IDF + LogReg
 * baseline: rows = true label, columns = predicted label, diagonal tinted
 * emerald, errors rose, intensity proportional to the cell value. The table
 * scrolls inside a max-height container on small screens with the header row
 * and the true-label column pinned.
 */
export function ConfusionMatrixSection({
  confusion,
}: {
  confusion: Phase2ConfusionMatrix | undefined;
}) {
  const labels = confusion?.labels ?? [];
  const matrix = confusion?.matrix ?? [];

  return (
    <section aria-labelledby="phase2-confusion-heading" className="space-y-4">
      <SubsectionHeading
        id="phase2-confusion-heading"
        icon={Table2}
        title="Confusion matrix (tfidf-logreg, test)"
        description="Every test example of the learned baseline, by true label (rows) and predicted label (columns). Scroll horizontally on small screens — the header row and the true-label column stay pinned."
      />
      {labels.length === 0 || matrix.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No confusion matrix available.
        </p>
      ) : (
        <ConfusionMatrixCard labels={labels} matrix={matrix} />
      )}
    </section>
  );
}

function ConfusionMatrixCard({
  labels,
  matrix,
}: {
  labels: string[];
  matrix: number[][];
}) {
  const max = matrix.reduce(
    (acc, row) =>
      row.reduce((rowMax, cell) => Math.max(rowMax, cell), acc),
    0,
  );
  const rowTotals = matrix.map((row) =>
    row.reduce((sum, cell) => sum + cell, 0),
  );
  const testTotal = rowTotals.reduce((sum, total) => sum + total, 0);
  const correct = matrix.reduce(
    (sum, row, index) => sum + (row[index] ?? 0),
    0,
  );
  const accuracyShare =
    testTotal > 0 ? `${((correct / testTotal) * 100).toFixed(1)}%` : "—";

  /* Screen-reader narration: the headline counts plus every non-zero
     off-diagonal cell, so the matrix is consumable without sight. */
  const offDiagonal: string[] = [];
  matrix.forEach((row, trueIndex) => {
    row.forEach((value, predictedIndex) => {
      if (predictedIndex !== trueIndex && value > 0) {
        offDiagonal.push(
          `${formatInt(value)} true ${labels[trueIndex] ?? "?"} example${
            value === 1 ? "" : "s"
          } predicted ${labels[predictedIndex] ?? "?"}`,
        );
      }
    });
  });
  const srSummary = [
    `Confusion matrix of the TF-IDF plus logistic regression baseline on ${formatInt(
      testTotal,
    )} test examples.`,
    `${formatInt(correct)} of ${formatInt(testTotal)} examples predicted correctly (${accuracyShare}).`,
    offDiagonal.length > 0
      ? `Misclassifications: ${offDiagonal.join("; ")}.`
      : "No misclassifications.",
  ].join(" ");

  return (
    <Card className="gap-0">
      <CardHeader className="border-b">
        <CardTitle className="text-sm">
          Test predictions — {formatInt(correct)} of{" "}
          {formatInt(testTotal)} correct ({accuracyShare})
        </CardTitle>
        <CardDescription className="text-xs">
          Hover or focus a cell for its exact reading (“true label →
          predicted label: n”).
        </CardDescription>
      </CardHeader>
      <CardContent className="mt-4">
        <p className="sr-only">{srSummary}</p>
        <div
          className="max-h-[26rem] overflow-auto rounded-lg border border-zinc-200 dark:border-zinc-800 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-zinc-300 dark:[&::-webkit-scrollbar-thumb]:bg-zinc-700 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-zinc-100 dark:[&::-webkit-scrollbar-track]:bg-zinc-800/80"
        >
          <table className="w-full border-separate border-spacing-0 text-xs">
            <caption className="sr-only">
              Confusion matrix for the TF-IDF plus Logistic Regression baseline
              on the {formatInt(testTotal)}-example test split. Rows are true
              labels, columns are predicted labels, cell values are example
              counts, and the right-hand column totals each true label.
            </caption>
            <thead>
              <tr>
                <th
                  scope="col"
                  className="sticky left-0 top-0 z-30 min-w-[6rem] border-b border-r border-zinc-200 bg-zinc-50 px-2 py-1.5 text-left font-medium text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400"
                >
                  <span className="sr-only">True label (rows) by predicted label (columns)</span>
                  <span aria-hidden="true" className="text-[10px]">
                    true ↓ · pred →
                  </span>
                </th>
                {labels.map((label) => (
                  <th
                    key={label}
                    scope="col"
                    title={label}
                    className="sticky top-0 z-20 min-w-[2.5rem] whitespace-nowrap border-b border-r border-zinc-200 bg-zinc-50 px-1 py-1.5 text-center font-mono text-[10px] font-medium text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
                  >
                    <span className="hidden 2xl:inline">{label}</span>
                    <span className="2xl:hidden">{shortLabel(label)}</span>
                  </th>
                ))}
                <th
                  scope="col"
                  className="sticky top-0 z-20 min-w-[2.25rem] whitespace-nowrap border-b border-zinc-200 bg-zinc-50 px-1.5 py-1.5 text-center text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400"
                >
                  Σ true
                </th>
              </tr>
            </thead>
            <tbody>
              {matrix.map((row, trueIndex) => {
                const trueLabel = labels[trueIndex] ?? `row-${trueIndex}`;
                return (
                  <tr key={trueLabel}>
                    <th
                      scope="row"
                      title={trueLabel}
                      className="sticky left-0 z-10 max-w-[9rem] whitespace-nowrap border-b border-r border-zinc-200 bg-zinc-50 px-2 py-1.5 text-left font-mono text-[10px] font-medium text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
                    >
                      <span className="hidden 2xl:inline">{trueLabel}</span>
                      <span className="2xl:hidden">{shortLabel(trueLabel)}</span>
                    </th>
                    {row.map((value, predictedIndex) => {
                      const diagonal = predictedIndex === trueIndex;
                      const tinted = value > 0;
                      const alpha = tinted
                        ? diagonal
                          ? 0.18 + 0.52 * (value / Math.max(max, 1))
                          : 0.16 + 0.44 * (value / Math.max(max, 1))
                        : 0;
                      const style: CSSProperties | undefined = tinted
                        ? {
                            backgroundColor: `rgba(${
                              diagonal ? EMERALD_RGB : ROSE_RGB
                            }, ${alpha.toFixed(3)})`,
                          }
                        : undefined;
                      return (
                        <td
                          key={`${trueLabel}-${labels[predictedIndex] ?? predictedIndex}`}
                          style={style}
                          title={`true ${trueLabel} → predicted ${
                            labels[predictedIndex] ?? "?"
                          }: ${formatInt(value)}`}
                          className={cn(
                            "h-9 min-w-[2.25rem] border-b border-r border-zinc-100 px-1 text-center tabular-nums dark:border-zinc-800",
                            tinted
                              ? "font-medium text-zinc-900 dark:text-zinc-50"
                              : "text-zinc-300 dark:text-zinc-600",
                          )}
                        >
                          {formatInt(value)}
                        </td>
                      );
                    })}
                    <td className="h-9 min-w-[2.25rem] border-b border-zinc-100 bg-zinc-50/60 px-1.5 text-center text-[10px] font-medium tabular-nums text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-400">
                      {formatInt(rowTotals[trueIndex])}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
          <li className="flex items-center gap-1.5">
            <span
              className="size-2.5 shrink-0 rounded-[3px]"
              style={{ backgroundColor: `rgba(${EMERALD_RGB}, 0.55)` }}
              aria-hidden="true"
            />
            correct — diagonal
          </li>
          <li className="flex items-center gap-1.5">
            <span
              className="size-2.5 shrink-0 rounded-[3px]"
              style={{ backgroundColor: `rgba(${ROSE_RGB}, 0.45)` }}
              aria-hidden="true"
            />
            misclassified
          </li>
          <li>darker cell = more examples</li>
          <li>
            rows = true label · columns = predicted ·{" "}
            <span className="tabular-nums text-zinc-300 dark:text-zinc-600">
              0
            </span>{" "}
            = no examples
          </li>
        </ul>
        <p className="mt-2 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
          The learned baseline predicted{" "}
          <span className="font-medium text-zinc-700 dark:text-zinc-300">
            software_bug
          </span>{" "}
          for {formatInt(matrix.reduce((sum, row) => sum + (row[0] ?? 0), 0))}{" "}
          of {formatInt(testTotal)} test messages — {formatInt(correct)} of
          them correctly — which is the collapse the baselines section
          describes. Test accuracy {formatScore(accuracyFromCounts(correct, testTotal))}.
        </p>
      </CardContent>
    </Card>
  );
}

function accuracyFromCounts(correct: number, total: number): number | undefined {
  return total > 0 ? correct / total : undefined;
}
