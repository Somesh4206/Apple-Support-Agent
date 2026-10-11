"use client";

import { BarChart3, Lightbulb } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  XAxis,
  YAxis,
} from "recharts";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from "@/components/ui/chart";
import { SubsectionHeading } from "@/components/phase2/subsection-heading";
import { formatSignedDelta } from "@/lib/phase2";
import {
  COMPARISON_LABELS,
  COMPARISON_ORDER,
  COMPARISON_TICKS,
  PHASE3_COMPARISON_KEYS,
  type Phase3ComparisonTest,
  type Phase3ComparisonKey,
  type Phase3DeltasTest,
} from "@/lib/phase3";
import { cn } from "@/lib/utils";

/* Emerald = accuracy / weighted-F1, amber = macro-F1 — the app's existing
   accent palette (no blue/indigo). Phase 3 bars render at full opacity,
   Phase 2 baseline bars faded, so the new heads stand out without a new
   color being introduced. rgb triplets like the phase2 confusion matrix. */
const EMERALD_RGB = "16, 185, 129";
const AMBER_RGB = "245, 158, 11";
const FULL = "1";
const FADED = "0.35";
const LABEL_FILL = "#71717b"; /* zinc-500 — legible light + dark */

type MetricKey = "accuracy" | "macro_f1" | "weighted_f1";

const METRIC_LABELS: Record<MetricKey, string> = {
  accuracy: "Accuracy",
  macro_f1: "Macro-F1",
  weighted_f1: "Weighted-F1",
};

interface ComparisonDatum {
  key: Phase3ComparisonKey;
  tick: string;
  full: string;
  isPhase3: boolean;
  accuracy: number | null;
  macro_f1: number | null;
  weighted_f1: number | null;
}

