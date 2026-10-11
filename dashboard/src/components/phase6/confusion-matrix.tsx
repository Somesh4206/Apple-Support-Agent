import { Table2 } from "lucide-react";
import type { CSSProperties } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SubsectionHeading } from "@/components/phase2/subsection-heading";
import { formatInt, formatPercent } from "@/lib/phase1";
import type { Phase6Confusion } from "@/lib/phase6";
import { cn } from "@/lib/utils";

/** Emerald (correct) and rose (error) cell tints, rgb triplets — the same
 *  visual language as the Phase 2/3 confusion matrices. */
const EMERALD_RGB = "16, 185, 129";
const ROSE_RGB = "244, 63, 94";

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

interface CellSpec {
  key: string;
  /** row: ground truth, column: policy decision */
  truth: "escalate" | "auto";
  decision: "escalate" | "auto";
  count: number | undefined;
  /** plain-English name shown in the cell */
  name: string;
  /** what the cell means for the customer */
  reading: string;
  kind: "good" | "bad" | "cost";
}

/**
 * Subsection C — the 2×2 decision matrix: rows = ground truth (escalate /
 * auto-safe), columns = policy decision (escalate / auto-handle). The
 * false-auto cell (policy answered automatically, truth said escalate) is
 * highlighted as the safety-critical zero; over-escalation is shown as the
 * deliberate cost, not a correctness error.
 */
