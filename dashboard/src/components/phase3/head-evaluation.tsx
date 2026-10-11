"use client";

import { Table2 } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SubsectionHeading } from "@/components/phase2/subsection-heading";
import { Phase3ConfusionMatrix } from "@/components/phase3/confusion-matrix";
import { PerClassTable } from "@/components/phase3/per-class-table";
import {
  HEAD_LABELS,
  HEAD_ORDER,
  type Phase3ComparisonTest,
  type Phase3Heads,
  type Phase3HeadKey,
} from "@/lib/phase3";

interface HeadEvaluationProps {
  heads: Phase3Heads;
  comparison: Phase3ComparisonTest;
}

/**
 * Subsection D — confusion matrix + per-class test report behind a head
 * toggle. Default: the CV-selected LogReg head; the prototype head is one
 * tab away. Both read the same untouched 29-example test split, and the
 * matrix card compares "distinct predicted classes" against the Phase 2
 * learned baseline measured in the same artifact.
 */
export function HeadEvaluation({ heads, comparison }: HeadEvaluationProps) {
  const availableHeads = HEAD_ORDER.filter(
    (key) => (heads[key]?.confusion_matrix_test?.matrix?.length ?? 0) > 0,
  );
  const baselineConfusion = comparison.tfidf_logreg?.confusion_matrix;

  if (availableHeads.length === 0) {
    return (
      <section aria-labelledby="phase3-evaluation-heading" className="space-y-4">
        <SubsectionHeading
          id="phase3-evaluation-heading"
          icon={Table2}
          title="Confusion matrix + per-class report"
          description="Per-head test evaluation of the Phase 3 classifiers."
        />
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No confusion matrix available for either head.
        </p>
      </section>
    );
  }

  const headContent = (key: Phase3HeadKey) => {
    const head = heads[key];
    return (
      <>
        <Phase3ConfusionMatrix
          confusion={head?.confusion_matrix_test}
          headLabel={HEAD_LABELS[key]}
          baselineConfusion={baselineConfusion}
        />
        <PerClassTable
          rows={head?.per_class_test ?? []}
          headLabel={HEAD_LABELS[key]}
        />
      </>
    );
  };

  const singleHead = availableHeads.length === 1 ? availableHeads[0] : undefined;

  return (
    <section aria-labelledby="phase3-evaluation-heading" className="space-y-4">
      <SubsectionHeading
        id="phase3-evaluation-heading"
        icon={Table2}
        title="Confusion matrix + per-class report"
        description="Every test example of the selected head, by true label (rows) and predicted label (columns) — plus the per-class precision / recall / F1 table. Toggle between the two heads; the matrix card compares them against the Phase 2 learned baseline."
      />

      {availableHeads.length > 1 ? (
        <Tabs defaultValue="logreg_head" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <TabsList className="h-9">
              {availableHeads.map((key) => (
                <TabsTrigger key={key} value={key} className="text-xs">
                  {HEAD_LABELS[key]}
                </TabsTrigger>
              ))}
            </TabsList>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              Default: the CV-selected LogReg head (test accuracy winner).
            </p>
          </div>
          {availableHeads.map((key) => (
            <TabsContent key={key} value={key} className="space-y-4">
              {headContent(key)}
            </TabsContent>
          ))}
        </Tabs>
      ) : singleHead ? (
        <div className="space-y-4">{headContent(singleHead)}</div>
      ) : null}
    </section>
  );
}
