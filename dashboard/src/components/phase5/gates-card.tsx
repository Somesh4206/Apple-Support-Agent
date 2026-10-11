import { ShieldQuestion } from "lucide-react";

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
import type { Phase5Config, Phase5TestEvaluation } from "@/lib/phase5";

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

interface GatesCardProps {
  test: Phase5TestEvaluation;
  /** the run's gate thresholds (0.60 / 0.65) */
  config: Phase5Config | undefined;
}

/**
 * Subsection D — the Phase 6 escalation preview. The two gates Phase 6 will
 * use (intent confidence from the Phase 3 head, top-1 cosine from the Phase
 * 4 index) are applied to every generated reply here; this card shows how
 * often each gate passes and how consistently the gated replies behaved
 * (clarifying question or DM redirect instead of specific advice). The
 * escalation policy itself is not implemented yet — this is a preview.
 */
export function GatesCard({ test, config }: GatesCardProps) {
  const gates = test.gates ?? {};
  const escalation = test.escalation_consistency ?? {};
  const nTotal = test.n_total;

  const intentThreshold = config?.intent_confidence_threshold;
  const retrievalThreshold = config?.retrieval_threshold;

  /* Derived, never asserted: the gated set is the complement of the
     auto-eligible set (13 = 29 − 16). */
  const gatedDerived =
    isFiniteNumber(escalation.gated_n) &&
    isFiniteNumber(gates.auto_eligible_n) &&
    isFiniteNumber(nTotal)
      ? escalation.gated_n === nTotal - gates.auto_eligible_n
      : undefined;

  const bars: Array<{
    key: string;
    label: string;
    pass: number | undefined;
    thresholdLabel: string;
    hint: string;
  }> = [
    {
      key: "intent",
      label: "Intent gate",
      pass: gates.intent_pass_n,
      thresholdLabel: isFiniteNumber(intentThreshold)
        ? `confidence ≥ ${intentThreshold.toFixed(2)}`
        : "confidence threshold",
      hint: "openers whose predicted intent clears the Phase 3 head's confidence bar",
    },
    {
      key: "retrieval",
      label: "Retrieval gate",
      pass: gates.retrieval_pass_n,
      thresholdLabel: isFiniteNumber(retrievalThreshold)
        ? `top-1 cosine ≥ ${retrievalThreshold.toFixed(2)}`
        : "retrieval threshold",
      hint: "openers whose strongest evidence pair is similar enough to trust",
    },
    {
      key: "auto",
      label: "Auto-handle eligible",
      pass: gates.auto_eligible_n,
      thresholdLabel: "both gates pass",
      hint: `replies a Phase 6 agent could answer unaided (${formatPercent(
        gates.auto_eligible_rate,
      )})`,
    },
  ];

  const srSummary =
    bars
      .map(
        (bar) =>
          `${bar.label}: ${isFiniteNumber(bar.pass) && isFiniteNumber(nTotal) ? `${formatInt(bar.pass)} of ${formatInt(nTotal)}` : "—"}`,
      )
      .join("; ") +
    `. Escalation consistency: ${
      isFiniteNumber(escalation.consistent_n) && isFiniteNumber(escalation.gated_n)
        ? `${formatInt(escalation.consistent_n)} of ${formatInt(escalation.gated_n)}`
        : "—"
    } gated replies stayed non-committal.`;

  return (
    <section aria-labelledby="phase5-gates-heading" className="space-y-4">
      <SubsectionHeading
        id="phase5-gates-heading"
        icon={ShieldQuestion}
        title="The escalation gates — a Phase 6 preview"
        description="Every reply was also run through the two gates the Phase 6 escalation policy will use. This is a preview only: the policy itself is not implemented yet."
      />

      <Card className="gap-0">
        <CardHeader className="border-b">
          <CardTitle className="text-sm">
            How far could a Phase 6 agent go on its own?
          </CardTitle>
          <CardDescription className="text-xs">
            Pass counts over the{" "}
            {isFiniteNumber(nTotal) ? formatInt(nTotal) : "—"} golden TEST
            openers, measured on the same recorded replies as the metrics
            above.
          </CardDescription>
        </CardHeader>
        <CardContent className="mt-4">
          <p className="sr-only">{srSummary}</p>

          <ul className="space-y-4">
            {bars.map((bar) => {
              const pass = bar.pass;
              const share =
                isFiniteNumber(pass) && isFiniteNumber(nTotal) && nTotal > 0
                  ? pass / nTotal
                  : undefined;
              return (
                <li key={bar.key} className="min-w-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                      {bar.label}
                      <span className="ml-2 font-mono text-[10px] font-normal tabular-nums text-zinc-500 dark:text-zinc-400">
                        {bar.thresholdLabel}
                      </span>
                    </span>
                    <span className="shrink-0 font-mono text-xs tabular-nums text-zinc-900 dark:text-zinc-100">
                      {isFiniteNumber(pass) && isFiniteNumber(nTotal)
                        ? `${formatInt(pass)} / ${formatInt(nTotal)}`
                        : "—"}
                      {isFiniteNumber(share) ? (
                        <span className="ml-1.5 text-zinc-400 dark:text-zinc-500">
                          {formatPercent(share)}
                        </span>
                      ) : null}
                    </span>
                  </div>
                  <div
                    className="mt-1 flex h-3 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
                    role="img"
                    aria-label={`${bar.label}: ${isFiniteNumber(pass) ? formatInt(pass) : "—"} of ${isFiniteNumber(nTotal) ? formatInt(nTotal) : "—"} openers pass (${isFiniteNumber(share) ? formatPercent(share) : "—"})`}
                  >
                    {isFiniteNumber(share) ? (
                      <div
                        className={
                          bar.key === "auto"
                            ? "h-full rounded-full bg-emerald-500 dark:bg-emerald-400"
                            : "h-full rounded-full bg-emerald-500/70 dark:bg-emerald-400/70"
                        }
                        style={{ width: `${share * 100}%` }}
                        title={`${bar.label}: ${formatInt(pass as number)} of ${formatInt(nTotal as number)} (${formatPercent(share)})`}
                      />
                    ) : null}
                  </div>
                  <p className="mt-1 text-[10px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                    {bar.hint}
                  </p>
                </li>
              );
            })}
          </ul>

          {/* escalation consistency */}
          <div className="mt-5 min-w-0 rounded-lg border border-zinc-100 bg-zinc-50/60 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
            <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs font-medium text-zinc-700 dark:text-zinc-300">
              <span>Escalation consistency</span>
              <span className="font-mono text-[10px] font-normal tabular-nums text-zinc-500 dark:text-zinc-400">
                {isFiniteNumber(escalation.consistent_n) &&
                isFiniteNumber(escalation.gated_n)
                  ? `${formatInt(escalation.consistent_n)} / ${formatInt(escalation.gated_n)}`
                  : "—"}
                {isFiniteNumber(escalation.rate) ? (
                  <span className="ml-1.5 text-emerald-600 dark:text-emerald-400">
                    {formatPercent(escalation.rate)}
                  </span>
                ) : null}
              </span>
            </p>
            {escalation.definition ? (
              <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-400">
                {escalation.definition}.
              </p>
            ) : (
              <p className="mt-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                No escalation-consistency definition available.
              </p>
            )}
            {escalation.gated_n !== undefined ? (
              <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                The gated set is the complement of the auto-eligible set —{" "}
                {isFiniteNumber(nTotal) ? formatInt(nTotal) : "—"} minus{" "}
                {isFiniteNumber(gates.auto_eligible_n)
                  ? formatInt(gates.auto_eligible_n)
                  : "—"}{" "}
                replies
                {gatedDerived === true ? " (matches the recorded count)" : ""}
                . Where both gates fail, the safety rules already push the LLM
                toward a clarifying question or a DM redirect instead of
                specific advice — which is exactly what a Phase 6 escalation
                would do.
              </p>
            ) : null}
          </div>

          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-[11px] leading-relaxed text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-300/80">
            Preview only — the Phase 6 escalation policy is not implemented
            yet. These gate counts describe the recorded Phase 5 run; Phase 6
            will consume the same two thresholds and add the actual
            escalate/auto-handle decision.
          </p>
        </CardContent>
      </Card>
    </section>
  );
}
