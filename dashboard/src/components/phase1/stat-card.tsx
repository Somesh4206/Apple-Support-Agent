"use client";

import { useState, type MouseEvent } from "react";
import type { LucideIcon } from "lucide-react";

import { Card } from "@/components/ui/card";

/** Points of one mini bar sparkline drawn under the value. */
export interface StatCardSpark {
  /** Bar heights, normalized to the tallest value at render time. */
  points: number[];
  /** Accessible description of what the sparkline shows. */
  label: string;
  /** x-axis tick labels aligned with the buckets (optional, 2–3 short words). */
  xLabel?: string;
  /** One human label per bar for the hover tooltip ("2 turns", "26–50"…). */
  bucketLabels?: string[];
  /** Unit shown next to the bucket count in the tooltip ("conversations", "messages"). */
  bucketUnit?: string;
}

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string;
  spark?: StatCardSpark;
}

/** Bar-chart geometry: viewBox height for the spark, bar corner rounding. */
const SPARK_VIEW_H = 30;
const SPARK_BAR_GAP = 1.5;
const SPARK_BAR_MIN = 2;
const SPARK_BAR_RADIUS = 1;

/** Formats bucket counts like the rest of the dashboard (2,811,774). */
const fmtCount = (n: number) =>
  new Intl.NumberFormat("en-US").format(Math.round(n));

/**
 * Pure-SVG mini bar chart for the KPI cards: no charting library, no layout
 * reflow (fixed 30-unit viewBox scaled to the card width via preserveAspectRatio="none"
 * is avoided on purpose — bars would distort; instead the bars are laid out in
 * a fixed 100×30 viewBox and stretched with rounded caps disabled below 2px).
 * Hovering a bar lifts it to full opacity and shows a pinned tooltip with the
 * bucket label and exact count (native <title> acts as the touch fallback).
 * Decorative by default: the full distributions are tabular in the EDA
 * section, so the spark only surfaces shape at a glance.
 */
function Sparkline({ spark }: { spark: StatCardSpark }) {
  const { points, xLabel, bucketLabels, bucketUnit } = spark;
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  if (points.length === 0) {
    return null;
  }
  const max = Math.max(...points, 1);
  const slot = (100 - SPARK_BAR_GAP * (points.length - 1)) / points.length;
  const bars = points.map((value, index) => {
    const height = Math.max((value / max) * (SPARK_VIEW_H - 2), SPARK_BAR_MIN);
    const x = index * (slot + SPARK_BAR_GAP);
    const y = SPARK_VIEW_H - height;
    return { x, y, width: slot, height, value, index };
  });
  const hovered = hoverIndex !== null ? bars[hoverIndex] : undefined;
  const hoverBar = (index: number) => (event: MouseEvent<SVGRectElement>) => {
    event.stopPropagation();
    setHoverIndex(index);
  };
  return (
    <figure
      className="relative mt-2.5 print:hidden"
      aria-hidden="false"
      role="img"
      aria-label={spark.label}
      title={spark.label}
      onMouseLeave={() => setHoverIndex(null)}
    >
      {hovered && bucketLabels ? (
        <div
          role="status"
          aria-hidden="true"
          /* min/max keeps the centered pill inside the card even for edge bars */
          style={{
            left: `min(max(${((hovered.index + 0.5) / points.length) * 100}%, 62px), calc(100% - 62px))`,
          }}
          className="pointer-events-none absolute bottom-full z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-zinc-900 px-2 py-1 text-[10px] font-medium leading-none text-zinc-100 shadow-lg ring-1 ring-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:ring-zinc-400 print:hidden"
        >
          <span className="text-zinc-300 dark:text-zinc-600">
            {bucketLabels[hovered.index] ?? `bucket ${hovered.index + 1}`}
          </span>
          <span className="mx-1.5 text-zinc-500 dark:text-zinc-400" aria-hidden="true">
            ·
          </span>
          <span className="tabular-nums text-emerald-400 dark:text-emerald-600">
            {fmtCount(hovered.value)}
          </span>
        </div>
      ) : null}
      <svg
        viewBox={`0 0 100 ${SPARK_VIEW_H}`}
        width="100%"
        height={20}
        preserveAspectRatio="none"
        className="block overflow-visible rounded-sm"
        focusable="false"
      >
        {bars.map((bar) => (
          <rect
            key={bar.index}
            x={bar.x}
            y={bar.y}
            width={Math.max(bar.width, 0.5)}
            height={bar.height}
            rx={SPARK_BAR_RADIUS}
            fill="currentColor"
            onMouseEnter={hoverBar(bar.index)}
            className={
              "cursor-default text-emerald-600/70 transition-opacity duration-150 dark:text-emerald-400/60 " +
              (hoverIndex !== null
                ? hoverIndex === bar.index
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "opacity-30"
                : "")
            }
          >
            <title>
              {bucketLabels?.[bar.index] ?? `bucket ${bar.index + 1}`} ·{" "}
              {fmtCount(bar.value)} {bucketUnit ?? ""}
            </title>
          </rect>
        ))}
      </svg>
      {xLabel ? (
        <figcaption className="mt-1 flex justify-between text-[9px] font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
          <span aria-hidden="true">{xLabel.split("–")[0]}</span>
          <span aria-hidden="true">{xLabel.split("–")[1]}</span>
        </figcaption>
      ) : null}
    </figure>
  );
}

/**
 * Compact KPI card: tinted icon chip, uppercase label, bold value, sub-line,
 * optional mini distribution sparkline at the bottom.
 */
export function StatCard({ icon: Icon, label, value, sub, spark }: StatCardProps) {
  return (
    <Card className="group relative gap-2 p-4 transition-all duration-200 hover:shadow-md motion-safe:hover:-translate-y-0.5 dark:hover:shadow-emerald-500/10 sm:p-5">
      <div className="flex items-center gap-2">
        <span
          className="flex size-6 shrink-0 items-center justify-center rounded-md bg-emerald-100/70 text-emerald-700 ring-1 ring-emerald-200/50 dark:bg-emerald-900/40 dark:text-emerald-300 dark:ring-emerald-800/50"
          aria-hidden="true"
        >
          <Icon className="size-3.5" />
        </span>
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {label}
        </span>
      </div>
      <div>
        <p className="text-2xl font-bold tracking-tight tabular-nums text-zinc-900 dark:text-zinc-100">
          {value}
        </p>
        {sub ? (
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{sub}</p>
        ) : null}
      </div>
      {spark ? <Sparkline spark={spark} /> : null}
    </Card>
  );
}
