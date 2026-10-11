"use client";

import {
  AlignLeft,
  MessagesSquare,
  PieChart,
  Repeat2,
  Type,
  type LucideIcon,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  formatPercent,
  type Phase1BucketBin,
  type Phase1TurnsBin,
} from "@/lib/phase1";

interface InsightChip {
  icon: LucideIcon;
  /** Pre-formatted percentage (e.g. "65.5%"). */
  value: string;
  label: string;
}

interface DistributionInsightsProps {
  turnsBins?: Phase1TurnsBin[];
  lengthBins?: Phase1BucketBin[];
}

/** Parses "1-25" → {min:1,max:25} and "201+" → {min:201,max:∞}. */
function bucketBounds(bucket: string): { min: number; max: number } | null {
  const trimmed = bucket.trim();
  const range = /^(\d+)\s*-\s*(\d+)$/.exec(trimmed);
  if (range) {
    return { min: Number(range[1]), max: Number(range[2]) };
  }
  const openEnded = /^(\d+)\s*\+$/.exec(trimmed);
  if (openEnded) {
    return { min: Number(openEnded[1]), max: Number.POSITIVE_INFINITY };
  }
  return null;
}

/**
 * Compact "insights" strip for the EDA Overview tab. Every percentage is
 * derived at render time from the histogram data already present in
 * EdaSummary — nothing is invented or read from disk.
 */
export function DistributionInsights({
  turnsBins,
  lengthBins,
}: DistributionInsightsProps) {
  const chips: InsightChip[] = [];

  // --- Conversation length (turns) ---------------------------------
  const turnRows = (turnsBins ?? []).filter(
    (bin) =>
      typeof bin.count === "number" &&
      bin.count > 0 &&
      typeof bin.turns === "number",
  );
  const turnTotal = turnRows.reduce((sum, bin) => sum + (bin.count ?? 0), 0);
  if (turnTotal > 0) {
    const shareOf = (count: number) => count / turnTotal;
    const upTo2 = turnRows
      .filter((bin) => (bin.turns ?? 0) <= 2)
      .reduce((sum, bin) => sum + (bin.count ?? 0), 0);
    const upTo4 = turnRows
      .filter((bin) => (bin.turns ?? 0) <= 4)
      .reduce((sum, bin) => sum + (bin.count ?? 0), 0);
    const largest = turnRows.reduce((best, bin) =>
      (bin.count ?? 0) > (best.count ?? 0) ? bin : best,
    );

    chips.push({
      icon: MessagesSquare,
      value: formatPercent(shareOf(upTo2)),
      label: "conversations ≤ 2 turns",
    });
    chips.push({
      icon: Repeat2,
      value: formatPercent(shareOf(upTo4)),
      label: "conversations ≤ 4 turns",
    });
    chips.push({
      icon: PieChart,
      value: formatPercent(shareOf(largest.count ?? 0)),
      label: `in the ${largest.turns}-turn bucket (largest)`,
    });
  }

  // --- Message length (character buckets) --------------------------
  const lengthRows = (lengthBins ?? []).filter(
    (bin) =>
      typeof bin.count === "number" &&
      bin.count > 0 &&
      typeof bin.bucket === "string" &&
      bucketBounds(bin.bucket) !== null,
  );
  const lengthTotal = lengthRows.reduce(
    (sum, bin) => sum + (bin.count ?? 0),
    0,
  );
  if (lengthTotal > 0) {
    const shareOf = (count: number) => count / lengthTotal;
    const upTo150 = lengthRows
      .filter((bin) => (bucketBounds(bin.bucket ?? "")?.max ?? 0) <= 150)
      .reduce((sum, bin) => sum + (bin.count ?? 0), 0);
    const from200 = lengthRows
      .filter((bin) => (bucketBounds(bin.bucket ?? "")?.min ?? 0) >= 200)
      .reduce((sum, bin) => sum + (bin.count ?? 0), 0);

    chips.push({
      icon: Type,
      value: formatPercent(shareOf(upTo150)),
      label: "messages ≤ 150 chars",
    });
    chips.push({
      icon: AlignLeft,
      value: formatPercent(shareOf(from200)),
      label: "messages 201+ chars",
    });
  }

  // Hide the strip entirely when there is nothing to derive.
  if (chips.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="text-sm">Distribution insights</CardTitle>
        <CardDescription>
          Quick read of the two histograms above.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-wrap gap-2">
          {chips.map((chip) => (
            <li
              key={chip.label}
              className="flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 py-1.5 pr-3 pl-2.5 dark:border-zinc-800 dark:bg-zinc-900/60"
            >
              <chip.icon
                className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
                aria-hidden="true"
              />
              <span className="text-sm font-bold tabular-nums text-zinc-900 dark:text-zinc-100">
                {chip.value}
              </span>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                {chip.label}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-zinc-400 dark:text-zinc-500">
          Derived from the histograms above — computed at render time, not
          stored in eda_summary.json.
        </p>
      </CardContent>
    </Card>
  );
}
