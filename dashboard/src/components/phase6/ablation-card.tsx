import { ArrowLeftRight, ShieldCheck } from "lucide-react";

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
import {
  intentName,
  type Phase6Ablation,
  type Phase6PerExample,
} from "@/lib/phase6";

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

interface AblationCardProps {
  ablation: Phase6Ablation | undefined;
  /** delta-matched per-example records (optional, from the status route) */
  details: Phase6PerExample[] | undefined;
}

/**
 * Subsection E — the ablation against the Phase 5 preview. The Phase 5 gates
 * alone (confidence ≥ 0.60 AND top-1 ≥ 0.65) would auto-handle 16 of 29
 * openers; the Phase 6 policy auto-handles 15. Exactly one message flips —
 * golden test opener #25, an iCloud sign-in loop that passes BOTH gates and
 * whose ground truth is escalate. This is the whole argument for the domain
 * rules: the gates cannot see account stakes, rule E2 can.
 */
export function AblationCard({ ablation, details }: AblationCardProps) {
  const gatesOnly = ablation?.gates_only_auto_n;
  const policyAuto = ablation?.policy_auto_n;
  const deltas = ablation?.decision_deltas ?? [];

  const srSummary = [
    `Ablation against the Phase 5 gates-only preview: gates alone would auto-handle ${
      isFiniteNumber(gatesOnly) ? formatInt(gatesOnly) : "—"
    } openers, the policy auto-handles ${
      isFiniteNumber(policyAuto) ? formatInt(policyAuto) : "—"
    }.`,
    `${formatInt(deltas.length)} decision delta${deltas.length === 1 ? "" : "s"}.`,
    deltas
      .map((delta) => {
        const detail = details?.find(
          (candidate) => candidate.index === delta.index,
        );
        return `Opener ${
          delta.index
        }: "${delta.message}" — ${
          detail
            ? `predicted ${intentName(detail.predicted_intent)} at confidence ${formatScore(
                detail.intent_confidence,
              )}, top-1 score ${formatScore(detail.top1_score)}, both gates pass, but ${
              delta.reasons?.join(", ") ?? "a rule"
            } fires and the ground truth says ${delta.ground_truth}.`
            : `${delta.reasons?.join(", ") ?? "a rule"} fires; ground truth ${delta.ground_truth}.`
        }`;
      })
      .join(" "),
  ].join(" ");

  return (
    <section aria-labelledby="phase6-ablation-heading" className="space-y-4">
      <SubsectionHeading
        id="phase6-ablation-heading"
        icon={ArrowLeftRight}
        title="What the rules add over the gates alone"
        description="The Phase 5 preview treated a message as auto-handled iff both numeric gates passed. This ablation isolates the one decision that changed when the domain and content rules were added on top."
      />

      <Card className="gap-0">
        <CardHeader className="border-b">
          <CardTitle className="text-sm">
            Gates-only vs policy — one decision apart
          </CardTitle>
          <CardDescription className="text-xs">
            {orDash(ablation?.description)}
          </CardDescription>
        </CardHeader>
        <CardContent className="mt-4 space-y-4">
          <p className="sr-only">{srSummary}</p>

          {/* ---- the counts ---- */}
          <div className="grid grid-cols-2 gap-3">
            <div className="min-w-0 rounded-lg border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900/60 dark:bg-amber-950/20">
              <p className="text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-400">
                Phase 5 gates only
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-amber-900 dark:text-amber-200">
                {isFiniteNumber(gatesOnly) ? formatInt(gatesOnly) : "—"}
                <span className="ml-1 text-sm font-normal text-amber-700/80 dark:text-amber-300/70">
                  auto-eligible
                </span>
              </p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-amber-800/80 dark:text-amber-300/70">
                confidence ≥ gate AND top-1 ≥ gate, nothing else
              </p>
            </div>
            <div className="min-w-0 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-900/60 dark:bg-emerald-950/20">
              <p className="text-[10px] font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                Phase 6 policy
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-emerald-900 dark:text-emerald-100">
                {isFiniteNumber(policyAuto) ? formatInt(policyAuto) : "—"}
                <span className="ml-1 text-sm font-normal text-emerald-700/80 dark:text-emerald-300/70">
                  auto-handled
                </span>
              </p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-emerald-800/80 dark:text-emerald-300/70">
                all five rules must pass — one fewer auto decision
              </p>
            </div>
          </div>

          {/* ---- the deltas ---- */}
          {deltas.length === 0 ? (
            <p className="py-2 text-center text-sm text-zinc-500 dark:text-zinc-400">
              No decision deltas recorded.
            </p>
          ) : (
            <div className="space-y-3">
              <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                {formatInt(deltas.length)} decision delta
                {deltas.length === 1 ? " — the single most important safety fix in this phase" : "s"}
                :
              </p>
              {deltas.map((delta, position) => {
                const detail = details?.find(
                  (candidate) => candidate.index === delta.index,
                );
                return (
                  <article
                    key={delta.index ?? position}
                    className="min-w-0 rounded-lg border border-red-200 bg-red-50/50 p-3 dark:border-red-900/60 dark:bg-red-950/20"
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline" className="font-mono text-[10px]">
                        golden opener #{delta.index}
                      </Badge>
                      {detail ? (
                        <Badge
                          variant="outline"
                          className="font-mono text-[10px]"
                          title={`predicted intent (Phase 3 head): ${intentName(detail.predicted_intent)} (${orDash(detail.predicted_intent)})`}
                        >
                          {intentName(detail.predicted_intent)}
                        </Badge>
                      ) : null}
                      {delta.was_auto_now_escalated ? (
                        <Badge className="border-red-200 bg-red-100 text-[10px] text-red-800 dark:border-red-900/70 dark:bg-red-950/60 dark:text-red-300">
                          auto → escalate
                        </Badge>
                      ) : null}
                    </div>

                    <blockquote className="mt-2 border-l-2 border-red-300 pl-2.5 text-xs leading-relaxed text-zinc-700 dark:border-red-700/60 dark:text-zinc-300">
                      <span className="sr-only">Customer message: </span>
                      &ldquo;{orDash(delta.message)}&rdquo;
                    </blockquote>

                    {detail ? (
                      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                        <Badge
                          variant="outline"
                          className="font-mono text-[10px] tabular-nums"
                          title="Phase 3 head confidence vs the 0.60 gate"
                        >
                          conf {formatScore(detail.intent_confidence)}
                          <span className="ml-1 text-emerald-600 dark:text-emerald-400">
                            gate ✓
                          </span>
                        </Badge>
                        <Badge
                          variant="outline"
                          className="font-mono text-[10px] tabular-nums"
                          title="Phase 4 top-1 cosine vs the 0.65 gate"
                        >
                          top-1 {formatScore(detail.top1_score)}
                          <span className="ml-1 text-emerald-600 dark:text-emerald-400">
                            gate ✓
                          </span>
                        </Badge>
                        <span className="text-[10px] text-zinc-500 dark:text-zinc-400">
                          both gates pass — the numeric preview would have
                          auto-answered
                        </span>
                      </div>
                    ) : null}

                    <div className="mt-2.5 rounded-lg border border-zinc-200/80 bg-white/70 p-2.5 dark:border-zinc-800 dark:bg-zinc-900/50">
                      <p className="flex flex-wrap items-center gap-1.5 text-xs">
                        <ShieldCheck
                          className="size-3.5 shrink-0 text-red-500 dark:text-red-400"
                          aria-hidden="true"
                        />
                        <span className="font-medium text-red-700 dark:text-red-300">
                          Rule{" "}
                          {(delta.reasons ?? []).join(" · ") ||
                            "—"}{" "}
                          fires
                        </span>
                        <span className="text-zinc-500 dark:text-zinc-400">
                          — the policy escalates
                        </span>
                      </p>
                      {detail?.ground_truth_rationale ? (
                        <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-400">
                          <span className="font-medium">
                            Ground truth: {orDash(delta.ground_truth)}
                          </span>{" "}
                          — {detail.ground_truth_rationale}
                        </p>
                      ) : (
                        <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-400">
                          <span className="font-medium">
                            Ground truth: {orDash(delta.ground_truth)}
                          </span>
                        </p>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
