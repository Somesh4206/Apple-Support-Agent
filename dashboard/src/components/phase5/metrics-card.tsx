import {
  Anchor,
  Bot,
  CheckCircle2,
  Gauge,
  Quote,
  Ruler,
  ShieldCheck,
  ShieldQuestion,
  Timer,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SubsectionHeading } from "@/components/phase2/subsection-heading";
import { formatFloat, formatInt, formatPercent } from "@/lib/phase1";
import { formatScore } from "@/lib/phase2";
import type { Phase5TestEvaluation } from "@/lib/phase5";

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/** "29 / 29" — a pass count over the total, straight from the fields. */
function countOver(pass: number | undefined, total: number | undefined): string {
  return isFiniteNumber(pass) && isFiniteNumber(total)
    ? `${formatInt(pass)} / ${formatInt(total)}`
    : "—";
}

interface MetricsCardProps {
  test: Phase5TestEvaluation;
  /** config.max_reply_chars — the Twitter-length reply budget (280) */
  maxReplyChars: number | undefined;
}

/**
 * Subsection B — the headline reply-quality numbers, one stat tile per
 * measured quantity. Every value renders straight from
 * evaluation.test in phase5_summary.json; pass counts, shares and deltas are
 * computed from those fields, never pasted in.
 */
export function MetricsCard({ test, maxReplyChars }: MetricsCardProps) {
  const grounding = test.grounding_overlap ?? {};
  const unsupported = test.unsupported_specifics ?? {};
  const escalation = test.escalation_consistency ?? {};
  const gates = test.gates ?? {};
  const length = test.length ?? {};
  const latency = test.latency ?? {};

  const nTotal = test.n_total;
  const failures = test.failures ?? [];

  const srSummary = [
    `${countOver(test.n_success, nTotal)} replies generated (success rate ${formatPercent(test.success_rate)}).`,
    `Grounding overlap mean ${formatScore(grounding.mean)}, median ${formatScore(grounding.median)}, min ${formatScore(grounding.min)}, max ${formatScore(grounding.max)}.`,
    `${countOver(unsupported.replies_clean, nTotal)} replies clean of unsupported specifics (${formatInt(unsupported.total_violations)} violations).`,
    `Framing compliance ${formatPercent(test.framing_compliance_rate)}; clarifying questions ${formatPercent(test.clarifying_rate)}; DM redirects ${formatPercent(test.dm_redirect_rate)}.`,
    `Escalation consistency ${countOver(escalation.consistent_n, escalation.gated_n)}; auto-eligible ${countOver(gates.auto_eligible_n, nTotal)} (${formatPercent(gates.auto_eligible_rate)}).`,
    `Mean length ${formatFloat(length.mean_chars, 1)} chars; mean LLM latency ${isFiniteNumber(latency.mean_llm_ms) ? `${Math.round(latency.mean_llm_ms)} ms` : "—"}.`,
  ].join(" ");

  return (
    <section aria-labelledby="phase5-metrics-heading" className="space-y-4">
      <SubsectionHeading
        id="phase5-metrics-heading"
        icon={Gauge}
        title="What the evaluation measured"
        description={
          isFiniteNumber(nTotal)
            ? `All ${formatInt(nTotal)} golden TEST openers went through the full pipeline — the same openers the Phase 3 and Phase 4 evaluations used — and every generated reply was scored with transparent lexical heuristics.`
            : "Every golden TEST opener went through the full pipeline — the same openers the Phase 3 and Phase 4 evaluations used — and every generated reply was scored with transparent lexical heuristics."
        }
      />

      <Card className="gap-0">
        <CardHeader className="border-b">
          <CardTitle className="text-sm">
            Reply quality on the golden TEST openers
          </CardTitle>
          <CardDescription className="text-xs">
            Grounding and safety are proxied by lexical heuristics, not human
            judgment — the caveats below the chart spell out what that does and
            does not certify.
          </CardDescription>
        </CardHeader>
        <CardContent className="mt-4">
          <p className="sr-only">{srSummary}</p>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <MiniStat
              icon={CheckCircle2}
              label="Replies generated"
              value={countOver(test.n_success, nTotal)}
              sub={`success rate ${formatPercent(test.success_rate)}`}
            />
            <MiniStat
              icon={Anchor}
              label="Grounding overlap"
              value={formatScore(grounding.mean)}
              sub={`median ${formatScore(grounding.median)} · min ${formatScore(grounding.min)} · max ${formatScore(grounding.max)}`}
            />
            <MiniStat
              icon={ShieldCheck}
              label="Unsupported specifics"
              value={`${countOver(unsupported.replies_clean, nTotal)} clean`}
              sub={`${formatInt(unsupported.total_violations)} fabricated numbers, versions, prices or URLs`}
            />
            <MiniStat
              icon={Quote}
              label="Framing compliance"
              value={formatPercent(test.framing_compliance_rate)}
              sub="replies carry the historical-grounding phrase"
            />
            <MiniStat
              icon={ShieldQuestion}
              label="Escalation consistency"
              value={countOver(escalation.consistent_n, escalation.gated_n)}
              sub={`gated replies stay non-committal (${formatPercent(escalation.rate)})`}
            />
            <MiniStat
              icon={Bot}
              label="Auto-handle eligible"
              value={countOver(gates.auto_eligible_n, nTotal)}
              sub={`${formatPercent(gates.auto_eligible_rate)} pass both gates`}
            />
            <MiniStat
              icon={Ruler}
              label="Reply length"
              value={
                isFiniteNumber(length.mean_chars)
                  ? `${formatFloat(length.mean_chars, 1)} chars`
                  : "—"
              }
              sub={`vs corpus ${formatFloat(length.corpus_avg_chars, 1)} · ${formatFloat(length.mean_words, 1)} vs ${formatFloat(length.corpus_avg_words, 1)} words`}
            />
            <MiniStat
              icon={Timer}
              label="LLM latency"
              value={
                isFiniteNumber(latency.mean_llm_ms)
                  ? `≈ ${Math.round(latency.mean_llm_ms)} ms`
                  : "—"
              }
              sub={`per reply · total ≈ ${
                isFiniteNumber(latency.mean_total_ms)
                  ? `${Math.round(latency.mean_total_ms)} ms`
                  : "—"
              } · max ${
                isFiniteNumber(latency.max_total_ms)
                  ? `${Math.round(latency.max_total_ms)} ms`
                  : "—"
              }`}
            />
          </div>

          {/* behavioural signals — every remaining test field, rendered */}
          <p className="mt-4 rounded-lg border border-zinc-200/80 bg-zinc-100/60 px-3 py-2 text-[11px] leading-relaxed text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
            Behavioural signals over the same replies: a clarifying question in{" "}
            {formatPercent(test.clarifying_rate)}, a DM redirect in{" "}
            {formatPercent(test.dm_redirect_rate)},{" "}
            {formatInt(test.personal_data_solicited_count)} solicitations of
            personal data, every reply within the{" "}
            {isFiniteNumber(maxReplyChars)
              ? `${formatInt(maxReplyChars)}-character`
              : "configured"}{" "}
            budget ({formatPercent(length.within_280_rate)}) and{" "}
            {formatInt(failures.length)} failed generations.
          </p>
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
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-zinc-100 bg-zinc-50/60 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        <Icon
          className="size-3 shrink-0 text-emerald-600 dark:text-emerald-400"
          aria-hidden="true"
        />
        <span className="truncate">{label}</span>
      </div>
      <p
        className="mt-1 truncate text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-100"
        title={value}
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
