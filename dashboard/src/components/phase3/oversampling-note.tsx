import { Scale } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SubsectionHeading } from "@/components/phase2/subsection-heading";
import { formatScore } from "@/lib/phase2";
import type { Phase3OversamplingNote } from "@/lib/phase3";
import { cn } from "@/lib/utils";

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/**
 * Subsection G — the over-sampling question, answered by the same CV
 * criterion that selected the head: class_weight="balanced" (the linear-head
 * equivalent of duplicating rare examples) beat unweighted training on the
 * selection metric, so it was selected by measurement, not assumption.
 */
export function OversamplingNote({
  note,
}: {
  note: Phase3OversamplingNote;
}) {
  const unweighted = note.best_unweighted_cv;
  const balanced = note.best_balanced_cv;
  const balancedMacro = balanced?.cv_train_macro_f1;
  const unweightedMacro = unweighted?.cv_train_macro_f1;
  const macroDelta =
    isFiniteNumber(balancedMacro) && isFiniteNumber(unweightedMacro)
      ? balancedMacro - unweightedMacro
      : undefined;

  return (
    <section aria-labelledby="phase3-oversampling-heading" className="space-y-4">
      <SubsectionHeading
        id="phase3-oversampling-heading"
        icon={Scale}
        title="Would over-sampling rare classes help?"
        description="Answered under the same CV-on-train criterion that selected the head — before the test split was ever touched."
      />

      <Card className="gap-0">
        <CardHeader className="border-b">
          <CardTitle className="text-sm">
            class_weight=&quot;balanced&quot; vs None — CV on train
          </CardTitle>
          <CardDescription className="text-xs">
            {note.question ??
              "Does rare-class over-sampling help at this train size with a frozen encoder?"}
          </CardDescription>
        </CardHeader>
        <CardContent className="mt-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <CvBlock
              title="Best unweighted CV"
              candidate={unweighted}
              weightLabel="None"
              tone="zinc"
            />
            <CvBlock
              title="Best balanced CV — selected"
              candidate={balanced}
              weightLabel="balanced"
              tone="emerald"
              badge
            />
          </div>

          <p className="mt-4 flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-lg border border-zinc-200/80 bg-zinc-100/60 px-3 py-2 text-xs leading-relaxed text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">
              Verdict:
            </span>
            {note.verdict ??
              "Selected by the same CV criterion — measurement, not assumption."}
            {macroDelta !== undefined ? (
              <span className="ml-auto shrink-0 font-mono text-xs font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
                Δ CV macro-F1 +{macroDelta.toFixed(4)}
              </span>
            ) : null}
          </p>
          <p className="mt-2 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
            class_weight=&quot;balanced&quot; is the linear-head equivalent of
            over-sampling rare classes: every class contributes equally to the
            loss regardless of its train frequency. The full 8-candidate grid
            (both weightings × four C values) is shown on the LogReg head card
            above.
          </p>
        </CardContent>
      </Card>
    </section>
  );
}

function CvBlock({
  title,
  candidate,
  weightLabel,
  tone,
  badge,
}: {
  title: string;
  candidate: Phase3OversamplingNote["best_unweighted_cv"];
  /** class_weight of this candidate — implied by the key name
      (best_unweighted_cv / best_balanced_cv), not stored per object. */
  weightLabel: string;
  tone: "zinc" | "emerald";
  badge?: boolean;
}) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-lg border p-3",
        tone === "emerald"
          ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/60 dark:bg-emerald-950/20"
          : "border-zinc-100 bg-zinc-50/60 dark:border-zinc-800 dark:bg-zinc-900/40",
      )}
    >
      <p className="flex flex-wrap items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {title}
        {badge ? (
          <span className="inline-flex items-center rounded-full border border-emerald-300 bg-emerald-100 px-1.5 py-px text-[9px] font-semibold normal-case tracking-normal text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
            winner by CV
          </span>
        ) : null}
      </p>
      <p className="mt-1.5 text-lg font-bold tabular-nums text-zinc-900 sm:text-xl dark:text-zinc-100">
        {formatScore(candidate?.cv_train_macro_f1)}
        <span className="ml-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">
          CV macro-F1
        </span>
      </p>
      <div className="mt-1.5 space-y-0.5 font-mono text-[10px] tabular-nums text-zinc-500 dark:text-zinc-400">
        <p>
          C = {isFiniteNumber(candidate?.C) ? candidate?.C?.toFixed(1) : "—"}{" "}
          · class_weight = {weightLabel}
        </p>
        <p>
          CV acc {formatScore(candidate?.cv_train_accuracy)} · CV mean{" "}
          {formatScore(candidate?.cv_train_mean_score)}
        </p>
      </div>
    </div>
  );
}
