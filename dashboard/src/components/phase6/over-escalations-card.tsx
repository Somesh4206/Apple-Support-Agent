import { CircleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SubsectionHeading } from "@/components/phase2/subsection-heading";
import { formatInt, orDash } from "@/lib/phase1";
import { formatScore } from "@/lib/phase2";
import { CUSTOM_SCROLLBAR, intentName, type Phase6OverEscalation } from "@/lib/phase6";

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/**
 * Subsection F — the four false positives, shown not hidden: messages the
 * ground truth says were safe to auto-answer but the policy escalated.
 * Every one is a G1 (or G1+E2+G2) confidence failure on a real golden
 * opener — the honest cost of the conservative design, read message by
 * message.
 */
export function OverEscalationsCard({
  examples,
}: {
  examples: Phase6OverEscalation[] | undefined;
}) {
  const list = examples ?? [];

  const srSummary =
    list.length > 0
      ? `The ${formatInt(list.length)} over-escalations: ${list
          .map(
            (example) =>
              `"${example.message}" — predicted ${intentName(
                example.predicted_intent,
              )} at confidence ${formatScore(example.intent_confidence)}, top-1 ${formatScore(
                example.top1_score,
              )}, rules ${(example.reasons_fired ?? []).join(" and ")} fired; ground truth says auto-safe because ${example.rationale}`,
          )
          .join(". ")}.`
      : "No over-escalation examples available.";

  return (
    <section
      aria-labelledby="phase6-overescalations-heading"
      className="space-y-4"
    >
      <SubsectionHeading
        id="phase6-overescalations-heading"
        icon={CircleAlert}
        title="The four over-escalations, read honestly"
        description="Every false positive of the policy — messages a human could have safely let through. They are shown, not averaged away: each one is a confidence-gate failure on a real golden opener, and the fixable kind."
      />

      <Card className="gap-0">
        <CardHeader className="border-b">
          <CardTitle className="text-sm">
            Escalated, but the ground truth says auto-safe
          </CardTitle>
          <CardDescription className="text-xs">
            {list.length > 0
              ? "Profanity and rants are quoted verbatim — these are the real golden evaluation messages."
              : "No over-escalation examples available."}
          </CardDescription>
        </CardHeader>
        <CardContent className="mt-4">
          <p className="sr-only">{srSummary}</p>
          {list.length === 0 ? (
            <p className="py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
              No over-escalation examples available.
            </p>
          ) : (
            <div
              className={`max-h-96 space-y-3 overflow-y-auto pr-1 ${CUSTOM_SCROLLBAR}`}
            >
              {list.map((example, position) => (
                <article
                  key={example.index ?? position}
                  className="min-w-0 rounded-lg border border-amber-200/80 bg-amber-50/40 p-3 dark:border-amber-900/50 dark:bg-amber-950/10"
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline" className="font-mono text-[10px]">
                      golden opener #{example.index}
                    </Badge>
                    <Badge
                      variant="outline"
                      className="font-mono text-[10px]"
                      title={`predicted intent (Phase 3 head): ${intentName(example.predicted_intent)} (${orDash(example.predicted_intent)})`}
                    >
                      {intentName(example.predicted_intent)}
                      {isFiniteNumber(example.intent_confidence) ? (
                        <span className="ml-1 tabular-nums text-zinc-400 dark:text-zinc-500">
                          {formatScore(example.intent_confidence)}
                        </span>
                      ) : null}
                    </Badge>
                    {isFiniteNumber(example.top1_score) ? (
                      <Badge
                        variant="outline"
                        className="font-mono text-[10px] tabular-nums"
                        title="top-1 cosine similarity from the Phase 4 index"
                      >
                        top-1 {formatScore(example.top1_score)}
                      </Badge>
                    ) : null}
                    {(example.reasons_fired ?? []).map((reason) => (
                      <Badge
                        key={reason}
                        className="border-amber-200 bg-amber-50 font-mono text-[10px] text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
                        title="escalation rule that fired on this message"
                      >
                        {reason}
                      </Badge>
                    ))}
                  </div>

                  <blockquote className="mt-2 border-l-2 border-zinc-200 pl-2.5 text-xs leading-relaxed text-zinc-700 dark:border-zinc-700 dark:text-zinc-300">
                    <span className="sr-only">Customer message: </span>
                    &ldquo;{orDash(example.message)}&rdquo;
                  </blockquote>

                  <p className="mt-2 text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-400">
                    <span className="font-medium">
                      Why the ground truth says auto-safe:
                    </span>{" "}
                    {orDash(example.rationale)}
                  </p>
                </article>
              ))}
            </div>
          )}

          {/* Derived, never asserted: does the intent gate (G1) fire on every
              over-escalation? Computed from reasons_fired so the caption
              cannot drift from the artifact. */}
          {(() => {
            const g1OnAll =
              list.length > 0 &&
              list.every((example) =>
                (example.reasons_fired ?? []).some((reason) =>
                  reason.startsWith("G1"),
                ),
              );
            if (!g1OnAll) return null;
            return (
              <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-[11px] leading-relaxed text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-300/80">
                The pattern: the intent gate (G1) fired on all {formatInt(list.length)}{" "}
                — the Phase 3 head was simply unsure on these messages. That is
                the deliberate trade: a confident wrong answer is worse than an
                unnecessary human one, and the honest-caveats note quantifies
                what these cost.
              </p>
            );
          })()}
        </CardContent>
      </Card>
    </section>
  );
}
