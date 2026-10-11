"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  Activity,
  CircleAlert,
  FileSpreadsheet,
  RefreshCw,
  CheckCircle2,
  XCircle,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BarList, type BarListItem } from "@/components/phase1/charts";
import { SectionHeading } from "@/components/phase1/section-heading";
import {
  formatBytes,
  formatDuration,
  formatInt,
  orDash,
  type PipelineRun,
  type Phase1PipelineResponse,
} from "@/lib/phase1";
import { cn } from "@/lib/utils";

type LoadState = "loading" | "ready" | "not_run" | "error";

/**
 * "Pipeline run details" section — renders the manifest of the last
 * prepare_data.py execution (pipeline_run.json) via /api/phase1/pipeline.
 * Owns its loading / error / not-run states independently of the EDA summary.
 */
export function PipelineDetail() {
  const [state, setState] = useState<LoadState>("loading");
  const [run, setRun] = useState<PipelineRun | null>(null);
  const [message, setMessage] = useState<string>("");

  const load = useCallback(async () => {
    setState("loading");
    try {
      const response = await fetch("/api/phase1/pipeline", {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(`Request failed with HTTP ${response.status}`);
      }
      const payload = (await response.json()) as Phase1PipelineResponse;
      if (payload.ok && payload.status === "READY" && payload.data) {
        setRun(payload.data);
        setMessage("");
        setState("ready");
      } else {
        setRun(null);
        setMessage(
          payload.message ??
            "The pipeline has not been run yet (pipeline_run.json is missing).",
        );
        setState("not_run");
      }
    } catch (error) {
      setRun(null);
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to reach the pipeline API.",
      );
      setState("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section aria-labelledby="pipeline-detail-heading" className="space-y-4">
      <SectionHeading
        id="pipeline-detail-heading"
        icon={Activity}
        title="Pipeline run details"
        description="Run manifest from the last execution of scripts/prepare_data.py — scan, cleaning, reconstruction and validation telemetry. Values come from pipeline_run.json."
      />

      {state === "loading" ? <PipelineDetailSkeleton /> : null}

      {state === "error" ? (
        <PipelineErrorCard
          message={message}
          onRetry={() => void load()}
        />
      ) : null}

      {state === "not_run" ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Pipeline run manifest not available — {message}
        </p>
      ) : null}

      {state === "ready" && run ? <PipelineRunCards run={run} /> : null}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Ready state: seven cards                                            */
/* ------------------------------------------------------------------ */

function PipelineRunCards({ run }: { run: PipelineRun }) {
  const input = run.input;
  const settings = run.settings;
  const scan = run.scan_stats;
  const cleaning = run.cleaning_report;
  const reconstruction = run.reconstruction_stats;
  const validations = run.validations ?? [];

  const authors = (scan?.top_outbound_authors ?? []).slice(0, 10);
  const supportAuthorId = run.apple_support_author_id?.trim();
  const supportRank =
    supportAuthorId !== undefined
      ? authors.findIndex((author) => author.author_id === supportAuthorId) + 1
      : 0;

  const authorItems: BarListItem[] = authors.map((author) => ({
    label: orDash(author.author_id),
    barValue: author.tweets,
    primaryValue: formatInt(author.tweets),
    accent: author.author_id === supportAuthorId,
  }));
  const authorsSummary = `Top outbound authors in the raw dataset: ${authors
    .map(
      (author) =>
        `${orDash(author.author_id)} (${formatInt(author.tweets)} tweets)`,
    )
    .join(", ")}.`;

  const passedCount = validations.filter(
    (validation) => validation.passed === true,
  ).length;

  const outputs = Object.entries(run.outputs ?? {}).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* 1 — run overview */}
      <Card className="h-full gap-0 md:col-span-2">
        <CardHeader className="border-b">
          <CardTitle className="text-sm">Run overview</CardTitle>
          <CardDescription className="text-xs">
            Manifest header of the last prepare_data.py execution.
          </CardDescription>
        </CardHeader>
        <CardContent className="mt-4">
          <div className="grid gap-x-8 sm:grid-cols-2">
            <StatRow
              label="Mode"
              value={
                <Badge
                  variant="outline"
                  className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
                >
                  {orDash(run.mode)}
                </Badge>
              }
            />
            <StatRow label="Generated at" value={orDash(run.generated_at)} mono />
            <StatRow
              label="Duration"
              value={formatDuration(run.duration_seconds)}
            />
            <StatRow
              label="Input file"
              value={
                <>
                  <span>{orDash(input?.file)}</span>
                  <span className="ml-2 text-xs text-zinc-500 dark:text-zinc-400">
                    {formatBytes(input?.size_bytes)}
                  </span>
                </>
              }
            />
            <StatRow
              label="Support account"
              value={orDash(run.apple_support_author_id)}
              mono
            />
            <StatRow
              label="Raw dataset size"
              value={formatBytes(scan?.file_size_bytes)}
            />
          </div>
          <div className="mt-4 border-t border-zinc-100 pt-4 dark:border-zinc-800">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Run settings
            </p>
            <div className="mt-2 grid gap-x-8 sm:grid-cols-3">
              <StatRow
                label="random_seed"
                value={formatInt(settings?.random_seed)}
                mono
              />
              <StatRow
                label="chunk_size"
                value={formatInt(settings?.chunk_size)}
                mono
              />
              <StatRow
                label="closure_max_passes"
                value={formatInt(settings?.closure_max_passes)}
                mono
              />
            </div>
            {settings?.note ? (
              <p className="mt-3 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                {settings.note}
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {/* 2 — dataset scan */}
      <Card className="h-full gap-0">
        <CardHeader className="border-b">
          <CardTitle className="text-sm">Dataset scan</CardTitle>
          <CardDescription className="text-xs">
            First pass over the raw twcs.csv before any filtering.
          </CardDescription>
        </CardHeader>
        <CardContent className="mt-4">
          <div>
            <StatRow label="Total rows" value={formatInt(scan?.total_rows)} />
            <StatRow
              label="Unique tweet ids"
              value={formatInt(scan?.unique_tweet_ids)}
            />
            <StatRow
              label="Duplicate tweet ids"
              value={formatInt(scan?.duplicate_tweet_ids)}
            />
            <StatRow
              label="Inbound rows (customers)"
              value={formatInt(scan?.inbound_rows)}
            />
            <StatRow
              label="Outbound rows (support)"
              value={formatInt(scan?.outbound_rows)}
            />
            <StatRow
              label="Conversation starters"
              value={formatInt(scan?.conversation_starters)}
            />
            <StatRow
              label="Malformed inbound flags"
              value={formatInt(scan?.malformed_inbound)}
            />
          </div>
        </CardContent>
      </Card>

      {/* 3 — top outbound authors */}
      <Card className="h-full gap-0">
        <CardHeader className="border-b">
          <CardTitle className="text-sm">Top outbound authors</CardTitle>
          <CardDescription className="text-xs">
            Most prolific support accounts in the raw dataset.
          </CardDescription>
        </CardHeader>
        <CardContent className="mt-4">
          {authorItems.length > 0 ? (
            <BarList items={authorItems} srSummary={authorsSummary} />
          ) : (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              No outbound author statistics available.
            </p>
          )}
          <p className="mt-4 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
            {supportAuthorId && supportRank > 0
              ? `${supportAuthorId} ranks #${supportRank} by outbound volume across the dataset — this is how the support account was identified (configurable via APPLE_SUPPORT_AUTHOR_ID).`
              : "The support account is configurable via APPLE_SUPPORT_AUTHOR_ID."}
          </p>
        </CardContent>
      </Card>

      {/* 4 — cleaning report */}
      <Card className="h-full gap-0">
        <CardHeader className="border-b">
          <CardTitle className="text-sm">Cleaning report</CardTitle>
          <CardDescription className="text-xs">
            Conservative text cleaning before reconstruction.
          </CardDescription>
        </CardHeader>
        <CardContent className="mt-4">
          <p className="text-lg font-bold tabular-nums text-zinc-900 dark:text-zinc-100">
            {formatInt(cleaning?.rows_in)} → {formatInt(cleaning?.rows_out)}{" "}
            rows
          </p>
          <div className="mt-3 grid gap-x-8 sm:grid-cols-2">
            <StatRow
              label="Empty text dropped"
              value={formatInt(cleaning?.dropped_empty_text)}
            />
            <StatRow
              label="Missing tweet id dropped"
              value={formatInt(cleaning?.dropped_missing_tweet_id)}
            />
            <StatRow
              label="Missing author id dropped"
              value={formatInt(cleaning?.dropped_missing_author_id)}
            />
            <StatRow
              label="Duplicate tweet id dropped"
              value={formatInt(cleaning?.dropped_duplicate_tweet_id)}
            />
            <StatRow
              label="HTML entities decoded"
              value={formatInt(cleaning?.decoded_html_entities)}
            />
            <StatRow
              label="RT prefixes removed"
              value={formatInt(cleaning?.removed_rt_prefix)}
            />
            <StatRow
              label="URLs removed"
              value={formatInt(cleaning?.removed_urls)}
            />
            <StatRow
              label="Leading mentions removed"
              value={formatInt(cleaning?.removed_leading_mention)}
            />
            <StatRow
              label="Whitespace collapsed"
              value={formatInt(cleaning?.collapsed_whitespace)}
            />
          </div>
          <p className="mt-4 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
            Conservative cleaning — URLs, RT prefixes and leading @mentions
            removed; spelling and natural phrasing preserved.
          </p>
        </CardContent>
      </Card>

      {/* 5 — reconstruction */}
      <Card className="h-full gap-0">
        <CardHeader className="border-b">
          <CardTitle className="text-sm">Reconstruction</CardTitle>
          <CardDescription className="text-xs">
            Reply-forest rebuild from the cleaned tweet set.
          </CardDescription>
        </CardHeader>
        <CardContent className="mt-4">
          <div>
            <StatRow
              label="Conversations reconstructed"
              value={formatInt(reconstruction?.conversations)}
            />
            <StatRow
              label="Tweets in conversations"
              value={formatInt(reconstruction?.tweets_in_conversations)}
            />
            <StatRow
              label="Partial roots"
              value={formatInt(reconstruction?.partial_roots)}
            />
            <StatRow
              label="Cyclic tweets skipped"
              value={formatInt(reconstruction?.cyclic_tweets_skipped)}
            />
            <StatRow
              label="Parent link mismatches"
              value={formatInt(reconstruction?.parent_link_mismatches)}
            />
            <StatRow
              label="Dangling child links"
              value={formatInt(reconstruction?.dangling_child_links)}
            />
          </div>
        </CardContent>
      </Card>

      {/* 6 — validation checks */}
      <Card className="h-full gap-0">
        <CardHeader className="border-b">
          <CardTitle className="text-sm">Validation checks</CardTitle>
          <CardDescription className="text-xs">
            Gate every pipeline run must pass before outputs are trusted.
          </CardDescription>
          <CardAction>
            <Badge
              variant="outline"
              className={cn(
                "tabular-nums",
                validations.length > 0 && passedCount === validations.length
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
                  : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
              )}
            >
              {formatInt(passedCount)}/{formatInt(validations.length)} checks
              passed
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="mt-4">
          {validations.length > 0 ? (
            <ul>
              {validations.map((validation, index) => (
                <li
                  key={`${validation.name ?? "check"}-${index}`}
                  className="flex gap-3 border-b border-zinc-100 py-2.5 last:border-b-0 last:pb-0 dark:border-zinc-800"
                >
                  {validation.passed === true ? (
                    <CheckCircle2
                      className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                      aria-hidden="true"
                    />
                  ) : (
                    <XCircle
                      className="mt-0.5 size-4 shrink-0 text-red-500 dark:text-red-400"
                      aria-hidden="true"
                    />
                  )}
                  <div className="min-w-0">
                    <p className="font-mono text-xs text-zinc-700 dark:text-zinc-300">
                      {orDash(validation.name)}
                    </p>
                    <p className="mt-0.5 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                      {orDash(validation.detail)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              No validation results available.
            </p>
          )}
        </CardContent>
      </Card>

      {/* 7 — output files */}
      <Card className="h-full gap-0">
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2 text-sm">
            <FileSpreadsheet
              className="size-4 shrink-0 text-zinc-400 dark:text-zinc-500"
              aria-hidden="true"
            />
            Output files
          </CardTitle>
          <CardDescription className="text-xs">
            Artifacts written to hiver-support-agent/data/processed/.
          </CardDescription>
        </CardHeader>
        <CardContent className="mt-4">
          {outputs.length > 0 ? (
            <ul>
              {outputs.map(([name, file]) => {
                const displayName = displayOutputName(name, file?.path);
                return (
                  <li
                    key={name}
                    className="flex items-baseline justify-between gap-4 border-b border-zinc-100 py-2.5 last:border-b-0 last:pb-0 dark:border-zinc-800"
                  >
                    <span
                      className="min-w-0 break-all font-mono text-xs text-zinc-700 dark:text-zinc-300"
                      title={file?.path ?? name}
                    >
                      {displayName}
                    </span>
                    <span className="shrink-0 text-xs font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
                      {formatInt(file?.rows)} rows
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">No output files recorded.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Small shared pieces                                                 */
/* ------------------------------------------------------------------ */

/** Compact definition row: label left, value right (tabular-nums). */
function StatRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-zinc-100 py-2 last:border-b-0 dark:border-zinc-800">
      <span className="text-sm text-zinc-600 dark:text-zinc-400">{label}</span>
      <span
        className={cn(
          "text-right text-sm font-medium tabular-nums text-zinc-900 dark:text-zinc-100",
          mono && "font-mono text-xs",
        )}
      >
        {value}
      </span>
    </div>
  );
}

/** Strip everything before "data/processed/" so long paths show as a basename. */
function displayOutputName(key: string, path?: string): string {
  const marker = "data/processed/";
  const source = path?.trim() ? path : key;
  const index = source.indexOf(marker);
  const base = index >= 0 ? source.slice(index + marker.length) : source;
  return base || key;
}

function PipelineErrorCard({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <Alert
      variant="destructive"
      className="border-red-200 bg-red-50 text-red-900 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-100"
    >
      <CircleAlert className="size-4" aria-hidden="true" />
      <AlertTitle>Could not load the pipeline run manifest</AlertTitle>
      <AlertDescription className="text-red-800 dark:text-red-300">
        <p>{message || "The pipeline API request failed."}</p>
        <Button
          variant="outline"
          size="sm"
          className="mt-3 h-11 border-red-200 bg-white text-red-700 hover:bg-red-50 hover:text-red-800 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-950/60 dark:hover:text-red-200"
          onClick={onRetry}
        >
          <RefreshCw className="size-4" aria-hidden="true" />
          Retry
        </Button>
      </AlertDescription>
    </Alert>
  );
}

function PipelineDetailSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-4">
      <p className="sr-only">Loading the pipeline run manifest…</p>
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-4 md:col-span-2">
          <Skeleton className="skeleton-shimmer h-4 w-32" />
          <Skeleton className="skeleton-shimmer mt-4 h-24 w-full" />
        </Card>
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index} className="p-4">
            <Skeleton className="skeleton-shimmer h-4 w-32" />
            <Skeleton className="skeleton-shimmer mt-4 h-40 w-full" />
          </Card>
        ))}
      </div>
    </div>
  );
}
