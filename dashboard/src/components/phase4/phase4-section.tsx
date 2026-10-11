"use client";

import { useCallback, useEffect, useState } from "react";
import { CircleAlert, Download, RefreshCw, Search } from "lucide-react";

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
import { CorpusDistribution } from "@/components/phase4/corpus-distribution";
import { IndexCard } from "@/components/phase4/index-card";
import { MethodologyNote } from "@/components/phase4/methodology-note";
import { QualitativeExamples } from "@/components/phase4/qualitative-examples";
import { RecallCard } from "@/components/phase4/recall-card";
import { RetrievalDemo } from "@/components/phase4/retrieval-demo";
import { ThresholdCard } from "@/components/phase4/threshold-card";
import { formatInt, orDash } from "@/lib/phase1";
import { type Phase3StatusResponse } from "@/lib/phase3";
import {
  PHASE4_SETUP_STEPS,
  type Phase4StatusResponse,
  type Phase4Summary,
} from "@/lib/phase4";

type LoadState = "loading" | "ready" | "not_run" | "error";

/**
 * "Phase 4 — Historical retrieval (FAISS)" section. Fetches
 * /api/phase4/status on mount and owns its loading / error / not-run states
 * independently of the earlier sections — the page reads Phase 1 → 2 → 3 → 4.
 * Ready state renders the seven subsections: index → recall → methodology →
 * corpus distribution → threshold → qualitative examples → live demo.
 *
 * The Phase 3 logreg head's test accuracy is fetched alongside (from
 * /api/phase3/status, non-fatal when unavailable) so the recall card can
 * compare retrieval's majority-vote accuracy against the trained head using
 * the same field the Phase 3 panel renders — no hardcoded cross-references.
 */
