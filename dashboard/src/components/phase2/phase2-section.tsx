"use client";

import { useCallback, useEffect, useState } from "react";
import { CircleAlert, Download, RefreshCw, Tags } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionHeading } from "@/components/phase1/section-heading";
import { BaselineCards } from "@/components/phase2/baseline-cards";
import { ConfusionMatrixSection } from "@/components/phase2/confusion-matrix";
import { GoldenSetOverview } from "@/components/phase2/golden-set-overview";
import { TaxonomyGrid } from "@/components/phase2/taxonomy-grid";
import { formatInt, orDash } from "@/lib/phase1";
import {
  PHASE2_SETUP_STEPS,
  type Phase2StatusResponse,
  type Phase2Summary,
} from "@/lib/phase2";

type LoadState = "loading" | "ready" | "not_run" | "error";

/**
 * "Phase 2 — Intent classification foundation" section. Fetches
 * /api/phase2/status on mount and owns its loading / error / not-run states
 * independently of the Phase 1 summary, exactly like PipelineDetail. Ready
 * state renders the four subsections: taxonomy → golden set → baselines →
 * confusion matrix.
 */
export function Phase2Section() {
  const [state, setState] = useState<LoadState>("loading");
  const [summary, setSummary] = useState<Phase2Summary | null>(null);
  const [message, setMessage] = useState<string>("");

  const load = useCallback(async () => {
    setState("loading");
    try {
      const response = await fetch("/api/phase2/status", {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(`Request failed with HTTP ${response.status}`);
      }
      const payload = (await response.json()) as Phase2StatusResponse;
      if (payload.ok && payload.status === "READY" && payload.data) {
        setSummary(payload.data);
        setMessage("");
        setState("ready");
      } else {
        setSummary(null);
        setMessage(
          payload.message ?? "Phase 2 results are not available yet.",
        );
        setState("not_run");
      }
    } catch (error) {
      setSummary(null);
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to reach the Phase 2 status API.",
      );
      setState("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section aria-labelledby="phase2-heading" className="space-y-4">
      <SectionHeading
        id="phase2-heading"
        icon={Tags}
        title="Phase 2 — Intent classification foundation"
        description="The 10-class intent taxonomy derived from the Phase 1 EDA, a 200-example manually labelled golden set with a conversation-level 70/15/15 split, and three measured baselines. All values come straight from evaluation/results/phase2_summary.json."
      />

      {state === "ready" ? (
        <div className="flex justify-end print:hidden">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-xs text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
            onClick={() => {
              const anchor = document.createElement("a");
              anchor.href = "/api/phase2/status?format=raw";
              anchor.rel = "noopener";
              document.body.appendChild(anchor);
              anchor.click();
              anchor.remove();
            }}
            aria-label="Download phase2_summary.json — the raw Phase 2 artifact"
            title="Download the raw phase2_summary.json written by scripts/train_baselines.py"
          >
            <Download className="size-3.5" aria-hidden="true" />
            Download phase2_summary.json
          </Button>
        </div>
      ) : null}

      {state === "loading" ? <Phase2Skeleton /> : null}

      {state === "error" ? (
        <Phase2ErrorCard message={message} onRetry={() => void load()} />
      ) : null}

      {state === "not_run" ? <Phase2NotRunCard message={message} /> : null}

      {state === "ready" && summary ? <Phase2Content summary={summary} /> : null}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Ready state: meta strip + the four subsections                       */
/* ------------------------------------------------------------------ */

function Phase2Content({ summary }: { summary: Phase2Summary }) {
  const golden = summary.golden_set ?? {};
  return (
    <div className="space-y-8 sm:space-y-10">
      <p className="rounded-lg border border-zinc-200/80 bg-zinc-100/60 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
        Results generated: {orDash(summary.generated_at)} · Random seed:{" "}
        {orDash(String(summary.random_seed ?? ""))} · Artifact:{" "}
        <code className="font-mono">
          hiver-support-agent/evaluation/results/phase2_summary.json
        </code>{" "}
        · {formatInt(summary.artifacts?.length)} evaluation artifacts
      </p>

      <TaxonomyGrid
        taxonomy={summary.taxonomy ?? []}
        classCounts={golden.class_counts}
        goldenTotal={golden.total}
      />

      <GoldenSetOverview golden={golden} seed={summary.random_seed} />

      <BaselineCards summary={summary} />

      <ConfusionMatrixSection
        confusion={summary.baselines?.tfidf_logreg?.confusion_matrix_test}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* NOT_RUN guidance (mirrors the Phase 1 NotRunCard pattern)            */
/* ------------------------------------------------------------------ */

function Phase2NotRunCard({ message }: { message: string }) {
  return (
    <Card className="border-amber-200 bg-amber-50/60 dark:border-amber-900/70 dark:bg-amber-950/30">
      <CardHeader className="border-b border-amber-200/70 dark:border-amber-900/50">
        <CardTitle className="flex items-center gap-2 text-amber-900 dark:text-amber-200">
          <CircleAlert
            className="size-5 shrink-0 text-amber-500 dark:text-amber-400"
            aria-hidden="true"
          />
          Phase 2 results have not been generated yet
        </CardTitle>
        <CardDescription className="text-amber-800/90 dark:text-amber-300/80">
          This section renders the taxonomy, golden set and baselines from{" "}
          <code className="font-mono text-xs">
            hiver-support-agent/evaluation/results/phase2_summary.json
          </code>
          , which does not exist yet. Follow the steps below to produce it,
          then press Refresh.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="space-y-4">
          {PHASE2_SETUP_STEPS.map((step, index) => (
            <li key={step.title} className="flex gap-3">
              <span
                aria-hidden="true"
                className="flex size-6 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-semibold text-amber-800 ring-1 ring-amber-200 dark:bg-amber-900/40 dark:text-amber-200 dark:ring-amber-800/70"
              >
                {index + 1}
              </span>
              <div className="min-w-0 flex-1 space-y-1.5">
                <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                  {step.title}
                </p>
                <p className="text-xs leading-relaxed text-amber-800/90 dark:text-amber-300/80">
                  {step.detail}
                </p>
                {step.commands?.map((command) => (
                  <code
                    key={command}
                    className="block overflow-x-auto rounded-md bg-zinc-900 px-3 py-2 font-mono text-xs leading-relaxed text-zinc-100 dark:bg-zinc-950 dark:text-zinc-200 dark:ring-1 dark:ring-zinc-800/80"
                  >
                    {command}
                  </code>
                ))}
              </div>
            </li>
          ))}
        </ol>
        {message ? (
          <p className="mt-5 border-t border-amber-200/70 pt-4 text-xs leading-relaxed text-amber-800/80 dark:border-amber-900/50 dark:text-amber-300/70">
            <span className="font-medium">API message: </span>
            {message}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Error + loading states                                              */
/* ------------------------------------------------------------------ */

function Phase2ErrorCard({
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
      <AlertTitle>Could not load Phase 2 results</AlertTitle>
      <AlertDescription className="text-red-800 dark:text-red-300">
        <p>{message || "The Phase 2 status API request failed."}</p>
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

function Phase2Skeleton() {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-4">
      <p className="sr-only">Loading Phase 2 results…</p>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index} className="gap-3 p-4 sm:p-5">
            <Skeleton className="skeleton-shimmer h-3 w-24" />
            <Skeleton className="skeleton-shimmer h-8 w-20" />
            <Skeleton className="skeleton-shimmer h-3 w-28" />
          </Card>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <Card key={index} className="p-4">
            <Skeleton className="skeleton-shimmer h-4 w-36" />
            <Skeleton className="skeleton-shimmer mt-3 h-40 w-full" />
          </Card>
        ))}
      </div>
    </div>
  );
}
