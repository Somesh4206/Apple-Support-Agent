import {
  Box,
  Cpu,
  Dices,
  Layers,
  ShieldCheck,
  Timer,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SubsectionHeading } from "@/components/phase2/subsection-heading";
import { formatInt, orDash } from "@/lib/phase1";
import type { Phase3EmbeddingModel } from "@/lib/phase3";

interface ModelCardProps {
  model: Phase3EmbeddingModel;
  seed: number | undefined;
  /** protocol sentence from the summary (rendered verbatim in the footer) */
  protocol?: string;
}

/**
 * Subsection A — the frozen encoder card: what all-MiniLM-L6-v2 is, what was
 * trained (only the head) and what was not touched (the golden test split).
 * All values render straight from phase3_summary.json.
 */
export function ModelCard({ model, seed, protocol }: ModelCardProps) {
  const embedSeconds = model.embedding_seconds_for_golden_set;
  const embedSecondsLabel =
    typeof embedSeconds === "number" && Number.isFinite(embedSeconds)
      ? embedSeconds > 0
        ? `≈ ${embedSeconds.toFixed(1)} s`
        : "0.0 s · cache hit"
      : "—";
  /* "22.3M (frozen; only the head is trained)" -> value "22.3M", note the
     parenthesised half; both halves render, never fabricated. */
  const parametersValue = model.parameters?.split("(")[0]?.trim();
  const parametersNote = model.parameters?.match(/\(([^)]*)\)/)?.[1];
  /* "external public corpus (not this dataset) — no golden leakage" -> value
     "external public corpus", note the leakage guarantee. */
  const trainedOnValue = model.trained_on?.split("(")[0]?.replace(/—.*$/, "")?.trim();
  const trainedOnNote = model.trained_on?.match(/\(([^)]*)\)/)?.[1];

  return (
    <section aria-labelledby="phase3-model-heading" className="space-y-4">
      <SubsectionHeading
        id="phase3-model-heading"
        icon={Box}
        title="The frozen encoder"
        description="One public sentence embedding model, used as a fixed feature extractor: only the small classification head on top is trained, on the train split only."
      />

      <Card className="gap-0">
        <CardHeader className="border-b">
          <CardTitle className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
            <span className="font-mono text-xs font-semibold text-emerald-700 dark:text-emerald-300">
              {orDash(model.id)}
            </span>
            <span className="text-xs font-normal text-zinc-500 dark:text-zinc-400">
              the embedding model behind both Phase 3 heads
            </span>
          </CardTitle>
          <CardDescription className="text-xs">
            A frozen sentence encoder — no fine-tuning, no golden-set leakage:
            it was trained on an external public corpus, not this dataset.
          </CardDescription>
        </CardHeader>
        <CardContent className="mt-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <MiniStat
              icon={Layers}
              label="Dimensions"
              value={formatInt(model.dim)}
              sub="dense embedding vector"
            />
            <MiniStat
              icon={Cpu}
              label="Parameters"
              value={orDash(parametersValue)}
              sub={orDash(parametersNote)}
            />
            <MiniStat
              icon={Box}
              label="Trained on"
              value={orDash(trainedOnValue)}
              sub={orDash(trainedOnNote)}
              valueTitle={model.trained_on}
            />
            <MiniStat
              icon={Cpu}
              label="Runtime"
              value={orDash(model.runtime)}
              sub="no GPU required"
            />
            <MiniStat
              icon={Timer}
              label="Embed golden set"
              value={embedSecondsLabel}
              sub={
                embedSeconds === 0
                  ? "computed once, then cached (models/embedding_cache/)"
                  : "one-time cost, then cached"
              }
            />
            <MiniStat
              icon={Dices}
              label="Random seed"
              value={formatInt(seed)}
              sub="deterministic end-to-end"
            />
          </div>

          <p className="mt-4 rounded-lg border border-zinc-200/80 bg-zinc-100/60 px-3 py-2 text-xs leading-relaxed text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">
              Protocol:{" "}
            </span>
            {orDash(protocol)}
          </p>

          <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
            <ShieldCheck
              className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
              aria-hidden="true"
            />
            Because the encoder is frozen and public, the only thing Phase 3
            trains is the head — the comparison against the Phase 2 baselines
            therefore isolates the feature representation, not the training
            budget.
          </p>
        </CardContent>
      </Card>
    </section>
  );
}

function MiniStat({
  icon: Icon,
  label,
  value,
  sub,
  valueTitle,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string;
  valueTitle?: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-zinc-100 bg-zinc-50/60 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        <Icon
          className="size-3 shrink-0 text-emerald-600 dark:text-emerald-400"
          aria-hidden="true"
        />
        <span className="truncate">{label}</span>
      </div>
      <p
        className="mt-1 truncate text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-100"
        title={valueTitle ?? value}
      >
        {value}
      </p>
      {sub ? (
        <p
          className="mt-0.5 text-[10px] leading-relaxed text-zinc-500 dark:text-zinc-400"
          title={sub}
        >
          {sub}
        </p>
      ) : null}
    </div>
  );
}
