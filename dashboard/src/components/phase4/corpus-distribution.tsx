import { BarChart3 } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SubsectionHeading } from "@/components/phase2/subsection-heading";
import { formatInt, formatPercent } from "@/lib/phase1";
import { intentName } from "@/lib/phase4";

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

interface CorpusDistributionProps {
  /** predicted-intent label -> pair count over the indexed corpus */
  distribution: Record<string, number> | undefined;
}

/**
 * Subsection D — predicted-intent distribution of the indexed corpus. The
 * counts come straight from corpus_label_distribution; shares are computed
 * against the distribution's own total. software_bug dominating ~69% of the
 * corpus is itself an honest EDA-anchored finding, not a bug: the historical
 * AppleSupport traffic skews heavily to software complaints, mirroring the
 * dominance already seen in the Phase 1 topics and the Phase 2 golden set.
 */
export function CorpusDistribution({
  distribution,
}: CorpusDistributionProps) {
  const rows = Object.entries(distribution ?? {})
    .filter(([, count]) => isFiniteNumber(count))
    .sort((a, b) => (b[1] as number) - (a[1] as number));

  const total = rows.reduce((sum, [, count]) => sum + (count as number), 0);
  const max = rows.length > 0 ? (rows[0]?.[1] as number) : 0;
  const dominant = rows[0]?.[0];
  const dominantShare =
    isFiniteNumber(total) && total > 0 && dominant !== undefined
      ? ((rows[0]?.[1] as number) / total)
      : undefined;

  const srSummary =
    rows.length > 0
      ? `Predicted-intent distribution over the indexed corpus: ${rows
          .map(([label, count]) => `${intentName(label)} ${formatInt(count)}`)
          .join(", ")}.`
      : "No corpus label distribution available.";

  return (
    <section
      aria-labelledby="phase4-corpus-heading"
      className="space-y-4"
    >
      <SubsectionHeading
        id="phase4-corpus-heading"
        icon={BarChart3}
        title="What the evidence corpus is made of"
        description="Predicted-intent counts over the indexed pairs — a view of the historical traffic the retriever draws from, and of the imbalance any kNN majority vote inherits."
      />

      <Card className="gap-0">
        <CardHeader className="border-b">
          <CardTitle className="text-sm">
            {dominant !== undefined
              ? `${intentName(dominant)} dominates the retrievable evidence`
              : "Predicted intents across the indexed corpus"}
          </CardTitle>
          <CardDescription className="text-xs">
            {isFiniteNumber(dominantShare)
              ? `${intentName(dominant)} accounts for ${formatPercent(
                  dominantShare,
                )} of the ${formatInt(total)} indexed pairs — the corpus mirrors the software_bug dominance the Phase 1 EDA topics and the Phase 2 golden set already showed.`
              : "Labels are Phase 3 head predictions over the embedded customer messages."}
          </CardDescription>
        </CardHeader>
        <CardContent className="mt-4">
          <p className="sr-only">{srSummary}</p>
          {rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
              No corpus label distribution available.
            </p>
          ) : (
            <ul className="space-y-2.5">
              {rows.map(([label, count]) => {
                const share =
                  isFiniteNumber(total) && total > 0
                    ? (count as number) / total
                    : undefined;
                const width =
                  isFiniteNumber(max) && max > 0
                    ? ((count as number) / max) * 100
                    : 0;
                const isDominant = label === dominant;
                return (
                  <li key={label} className="min-w-0">
                    <div className="flex items-baseline justify-between gap-3">
                      <span
                        className="min-w-0 truncate text-xs text-zinc-600 dark:text-zinc-400"
                        title={`${intentName(label)} (${label})`}
                      >
                        {intentName(label)}
                      </span>
                      <span className="shrink-0 font-mono text-xs tabular-nums text-zinc-900 dark:text-zinc-100">
                        {formatInt(count as number)}
                        <span className="ml-1.5 text-zinc-400 dark:text-zinc-500">
                          {isFiniteNumber(share)
                            ? formatPercent(share)
                            : "—"}
                        </span>
                      </span>
                    </div>
                    <div
                      className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
                      role="img"
                      aria-label={`${intentName(label)}: ${formatInt(count as number)} pairs${isFiniteNumber(share) ? `, ${formatPercent(share)} of the corpus` : ""}`}
                    >
                      <div
                        className={
                          isDominant
                            ? "h-full rounded-full bg-emerald-500 dark:bg-emerald-400"
                            : "h-full rounded-full bg-emerald-500/60 dark:bg-emerald-400/60"
                        }
                        style={{ width: `${width}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <p className="mt-4 rounded-lg border border-zinc-200/80 bg-zinc-100/60 px-3 py-2 text-[11px] leading-relaxed text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
            These are <span className="font-medium">Phase 3 head
            predictions</span>, not hand labels — the historical corpus is
            unlabeled, so its &ldquo;shape&rdquo; is seen through the same
            noisy classifier the relevance definition above discloses. The
            imbalance is real either way: a kNN majority vote over these pairs
            starts from the same dominant software_bug prior shown above,
            which is also why software_bug openers retrieve well.
          </p>
        </CardContent>
      </Card>
    </section>
  );
}
