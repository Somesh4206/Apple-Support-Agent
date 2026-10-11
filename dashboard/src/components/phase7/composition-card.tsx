import { Workflow } from "lucide-react";

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
import type { Phase7Summary } from "@/lib/phase7";

/**
 * Subsection A — the composition of the unified agent: the five recorded
 * steps (verbatim from phase7_summary.json → agent_steps) drawn as a
 * flow. Steps 1–3 always run; the policy at step 3 then branches into the
 * auto path (step 4, emerald — Phase 5 generation, an LLM call) or the
 * escalate path (step 5, red — a structured human handoff, zero LLM calls).
 * Pure CSS/flex — no diagram library.
 */
export function CompositionCard({
  summary,
  policyRules,
}: {
  summary: Phase7Summary;
  policyRules: number;
}) {
  const steps = summary.agent_steps ?? [];
  /* agent_steps is [head, retrieval, policy, auto-path, escalate-path] in
     the recorded artifact; the flow below renders whichever prefix/suffix
     is present without assuming the exact count. */
  const linear = steps.slice(0, 3);
  const autoStep = steps[3];
  const escalateStep = steps[4];

  return (
    <section aria-labelledby="phase7-composition-heading" className="space-y-4">
      <SubsectionHeading
        id="phase7-composition-heading"
        icon={Workflow}
        title="One agent, five steps, one decision point"
        description="The Phase 3 head labels the message, the Phase 4 index retrieves its evidence, and the Phase 6 policy decides — before a single LLM call is spent. Then exactly one of the two final steps runs."
      />

      <Card className="gap-0">
        <CardHeader className="border-b">
          <CardTitle className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
            <span>The agent loop, as evaluated</span>
            {policyRules > 0 ? (
              <span className="font-mono text-xs font-normal tabular-nums text-zinc-500 dark:text-zinc-400">
                {formatInt(policyRules)} escalation rules at the decision point
              </span>
            ) : null}
          </CardTitle>
          <CardDescription className="text-xs">
            Step texts are the recorded agent_steps, verbatim from the
            artifact.
          </CardDescription>
        </CardHeader>
        <CardContent className="mt-4">
          {steps.length === 0 ? (
            <p className="py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
              No agent steps recorded.
            </p>
          ) : (
            <div className="min-w-0 space-y-4">
              {/* ---- the three always-run steps ---- */}
              <ol className="grid gap-3 md:grid-cols-3">
                {linear.map((step, index) => (
                  <li
                    key={index}
                    className="relative min-w-0 rounded-lg border border-zinc-200 bg-zinc-50/60 p-3 dark:border-zinc-800 dark:bg-zinc-900/40"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="flex size-6 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-[10px] font-semibold text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900"
                      >
                        {index + 1}
                      </span>
                      <Badge
                        variant="outline"
                        className="font-mono text-[10px]"
                        title="always runs"
                      >
                        always
                      </Badge>
                      {/* connector arrow (desktop) */}
                      {index < linear.length - 1 ? (
                        <span
                          aria-hidden="true"
                          className="absolute -right-[13px] top-1/2 hidden -translate-y-1/2 text-zinc-300 md:block dark:text-zinc-600"
                        >
                          →
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-zinc-700 dark:text-zinc-300">
                      {orDash(step)}
                    </p>
                  </li>
                ))}
              </ol>

              {/* ---- the branch ---- */}
              {(autoStep || escalateStep) && (
                <div className="min-w-0">
                  <p
                    aria-hidden="true"
                    className="text-center font-mono text-[10px] uppercase tracking-wide text-zinc-400 dark:text-zinc-500"
                  >
                    ▼ the policy branch — exactly one path runs ▼
                  </p>
                  <div className="mt-2 grid gap-3 md:grid-cols-2">
                    {autoStep ? (
                      <div className="min-w-0 rounded-lg border border-emerald-300 bg-emerald-50/60 p-3 dark:border-emerald-800/70 dark:bg-emerald-950/20">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            aria-hidden="true"
                            className="flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-[10px] font-semibold text-white"
                          >
                            4
                          </span>
                          <Badge className="border-emerald-300 bg-emerald-100 text-[10px] text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                            auto path
                          </Badge>
                          <span className="text-[10px] text-emerald-700/80 dark:text-emerald-400/70">
                            spends one LLM call
                          </span>
                        </div>
                        <p className="mt-2 text-xs leading-relaxed text-emerald-900 dark:text-emerald-200/90">
                          {orDash(autoStep)}
                        </p>
                      </div>
                    ) : null}
                    {escalateStep ? (
                      <div className="min-w-0 rounded-lg border border-red-300 bg-red-50/60 p-3 dark:border-red-900/60 dark:bg-red-950/20">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            aria-hidden="true"
                            className="flex size-6 shrink-0 items-center justify-center rounded-full bg-red-600 text-[10px] font-semibold text-white"
                          >
                            5
                          </span>
                          <Badge className="border-red-200 bg-red-100 text-[10px] text-red-800 dark:border-red-900/70 dark:bg-red-950/60 dark:text-red-300">
                            escalate path
                          </Badge>
                          <span className="text-[10px] text-red-700/80 dark:text-red-400/70">
                            zero LLM calls
                          </span>
                        </div>
                        <p className="mt-2 text-xs leading-relaxed text-red-900 dark:text-red-200/90">
                          {orDash(escalateStep)}
                        </p>
                      </div>
                    ) : null}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
