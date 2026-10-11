"use client";

import { useCallback, useEffect, useState } from "react";
import { CircleAlert, Download, PenLine, RefreshCw } from "lucide-react";

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
import { GatesCard } from "@/components/phase5/gates-card";
import { GenerationDemo } from "@/components/phase5/generation-demo";
import { GroundingCard } from "@/components/phase5/grounding-card";
import { MethodologyCard } from "@/components/phase5/methodology-card";
import { MetricsCard } from "@/components/phase5/metrics-card";
import { QualitativeExamples } from "@/components/phase5/qualitative-examples";
import { formatFloat, formatInt, orDash } from "@/lib/phase1";
import { formatScore } from "@/lib/phase2";
import { type Phase4StatusResponse } from "@/lib/phase4";
import {
  PHASE5_SETUP_STEPS,
  type Phase5StatusResponse,
  type Phase5Summary,
} from "@/lib/phase5";

type LoadState = "loading" | "ready" | "not_run" | "error";

/**
 * "Phase 5 — Grounded response generation" section. Fetches
 * /api/phase5/status on mount and owns its loading / error / not-run states
 * independently of the earlier sections — the page reads Phase 1 → … → 5.
 * Ready state renders the subsections: methodology → evidence quality
 * (cross-referenced from phase4_summary.json) → metrics → grounding →
 * gates → qualitative examples → live demo.
 *
 * The Phase 4 Recall@5 is fetched alongside (from /api/phase4/status,
 * non-fatal when unavailable) so the evidence-quality card can state what
 * the generator actually consumes — no hardcoded cross-references.
 */
