"use client";

import { useState } from "react";
import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { CHART_CATALOG, type ChartMeta } from "@/lib/phase1";

/**
 * Intrinsic pixel sizes of the six matplotlib PNGs (used only as width/height
 * attributes so the browser reserves the right space before the bytes arrive).
 */
const CHART_IMAGE_SIZE: Record<string, { width: number; height: number }> = {
  inbound_outbound: { width: 900, height: 600 },
  conversation_lengths: { width: 1200, height: 600 },
  message_lengths: { width: 1200, height: 600 },
  top_terms: { width: 1050, height: 750 },
  top_bigrams: { width: 1050, height: 675 },
  provisional_topics: { width: 1050, height: 750 },
};

const FALLBACK_SIZE = { width: 900, height: 600 };

function chartUrl(name: string): string {
  return `/api/phase1/chart?name=${encodeURIComponent(name)}`;
}

/**
 * EDA chart gallery — the six matplotlib PNGs written by scripts/run_eda.py
 * into data/processed/charts/, served by /api/phase1/chart. Rendered as the
 * "Charts" tab of the EDA section; Radix Tabs unmounts inactive content, so
 * images only fetch once the tab is opened.
 */
export function ChartGallery() {
  return (
    <div className="space-y-4">
      <p className="sr-only">
        EDA chart gallery with six figures:{" "}
        {CHART_CATALOG.map((chart) => chart.title).join(", ")}. Each figure is
        also available as a full-size view with a PNG download.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        {CHART_CATALOG.map((chart) => (
          <ChartCard key={chart.name} chart={chart} />
        ))}
      </div>
    </div>
  );
}

function ChartCard({ chart }: { chart: ChartMeta }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const url = chartUrl(chart.name);
  const size = CHART_IMAGE_SIZE[chart.name] ?? FALLBACK_SIZE;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={`Open the ${chart.title} chart in a larger view`}
          className="group block h-full w-full rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 dark:focus-visible:ring-emerald-500 dark:focus-visible:ring-offset-zinc-900"
        >
          <Card className="h-full gap-0 p-4 transition-all duration-200 group-hover:shadow-md group-focus-visible:shadow-md motion-safe:group-hover:-translate-y-0.5 dark:group-hover:shadow-emerald-500/10">
            <CardHeader className="gap-1">
              <CardTitle className="text-sm">{chart.title}</CardTitle>
              <CardDescription className="text-xs">
                {chart.description}
              </CardDescription>
            </CardHeader>
            <CardContent className="mt-3">
              {failed ? (
                <div className="flex h-56 items-center justify-center rounded-md border border-dashed border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900/60">
                  <p className="px-4 text-center text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                    Chart unavailable — the{" "}
                    <span className="font-medium">{chart.title}</span> image
                    could not be loaded.
                  </p>
                </div>
              ) : (
                <div className="relative">
                  {/* White "plate": the matplotlib PNGs have white backgrounds,
                      so they stay legible in dark mode on a white pad. */}
                  <div className="overflow-hidden rounded-md border border-zinc-200 bg-white dark:rounded-lg dark:border-zinc-800 dark:p-2">
                    <img
                      src={url}
                      alt={chart.alt}
                      width={size.width}
                      height={size.height}
                      loading="lazy"
                      onLoad={() => setLoaded(true)}
                      onError={() => setFailed(true)}
                      className="h-auto w-full"
                    />
                  </div>
                  {!loaded ? (
                    <Skeleton
                      className="skeleton-shimmer absolute inset-0 z-10 rounded-md dark:rounded-lg"
                      aria-hidden="true"
                    />
                  ) : null}
                </div>
              )}
              <p className="mt-2 text-[10px] text-zinc-400 group-hover:text-zinc-500 dark:text-zinc-500 dark:group-hover:text-zinc-400">
                Click to enlarge · PNG available
              </p>
            </CardContent>
          </Card>
        </button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{chart.title}</DialogTitle>
          <DialogDescription>{chart.description}</DialogDescription>
        </DialogHeader>
        <div className="max-h-[80vh] overflow-y-auto">
          {/* White plate so the white-background PNG stays legible in dark mode. */}
          <div className="rounded-md border border-zinc-200 bg-white dark:rounded-lg dark:border-zinc-800 dark:p-2">
            <img
              src={url}
              alt={chart.alt}
              width={size.width}
              height={size.height}
              className="max-h-[80vh] w-full object-contain dark:max-h-[calc(80vh-1.125rem)]"
            />
          </div>
        </div>
        <DialogFooter className="sm:justify-start print:hidden">
          <Button asChild variant="outline" size="sm" className="h-11">
            <a href={url} download={`${chart.name}.png`}>
              <Download className="size-4" aria-hidden="true" />
              Download PNG
            </a>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
