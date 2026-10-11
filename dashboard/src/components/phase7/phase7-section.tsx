"use client";

import { useCallback, useEffect, useState } from "react";
import { Bot, CircleAlert, Download, RefreshCw } from "lucide-react";

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
import { AgentConsole } from "@/components/phase7/agent-console";
import { CompositionCard } from "@/components/phase7/composition-card";
import { CostCard } from "@/components/phase7/cost-card";
import { MetricsCard } from "@/components/phase7/metrics-card";
import { formatFloat, orDash } from "@/lib/phase1";
import {
  PHASE7_SETUP_STEPS,
  type Phase7StatusResponse,
  type Phase7Summary,
} from "@/lib/phase7";

type LoadState = "loading" | "ready" | "not_run" | "error";

/**
 * "Phase 7 — Unified agent" section. Fetches /api/phase7/status on mount
 * and owns its loading / error / not-run states independently of the
 * earlier sections — the page reads Phase 1 → … → 7. Ready state renders
 * the subsections: composition flow → live metrics → LLM-call cost → the
 * LIVE agent console (the same loop, interactive through the gateway).
 */
export function Phase7Section() {
  const [state, setState] = useState<LoadState>("loading");
  const [summary, setSummary] = useState<Phase7Summary | null>(null);
  const [message, setMessage] = useState<string>("");

  const load = useCallback(async () => {
    setState("loading");
    try {
      const response = await fetch("/api/phase7/status", {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(`Request failed with HTTP ${response.status}`);
      }
      const payload = (await response.json()) as Phase7StatusResponse;
      if (payload.ok && payload.status === "READY" && payload.data) {
        setSummary(payload.data);
        setMessage("");
        setState("ready");
      } else {
        setSummary(null);
        setMessage(
          payload.message ?? "Phase 7 results are not available yet.",
        );
        setState("not_run");
      }
    } catch (error) {
      setSummary(null);
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to reach the Phase 7 status API.",
      );
      setState("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section aria-labelledby="phase7-heading" className="space-y-4">
      <SectionHeading
        id="phase7-heading"
        icon={Bot}
        title="Phase 7 — Unified agent"
        description="Every phase composed into one loop: classify the message, retrieve its evidence, let the Phase 6 policy decide — and only then either draft a grounded reply or hand the conversation to a human with a structured brief. The evaluation below drove all 29 golden TEST openers through the live endpoint and asserted the service's TypeScript policy mirror agrees with the Python policy on every single message. All values come straight from evaluation/results/phase7_summary.json — and the console at the end of this section runs the same agent live."
      />

      {state === "ready" ? (
        <div className="flex justify-end print:hidden">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-xs text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
            onClick={() => {
              const anchor = document.createElement("a");
              anchor.href = "/api/phase7/status?format=raw";
              anchor.rel = "noopener";
              document.body.appendChild(anchor);
              anchor.click();
              anchor.remove();
            }}
            aria-label="Download phase7_summary.json — the raw Phase 7 artifact"
            title="Download the raw phase7_summary.json written by scripts/evaluate_agent.py"
          >
            <Download className="size-3.5" aria-hidden="true" />
            Download phase7_summary.json
          </Button>
        </div>
      ) : null}

      {state === "loading" ? <Phase7Skeleton /> : null}

      {state === "error" ? (
        <Phase7ErrorCard message={message} onRetry={() => void load()} />
      ) : null}

      {state === "not_run" ? <Phase7NotRunCard message={message} /> : null}

      {state === "ready" && summary ? (
        <Phase7Content summary={summary} />
      ) : null}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Ready state: meta strip + the four subsections                       */
/* ------------------------------------------------------------------ */

function Phase7Content({ summary }: { summary: Phase7Summary }) {
  const evaluation = summary.evaluation ?? {};
  const config = summary.config ?? {};
  const policy = summary.policy ?? {};
  const live = summary.live_service ?? {};

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
          hiver-support-agent/evaluation/results/phase7_summary.json
        </code>
      </p>

      <CompositionCard
        summary={summary}
        policyRules={(policy.rules ?? []).length}
      />

      <MetricsCard evaluation={evaluation} />

      <CostCard cost={evaluation.cost} />

      <AgentConsole llmModel={config.llm} />

      {/* live-service footer pointer */}
      {live.note ? (
        <p className="rounded-lg border border-zinc-200/80 bg-zinc-100/60 px-3 py-2 text-[11px] leading-relaxed text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
          The console above calls{" "}
          <code className="font-mono">{live.agent_endpoint ?? "/api/phase7/agent"}</code>{" "}
          on the mini-service
          {live.port !== undefined ? ` (port ${live.port})` : ""} through the
          sandbox gateway. {live.note}
        </p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* NOT_RUN guidance (mirrors the Phase 1–6 NotRunCard pattern)          */
/* ------------------------------------------------------------------ */

function Phase7NotRunCard({ message }: { message: string }) {
  return (
    <Card className="border-amber-200 bg-amber-50/60 dark:border-amber-900/70 dark:bg-amber-950/30">
      <CardHeader className="border-b border-amber-200/70 dark:border-amber-900/50">
        <CardTitle className="flex items-center gap-2 text-amber-900 dark:text-amber-200">
          <CircleAlert
            className="size-5 shrink-0 text-amber-500 dark:text-amber-400"
            aria-hidden="true"
          />
          Phase 7 results have not been generated yet
        </CardTitle>
        <CardDescription className="text-amber-800/90 dark:text-amber-300/80">
          This section renders the unified-agent evaluation from{" "}
          <code className="font-mono text-xs">
            hiver-support-agent/evaluation/results/phase7_summary.json
          </code>
          , which does not exist yet. Follow the steps below to produce it,
          then press Refresh.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="space-y-4">
          {PHASE7_SETUP_STEPS.map((step, index) => (
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

function Phase7ErrorCard({
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
      <AlertTitle>Could not load Phase 7 results</AlertTitle>
      <AlertDescription className="text-red-800 dark:text-red-300">
        <p>{message || "The Phase 7 status API request failed."}</p>
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

function Phase7Skeleton() {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-4">
      <p className="sr-only">Loading Phase 7 results…</p>
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
