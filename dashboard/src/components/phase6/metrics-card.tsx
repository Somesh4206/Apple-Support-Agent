import { Gauge, ShieldCheck } from "lucide-react";
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
import type { Phase6Evaluation, Phase6Rate } from "@/lib/phase6";

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/** "0 / 10" — a count over its denominator, straight from the fields. */
function countOver(top: number | undefined, bottom: number | undefined): string {
  return isFiniteNumber(top) && isFiniteNumber(bottom)
    ? `${formatInt(top)} / ${formatInt(bottom)}`
    : "—";
}

/** "CI95 [0.0000, 0.3085] · Clopper-Pearson (exact)" — the honest-statistics
 *  footnote every rate in this section carries next to its value. */
function ciLabel(rate: Phase6Rate | undefined): string {
  const ci = rate?.ci95;
  if (!ci || !isFiniteNumber(ci[0]) || !isFiniteNumber(ci[1])) return "—";
  return `CI95 [${formatScore(ci[0])}, ${formatScore(ci[1])}]${
    rate?.ci_method ? ` · ${rate.ci_method}` : ""
  }`;
}

interface MetricsCardProps {
  evaluation: Phase6Evaluation;
}

/**
 * Subsection B — the headline Phase 6 numbers. The primary metric is the
 * false-auto rate (a wrongly auto-handled escalate case), shown large with
 * its exact Clopper-Pearson interval: 0 observed in 10 bounds the true rate
 * below ~31% at 95% confidence — the honest reading of a zero on n=10.
 */