export function Phase4Section() {
  const [state, setState] = useState<LoadState>("loading");
  const [summary, setSummary] = useState<Phase4Summary | null>(null);
  const [message, setMessage] = useState<string>("");
  const [phase3HeadTestAccuracy, setPhase3HeadTestAccuracy] = useState<
    number | undefined
  >(undefined);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const response = await fetch("/api/phase4/status", {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(`Request failed with HTTP ${response.status}`);
      }
      const payload = (await response.json()) as Phase4StatusResponse;
      if (payload.ok && payload.status === "READY" && payload.data) {
        setSummary(payload.data);
        setMessage("");
        setState("ready");
      } else {
        setSummary(null);
        setMessage(
          payload.message ?? "Phase 4 results are not available yet.",
        );
        setState("not_run");
      }
    } catch (error) {
      setSummary(null);
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to reach the Phase 4 status API.",
      );
      setState("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /* Optional cross-reference: the Phase 3 logreg head's test accuracy for
     the recall card's majority-vote comparison. Failure is silent — the
     comparison degrades to a pointer to the Phase 3 panel. */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/phase3/status", {
          cache: "no-store",
        });
        if (!response.ok) return;
        const payload = (await response.json()) as Phase3StatusResponse;
        if (!cancelled && payload.ok && payload.data) {
          setPhase3HeadTestAccuracy(
            payload.data.heads?.logreg_head?.test?.accuracy,
          );
        }
      } catch {
        /* comparison stays unavailable — not worth failing the section */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section aria-labelledby="phase4-heading" className="space-y-4">
      <SectionHeading
        id="phase4-heading"
        icon={Search}
        title="Phase 4 — Historical retrieval (FAISS)"
        description="Dense retrieval over the historical corpus: the frozen MiniLM encoder embeds every non-golden customer↔support pair into an exact FAISS cosine index, so a new message can retrieve its nearest past cases as evidence for generation. All values come straight from evaluation/results/phase4_summary.json — and the search box at the end of this section runs the live index."
      />

      {state === "ready" ? (
        <div className="flex justify-end print:hidden">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-xs text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
            onClick={() => {
              const anchor = document.createElement("a");
              anchor.href = "/api/phase4/status?format=raw";
              anchor.rel = "noopener";
              document.body.appendChild(anchor);
              anchor.click();
              anchor.remove();
            }}
            aria-label="Download phase4_summary.json — the raw Phase 4 artifact"
            title="Download the raw phase4_summary.json written by scripts/build_retrieval_index.py"
          >
            <Download className="size-3.5" aria-hidden="true" />
            Download phase4_summary.json
          </Button>
        </div>
      ) : null}

      {state === "loading" ? <Phase4Skeleton /> : null}

      {state === "error" ? (
        <Phase4ErrorCard message={message} onRetry={() => void load()} />
      ) : null}

      {state === "not_run" ? <Phase4NotRunCard message={message} /> : null}

      {state === "ready" && summary ? (
        <Phase4Content
          summary={summary}
          phase3HeadTestAccuracy={phase3HeadTestAccuracy}
        />
      ) : null}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Ready state: meta strip + the seven subsections                      */
/* ------------------------------------------------------------------ */

function Phase4Content({
  summary,
  phase3HeadTestAccuracy,
}: {
  summary: Phase4Summary;
  phase3HeadTestAccuracy: number | undefined;
}) {
  const evaluation = summary.evaluation ?? {};
  const examples = summary.qualitative_examples ?? [];

  return (
    <div className="space-y-8 sm:space-y-10">
      <p className="rounded-lg border border-zinc-200/80 bg-zinc-100/60 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
        Results generated: {orDash(summary.generated_at)} · Random seed:{" "}
        {orDash(String(summary.random_seed ?? ""))} · Artifact:{" "}
        <code className="font-mono">
          hiver-support-agent/evaluation/results/phase4_summary.json
        </code>{" "}
        · {formatInt(summary.artifacts?.length)} evaluation artifacts
      </p>

      <IndexCard
        corpus={summary.corpus ?? {}}
        model={summary.embedding_model ?? {}}
        seed={summary.random_seed}
      />

      <RecallCard
        evaluation={evaluation}
        phase3HeadTestAccuracy={phase3HeadTestAccuracy}
      />

      <MethodologyNote definition={summary.relevance_definition} />

      <CorpusDistribution distribution={summary.corpus_label_distribution} />

      {evaluation.threshold_preview ? (
        <ThresholdCard
          preview={evaluation.threshold_preview}
          test={evaluation.test}
        />
      ) : null}

      {examples.length > 0 ? <QualitativeExamples examples={examples} /> : null}

      <RetrievalDemo indexedPairs={summary.corpus?.indexed_pairs} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* NOT_RUN guidance (mirrors the Phase 1/2/3 NotRunCard pattern)        */
/* ------------------------------------------------------------------ */

function Phase4NotRunCard({ message }: { message: string }) {
  return (
    <Card className="border-amber-200 bg-amber-50/60 dark:border-amber-900/70 dark:bg-amber-950/30">
      <CardHeader className="border-b border-amber-200/70 dark:border-amber-900/50">
        <CardTitle className="flex items-center gap-2 text-amber-900 dark:text-amber-200">
          <CircleAlert
            className="size-5 shrink-0 text-amber-500 dark:text-amber-400"
            aria-hidden="true"
          />
          Phase 4 results have not been generated yet
        </CardTitle>
        <CardDescription className="text-amber-800/90 dark:text-amber-300/80">
          This section renders the retrieval evaluation from{" "}
          <code className="font-mono text-xs">
            hiver-support-agent/evaluation/results/phase4_summary.json
          </code>
          , which does not exist yet. Follow the steps below to produce it,
          then press Refresh.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="space-y-4">
          {PHASE4_SETUP_STEPS.map((step, index) => (
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

function Phase4ErrorCard({
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
      <AlertTitle>Could not load Phase 4 results</AlertTitle>
      <AlertDescription className="text-red-800 dark:text-red-300">
        <p>{message || "The Phase 4 status API request failed."}</p>
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

function Phase4Skeleton() {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-4">
      <p className="sr-only">Loading Phase 4 results…</p>
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