export function ConfusionMatrixCard({
  confusion,
}: {
  confusion: Phase6Confusion | undefined;
}) {
  const cells: CellSpec[] = [
    {
      key: "true_escalate",
      truth: "escalate",
      decision: "escalate",
      count: confusion?.true_escalate,
      name: "True escalate",
      reading: "should escalate · escalated — correct",
      kind: "good",
    },
    {
      key: "over_escalation",
      truth: "auto",
      decision: "escalate",
      count: confusion?.over_escalation,
      name: "Over-escalation",
      reading: "auto-safe · escalated — a human handles an easy one",
      kind: "cost",
    },
    {
      key: "false_auto",
      truth: "escalate",
      decision: "auto",
      count: confusion?.false_auto,
      name: "False auto",
      reading: "should escalate · auto-answered — the dangerous cell",
      kind: "bad",
    },
    {
      key: "true_auto",
      truth: "auto",
      decision: "auto",
      count: confusion?.true_auto,
      name: "True auto",
      reading: "auto-safe · auto-answered — correct",
      kind: "good",
    },
  ];

  const total = cells.reduce((sum, cell) => sum + (cell.count ?? 0), 0);
  const max = cells.reduce((acc, cell) => Math.max(acc, cell.count ?? 0), 0);

  const srSummary = cells
    .map(
      (cell) =>
        `${cell.name}: ${formatInt(cell.count)} of ${formatInt(total)} (${cell.reading})`,
    )
    .join("; ");

  return (
    <section aria-labelledby="phase6-confusion-heading" className="space-y-4">
      <SubsectionHeading
        id="phase6-confusion-heading"
        icon={Table2}
        title="The decision matrix"
        description="Every golden TEST opener by ground truth (rows) against the policy's decision (columns). One cell matters more than the others — and it is zero."
      />

      <Card className="gap-0">
        <CardHeader className="border-b">
          <CardTitle className="text-sm">
            Policy decisions vs hand-labelled ground truth
          </CardTitle>
          <CardDescription className="text-xs">
            Rows are what the message actually needed; columns are what the
            policy chose. Intensity scales with the cell count.
          </CardDescription>
        </CardHeader>
        <CardContent className="mt-4">
          <p className="sr-only">{srSummary}</p>

          <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-zinc-300 dark:[&::-webkit-scrollbar-thumb]:bg-zinc-700 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-zinc-100 dark:[&::-webkit-scrollbar-track]:bg-zinc-800/80">
            <table className="w-full min-w-[26rem] border-separate border-spacing-0 text-xs">
              <caption className="sr-only">
                Two-by-two decision matrix of the Phase 6 escalation policy on
                the golden TEST openers. Rows are the ground truth (escalate or
                auto-safe), columns are the policy decision (escalate or
                auto-handle), cells are opener counts.
              </caption>
              <thead>
                <tr>
                  <th scope="col" className="w-24 border-b border-r border-zinc-200 bg-zinc-50 px-2 py-2 text-left text-[10px] font-medium text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                    <span className="sr-only">
                      Ground truth (rows) by policy decision (columns)
                    </span>
                    <span aria-hidden="true" className="whitespace-nowrap">
                      truth ↓ · policy →
                    </span>
                  </th>
                  <th scope="col" className="border-b border-r border-zinc-200 bg-zinc-50 px-2 py-2 text-center font-mono text-[10px] font-medium text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
                    escalate
                  </th>
                  <th scope="col" className="border-b border-zinc-200 bg-zinc-50 px-2 py-2 text-center font-mono text-[10px] font-medium text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
                    auto-handle
                  </th>
                  <th scope="col" className="border-b border-zinc-200 bg-zinc-50 px-2 py-2 text-center text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                    Σ truth
                  </th>
                </tr>
              </thead>
              <tbody>
                {(["escalate", "auto"] as const).map((truth) => {
                  const rowCells = cells.filter((cell) => cell.truth === truth);
                  const rowTotal = rowCells.reduce(
                    (sum, cell) => sum + (cell.count ?? 0),
                    0,
                  );
                  return (
                    <tr key={truth}>
                      <th scope="row" className="max-w-[9rem] border-b border-r border-zinc-200 bg-zinc-50 px-2 py-2 text-left font-mono text-[10px] font-medium text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
                        {truth === "escalate"
                          ? "escalate"
                          : "auto-safe"}
                      </th>
                      {(["escalate", "auto"] as const).map((decision) => {
                        const cell = cells.find(
                          (candidate) =>
                            candidate.truth === truth &&
                            candidate.decision === decision,
                        );
                        return (
                          <td
                            key={`${truth}-${decision}`}
                            className={cn(
                              "border-b border-r border-zinc-100 p-0 dark:border-zinc-800",
                              decision === "auto" && "border-r-0",
                            )}
                          >
                            <MatrixCell cell={cell} max={max} total={total} />
                          </td>
                        );
                      })}
                      <td className="border-b border-zinc-100 bg-zinc-50/60 px-2 text-center text-[10px] font-medium tabular-nums text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-400">
                        {formatInt(rowTotal)}
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
              correct
            </li>
            <li className="flex items-center gap-1.5">
              <span
                className="size-2.5 shrink-0 rounded-[3px]"
                style={{ backgroundColor: `rgba(${ROSE_RGB}, 0.55)` }}
                aria-hidden="true"
              />
              false auto — safety-critical
            </li>
            <li className="flex items-center gap-1.5">
              <span className="size-2.5 shrink-0 rounded-[3px] bg-amber-300 dark:bg-amber-700" aria-hidden="true" />
              over-escalation — deliberate cost
            </li>
          </ul>
        </CardContent>
      </Card>
    </section>
  );
}

function MatrixCell({
  cell,
  max,
  total,
}: {
  cell: CellSpec | undefined;
  max: number;
  total: number;
}) {
  if (!cell) {
    return <div className="h-20" aria-hidden="true" />;
  }
  const count = cell.count ?? 0;
  const share = total > 0 ? count / total : 0;

  const style: CSSProperties = {};
  let valueClass =
    "text-zinc-300 dark:text-zinc-600";
  if (cell.kind === "good") {
    const alpha = count > 0 ? 0.18 + 0.52 * (count / Math.max(max, 1)) : 0;
    style.backgroundColor = `rgba(${EMERALD_RGB}, ${alpha.toFixed(3)})`;
    valueClass = count > 0 ? "text-zinc-900 dark:text-zinc-50" : valueClass;
  } else if (cell.kind === "bad") {
    /* The false-auto cell is highlighted even at zero — the whole point of
       the matrix is that this dangerous cell stayed empty. */
    style.backgroundColor =
      count > 0
        ? `rgba(${ROSE_RGB}, ${(0.16 + 0.44 * (count / Math.max(max, 1))).toFixed(3)})`
        : "rgba(244, 63, 94, 0.10)";
    valueClass = "text-zinc-900 dark:text-zinc-50";
  } else {
    style.backgroundColor =
      count > 0
        ? `rgba(252, 211, 77, ${(0.25 + 0.35 * (count / Math.max(max, 1))).toFixed(3)})`
        : undefined;
    valueClass = count > 0 ? "text-zinc-900 dark:text-zinc-50" : valueClass;
  }

  return (
    <div
      style={style}
      className="flex h-20 min-w-[10rem] flex-col items-center justify-center gap-0.5 px-2 text-center"
      title={`${cell.name} (${cell.reading}): ${formatInt(count)} of ${formatInt(total)} openers (${formatPercent(share)})`}
    >
      <span className={cn("text-xl font-semibold tabular-nums", valueClass)}>
        {formatInt(count)}
      </span>
      <span className="text-[9px] font-medium uppercase leading-tight tracking-wide text-zinc-500 dark:text-zinc-400">
        {cell.name}
      </span>
      {cell.kind === "bad" && count === 0 ? (
        <span className="text-[9px] font-semibold text-emerald-600 dark:text-emerald-400">
          the safety win
        </span>
      ) : null}
    </div>
  );
}