export function MetricsCard({ evaluation }: MetricsCardProps) {
  const nTest = evaluation.n_test;
  const falseAuto = evaluation.false_auto_rate;
  const precision = evaluation.precision_escalate;
  const recall = evaluation.recall_escalate;
  const overEscalation = evaluation.over_escalation_rate;
  const autoHandle = evaluation.auto_handle_rate;

  const srSummary = [
    `False-auto rate ${countOver(falseAuto?.numerator, falseAuto?.denominator)} (${ciLabel(falseAuto)}).`,
    `Precision ${formatScore(precision?.value)}, recall ${formatScore(recall?.value)}, F1 ${formatScore(evaluation.f1_escalate)}.`,
    `Over-escalation ${countOver(overEscalation?.numerator, overEscalation?.denominator)} (${formatScore(overEscalation?.value)}).`,
    `Auto-handle rate ${countOver(autoHandle?.numerator, autoHandle?.denominator)} (${formatScore(autoHandle?.value)}).`,
  ].join(" ");

  return (
    <section aria-labelledby="phase6-metrics-heading" className="space-y-4">
      <SubsectionHeading
        id="phase6-metrics-heading"
        icon={Gauge}
        title="What the evaluation measured"
        description={
          isFiniteNumber(nTest)
            ? `The five-rule policy decided all ${formatInt(nTest)} golden TEST openers offline, on the recorded Phase 5 runtime signals, and every decision was compared against the hand-labelled ground truth. The primary metric is the false-auto rate — the error that puts a customer with money or account stakes in front of a public auto-reply.`
            : "The five-rule policy decided every golden TEST opener offline, on the recorded Phase 5 runtime signals, and every decision was compared against the hand-labelled ground truth. The primary metric is the false-auto rate — the error that puts a customer with money or account stakes in front of a public auto-reply."
        }
      />

      {/* ---- the primary metric: false-auto, large, CI prominent ---- */}
      <Card className="gap-0 border-emerald-200/80 dark:border-emerald-900/60">
        <CardHeader className="border-b">
          <CardTitle className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
            <span>False-auto rate</span>
            <span className="text-[10px] font-normal uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
              primary metric
            </span>
          </CardTitle>
          <CardDescription className="text-xs">
            Messages the ground truth says escalate, but the policy would have
            answered automatically. Zero is the safety win — the interval says
            how far zero can be trusted.
          </CardDescription>
        </CardHeader>
        <CardContent className="mt-4">
          <p className="sr-only">{srSummary}</p>
          <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
            <p className="text-4xl font-bold tabular-nums tracking-tight text-emerald-600 dark:text-emerald-400 sm:text-5xl">
              {countOver(falseAuto?.numerator, falseAuto?.denominator)}
            </p>
            <div className="min-w-0 space-y-1 pb-1">
              <p className="font-mono text-sm font-semibold tabular-nums text-zinc-800 dark:text-zinc-200">
                {isFiniteNumber(falseAuto?.value)
                  ? formatScore(falseAuto.value)
                  : "—"}
              </p>
              <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                {ciLabel(falseAuto)}
              </p>
              <p className="max-w-xl text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-500">
                Read honestly: zero false-autos in{" "}
                {isFiniteNumber(falseAuto?.denominator)
                  ? formatInt(falseAuto.denominator)
                  : "—"}{" "}
                should-escalate messages bounds the true rate below{" "}
                {isFiniteNumber(falseAuto?.ci95?.[1])
                  ? formatPercent(falseAuto.ci95[1])
                  : "—"}{" "}
                at 95% confidence — not at zero. That is what n=10 can honestly
                certify.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ---- the supporting metrics ---- */}
      <Card className="gap-0">
        <CardHeader className="border-b">
          <CardTitle className="text-sm">
            The supporting metrics, each with its interval
          </CardTitle>
          <CardDescription className="text-xs">
            Precision, recall and F1 treat escalate as the positive class. The
            operationally dominant error — over-escalation — is reported
            separately because it costs human minutes, not customer safety.
          </CardDescription>
        </CardHeader>
        <CardContent className="mt-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MiniStat
              icon={ShieldCheck}
              label="Precision (escalate)"
              value={formatScore(precision?.value)}
              sub={ciLabel(precision)}
              subMono
              title={`${countOver(precision?.numerator, precision?.denominator)} policy escalations were correct`}
            />
            <MiniStat
              icon={ShieldCheck}
              label="Recall (escalate)"
              value={formatScore(recall?.value)}
              sub={ciLabel(recall)}
              subMono
              title={`every one of ${formatInt(recall?.denominator)} should-escalate messages was escalated`}
            />
            <MiniStat
              icon={ShieldCheck}
              label="F1 (escalate)"
              value={formatScore(evaluation.f1_escalate)}
              sub="harmonic mean of precision and recall"
            />
            <MiniStat
              icon={ShieldCheck}
              label="Auto-handle rate"
              value={countOver(autoHandle?.numerator, autoHandle?.denominator)}
              sub={
                isFiniteNumber(autoHandle?.value)
                  ? `${formatScore(autoHandle.value)} · ${ciLabel(autoHandle)}`
                  : "—"
              }
              subMono
            />
            <MiniStat
              icon={ShieldCheck}
              label="Over-escalation"
              value={countOver(
                overEscalation?.numerator,
                overEscalation?.denominator,
              )}
              sub={
                isFiniteNumber(overEscalation?.value)
                  ? `${formatScore(overEscalation.value)} · ${ciLabel(overEscalation)}`
                  : "—"
              }
              subMono
              tone="amber"
              title="auto-safe messages escalated anyway — the deliberate cost of the conservative design"
            />
            <MiniStat
              icon={ShieldCheck}
              label="False-auto (overall)"
              value={countOver(
                evaluation.false_auto_rate_overall?.numerator,
                evaluation.false_auto_rate_overall?.denominator,
              )}
              sub={
                isFiniteNumber(evaluation.false_auto_rate_overall?.value)
                  ? ciLabel(evaluation.false_auto_rate_overall)
                  : "—"
              }
              subMono
              title="denominator = all 29 openers, not just the should-escalate ones"
            />
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
  subMono,
  tone,
  title,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string;
  subMono?: boolean;
  tone?: "amber";
  title?: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-zinc-100 bg-zinc-50/60 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        <Icon
          className={`size-3 shrink-0 ${
            tone === "amber"
              ? "text-amber-500 dark:text-amber-400"
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
          className={`mt-0.5 text-[10px] leading-relaxed text-zinc-500 dark:text-zinc-400 ${
            subMono ? "font-mono" : ""
          }`}
          title={sub}
        >
          {sub}
        </p>
      ) : null}
      {tone === "amber" ? (
        <Badge
          variant="outline"
          className="mt-1.5 border-amber-200 bg-amber-50 text-[9px] text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
        >
          cost: human minutes
        </Badge>
      ) : null}
    </div>
  );
}
