import { Anchor, TriangleAlert } from "lucide-react";

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
import {
  intentName,
  type Phase5GroundingOverlap,
  type Phase5QualitativeExample,
} from "@/lib/phase5";

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

interface GroundingCardProps {
  /** evaluation.test.grounding_overlap (mean/median/min/max + definition) */
  grounding: Phase5GroundingOverlap | undefined;
  /** the five qualitative examples — their grounding_overlap drives the bars */
  examples: Phase5QualitativeExample[];
  /** honest_caveats, verbatim */
  caveats: string[] | undefined;
}

/**
 * Subsection C — grounding overlap, visualised and defined honestly. The
 * bars chart the five qualitative examples' own grounding_overlap values on
 * a fixed 0–1 axis (with the recorded run's mean marked), and the caveats
 * list spells out exactly what a lexical overlap score does and does not
 * certify. All values render straight from phase5_summary.json.
 */
export function GroundingCard({
  grounding,
  examples,
  caveats,
}: GroundingCardProps) {
  /* Sort the examples by their grounding_overlap (the recorded run lists
     them lowest → highest already, but never assume it). The label keeps the
     example's position in the artifact's own list. */
  const rows = examples
    .map((example, index) => ({
      index: index + 1,
      intent: example.predicted_intent,
      value: example.grounding_overlap ?? example.scores?.grounding_overlap,
    }))
    .filter((row) => isFiniteNumber(row.value))
    .sort((a, b) => (a.value as number) - (b.value as number));

  const mean = grounding?.mean;
  const notes = caveats ?? [];

  const srSummary =
    rows.length > 0
      ? `Grounding overlap of the qualitative examples, lowest first: ${rows
          .map(
            (row) =>
              `example ${row.index} (${intentName(row.intent)}) ${formatScore(row.value)}`,
          )
          .join(", ")}. Run mean ${formatScore(mean)}. Definition: ${
            grounding?.definition ?? "not available"
          }`
      : "No grounding overlap values available.";

  return (
    <section aria-labelledby="phase5-grounding-heading" className="space-y-4">
      <SubsectionHeading
        id="phase5-grounding-heading"
        icon={Anchor}
        title="Grounding, measured honestly"
        description="How much of each reply's wording actually traces back to the retrieved evidence — a lexical token-overlap proxy, shown here with its definition and its limits."
      />

      <Card className="gap-0">
        <CardHeader className="border-b">
          <CardTitle className="text-sm">
            Grounding overlap across the qualitative examples
          </CardTitle>
          <CardDescription className="text-xs">
            {isFiniteNumber(mean)
              ? `The five worked examples below the chart span the recorded run's range; the dashed marker is the run's mean (${formatScore(
                  mean,
                )}).`
              : "The five worked examples below the chart, lowest grounding first."}
          </CardDescription>
        </CardHeader>
        <CardContent className="mt-4">
          <p className="sr-only">{srSummary}</p>

          {rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
              No grounding overlap values available.
            </p>
          ) : (
            <ul className="space-y-2.5">
              {rows.map((row) => {
                const value = row.value as number;
                return (
                  <li key={row.index} className="min-w-0">
                    <div className="flex items-baseline justify-between gap-3">
                      <span
                        className="min-w-0 truncate text-xs text-zinc-600 dark:text-zinc-400"
                        title={`example ${row.index} · predicted intent ${intentName(row.intent)}`}
                      >
                        <span className="font-medium">example {row.index}</span>
                        <span className="mx-1.5 text-zinc-300 dark:text-zinc-600" aria-hidden="true">
                          ·
                        </span>
                        {intentName(row.intent)}
                      </span>
                      <span className="shrink-0 font-mono text-xs tabular-nums text-zinc-900 dark:text-zinc-100">
                        {formatPercent(value)}
                      </span>
                    </div>
                    {/* fixed 0–1 axis: width IS the overlap share itself */}
                    <div
                      className="relative mt-1 h-2.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
                      role="img"
                      aria-label={`example ${row.index}: grounding overlap ${formatScore(value)} (${formatPercent(value)})`}
                    >
                      <div
                        className="h-full rounded-full bg-emerald-500 dark:bg-emerald-400"
                        style={{ width: `${value * 100}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {/* the run's mean, marked on the same fixed 0–1 axis */}
          {isFiniteNumber(mean) && rows.length > 0 ? (
            <div className="mt-3">
              <div
                className="relative h-2 w-full rounded-full bg-zinc-100 dark:bg-zinc-800/60"
                aria-hidden="true"
              >
                <div
                  className="absolute inset-y-0 border-l-2 border-dashed border-zinc-500/70 dark:border-zinc-300/70"
                  style={{ left: `${(mean as number) * 100}%` }}
                  title={`run mean ${formatScore(mean)}`}
                />
              </div>
              <p className="mt-1.5 flex items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                <span
                  aria-hidden="true"
                  className="inline-block h-3 w-0 border-l-2 border-dashed border-zinc-500/70 dark:border-zinc-300/70"
                />
                dashed tick — run mean {formatScore(mean)}. Bars are drawn on a
                fixed 0–1 overlap axis, so a 0.70 bar really is 70% of the
                reply&apos;s content tokens.
              </p>
            </div>
          ) : null}

          {grounding?.definition ? (
            <p className="mt-4 rounded-lg border border-zinc-200/80 bg-zinc-100/60 px-3 py-2 text-[11px] leading-relaxed text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
              <span className="font-medium">How it is computed: </span>
              {grounding.definition}.
            </p>
          ) : null}

          {/* -------- measurement honesty -------- */}
          {notes.length > 0 ? (
            <div className="mt-4 min-w-0 rounded-lg border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900/60 dark:bg-amber-950/20">
              <p className="flex items-center gap-2 text-xs font-medium text-amber-900 dark:text-amber-200">
                <TriangleAlert
                  className="size-4 shrink-0 text-amber-500 dark:text-amber-400"
                  aria-hidden="true"
                />
                Measurement honesty — {formatInt(notes.length)} caveats,
                verbatim from the artifact
              </p>
              <ul className="mt-2 space-y-1.5">
                {notes.map((note) => (
                  <li
                    key={note}
                    className="flex gap-2 text-[11px] leading-relaxed text-amber-900/90 dark:text-amber-300/80"
                  >
                    <TriangleAlert
                      className="mt-0.5 size-3 shrink-0 text-amber-500/80 dark:text-amber-400/80"
                      aria-hidden="true"
                    />
                    <span className="min-w-0">{note}</span>
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