export function Phase5Section() {
  const [state, setState] = useState<LoadState>("loading");
  const [summary, setSummary] = useState<Phase5Summary | null>(null);
  const [message, setMessage] = useState<string>("");
  const [phase4RecallAt5, setPhase4RecallAt5] = useState<number | undefined>(
    undefined,
  );
  const [phase4TestN, setPhase4TestN] = useState<number | undefined>(
    undefined,
  );
  const [phase4IndexedPairs, setPhase4IndexedPairs] = useState<
    number | undefined
  >(undefined);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const response = await fetch("/api/phase5/status", {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(`Request failed with HTTP ${response.status}`);
      }
      const payload = (await response.json()) as Phase5StatusResponse;
      if (payload.ok && payload.status === "READY" && payload.data) {
        setSummary(payload.data);
        setMessage("");
        setState("ready");
      } else {
        setSummary(null);
        setMessage(
          payload.message ?? "Phase 5 results are not available yet.",
        );
        setState("not_run");
      }
    } catch (error) {
      setSummary(null);
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to reach the Phase 5 status API.",
      );
      setState("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /* Optional cross-reference: the Phase 4 evidence quality the generator
     consumes. Failure is silent — the card degrades to a pointer to the
     Phase 4 section. */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/phase4/status", {
          cache: "no-store",
        });
        if (!response.ok) return;
        const payload = (await response.json()) as Phase4StatusResponse;
        if (!cancelled && payload.ok && payload.data) {
          setPhase4RecallAt5(
            payload.data.evaluation?.test?.recall_at_5,
          );
          setPhase4TestN(payload.data.evaluation?.test?.n);
          setPhase4IndexedPairs(payload.data.corpus?.indexed_pairs);
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
    <section aria-labelledby="phase5-heading" className="space-y-4">
      <SectionHeading
        id="phase5-heading"
        icon={PenLine}
        title="Phase 5 — Grounded response generation"
        description="For a customer message, the system predicts intent with the Phase 3 head, retrieves the most similar historical cases from the Phase 4 index, and asks the z-ai LLM (backend only) for ONE Twitter-length reply under six non-negotiable safety rules — then scores every reply with transparent lexical heuristics. All values come straight from evaluation/results/phase5_summary.json — and the demo at the end of this section drafts replies through the live service."
      />

      {state === "ready" ? (
        <div className="flex justify-end print:hidden">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-xs text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
            onClick={() => {
              const anchor = document.createElement("a");
              anchor.href = "/api/phase5/status?format=raw";
              anchor.rel = "noopener";
              document.body.appendChild(anchor);
              anchor.click();
              anchor.remove();
            }}
            aria-label="Download phase5_summary.json — the raw Phase 5 artifact"
            title="Download the raw phase5_summary.json written by scripts/evaluate_generation.py"
          >
            <Download className="size-3.5" aria-hidden="true" />
            Download phase5_summary.json
          </Button>
        </div>
      ) : null}

      {state === "loading" ? <Phase5Skeleton /> : null}

      {state === "error" ? (
        <Phase5ErrorCard message={message} onRetry={() => void load()} />
      ) : null}

      {state === "not_run" ? <Phase5NotRunCard message={message} /> : null}

      {state === "ready" && summary ? (
        <Phase5Content
          summary={summary}
          phase4RecallAt5={phase4RecallAt5}
          phase4TestN={phase4TestN}
          phase4IndexedPairs={phase4IndexedPairs}
        />
      ) : null}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Ready state: meta strip + the seven subsections                      */
/* ------------------------------------------------------------------ */

function Phase5Content({
  summary,
  phase4RecallAt5,
  phase4TestN,
  phase4IndexedPairs,
}: {
  summary: Phase5Summary;
  phase4RecallAt5: number | undefined;
  phase4TestN: number | undefined;
  phase4IndexedPairs: number | undefined;
}) {
  const evaluation = summary.evaluation ?? {};
  const test = evaluation.test ?? {};
  const examples = summary.qualitative_examples ?? [];
  const config = summary.config ?? {};

  return (
    <div className="space-y-8 sm:space-y-10">
      <p className="rounded-lg border border-zinc-200/80 bg-zinc-100/60 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
        Results generated: {orDash(summary.generated_at)} · Random seed:{" "}
        {orDash(String(summary.random_seed ?? ""))} · Wall clock:{" "}
        {summary.wall_clock_seconds !== undefined
          ? `${formatFloat(summary.wall_clock_seconds, 1)} s`
          : "—"}{" "}
        · Artifact:{" "}
        <code className="font-mono">
          hiver-support-agent/evaluation/results/phase5_summary.json
        </code>
      </p>

      <MethodologyCard
        pipeline={summary.pipeline}
        safetyRules={summary.safety_rules}
        promptDesign={summary.prompt_design}
        llmModel={config.llm}
      />

      <EvidenceQualityCard
        recallAt5={phase4RecallAt5}
        testN={phase4TestN}
        indexedPairs={phase4IndexedPairs}
        topK={config.top_k}
      />

      <MetricsCard test={test} maxReplyChars={config.max_reply_chars} />

      <GroundingCard
        grounding={test.grounding_overlap}
        examples={examples}
        caveats={summary.honest_caveats}
      />

      <GatesCard test={test} config={config} />

      {examples.length > 0 ? (
        <QualitativeExamples examples={examples} config={config} />
      ) : null}

      <GenerationDemo defaultK={config.top_k} llmModel={config.llm} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Cross-reference: the Phase 4 evidence quality the generator consumes */
/* ------------------------------------------------------------------ */

function EvidenceQualityCard({
  recallAt5,
  testN,
  indexedPairs,
  topK,
}: {
  recallAt5: number | undefined;
  testN: number | undefined;
  indexedPairs: number | undefined;
  topK: number | undefined;
}) {
  /* Derived, never asserted: Recall@5 0.7586 ≈ 3 in 4 openers. */
  const aboutInFour =
    recallAt5 !== undefined && Number.isFinite(recallAt5) && recallAt5 > 0
      ? Math.round(recallAt5 * 4)
      : undefined;

  return (
    <Card className="gap-0">
      <CardHeader className="border-b">
        <CardTitle className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
          <span>The evidence behind every reply</span>
          {recallAt5 !== undefined ? (
            <span className="font-mono text-xs font-normal tabular-nums text-zinc-500 dark:text-zinc-400">
              Phase 4 Recall@5 {formatScore(recallAt5)}
            </span>
          ) : null}
        </CardTitle>
        <CardDescription className="text-xs">
          Every Phase 5 draft is grounded in pairs drawn from the same Phase 4
          index{indexedPairs !== undefined ? ` (${formatInt(indexedPairs)} pairs)` : ""}
          {topK !== undefined ? ` — the top ${formatInt(topK)} per message` : ""}.
        </CardDescription>
      </CardHeader>
      <CardContent className="mt-4">
        {recallAt5 !== undefined ? (
          <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
            On the same{" "}
            {testN !== undefined ? formatInt(testN) : "golden"} golden TEST
            openers, the Phase 4 retrieval evaluation measured Recall@5 ={" "}
            <span className="font-mono font-semibold tabular-nums">
              {formatScore(recallAt5)}
            </span>
            {aboutInFour !== undefined
              ? ` — roughly ${aboutInFour} in 4 openers find a same-intent historical case within the top-${topK ?? 5}`
              : ""}
            . Grounding cannot exceed what retrieval finds: when the evidence
            is weak, the safety rules push the reply toward a clarifying
            question or a DM redirect instead of specific advice — the
            escalation gates below quantify exactly that fallback.
          </p>
        ) : (
          <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
            The Phase 4 summary could not be loaded for the cross-reference —
            see the <span className="font-medium">Phase 4</span> section above
            for the Recall@5 evaluation of the index this generator consumes.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* NOT_RUN guidance (mirrors the Phase 1–4 NotRunCard pattern)          */
/* ------------------------------------------------------------------ */

function Phase5NotRunCard({ message }: { message: string }) {
  return (
    <Card className="border-amber-200 bg-amber-50/60 dark:border-amber-900/70 dark:bg-amber-950/30">
      <CardHeader className="border-b border-amber-200/70 dark:border-amber-900/50">
        <CardTitle className="flex items-center gap-2 text-amber-900 dark:text-amber-200">
          <CircleAlert
            className="size-5 shrink-0 text-amber-500 dark:text-amber-400"
            aria-hidden="true"
          />
          Phase 5 results have not been generated yet
        </CardTitle>
        <CardDescription className="text-amber-800/90 dark:text-amber-300/80">
          This section renders the grounded-generation evaluation from{" "}
          <code className="font-mono text-xs">
            hiver-support-agent/evaluation/results/phase5_summary.json
          </code>
          , which does not exist yet. Follow the steps below to produce it,
          then press Refresh.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="space-y-4">
          {PHASE5_SETUP_STEPS.map((step, index) => (
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

function Phase5ErrorCard({
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
      <AlertTitle>Could not load Phase 5 results</AlertTitle>
      <AlertDescription className="text-red-800 dark:text-red-300">
        <p>{message || "The Phase 5 status API request failed."}</p>
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

function Phase5Skeleton() {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-4">
      <p className="sr-only">Loading Phase 5 results…</p>
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
