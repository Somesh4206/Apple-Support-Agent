import {
  CheckCircle2,
  Gauge,
  GitCompareArrows,
  Timer,
  Workflow,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
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
import type { Phase7Evaluation } from "@/lib/phase7";

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/** "29 / 29" — a pass count over its total, straight from the fields. */
function countOver(top: number | undefined, bottom: number | undefined): string {
  return isFiniteNumber(top) && isFiniteNumber(bottom)
    ? `${formatInt(top)} / ${formatInt(bottom)}`
    : "—";
}

/**
 * Subsection B — the headline live evaluation numbers: the TS-vs-Python
 * policy consistency (the cross-implementation assertion the evaluation
 * exists to prove), the structural checks, the decision split, the
 * end-to-end confusion against the same hand-labelled ground truth as
 * Phase 6 (false-auto 0 again — live this time), and the auto-vs-escalate
 * latency gap.
 */
export function MetricsCard({ evaluation }: { evaluation: Phase7Evaluation }) {
  const consistency = evaluation.consistency ?? {};
  const decisions = evaluation.decisions ?? {};
  const quality = evaluation.end_to_end_quality ?? {};
  const confusion = quality.confusion ?? {};
  const cost = evaluation.cost ?? {};
  const latency = evaluation.latency ?? {};
  const nTest = evaluation.n_test;

  const totalDecisions =
    (decisions.auto_handle_n ?? 0) + (decisions.escalate_n ?? 0);

  const srSummary = [
    `Calls ${countOver(evaluation.n_success, nTest)} succeeded.`,
    `TypeScript-vs-Python policy consistency ${countOver(consistency.agreed_n, consistency.total_n)}.`,
    `Structure checks ${countOver(evaluation.structure_ok_n, nTest)}.`,
    `Decisions: ${formatInt(decisions.auto_handle_n)} auto-handle, ${formatInt(decisions.escalate_n)} escalate.`,
    `End-to-end: ${formatInt(confusion.true_escalate)} true escalates, ${formatInt(confusion.over_escalation)} over-escalations, ${formatInt(confusion.false_auto)} false autos, ${formatInt(confusion.true_auto)} true autos.`,
    `LLM calls saved by policy ${formatPercent(cost.llm_call_saving_rate)}.`,
    `Latency: ${
      isFiniteNumber(latency.mean_total_ms_auto)
        ? `${Math.round(latency.mean_total_ms_auto)} ms`
        : "—"
    } auto vs ${
      isFiniteNumber(latency.mean_total_ms_escalate)
        ? `${Math.round(latency.mean_total_ms_escalate)} ms`
        : "—"
    } escalate.`,
  ].join(" ");

  return (
    <section aria-labelledby="phase7-metrics-heading" className="space-y-4">
      <SubsectionHeading
        id="phase7-metrics-heading"
        icon={Gauge}
        title="What the live evaluation measured"
        description={
          isFiniteNumber(nTest)
            ? `All ${formatInt(nTest)} golden TEST openers were driven through the live /api/phase7/agent endpoint — real embeds, real FAISS searches, real policy decisions and real LLM calls — with every response asserted against the Python policy before scoring.`
            : "Every golden TEST opener was driven through the live /api/phase7/agent endpoint — real embeds, real FAISS searches, real policy decisions and real LLM calls — with every response asserted against the Python policy before scoring."
        }
      />

      <Card className="gap-0">
        <CardHeader className="border-b">
          <CardTitle className="text-sm">
            The unified agent, end to end
          </CardTitle>
          <CardDescription className="text-xs">
            Consistency is the assertion the evaluation exists to prove: the
            service's TypeScript policy mirror must agree with the Python
            policy on every message, or the run fails.
          </CardDescription>
        </CardHeader>
        <CardContent className="mt-4">
          <p className="sr-only">{srSummary}</p>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <MiniStat
              icon={GitCompareArrows}
              label="Policy consistency"
              value={countOver(consistency.agreed_n, consistency.total_n)}
              sub="TS mirror vs Python policy, same signals"
              tone="emerald"
              title={consistency.all_agree === true ? "all agree" : "mismatches recorded"}
            />
            <MiniStat
              icon={CheckCircle2}
              label="Structure checks"
              value={countOver(evaluation.structure_ok_n, nTest)}
              sub="every response carried its full contract"
            />
            <MiniStat
              icon={CheckCircle2}
              label="Agent calls OK"
              value={countOver(evaluation.n_success, nTest)}
              sub={`${formatInt((evaluation.failures ?? []).length)} failures`}
            />
            <MiniStat
              icon={Workflow}
              label="Decisions"
              value={`${formatInt(decisions.auto_handle_n)} auto · ${formatInt(
                decisions.escalate_n,
              )} escalate`}
              sub={
                isFiniteNumber(decisions.auto_rate)
                  ? `${formatScore(decisions.auto_rate)} auto-handle rate`
                  : undefined
              }
            />
            <MiniStat
              icon={Timer}
              label="Latency (mean)"
              value={`${
                isFiniteNumber(latency.mean_total_ms_auto)
                  ? Math.round(latency.mean_total_ms_auto)
                  : "—"
              } / ${
                isFiniteNumber(latency.mean_total_ms_escalate)
                  ? Math.round(latency.mean_total_ms_escalate)
                  : "—"
              } ms`}
              sub="auto / escalate — escalations skip the LLM entirely"
            />
            <MiniStat
              icon={CheckCircle2}
              label="LLM calls saved"
              value={countOver(
                cost.llm_calls_skipped_by_policy,
                totalDecisions > 0 ? totalDecisions : undefined,
              )}
              sub={
                isFiniteNumber(cost.llm_call_saving_rate)
                  ? `${formatPercent(cost.llm_call_saving_rate)} of decisions spent zero LLM calls`
                  : undefined
              }
              tone="emerald"
            />
          </div>

          {/* ---- the end-to-end confusion strip ---- */}
          <div className="mt-5 min-w-0 rounded-lg border border-zinc-100 bg-zinc-50/60 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
            <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs font-medium text-zinc-700 dark:text-zinc-300">
              <span>End-to-end quality vs the Phase 6 ground truth</span>
              {isFiniteNumber(quality.false_auto_rate) ? (
                <span className="font-mono text-[10px] font-normal tabular-nums text-emerald-600 dark:text-emerald-400">
                  false-auto {formatScore(quality.false_auto_rate)} — live this
                  time
                </span>
              ) : null}
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <OutcomeTile
                label="true escalate"
                count={confusion.true_escalate}
                tone="good"
              />
              <OutcomeTile
                label="over-escalation"
                count={confusion.over_escalation}
                tone="cost"
              />
              <OutcomeTile
                label="false auto"
                count={confusion.false_auto}
                tone="critical"
              />
              <OutcomeTile
                label="true auto"
                count={confusion.true_auto}
                tone="good"
              />
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
              Precision (escalate){" "}
              {isFiniteNumber(quality.precision_escalate)
                ? formatScore(quality.precision_escalate)
                : "—"}{" "}
              · recall{" "}
              {isFiniteNumber(quality.recall_escalate)
                ? formatScore(quality.recall_escalate)
                : "—"}
              . {quality.note ?? ""}
            </p>
          </div>
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
  tone,
  title,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string;
  tone?: "emerald";
  title?: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-zinc-100 bg-zinc-50/60 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        <Icon
          className={`size-3 shrink-0 ${
            tone === "emerald"
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-emerald-600 dark:text-emerald-400"
          }`}
          aria-hidden="true"
        />
        <span className="truncate">{label}</span>
      </div>
      <p
        className="mt-1 truncate text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-100"
        title={title ?? value}
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

function OutcomeTile({
  label,
  count,
  tone,
}: {
  label: string;
  count: number | undefined;
  tone: "good" | "cost" | "critical";
}) {
  const value = isFiniteNumber(count) ? formatInt(count) : "—";
  return (
    <div
      className={`flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg border px-2 py-2.5 text-center ${
        tone === "good"
          ? "border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/60 dark:bg-emerald-950/20"
          : tone === "cost"
            ? "border-amber-200 bg-amber-50/70 dark:border-amber-900/60 dark:bg-amber-950/20"
            : "border-red-200 bg-red-50/70 dark:border-red-900/60 dark:bg-red-950/20"
      }`}
      title={`${label}: ${value} openers`}
    >
      <span
        className={`text-xl font-semibold tabular-nums ${
          tone === "good"
            ? "text-emerald-900 dark:text-emerald-100"
            : tone === "cost"
              ? "text-amber-900 dark:text-amber-200"
              : "text-red-900 dark:text-red-200"
        }`}
      >
        {value}
      </span>
      <span className="text-[9px] font-medium uppercase leading-tight tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
      </span>
      {tone === "critical" && count === 0 ? (
        <Badge className="border-emerald-300 bg-emerald-100 text-[8px] text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
          the safety win
        </Badge>
      ) : null}
    </div>
  );
}
