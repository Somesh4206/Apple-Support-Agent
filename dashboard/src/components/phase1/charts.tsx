import { formatCompact, formatInt } from "@/lib/phase1";
import { cn } from "@/lib/utils";

/** Slim custom-styled scrollbar for long lists (theme-aware). */
export const SCROLLABLE_LIST_CLASS =
  "max-h-96 overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-zinc-100 dark:[&::-webkit-scrollbar-track]:bg-zinc-800/80 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-zinc-300 hover:[&::-webkit-scrollbar-thumb]:bg-zinc-400 dark:[&::-webkit-scrollbar-thumb]:bg-zinc-700 dark:hover:[&::-webkit-scrollbar-thumb]:bg-zinc-600";

/* ------------------------------------------------------------------ */
/* Stacked share bar (inbound vs outbound)                             */
/* ------------------------------------------------------------------ */

export interface StackedSegment {
  label: string;
  count: number | undefined;
  /** Tailwind background class used for both the bar and the legend dot */
  barClassName: string;
}

interface StackedShareBarProps {
  segments: StackedSegment[];
  srSummary: string;
}

export function StackedShareBar({ segments, srSummary }: StackedShareBarProps) {
  const known = segments.filter(
    (segment): segment is StackedSegment & { count: number } =>
      typeof segment.count === "number" && Number.isFinite(segment.count),
  );
  const total = known.reduce((sum, segment) => sum + segment.count, 0);

  return (
    <div>
      <p className="sr-only">{srSummary}</p>
      <div
        className="flex h-3 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
        aria-hidden="true"
      >
        {known.map((segment) => (
          <div
            key={segment.label}
            className={segment.barClassName}
            style={{
              width: total > 0 ? `${(segment.count / total) * 100}%` : "0%",
            }}
            title={`${segment.label}: ${formatInt(segment.count)} (${
              total > 0 ? ((segment.count / total) * 100).toFixed(1) : "0.0"
            }%)`}
          />
        ))}
      </div>
      <ul className="mt-4 space-y-2">
        {segments.map((segment) => {
          const share =
            total > 0 && typeof segment.count === "number"
              ? `${((segment.count / total) * 100).toFixed(1)}%`
              : "—";
          return (
            <li key={segment.label} className="flex items-center gap-2 text-sm">
              <span
                className={cn(
                  "size-2.5 shrink-0 rounded-[3px]",
                  segment.barClassName,
                )}
                aria-hidden="true"
              />
              <span className="text-zinc-700 dark:text-zinc-300">{segment.label}</span>
              <span className="ml-auto font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
                {formatInt(segment.count)}
              </span>
              <span className="w-14 shrink-0 text-right text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                {share}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Vertical column chart (CSS bars)                                    */
/* ------------------------------------------------------------------ */

export interface ColumnChartDatum {
  label: string;
  count: number;
}

interface ColumnChartProps {
  data: ColumnChartDatum[];
  srSummary: string;
  xLabel: string;
  /** unit for tooltips, e.g. "conversations" */
  unit: string;
}

export function ColumnChart({ data, srSummary, xLabel, unit }: ColumnChartProps) {
  const max = data.reduce((acc, datum) => Math.max(acc, datum.count), 0);
  // Thin x-axis labels once bars get crowded so labels never overlap.
  // Tooltips (title) and the sr-only summary still carry every value.
  const labelEvery = Math.max(1, Math.ceil(data.length / 12));

  return (
    <div className="min-w-0 space-y-3">
      <p className="sr-only">{srSummary}</p>
      <div className="max-w-full overflow-x-auto">
        <div
          className="flex h-44 min-w-full items-end gap-1 sm:gap-1.5"
          aria-hidden="true"
        >
          {data.map((datum, index) => {
            const ratio = max > 0 ? (datum.count / max) * 100 : 0;
            const height = Math.max(ratio, datum.count > 0 ? 3 : 0);
            return (
              <div
                key={datum.label}
                className="flex h-full min-w-[22px] flex-1 flex-col items-center justify-end gap-1"
                title={`${datum.label} ${unit}: ${formatInt(datum.count)}`}
              >
                <span className="text-[10px] tabular-nums text-zinc-500 dark:text-zinc-400">
                  {formatCompact(datum.count)}
                </span>
                <div
                  className="w-full max-w-10 rounded-t-[3px] bg-emerald-500/80 transition-colors hover:bg-emerald-600 dark:bg-emerald-500/70 dark:hover:bg-emerald-400"
                  style={{ height: `${height}%` }}
                />
                {index % labelEvery === 0 ? (
                  <span className="max-w-full truncate text-[10px] text-zinc-500 dark:text-zinc-400">
                    {datum.label}
                  </span>
                ) : (
                  <span className="text-[10px] text-transparent" aria-hidden="true">
                    {datum.label}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <p className="text-center text-xs text-zinc-400 dark:text-zinc-500">{xLabel}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Horizontal bar list (terms, bigrams, topics)                        */
/* ------------------------------------------------------------------ */

export interface BarListItem {
  label: string;
  /** value that determines bar width, relative to the list maximum */
  barValue: number | undefined;
  /** right-aligned primary value (e.g. count or share %) */
  primaryValue: string;
  /** optional secondary value rendered further right (e.g. matched count) */
  secondaryValue?: string;
  title?: string;
  /** highlight this row (emerald-600 bar + emerald-700 label) */
  accent?: boolean;
}

interface BarListProps {
  items: BarListItem[];
  srSummary: string;
  scrollable?: boolean;
}

export function BarList({ items, srSummary, scrollable = false }: BarListProps) {
  const max = items.reduce((acc, item) => {
    if (typeof item.barValue === "number" && Number.isFinite(item.barValue)) {
      return Math.max(acc, item.barValue);
    }
    return acc;
  }, 0);

  return (
    <div className="space-y-1">
      <p className="sr-only">{srSummary}</p>
      <ul className={cn("space-y-3", scrollable && SCROLLABLE_LIST_CLASS)}>
        {items.map((item, index) => {
          const width =
            max > 0 && typeof item.barValue === "number"
              ? (item.barValue / max) * 100
              : 0;
          return (
            <li
              key={`${item.label}-${index}`}
              className={cn(
                "flex items-center gap-3 rounded-sm",
                item.title !== undefined &&
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/60 dark:focus-visible:ring-emerald-500/60",
              )}
              title={item.title}
              // Rows with a tooltip are keyboard-focusable so the title is
              // reachable without a mouse.
              tabIndex={item.title !== undefined ? 0 : undefined}
            >
              <span
                className={cn(
                  "w-28 shrink-0 truncate text-sm text-zinc-700 dark:text-zinc-300",
                  item.accent && "font-medium text-emerald-700 dark:text-emerald-300",
                )}
                title={item.label}
              >
                {item.label}
              </span>
              <div
                className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-emerald-100 dark:bg-emerald-900/30"
                aria-hidden="true"
              >
                <div
                  className={cn(
                    "h-full rounded-full bg-emerald-500 dark:bg-emerald-400",
                    item.accent && "bg-emerald-600 dark:bg-emerald-500",
                  )}
                  style={{ width: `${width}%` }}
                />
              </div>
              <span className="w-14 shrink-0 text-right text-xs font-medium tabular-nums text-zinc-700 dark:text-zinc-300">
                {item.primaryValue}
              </span>
              {item.secondaryValue !== undefined ? (
                <span className="w-16 shrink-0 text-right text-xs tabular-nums text-zinc-400 dark:text-zinc-500">
                  {item.secondaryValue}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