interface ComparisonChartProps {
  comparison: Phase3ComparisonTest;
  deltas: Phase3DeltasTest | undefined;
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/** 0.6552 -> "0.66" (bar labels); invalid -> "" */
const fmtLabel = (value: number): string =>
  Number.isFinite(value) ? value.toFixed(2) : "";

const chartConfig = {
  accuracy: { label: "Accuracy", color: `rgba(${EMERALD_RGB}, 1)` },
  macro_f1: { label: "Macro-F1", color: `rgba(${AMBER_RGB}, 1)` },
  weighted_f1: { label: "Weighted-F1", color: `rgba(${EMERALD_RGB}, 1)` },
} satisfies ChartConfig;

/**
 * Subsection B — the money chart: all five models (three Phase 2 baselines +
 * the two Phase 3 embedding heads) on the SAME golden test split, grouped
 * bars for accuracy + macro-F1 (default) or weighted-F1 via the toggle.
 * The two Phase 3 heads render solid, the Phase 2 baselines faded.
 */
export function ComparisonChart({ comparison, deltas }: ComparisonChartProps) {
  const data: ComparisonDatum[] = COMPARISON_ORDER.map((key) => {
    const entry = comparison[key];
    return {
      key,
      tick: COMPARISON_TICKS[key],
      full: COMPARISON_LABELS[key],
      isPhase3: PHASE3_COMPARISON_KEYS.includes(key),
      accuracy: isFiniteNumber(entry?.accuracy) ? (entry?.accuracy as number) : null,
      macro_f1: isFiniteNumber(entry?.macro_f1)
        ? (entry?.macro_f1 as number)
        : null,
      weighted_f1: isFiniteNumber(entry?.weighted_f1)
        ? (entry?.weighted_f1 as number)
        : null,
    };
  });

  const hasPairData = data.some(
    (datum) => datum.accuracy !== null || datum.macro_f1 !== null,
  );
  const hasWeightedData = data.some((datum) => datum.weighted_f1 !== null);

  /* Story numbers — computed from the artifact, never hardcoded. */
  const tfidfMacro = comparison.tfidf_logreg?.macro_f1;
  const logregMacro = comparison.logreg_head?.macro_f1;
  const logregAcc = comparison.logreg_head?.accuracy;
  const majorityAcc = comparison.majority?.accuracy;
  const ratio =
    isFiniteNumber(tfidfMacro) &&
    isFiniteNumber(logregMacro) &&
    tfidfMacro > 0
      ? logregMacro / tfidfMacro
      : undefined;
  const protoMacro = comparison.prototype?.macro_f1;
  const keywordMacro = comparison.keyword_rules?.macro_f1;
  const keywordAcc = comparison.keyword_rules?.accuracy;
  const macroGap =
    isFiniteNumber(keywordMacro) && isFiniteNumber(protoMacro)
      ? keywordMacro - protoMacro
      : undefined;

  const srSummary = [
    "Bar chart comparing five models on the same golden test split.",
    ...data.map(
      (datum) =>
        `${datum.full}: accuracy ${
          datum.accuracy !== null ? datum.accuracy.toFixed(4) : "not available"
        }, macro-F1 ${
          datum.macro_f1 !== null ? datum.macro_f1.toFixed(4) : "not available"
        }, weighted-F1 ${
          datum.weighted_f1 !== null
            ? datum.weighted_f1.toFixed(4)
            : "not available"
        }.`,
    ),
    "The two Phase 3 heads are the MiniLM plus LogReg head and the MiniLM prototype head.",
  ].join(" ");

  return (
    <section aria-labelledby="phase3-comparison-heading" className="space-y-4">
      <SubsectionHeading
        id="phase3-comparison-heading"
        icon={BarChart3}
        title="Embeddings vs the Phase 2 baselines"
        description="All five models measured on the same untouched 29-example golden test split with the same protocol — so the only thing that changed between the grey and the solid bars is the feature representation."
      />

      <Tabs defaultValue={hasPairData ? "pair" : "weighted"} className="gap-0">
        <Card className="gap-0">
          <CardHeader className="border-b">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <CardTitle className="text-sm">
                  Test metrics — five models, one split
                </CardTitle>
                <CardDescription className="mt-1 text-xs">
                  Toggle the metric; hover or focus a bar for its exact value.
                  Solid bars = the Phase 3 embedding heads, faded bars = the
                  Phase 2 baselines.
                </CardDescription>
              </div>
              {hasPairData && hasWeightedData ? (
                <TabsList className="h-8 shrink-0">
                  <TabsTrigger value="pair" className="text-xs">
                    Accuracy + macro-F1
                  </TabsTrigger>
                  <TabsTrigger value="weighted" className="text-xs">
                    Weighted-F1
                  </TabsTrigger>
                </TabsList>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="mt-4">
            <p className="sr-only">{srSummary}</p>

            {hasPairData ? (
              <TabsContent value="pair" className="mt-0">
                <ComparisonBarChart
                  data={data}
                  metrics={["accuracy", "macro_f1"]}
                  srLabel="Grouped bar chart: test accuracy and macro-F1 for the five models"
                />
              </TabsContent>
            ) : null}

            {hasWeightedData ? (
              <TabsContent value="weighted" className="mt-0">
                <ComparisonBarChart
                  data={data}
                  metrics={["weighted_f1"]}
                  srLabel="Bar chart: test weighted-F1 for the five models"
                />
              </TabsContent>
            ) : null}

            {!hasPairData && !hasWeightedData ? (
              <p className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
                No comparison metrics available.
              </p>
            ) : null}

            <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
              <li className="flex items-center gap-1.5">
                <span
                  className="size-2.5 shrink-0 rounded-[3px]"
                  style={{ backgroundColor: `rgba(${EMERALD_RGB}, 0.85)` }}
                  aria-hidden="true"
                />
                accuracy / weighted-F1
              </li>
              <li className="flex items-center gap-1.5">
                <span
                  className="size-2.5 shrink-0 rounded-[3px]"
                  style={{ backgroundColor: `rgba(${AMBER_RGB}, 0.85)` }}
                  aria-hidden="true"
                />
                macro-F1
              </li>
              <li>solid = Phase 3 heads · faded = Phase 2 baselines</li>
            </ul>

            <div className="mt-4 rounded-lg border border-emerald-200/70 bg-emerald-50/50 p-3 dark:border-emerald-900/60 dark:bg-emerald-950/20">
              <p className="flex items-start gap-2 text-xs leading-relaxed text-zinc-700 dark:text-zinc-300">
                <Lightbulb
                  className="mt-0.5 size-4 shrink-0 text-amber-500 dark:text-amber-400"
                  aria-hidden="true"
                />
                <span>
                  <span className="font-semibold text-emerald-800 dark:text-emerald-300">
                    Embeddings fix the class collapse.
                  </span>{" "}
                  Macro-F1 goes{" "}
                  <span className="font-mono font-medium tabular-nums">
                    {tfidfMacro?.toFixed(4) ?? "—"}
                  </span>{" "}
                  →{" "}
                  <span className="font-mono font-medium tabular-nums text-emerald-700 dark:text-emerald-300">
                    {logregMacro?.toFixed(4) ?? "—"}
                  </span>
                  {ratio ? ` (≈${ratio.toFixed(1)}×)` : ""} against the
                  TF-IDF baseline while accuracy ties the majority class (
                  <span className="font-mono tabular-nums">
                    {logregAcc?.toFixed(4) ?? "—"}
                  </span>{" "}
                  vs{" "}
                  <span className="font-mono tabular-nums">
                    {majorityAcc?.toFixed(4) ?? "—"}
                  </span>
                  ). The prototype head reaches the best macro-F1 of all
                  learned models (
                  <span className="font-mono tabular-nums">
                    {protoMacro?.toFixed(4) ?? "—"}
                  </span>
                  ) —{" "}
                  {macroGap !== undefined
                    ? `just ${macroGap.toFixed(4)} under the keyword rules' ${keywordMacro?.toFixed(4) ?? "—"}, which cost them an accuracy of only ${keywordAcc?.toFixed(4) ?? "—"}.`
                    : ""}
                </span>
              </p>
            </div>

            {deltas ? (
              <div className="mt-3 grid gap-2 rounded-lg border border-zinc-200/80 bg-white/60 p-3 dark:border-zinc-800 dark:bg-zinc-900/60 sm:grid-cols-2">
                <DeltaRow
                  label="Δ accuracy · LogReg head − TF-IDF"
                  value={deltas.logreg_head_vs_tfidf_logreg?.accuracy}
                />
                <DeltaRow
                  label="Δ macro-F1 · LogReg head − TF-IDF"
                  value={deltas.logreg_head_vs_tfidf_logreg?.macro_f1}
                />
                <DeltaRow
                  label="Δ macro-F1 · LogReg head − majority"
                  value={deltas.logreg_head_vs_majority?.macro_f1}
                />
                <DeltaRow
                  label="Δ macro-F1 · prototype − majority"
                  value={deltas.prototype_vs_majority?.macro_f1}
                />
              </div>
            ) : null}
          </CardContent>
        </Card>
      </Tabs>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* The recharts bar chart (one or two metric series)                    */
/* ------------------------------------------------------------------ */

function ComparisonBarChart({
  data,
  metrics,
  srLabel,
}: {
  data: ComparisonDatum[];
  metrics: readonly MetricKey[];
  srLabel: string;
}) {
  const fills: Record<MetricKey, (isPhase3: boolean) => string> = {
    accuracy: (isPhase3) =>
      `rgba(${EMERALD_RGB}, ${isPhase3 ? FULL : FADED})`,
    macro_f1: (isPhase3) => `rgba(${AMBER_RGB}, ${isPhase3 ? FULL : FADED})`,
    weighted_f1: (isPhase3) =>
      `rgba(${EMERALD_RGB}, ${isPhase3 ? FULL : FADED})`,
  };

  return (
    <div
      className="h-[300px] w-full sm:h-[340px]"
      role="img"
      aria-label={srLabel}
    >
      <ChartContainer config={chartConfig} className="h-full w-full">
        <BarChart
          data={data}
          margin={{ top: 22, right: 8, left: 0, bottom: 4 }}
        >
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis
            dataKey="tick"
            interval={0}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            tick={{ fontSize: 10 }}
          />
          <YAxis
            domain={[0, 1]}
            ticks={[0, 0.25, 0.5, 0.75, 1]}
            tickLine={false}
            axisLine={false}
            width={36}
            tickFormatter={(value: number) => value.toFixed(2)}
            tick={{ fontSize: 10 }}
          />
          <ChartTooltip
            cursor={false}
            content={<ComparisonTooltipContent />}
          />
          {metrics.map((metric) => (
            <Bar
              key={metric}
              dataKey={metric}
              name={METRIC_LABELS[metric]}
              radius={[3, 3, 0, 0]}
              maxBarSize={26}
              isAnimationActive={false}
            >
              {data.map((datum) => (
                <Cell
                  key={datum.key}
                  fill={fills[metric](datum.isPhase3)}
                />
              ))}
              <LabelList
                dataKey={metric}
                position="top"
                fontSize={10}
                fill={LABEL_FILL}
                formatter={(value: number) => fmtLabel(value)}
              />
            </Bar>
          ))}
        </BarChart>
      </ChartContainer>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tooltip (fully typed, no any)                                        */
/* ------------------------------------------------------------------ */

interface TooltipPayloadItem {
  dataKey?: string | number;
  name?: string | number;
  value?: number | string;
  color?: string;
  payload?: ComparisonDatum;
}

function ComparisonTooltipContent({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: ReadonlyArray<TooltipPayloadItem>;
  label?: unknown;
}) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }
  const datum = payload[0]?.payload;
  const title = datum?.full ?? String(label ?? "");
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
      <p className="font-medium text-zinc-900 dark:text-zinc-100">
        {title}
        {datum?.isPhase3 ? " (Phase 3)" : ""}
      </p>
      <ul className="mt-1 space-y-0.5">
        {payload.map((item) => (
          <li
            key={String(item.dataKey)}
            className="flex items-center gap-2 whitespace-nowrap"
          >
            <span
              className="size-2 shrink-0 rounded-[2px]"
              style={{ backgroundColor: item.color }}
              aria-hidden="true"
            />
            <span className="text-zinc-500 dark:text-zinc-400">
              {METRIC_LABELS[item.dataKey as MetricKey] ?? String(item.name)}
            </span>
            <span className="font-mono font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
              {isFiniteNumber(item.value) ? item.value.toFixed(4) : "—"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Delta chips                                                          */
/* ------------------------------------------------------------------ */

function DeltaRow({ label, value }: { label: string; value: number | undefined }) {
  const negative =
    typeof value === "number" && Number.isFinite(value) && value < 0;
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
        {label}
      </span>
      <span
        className={cn(
          "font-mono text-xs font-semibold tabular-nums",
          negative
            ? "text-rose-600 dark:text-rose-400"
            : "text-emerald-700 dark:text-emerald-300",
        )}
      >
        {formatSignedDelta(value)}
      </span>
    </div>
  );
}
