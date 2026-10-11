import { ListChecks } from "lucide-react";

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
import { formatInt } from "@/lib/phase1";
import { formatScore, shortLabel } from "@/lib/phase2";
import type { Phase3PerClassRow } from "@/lib/phase3";
import { cn } from "@/lib/utils";

interface PerClassTableProps {
  rows: Phase3PerClassRow[];
  headLabel: string;
}

/**
 * Per-class test report of the selected Phase 3 head: precision / recall /
 * F1 / support for each of the 10 taxonomy classes. Classes with support 0
 * are annotated — their metrics are undefined by convention (reported as 0).
 */
export function PerClassTable({ rows, headLabel }: PerClassTableProps) {
  const supportTotal = rows.reduce(
    (sum, row) => sum + (typeof row.support === "number" ? row.support : 0),
    0,
  );

  return (
    <Card className="gap-0">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2 text-sm">
          <ListChecks
            className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
            aria-hidden="true"
          />
          {headLabel} — per-class test report
        </CardTitle>
        <CardDescription className="text-xs">
          Precision, recall and F1 by class on the untouched test split. Σ
          support = {formatInt(supportTotal)} examples.
        </CardDescription>
      </CardHeader>
      <CardContent className="mt-4">
        <p className="sr-only">
          Per-class test report of the {headLabel}:{" "}
          {rows
            .map(
              (row) =>
                `${row.label ?? "unknown"}: precision ${formatScore(
                  row.precision,
                )}, recall ${formatScore(row.recall)}, F1 ${formatScore(
                  row.f1,
                )}, support ${formatInt(row.support)}`,
            )
            .join("; ")}
          .
        </p>
        <div className="max-h-96 overflow-auto rounded-lg border border-zinc-200 dark:border-zinc-800 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-zinc-300 dark:[&::-webkit-scrollbar-thumb]:bg-zinc-700 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-zinc-100 dark:[&::-webkit-scrollbar-track]:bg-zinc-800/80">
          <Table className="text-xs">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="sticky top-0 z-10 h-8 bg-zinc-50 px-2 text-left text-[10px] dark:bg-zinc-900">
                  Class
                </TableHead>
                <TableHead className="sticky top-0 z-10 h-8 bg-zinc-50 px-2 text-right text-[10px] dark:bg-zinc-900">
                  Precision
                </TableHead>
                <TableHead className="sticky top-0 z-10 h-8 bg-zinc-50 px-2 text-right text-[10px] dark:bg-zinc-900">
                  Recall
                </TableHead>
                <TableHead className="sticky top-0 z-10 h-8 bg-zinc-50 px-2 text-right text-[10px] dark:bg-zinc-900">
                  F1
                </TableHead>
                <TableHead className="sticky top-0 z-10 h-8 bg-zinc-50 px-2 text-right text-[10px] dark:bg-zinc-900">
                  Support
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const support = row.support;
                const noSupport = typeof support === "number" && support === 0;
                const positiveF1 =
                  typeof row.f1 === "number" && Number.isFinite(row.f1) && row.f1 > 0;
                return (
                  <TableRow
                    key={row.label ?? "unknown"}
                    className={cn(
                      "font-mono tabular-nums",
                      noSupport
                        ? "text-zinc-400 dark:text-zinc-600"
                        : "text-zinc-700 dark:text-zinc-300",
                    )}
                    title={
                      noSupport
                        ? "No test examples of this class — metrics are undefined (reported as 0)"
                        : undefined
                    }
                  >
                    <TableCell className="max-w-[10rem] truncate whitespace-nowrap px-2 py-1.5">
                      <span title={row.label}>
                        <span className="hidden 2xl:inline">{row.label}</span>
                        <span className="2xl:hidden">
                          {shortLabel(row.label ?? "—")}
                        </span>
                      </span>
                    </TableCell>
                    <TableCell
                      className={cn(
                        "px-2 py-1.5 text-right",
                        positiveF1 && "font-medium",
                      )}
                    >
                      {formatScore(row.precision)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "px-2 py-1.5 text-right",
                        positiveF1 && "font-medium",
                      )}
                    >
                      {formatScore(row.recall)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "px-2 py-1.5 text-right",
                        positiveF1 && "font-medium text-emerald-700 dark:text-emerald-300",
                      )}
                    >
                      {formatScore(row.f1)}
                    </TableCell>
                    <TableCell className="px-2 py-1.5 text-right">
                      {noSupport ? "0*" : formatInt(support)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
          <span className="font-medium">*</span> No test examples of this
          class — its metrics are undefined (reported as 0 by the evaluator and
          excluded from classes_evaluated). Rows with F1 &gt; 0 are exactly the
          classes the Phase 2 learned baseline could not score on at all.
        </p>
      </CardContent>
    </Card>
  );
}
