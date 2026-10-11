import { Coins } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SubsectionHeading } from "@/components/phase2/subsection-heading";
import { formatFloat, formatInt, formatPercent } from "@/lib/phase1";
import type { Phase7Cost } from "@/lib/phase7";

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/**
 * Subsection C — the cost story: because the policy decides BEFORE any LLM
 * call, every escalation is also a call not made. The card compares calls
 * made vs skipped (with the saving rate), the estimated LLM milliseconds
 * the policy saved, and how the auto-path's LLM latency compares with the
 * Phase 5 recorded mean.
 */
export function CostCard({ cost }: { cost: Phase7Cost | undefined }) {
  const made = cost?.llm_calls_made;
  const skipped = cost?.llm_calls_skipped_by_policy;
  const totalCalls =
    isFiniteNumber(made) && isFiniteNumber(skipped)
      ? made + skipped
      : undefined;
  const madeShare =
    isFiniteNumber(made) && isFiniteNumber(totalCalls) && totalCalls > 0
      ? made / totalCalls
      : undefined;

  const srSummary = [
    `LLM calls made ${formatInt(made)}, skipped by policy ${formatInt(skipped)}${
      isFiniteNumber(totalCalls) ? ` of ${formatInt(totalCalls)} decisions` : ""
    }.`,
    `Saving rate ${
      isFiniteNumber(cost?.llm_call_saving_rate)
        ? formatPercent(cost.llm_call_saving_rate)
        : "—"
    }.`,
    `Estimated LLM time saved ${
      isFiniteNumber(cost?.estimated_llm_ms_saved)
        ? `${formatFloat(cost.estimated_llm_ms_saved / 1000, 1)} s`
        : "—"
    }.`,
    `Mean LLM latency on the auto path ${
      isFiniteNumber(cost?.mean_llm_ms_auto)
        ? `${Math.round(cost.mean_llm_ms_auto)} ms`
        : "—"
    } vs Phase 5 recorded ${
      isFiniteNumber(cost?.phase5_mean_llm_ms_per_reply)
        ? `${Math.round(cost.phase5_mean_llm_ms_per_reply)} ms`
        : "—"
    } per reply.`,
  ].join(" ");

  return (
    <section aria-labelledby="phase7-cost-heading" className="space-y-4">
      <SubsectionHeading
        id="phase7-cost-heading"
        icon={Coins}
        title="The calls the policy never made"
        description="Deciding before generating means every escalation is also an LLM call saved. Over the evaluation, roughly half the decisions reached a human handoff without spending a token."
      />

      <Card className="gap-0">
        <CardHeader className="border-b">
          <CardTitle className="text-sm">
            LLM spend across the live evaluation
          </CardTitle>
          <CardDescription className="text-xs">
            Calls actually made on the auto path vs calls the escalate path
            skipped by design.
          </CardDescription>
        </CardHeader>
        <CardContent className="mt-4">
          <p className="sr-only">{srSummary}</p>

          {/* ---- made vs skipped bar ---- */}
          {isFiniteNumber(madeShare) ? (
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Calls made{" "}
                  <span className="font-mono text-[10px] font-normal tabular-nums text-zinc-500 dark:text-zinc-400">
                    auto path only
                  </span>
                </span>
                <span className="shrink-0 font-mono text-xs tabular-nums text-zinc-900 dark:text-zinc-100">
                  {formatInt(made)} made · {formatInt(skipped)} skipped
                  {isFiniteNumber(cost?.llm_call_saving_rate) ? (
                    <span className="ml-1.5 text-emerald-600 dark:text-emerald-400">
                      {formatPercent(cost.llm_call_saving_rate)} saved
                    </span>
                  ) : null}
                </span>
              </div>
              <div
                className="mt-1 flex h-3 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
                role="img"
                aria-label={`${formatInt(made)} LLM calls made, ${formatInt(
                  skipped,
                )} skipped by the escalation policy`}
              >
                <div
                  className="h-full bg-emerald-500 dark:bg-emerald-400"
                  style={{ width: `${madeShare * 100}%` }}
                />
                <div
                  className="h-full bg-zinc-400 dark:bg-zinc-600"
                  style={{ width: `${(1 - madeShare) * 100}%` }}
                />
              </div>
            </div>
          ) : (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              No call counts available.
            </p>
          )}

          {/* ---- the derived cost facts ---- */}
          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
            <CostTile
              label="Estimated LLM time saved"
              value={
                isFiniteNumber(cost?.estimated_llm_ms_saved)
                  ? `${formatFloat(cost.estimated_llm_ms_saved / 1000, 1)} s`
                  : "—"
              }
              sub={
                isFiniteNumber(cost?.estimated_llm_ms_saved)
                  ? `${formatInt(cost.estimated_llm_ms_saved)} ms across the run`
                  : undefined
              }
            />
            <CostTile
              label="Mean LLM latency · auto path"
              value={
                isFiniteNumber(cost?.mean_llm_ms_auto)
                  ? `${Math.round(cost.mean_llm_ms_auto)} ms`
                  : "—"
              }
              sub="per generated reply in this run"
            />
            <CostTile
              label="Phase 5 recorded mean"
              value={
                isFiniteNumber(cost?.phase5_mean_llm_ms_per_reply)
                  ? `${Math.round(cost.phase5_mean_llm_ms_per_reply)} ms`
                  : "—"
              }
              sub="per reply, offline evaluation — the same order of magnitude"
            />
          </div>

          <p className="mt-4 rounded-lg border border-zinc-200/80 bg-zinc-100/60 px-3 py-2 text-[11px] leading-relaxed text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
            Escalations still do real work — embed + FAISS + policy run on
            every message — but no draft is generated and no token is spent
            on a reply a human will rewrite anyway.
          </p>
        </CardContent>
      </Card>
    </section>
  );
}

function CostTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-zinc-100 bg-zinc-50/60 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
      <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
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
