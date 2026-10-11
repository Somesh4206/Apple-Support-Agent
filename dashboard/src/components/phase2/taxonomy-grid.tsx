import { Compass, Layers, LifeBuoy, UserRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { SubsectionHeading } from "@/components/phase2/subsection-heading";
import { formatInt } from "@/lib/phase1";
import { taxonomyExample, type Phase2IntentClass } from "@/lib/phase2";
import { cn } from "@/lib/utils";

interface TaxonomyGridProps {
  taxonomy: Phase2IntentClass[];
  /** golden-set example count per class label (drives the count bars) */
  classCounts: Record<string, number> | undefined;
  /** golden-set total, for the per-class share tooltip */
  goldenTotal: number | undefined;
}

/**
 * Subsection A — the 10-class intent taxonomy: one card per class with the
 * EDA anchor it was derived from, the escalation hint, a count-per-class bar
 * (golden_set.class_counts) and an example customer message.
 */
export function TaxonomyGrid({
  taxonomy,
  classCounts,
  goldenTotal,
}: TaxonomyGridProps) {
  const classes = taxonomy;
  const maxCount = Object.values(classCounts ?? {}).reduce(
    (max, count) => Math.max(max, count),
    0,
  );
  const srSummary = classes
    .map(
      (intent) =>
        `${intent.name ?? intent.label ?? "class"} (${intent.label ?? "?"}): ${
          classCounts?.[intent.label ?? ""] ?? 0
        } golden examples${intent.typically_escalated ? ", usually escalated" : ""}`,
    )
    .join("; ");

  return (
    <section aria-labelledby="phase2-taxonomy-heading" className="space-y-4">
      <SubsectionHeading
        id="phase2-taxonomy-heading"
        icon={Layers}
        title="Intent taxonomy"
        description="Ten classes, each anchored to the Phase 1 EDA topic distribution it was derived from. The amber badge marks classes that usually route to a human agent; the bar shows how many golden-set examples the class has."
      />
      {classes.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No taxonomy classes available.
        </p>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {classes.map((intent, index) => {
            const label = intent.label ?? `class-${index}`;
            const count = classCounts?.[label] ?? 0;
            const barWidth =
              maxCount > 0 ? Math.max((count / maxCount) * 100, count > 0 ? 4 : 0) : 0;
            const escalated = intent.typically_escalated === true;
            const example = taxonomyExample(intent.examples);
            const share =
              goldenTotal && goldenTotal > 0 && count > 0
                ? ` — ${((count / goldenTotal) * 100).toFixed(1)}% of the golden set`
                : "";
            return (
              <li key={label} className="min-w-0">
                <Card className="h-full gap-0 p-4 transition-all duration-200 hover:shadow-md motion-safe:hover:-translate-y-0.5 dark:hover:shadow-emerald-500/10">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <span className="font-mono text-[10px] tabular-nums text-zinc-400 dark:text-zinc-500">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                          {intent.name ?? label}
                        </h4>
                      </div>
                      <p className="mt-0.5 font-mono text-[10px] text-zinc-400 dark:text-zinc-500">
                        {label}
                      </p>
                    </div>
                    {escalated ? (
                      <Badge className="shrink-0 border border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                        usually escalated
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="shrink-0 border-zinc-200 bg-zinc-100 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
                      >
                        auto-handlable
                      </Badge>
                    )}
                  </div>

                  {intent.description ? (
                    <p className="mt-2.5 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                      {intent.description}
                    </p>
                  ) : null}

                  {intent.eda_anchor ? (
                    <p className="mt-2.5 flex items-start gap-1.5 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                      <Compass
                        className="mt-0.5 size-3.5 shrink-0 text-emerald-600/80 dark:text-emerald-400/80"
                        aria-hidden="true"
                      />
                      <span>
                        <span className="font-medium text-zinc-600 dark:text-zinc-300">
                          EDA anchor:{" "}
                        </span>
                        {intent.eda_anchor}
                      </span>
                    </p>
                  ) : null}

                  {intent.escalation_hint ? (
                    <p
                      className={cn(
                        "mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed",
                        escalated
                          ? "text-amber-700 dark:text-amber-300"
                          : "text-zinc-500 dark:text-zinc-400",
                      )}
                    >
                      {escalated ? (
                        <UserRound
                          className="mt-0.5 size-3.5 shrink-0 text-amber-500 dark:text-amber-400"
                          aria-hidden="true"
                        />
                      ) : (
                        <LifeBuoy
                          className="mt-0.5 size-3.5 shrink-0 text-emerald-600/80 dark:text-emerald-400/80"
                          aria-hidden="true"
                        />
                      )}
                      <span>
                        <span
                          className={cn(
                            "font-medium",
                            escalated
                              ? "text-amber-800 dark:text-amber-200"
                              : "text-zinc-600 dark:text-zinc-300",
                          )}
                        >
                          Escalation:{" "}
                        </span>
                        {intent.escalation_hint}
                      </span>
                    </p>
                  ) : null}

                  <div className="mt-3">
                    <div className="flex items-center justify-between text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      <span>In golden set</span>
                      <span className="tabular-nums text-zinc-700 dark:text-zinc-300">
                        {formatInt(count)}
                      </span>
                    </div>
                    <div
                      className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-emerald-100 dark:bg-emerald-900/30"
                      role="img"
                      aria-label={`${formatInt(count)} of ${formatInt(
                        goldenTotal,
                      )} golden examples${share}`}
                      title={`${label}: ${formatInt(count)} golden examples${share}`}
                    >
                      <div
                        className="h-full rounded-full bg-emerald-500 dark:bg-emerald-400"
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                  </div>

                  {example ? (
                    <blockquote className="mt-3 rounded-r-md border-l-2 border-emerald-300 bg-emerald-50/60 py-1.5 pl-3 pr-2 text-xs italic leading-relaxed text-zinc-600 dark:border-emerald-700 dark:bg-emerald-950/30 dark:text-zinc-400">
                      “{example}”
                    </blockquote>
                  ) : null}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
      <p className="sr-only">{srSummary}</p>
    </section>
  );
}
