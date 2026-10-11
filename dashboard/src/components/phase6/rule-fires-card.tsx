import { BarChart3 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SubsectionHeading } from "@/components/phase2/subsection-heading";
import { formatInt } from "@/lib/phase1";
import { RULE_ORDER, type Phase6Policy } from "@/lib/phase6";
import { cn } from "@/lib/utils";

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/** Human labels for the rule families — the same vocabulary the rules card uses. */
const RULE_FAMILY_LABEL: Record<string, string> = {
  E2: "domain rule",
  E3: "domain rule",
  E4: "content rule",
  G1: "numeric gate",
  G2: "numeric gate",
};

interface RuleFiresCardProps {
  /** evaluation.rule_fire_counts — fires per rule id over the test set */
  fireCounts: Record<string, number> | undefined;
  /** policy.rules — for the rule names behind the ids */
  policy: Phase6Policy | undefined;
}

/**
 * Subsection D — how often each rule fired across the 29 golden TEST
 * openers. A message can fire several rules at once (10 G1 fires and 6 G2
 * fires overlap on the 4 over-escalations), so the bars do not sum to the
 * escalation count — the caption says so.
 */
export function RuleFiresCard({ fireCounts, policy }: RuleFiresCardProps) {
  const rules = policy?.rules ?? [];
  const ruleName = (id: string): string | undefined =>
    rules.find((rule) => rule.id === id)?.name;

  /* Rule ids in the canonical order; any unexpected ids sort last. */
  const entries = Object.entries(fireCounts ?? {})
    .filter(([, count]) => isFiniteNumber(count))
    .sort((a, b) => {
      const ia = RULE_ORDER.indexOf(a[0]);
      const ib = RULE_ORDER.indexOf(b[0]);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });

  const max = entries.reduce(
    (acc, [, count]) => Math.max(acc, count as number),
    0,
  );
  const totalFires = entries.reduce((sum, [, count]) => sum + (count as number), 0);
  const isGate = (id: string) => id.startsWith("G");

  const srSummary =
    entries.length > 0
      ? `Rule fires across the test set: ${entries
          .map(([id, count]) => `${id} ${formatInt(count as number)}`)
          .join(", ")}. A message can fire several rules at once, so the counts overlap.`
      : "No rule fire counts available.";

  return (
    <section aria-labelledby="phase6-fires-heading" className="space-y-4">
      <SubsectionHeading
        id="phase6-fires-heading"
        icon={BarChart3}
        title="Which rules did the work"
        description="Fires per rule across the golden TEST openers. The numeric gates (G1/G2) fire most — but the domain rules catch the cases the gates cannot see."
      />

      <Card className="gap-0">
        <CardHeader className="border-b">
          <CardTitle className="text-sm">
            Rule fire counts over the{" "}
            {entries.length > 0 ? "test openers" : "evaluation"}
          </CardTitle>
          <CardDescription className="text-xs">
            One escalation can fire multiple rules, so these bars overlap —
            they explain decisions, they do not partition them.
          </CardDescription>
        </CardHeader>
        <CardContent className="mt-4">
          <p className="sr-only">{srSummary}</p>
          {entries.length === 0 ? (
            <p className="py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
              No rule fire counts available.
            </p>
          ) : (
            <ul className="space-y-3">
              {entries.map(([id, count]) => {
                const width =
                  max > 0 ? ((count as number) / max) * 100 : 0;
                return (
                  <li key={id} className="min-w-0">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <Badge
                          className={cn(
                            "font-mono text-[10px]",
                            isGate(id)
                              ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
                              : "border-red-200 bg-red-50 text-red-800 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-300",
                          )}
                        >
                          {id}
                        </Badge>
                        <span className="font-mono text-[11px] text-zinc-600 dark:text-zinc-400">
                          {ruleName(id) ?? "—"}
                        </span>
                        <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                          {RULE_FAMILY_LABEL[id] ?? "rule"}
                        </span>
                      </span>
                      <span className="shrink-0 font-mono text-xs font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
                        ×{formatInt(count as number)}
                      </span>
                    </div>
                    <div
                      className="mt-1 flex h-3 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
                      role="img"
                      aria-label={`Rule ${id} fired ${formatInt(count as number)} times, the most-fired rule fired ${formatInt(max)} times`}
                    >
                      <div
                        className={cn(
                          "h-full rounded-full",
                          isGate(id)
                            ? "bg-amber-400 dark:bg-amber-500/80"
                            : "bg-red-400 dark:bg-red-500/80",
                        )}
                        style={{ width: `${width}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-4 rounded-lg border border-zinc-200/80 bg-zinc-100/60 px-3 py-2 text-[11px] leading-relaxed text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
            {formatInt(totalFires)} rule fires in total across the evaluation —
            they overlap on the same messages, and every escalate decision
            carries at least one named rule, never a score or a vibe.
          </p>
        </CardContent>
      </Card>
    </section>
  );
}
