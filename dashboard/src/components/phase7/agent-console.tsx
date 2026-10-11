"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  Loader2,
  RefreshCw,
  Server,
  ServerCog,
  Sparkles,
  TriangleAlert,
  UserRoundCheck,
  X,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { SubsectionHeading } from "@/components/phase2/subsection-heading";
import { formatInt, formatPercent } from "@/lib/phase1";
import { formatScore } from "@/lib/phase2";
import {
  AGENT_EXAMPLE_MESSAGES,
  AGENT_MAX_INPUT_CHARS,
  intentName,
  type AgentEvidenceItem,
  type AgentResponse,
  type RetrievalHealthResponse,
} from "@/lib/phase7";
import { CUSTOM_SCROLLBAR } from "@/lib/phase5";
import { cn } from "@/lib/utils";

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/* Relative gateway URLs ONLY — the agent service lives on port 3030 and is
   reached through the Caddy gateway via the XTransformPort query parameter.
   Never an absolute http://localhost URL. */
const HEALTH_URL = "/api/phase4/health?XTransformPort=3030";
const AGENT_URL = "/api/phase7/agent?XTransformPort=3030";
const WARMUP_URL = "/api/phase4/warmup?XTransformPort=3030";

type WorkerState =
  | "unknown"
  | "idle"
  | "loading"
  | "ready"
  | "dead"
  | "unreachable";

type AgentErrorKind = "network" | "service" | null;

/**
 * Subsection D — THE live agent console: type a support message and the
 * full Phase 7 agent runs against the live service
 * (mini-services/retrieval-service, port 3030): Phase 3 head → Phase 4
 * FAISS → Phase 6 policy (before any LLM call) → then either a Phase 5
 * grounded draft or a structured human handoff with zero LLM calls. The
 * worker loads lazily (~15 s) — the UI says so; if the service is
 * unreachable, everything above still renders from the JSON artifact.
 */
export function AgentConsole({ llmModel }: { llmModel?: string }) {
  const [worker, setWorker] = useState<WorkerState>("unknown");
  const [health, setHealth] = useState<RetrievalHealthResponse | null>(null);

  const [message, setMessage] = useState("");
  const [askState, setAskState] = useState<"idle" | "loading">("idle");
  const [warming, setWarming] = useState(false);
  const [validation, setValidation] = useState<string | null>(null);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [agentErrorKind, setAgentErrorKind] = useState<AgentErrorKind>(null);
  const [result, setResult] = useState<AgentResponse | null>(null);

  const requestIdRef = useRef(0);

  /* ---------------- health polling ---------------- */

  const refreshHealth = useCallback(async () => {
    try {
      const response = await fetch(HEALTH_URL, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const payload = (await response.json()) as RetrievalHealthResponse;
      setHealth(payload);
      if (
        payload.worker === "idle" ||
        payload.worker === "loading" ||
        payload.worker === "ready" ||
        payload.worker === "dead"
      ) {
        setWorker(payload.worker);
      } else {
        setWorker("unknown");
      }
    } catch {
      setWorker("unreachable");
      setHealth(null);
    }
  }, []);

  useEffect(() => {
    void refreshHealth();
  }, [refreshHealth]);

  /* Poll while the worker is loading / unknown, or while a request is
     in flight, so the status chip flips live during the ~15 s warm-up. */
  useEffect(() => {
    const active =
      worker === "loading" ||
      worker === "unknown" ||
      askState === "loading" ||
      warming;
    if (!active) return;
    const timer = setInterval(() => {
      void refreshHealth();
    }, 2500);
    return () => clearInterval(timer);
  }, [worker, askState, warming, refreshHealth]);

  /* ---------------- ask + warmup ---------------- */

  const runAgent = useCallback(
    async (messageText: string) => {
      const trimmed = messageText.trim();
      if (!trimmed) {
        setValidation(
          "Type a message first — even a few words are enough (e.g. one of the examples below).",
        );
        return;
      }
      if (trimmed.length > AGENT_MAX_INPUT_CHARS) {
        setValidation(
          `That message is ${trimmed.length} characters — the agent caps input at ${AGENT_MAX_INPUT_CHARS}.`,
        );
        return;
      }
      setValidation(null);
      setAgentError(null);
      setAgentErrorKind(null);
      setAskState("loading");
      /* First request on a cold worker loads encoder + index (~15 s) before
         the policy (and possibly the LLM) run — say so instead of letting
         the UI look frozen. */
      setWarming(worker === "idle" || worker === "loading" || worker === "unknown");
      const requestId = ++requestIdRef.current;
      try {
        const response = await fetch(AGENT_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: trimmed }),
        });
        const payload = (await response.json()) as AgentResponse;
        if (requestId !== requestIdRef.current) return; // superseded
        if (!response.ok || !payload.ok) {
          throw new Error(
            payload.error ??
              `The agent call failed with HTTP ${response.status}.`,
          );
        }
        setResult(payload);
      } catch (error) {
        if (requestId !== requestIdRef.current) return; // superseded
        setResult(null);
        setAgentError(
          error instanceof Error
            ? error.message
            : "The agent service could not be reached.",
        );
        setAgentErrorKind(
          error instanceof TypeError ? "network" : "service",
        );
        void refreshHealth();
      } finally {
        if (requestId === requestIdRef.current) {
          setWarming(false);
          setAskState("idle");
        }
      }
    },
    [worker, refreshHealth],
  );

  const runWarmup = useCallback(async () => {
    setWarming(true);
    setAgentError(null);
    setAgentErrorKind(null);
    try {
      await fetch(WARMUP_URL, { method: "POST" });
    } catch {
      /* health refresh below surfaces the failure */
    } finally {
      setWarming(false);
      void refreshHealth();
    }
  }, [refreshHealth]);

  const applyExample = useCallback((example: string) => {
    setMessage(example);
    setValidation(null);
  }, []);

  const charCount = message.length;
  const nearLimit = charCount >= AGENT_MAX_INPUT_CHARS * 0.9;

  return (
    <section aria-labelledby="phase7-demo-heading" className="space-y-4">
      <SubsectionHeading
        id="phase7-demo-heading"
        icon={Sparkles}
        title="Try it — ask the agent yourself"
        description={
          llmModel
            ? `This console runs the real unified agent: your message is classified by the Phase 3 head, matched against the Phase 4 FAISS index, and routed by the Phase 6 policy BEFORE any LLM call. Auto-handle drafts a grounded reply (${llmModel.split(" ")[0] ?? "z-ai LLM"}, backend only); escalate builds a human handoff with zero LLM calls.`
            : "This console runs the real unified agent: your message is classified by the Phase 3 head, matched against the Phase 4 FAISS index, and routed by the Phase 6 policy BEFORE any LLM call. Auto-handle drafts a grounded reply; escalate builds a human handoff with zero LLM calls."
        }
      />

      <Card className="gap-0">
        <CardHeader className="border-b">
          <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
            <span>Live agent console</span>
            <ServiceChip
              worker={worker}
              health={health}
              onRetry={() => void refreshHealth()}
              onWarmup={() => void runWarmup()}
              warming={warming}
            />
          </CardTitle>
          <CardDescription className="text-xs">
            Served by the retrieval mini-service (port 3030, reached through
            the gateway). The worker loads lazily: the first question pays a
            one-time ~15 s load of the encoder + index; escalations then
            answer in tens of milliseconds, auto-handles add one LLM call.
          </CardDescription>
        </CardHeader>
        <CardContent className="mt-4 space-y-4">
          {/* -------- input row -------- */}
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <label
                htmlFor="phase7-demo-message"
                className="text-xs font-medium text-zinc-700 dark:text-zinc-300"
              >
                Your support message
              </label>
              <span
                className={cn(
                  "font-mono text-[10px] tabular-nums",
                  nearLimit
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-zinc-400 dark:text-zinc-500",
                )}
                aria-hidden="true"
              >
                {charCount}/{AGENT_MAX_INPUT_CHARS}
              </span>
            </div>
            <Textarea
              id="phase7-demo-message"
              value={message}
              maxLength={AGENT_MAX_INPUT_CHARS}
              rows={3}
              placeholder="e.g. my App Store is not working!!!!"
              className="min-h-[5.5rem] resize-y text-sm"
              aria-describedby="phase7-demo-message-hint"
              onChange={(event) => setMessage(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  void runAgent(message);
                }
              }}
            />
            <p
              id="phase7-demo-message-hint"
              className="text-[11px] text-zinc-500 dark:text-zinc-400"
            >
              Type like a customer would — typos and all. ⌘/Ctrl + Enter also
              asks the agent.
            </p>
          </div>

          {/* -------- ask button -------- */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              className="h-9 gap-1.5"
              disabled={askState === "loading"}
              onClick={() => void runAgent(message)}
            >
              {askState === "loading" ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Bot className="size-4" aria-hidden="true" />
              )}
              {askState === "loading" ? "asking…" : "Ask the agent"}
            </Button>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              The policy decides first — you will see why it answered or why
              it escalated.
            </p>
          </div>

          {/* -------- example chips -------- */}
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Or fill in an example from the golden test set
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {AGENT_EXAMPLE_MESSAGES.map((example) => (
                <button
                  key={example}
                  type="button"
                  className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-left text-[11px] leading-relaxed text-zinc-600 transition-colors hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:border-emerald-800 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-300"
                  onClick={() => applyExample(example)}
                >
                  {example}
                </button>
              ))}
            </div>
          </div>

          {/* -------- validation -------- */}
          {validation ? (
            <p
              role="alert"
              className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-300"
            >
              {validation}
            </p>
          ) : null}

          {/* -------- warm-up state -------- */}
          {askState === "loading" && warming ? (
            <div
              role="status"
              className="flex items-start gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2.5 dark:border-emerald-900/60 dark:bg-emerald-950/20"
            >
              <Loader2
                className="mt-0.5 size-4 shrink-0 animate-spin text-emerald-600 dark:text-emerald-400"
                aria-hidden="true"
              />
              <p className="text-xs leading-relaxed text-emerald-800 dark:text-emerald-300/90">
                Warming up the agent service — the first question loads the
                encoder + FAISS index (~15 s) before the policy runs. This
                happens once; the service then stays warm and escalations
                answer in tens of milliseconds.
              </p>
            </div>
          ) : null}

          {/* -------- agent in flight (worker warm) -------- */}
          {askState === "loading" && !warming ? (
            <div role="status" className="space-y-2" aria-busy="true">
              <p className="sr-only">The agent is deciding…</p>
              <Skeleton className="skeleton-shimmer h-14 w-full" />
              <Skeleton className="skeleton-shimmer h-24 w-full" />
              <Skeleton className="skeleton-shimmer h-16 w-full" />
            </div>
          ) : null}

          {/* -------- errors -------- */}
          {agentError && agentErrorKind === "network" ? (
            <ServiceUnreachableCard
              detail={agentError}
              onRetry={() => {
                void refreshHealth();
                void runAgent(message);
              }}
            />
          ) : agentError ? (
            <Alert
              variant="destructive"
              className="border-red-200 bg-red-50 text-red-900 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-100"
            >
              <TriangleAlert className="size-4" aria-hidden="true" />
              <AlertTitle>The agent call failed</AlertTitle>
              <AlertDescription className="text-red-800 dark:text-red-300">
                <p>{agentError}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 h-11 border-red-200 bg-white text-red-700 hover:bg-red-50 hover:text-red-800 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-950/60 dark:hover:text-red-200"
                  onClick={() => void runAgent(message)}
                >
                  <RefreshCw className="size-4" aria-hidden="true" />
                  Retry
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}

          {/* -------- results -------- */}
          {result ? (
            <div className="space-y-4" aria-live="polite">
              <AgentResult result={result} />
            </div>
          ) : null}

          {/* -------- historical-data + nondeterminism note -------- */}
          <p className="flex items-start gap-2 rounded-lg border border-zinc-200/80 bg-zinc-100/60 px-3 py-2 text-[11px] leading-relaxed text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
            <TriangleAlert
              className="mt-0.5 size-3.5 shrink-0 text-amber-500 dark:text-amber-400"
              aria-hidden="true"
            />
            The console runs the same agent loop the evaluation numbers above
            were measured with. LLM drafts are nondeterministic, so your
            auto-handle reply may differ from the recorded run — and the
            evidence behind it is 2017-era historical support, not current
            Apple policy.
          </p>
        </CardContent>
      </Card>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Service status chip (same states as the Phase 5 demo)               */
/* ------------------------------------------------------------------ */

function ServiceChip({
  worker,
  health,
  onRetry,
  onWarmup,
  warming,
}: {
  worker: WorkerState;
  health: RetrievalHealthResponse | null;
  onRetry: () => void;
  onWarmup: () => void;
  warming: boolean;
}) {
  const corpusSize = health?.corpus_size;

  if (worker === "ready") {
    return (
      <Badge className="gap-1.5 border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
        <Server className="size-3" aria-hidden="true" />
        {isFiniteNumber(corpusSize) && corpusSize > 0
          ? `live · ${formatInt(corpusSize)} pairs indexed`
          : "live"}
      </Badge>
    );
  }

  if (worker === "loading" || warming) {
    return (
      <Badge className="gap-1.5 border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
        <Loader2 className="size-3 animate-spin" aria-hidden="true" />
        loading encoder + index…
      </Badge>
    );
  }

  if (worker === "idle") {
    return (
      <span className="flex flex-wrap items-center gap-1.5">
        <Badge className="gap-1.5 border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
          <ServerCog className="size-3" aria-hidden="true" />
          idle — loads on first question (~15 s)
        </Badge>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-[11px] text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
          onClick={onWarmup}
        >
          <Loader2 className="mr-1 size-3" aria-hidden="true" />
          warm up now
        </Button>
      </span>
    );
  }

  if (worker === "dead") {
    return (
      <span className="flex flex-wrap items-center gap-1.5">
        <Badge className="border-rose-200 bg-rose-100 text-rose-700 dark:border-rose-900 dark:bg-rose-950/60 dark:text-rose-300">
          <TriangleAlert className="size-3" aria-hidden="true" />
          worker failed
        </Badge>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-[11px] text-rose-600 hover:text-rose-800 dark:text-rose-400 dark:hover:text-rose-300"
          onClick={onRetry}
        >
          <RefreshCw className="mr-1 size-3" aria-hidden="true" />
          re-check
        </Button>
      </span>
    );
  }

  if (worker === "unreachable") {
    return (
      <span className="flex flex-wrap items-center gap-1.5">
        <Badge className="border-rose-200 bg-rose-100 text-rose-700 dark:border-rose-900 dark:bg-rose-950/60 dark:text-rose-300">
          <TriangleAlert className="size-3" aria-hidden="true" />
          service unreachable
        </Badge>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-[11px] text-rose-600 hover:text-rose-800 dark:text-rose-400 dark:hover:text-rose-300"
          onClick={onRetry}
        >
          <RefreshCw className="mr-1 size-3" aria-hidden="true" />
          retry
        </Button>
      </span>
    );
  }

  return (
    <Badge
      variant="outline"
      className="gap-1.5 text-zinc-500 dark:text-zinc-400"
    >
      <Loader2 className="size-3 animate-spin" aria-hidden="true" />
      checking service…
    </Badge>
  );
}

/* ------------------------------------------------------------------ */
/* (a) The result: decision banner + metrics + rule trace + outcome     */
/* ------------------------------------------------------------------ */

function AgentResult({ result }: { result: AgentResponse }) {
  const isAuto = result.decision === "auto_handle";
  const intent = result.query_intent;
  const confidence = intent?.confidence;
  const confidenceWidth = isFiniteNumber(confidence)
    ? Math.min(Math.max(confidence, 0), 1) * 100
    : 0;
  const gates = result.gates ?? {};
  const policy = result.policy ?? {};
  const reasons = policy.reasons ?? [];
  const top1Score = gates.top1_score;
  const timings = result.timings ?? {};

  const srSummary = [
    `Decision: ${isAuto ? "auto-handle" : "escalate"}.`,
    `Predicted intent ${intent?.label ?? "—"}${
      isFiniteNumber(confidence) ? ` (confidence ${formatScore(confidence)})` : ""
    }; top-1 retrieval score ${formatScore(top1Score)}.`,
    `Gates: intent ${
      gates.intent_pass === true ? "pass" : gates.intent_pass === false ? "fail" : "—"
    }, retrieval ${
      gates.retrieval_pass === true ? "pass" : gates.retrieval_pass === false ? "fail" : "—"
    }.`,
    reasons.length > 0
      ? `Rules fired: ${reasons
          .map((reason) => `${reason.rule ?? "?"} ${reason.name ?? ""}`)
          .join("; ")}.`
      : "No rules fired.",
    isAuto
      ? `Auto-handled with a grounded reply: ${result.reply ?? "—"}`
      : "Escalated to a human with a structured handoff; no LLM call was made.",
  ].join(" ");

  return (
    <div
      className="min-w-0 space-y-4 rounded-lg border border-zinc-100 bg-zinc-50/60 p-3 dark:border-zinc-800 dark:bg-zinc-900/40"
    >
      <p className="sr-only">{srSummary}</p>

      {/* ---- the decision banner ---- */}
      <div
        role="status"
        className={cn(
          "flex flex-wrap items-center gap-3 rounded-lg border p-3.5",
          isAuto
            ? "border-emerald-300 bg-emerald-50/80 dark:border-emerald-800/70 dark:bg-emerald-950/30"
            : "border-red-300 bg-red-50/80 dark:border-red-900/60 dark:bg-red-950/30",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-full text-white",
            isAuto ? "bg-emerald-600" : "bg-red-600",
          )}
        >
          {isAuto ? (
            <Bot className="size-5" />
          ) : (
            <UserRoundCheck className="size-5" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "text-lg font-bold tracking-tight sm:text-xl",
              isAuto
                ? "text-emerald-900 dark:text-emerald-100"
                : "text-red-900 dark:text-red-100",
            )}
          >
            {isAuto ? "AUTO-HANDLE" : "ESCALATE"}
          </p>
          <p
            className={cn(
              "text-xs leading-relaxed",
              isAuto
                ? "text-emerald-800/90 dark:text-emerald-300/80"
                : "text-red-800/90 dark:text-red-300/80",
            )}
          >
            {isAuto
              ? result.reply_status === "ready_to_send"
                ? "All five rules passed — a grounded reply was drafted and is ready to send."
                : "All five rules passed — a grounded reply was drafted."
              : reasons.length > 0
                ? `${String(reasons.length)} rule${reasons.length === 1 ? "" : "s"} fired — this goes to a human, and no LLM call was spent.`
                : "The policy escalated this message — no LLM call was spent."}
          </p>
        </div>
      </div>

      {/* ---- your message ---- */}
      <div className="min-w-0">
        <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Your message
        </p>
        <blockquote className="mt-1 border-l-2 border-zinc-200 pl-2.5 text-xs leading-relaxed text-zinc-700 dark:border-zinc-700 dark:text-zinc-300">
          &ldquo;{result.message}&rdquo;
        </blockquote>
      </div>

      {/* ---- the four metrics ---- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricTile
          label="Intent (Phase 3)"
          value={intentName(intent?.label)}
          sub={
            isFiniteNumber(confidence)
              ? `confidence ${formatScore(confidence)}`
              : undefined
          }
          bar={confidenceWidth}
        />
        <MetricTile
          label="Top-1 evidence (Phase 4)"
          value={isFiniteNumber(top1Score) ? formatScore(top1Score) : "—"}
          sub="cosine similarity"
        />
        <MetricTile
          label="Gates"
          value={`intent ${
            gates.intent_pass === true
              ? "✓"
              : gates.intent_pass === false
                ? "✗"
                : "—"
          } · retrieval ${
            gates.retrieval_pass === true
              ? "✓"
              : gates.retrieval_pass === false
                ? "✗"
                : "—"
          }`}
          sub={
            gates.thresholds?.intent !== undefined &&
            gates.thresholds?.retrieval !== undefined
              ? `@ ${gates.thresholds.intent.toFixed(2)} / ${gates.thresholds.retrieval.toFixed(2)}`
              : undefined
          }
        />
        <MetricTile
          label="End-to-end"
          value={
            isFiniteNumber(timings.total_ms)
              ? `${Math.round(timings.total_ms)} ms`
              : "—"
          }
          sub={
            isFiniteNumber(timings.llm_ms)
              ? `incl. ${Math.round(timings.llm_ms)} ms LLM`
              : "no LLM call (policy escalate)"
          }
        />
      </div>

      {/* ---- the rule trace ---- */}
      <div className="min-w-0">
        <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Policy rule trace — {policy.provenance ?? "Phase 6 policy"}
        </p>
        {reasons.length === 0 ? (
          <p className="mt-1.5 rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-xs leading-relaxed text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-300/90">
            No rule fired — E2, E3, E4, G1 and G2 all passed, so the agent
            answered on its own.
          </p>
        ) : (
          <ul className="mt-1.5 space-y-2">
            {reasons.map((reason, index) => (
              <li
                key={`${reason.rule ?? index}-${index}`}
                className="min-w-0 rounded-lg border border-red-200 bg-red-50/50 p-2.5 dark:border-red-900/60 dark:bg-red-950/20"
              >
                <p className="flex flex-wrap items-baseline gap-2">
                  <Badge className="border-red-200 bg-red-100 font-mono text-[10px] text-red-800 dark:border-red-900/70 dark:bg-red-950/60 dark:text-red-300">
                    {reason.rule ?? "—"}
                  </Badge>
                  <span className="font-mono text-[11px] font-medium text-red-800 dark:text-red-300">
                    {reason.name ?? "—"}
                  </span>
                </p>
                {reason.detail ? (
                  <p className="mt-1 text-[11px] leading-relaxed text-red-800/90 dark:text-red-300/80">
                    {reason.detail}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ---- the outcome: reply OR handoff ---- */}
      {isAuto ? <AutoReplyCard result={result} /> : <HandoffCard result={result} />}

      {/* ---- evidence expander ---- */}
      <EvidenceSection result={result} />

      {/* ---- the 2017-era historical disclaimer, field-exact ---- */}
      {result.meta?.disclaimer ? (
        <p className="flex items-start gap-2 rounded-lg border border-zinc-200/80 bg-zinc-100/60 px-3 py-2 text-[11px] leading-relaxed text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
          <TriangleAlert
            className="mt-0.5 size-3.5 shrink-0 text-amber-500 dark:text-amber-400"
            aria-hidden="true"
          />
          {result.meta.disclaimer}
        </p>
      ) : null}
    </div>
  );
}

function MetricTile({
  label,
  value,
  sub,
  bar,
}: {
  label: string;
  value: string;
  sub?: string;
  /** 0..100 confidence bar width, optional */
  bar?: number;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-zinc-100 bg-white/70 p-2.5 dark:border-zinc-800 dark:bg-zinc-900/60">
      <p className="text-[9px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
      </p>
      <p
        className="mt-0.5 truncate text-xs font-semibold tabular-nums text-zinc-900 dark:text-zinc-100"
        title={value}
      >
        {value}
      </p>
      {bar !== undefined ? (
        <div
          className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
          role="img"
          aria-label={sub ?? ""}
        >
          <div
            className="h-full rounded-full bg-emerald-500 dark:bg-emerald-400"
            style={{ width: `${bar}%` }}
          />
        </div>
      ) : null}
      {sub ? (
        <p className="mt-1 text-[10px] leading-relaxed text-zinc-500 dark:text-zinc-400">
          {sub}
        </p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* (b) Auto path — the grounded reply + its scores                     */
/* ------------------------------------------------------------------ */

function AutoReplyCard({ result }: { result: AgentResponse }) {
  const scores = result.scores ?? {};
  const unsupported = scores.unsupported_specifics ?? [];
  const lengthChars = scores.length_chars;
  const maxReplyChars = result.llm?.max_reply_chars;

  return (
    <div className="min-w-0 rounded-lg border border-emerald-200/80 bg-emerald-50/70 p-3 dark:border-emerald-900/60 dark:bg-emerald-950/20">
      <p className="text-[10px] font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
        Generated reply — ready to send
        {isFiniteNumber(lengthChars) && isFiniteNumber(maxReplyChars) ? (
          <span className="ml-2 font-mono font-normal tabular-nums text-emerald-600/80 dark:text-emerald-400/80">
            {formatInt(lengthChars)} / {formatInt(maxReplyChars)} chars
          </span>
        ) : isFiniteNumber(lengthChars) ? (
          <span className="ml-2 font-mono font-normal tabular-nums text-emerald-600/80 dark:text-emerald-400/80">
            {formatInt(lengthChars)} chars
          </span>
        ) : null}
      </p>
      <blockquote className="mt-1.5 border-l-2 border-emerald-400/80 pl-2.5 text-sm font-medium leading-relaxed text-emerald-950 dark:border-emerald-700/70 dark:text-emerald-100">
        {result.reply ?? "—"}
      </blockquote>

      {/* scores row — the same transparent heuristics as Phase 5 */}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {isFiniteNumber(scores.grounding_overlap) ? (
          <Badge
            variant="outline"
            className="font-mono text-[10px] tabular-nums"
            title="share of the reply's content tokens present in the evidence"
          >
            grounding {formatPercent(scores.grounding_overlap)}
          </Badge>
        ) : null}
        <Badge
          variant="outline"
          className={cn(
            "text-[10px] font-mono tabular-nums",
            unsupported.length === 0
              ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
              : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300",
          )}
          title={
            unsupported.length === 0
              ? "no numbers, version-like tokens, prices or URLs absent from the evidence"
              : `unsupported specifics: ${unsupported.join(", ")}`
          }
        >
          {formatInt(unsupported.length)} unsupported
        </Badge>
        <BoolChip label="framing" value={scores.framing_compliant} tone="good" />
        <BoolChip label="clarifying" value={scores.clarifying_question} />
        <BoolChip label="DM redirect" value={scores.dm_redirect} />
        {scores.personal_data_solicited === false ? (
          <Badge
            variant="outline"
            className="border-emerald-300 bg-emerald-50 text-[10px] text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
            title="the reply never asks for or repeats private details in public"
          >
            no personal data solicited
          </Badge>
        ) : null}
      </div>

      {/* timings footer */}
      <p className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-500 dark:text-zinc-400">
        <span className="font-mono tabular-nums">
          {isFiniteNumber(result.timings?.embed_ms)
            ? `${Math.round(result.timings.embed_ms)} ms embed`
            : "—"}
          {" · "}
          {isFiniteNumber(result.timings?.faiss_search_ms)
            ? `${Math.round(result.timings.faiss_search_ms)} ms FAISS`
            : "—"}
          {" · "}
          {isFiniteNumber(result.timings?.llm_ms)
            ? `${Math.round(result.timings.llm_ms)} ms LLM`
            : "—"}
        </span>
        <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-600">
          ·
        </span>
        <span>
          drafted by {result.llm?.model ?? "the z-ai LLM"} over{" "}
          {isFiniteNumber(result.meta?.corpus_size)
            ? formatInt(result.meta.corpus_size)
            : "—"}{" "}
          indexed pairs
        </span>
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* (c) Escalate path — the structured human handoff                    */
/* ------------------------------------------------------------------ */

function HandoffCard({ result }: { result: AgentResponse }) {
  const handoff = result.handoff ?? {};

  return (
    <div className="min-w-0 rounded-lg border border-red-200/80 bg-red-50/50 p-3 dark:border-red-900/60 dark:bg-red-950/20">
      <p className="flex flex-wrap items-baseline gap-2 text-[10px] font-medium uppercase tracking-wide text-red-700 dark:text-red-300">
        <span>Structured handoff</span>
        <span className="font-mono text-[10px] font-normal text-red-600/80 dark:text-red-400/70">
          next step: {handoff.next_step ?? "—"}
        </span>
        <span className="font-mono text-[10px] font-normal text-red-600/80 dark:text-red-400/70">
          reply_status: {result.reply_status ?? "—"}
        </span>
      </p>

      {/* the safe reply that was auto-sent on the escalate path */}
      {handoff.suggested_public_acknowledgment ? (
        <div className="mt-2.5 min-w-0 rounded-lg border border-zinc-200/80 bg-white/70 p-2.5 dark:border-zinc-800 dark:bg-zinc-900/50">
          <p className="text-[10px] font-medium text-zinc-600 dark:text-zinc-400">
            Safe public reply (auto-sent · 0 LLM calls)
          </p>
          <blockquote className="mt-1 border-l-2 border-red-300 pl-2.5 text-xs font-medium leading-relaxed text-zinc-700 dark:border-red-700/60 dark:text-zinc-300">
            &ldquo;{handoff.suggested_public_acknowledgment}&rdquo;
          </blockquote>
          <p className="mt-1.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
            Official self-service pointers only — account-specific resolution
            continues with the human in DMs.
          </p>
        </div>
      ) : null}

      {handoff.note_for_agent ? (
        <p className="mt-2 text-[11px] leading-relaxed text-red-800/80 dark:text-red-300/70">
          {handoff.note_for_agent}
        </p>
      ) : null}

      {/* timings footer — zero LLM */}
      <p className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-500 dark:text-zinc-400">
        <span className="font-mono tabular-nums">
          {isFiniteNumber(result.timings?.embed_ms)
            ? `${Math.round(result.timings.embed_ms)} ms embed`
            : "—"}
          {" · "}
          {isFiniteNumber(result.timings?.faiss_search_ms)
            ? `${Math.round(result.timings.faiss_search_ms)} ms FAISS`
            : "—"}
          {" · "}
          {isFiniteNumber(result.timings?.llm_ms)
            ? `${Math.round(result.timings.llm_ms)} ms LLM`
            : "0 ms LLM"}
        </span>
        <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-600">
          ·
        </span>
        <span>
          over{" "}
          {isFiniteNumber(result.meta?.corpus_size)
            ? formatInt(result.meta.corpus_size)
            : "—"}{" "}
          indexed pairs — no draft was generated
        </span>
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* (d) Evidence — the historical cases the agent saw                   */
/* ------------------------------------------------------------------ */

function EvidenceSection({ result }: { result: AgentResponse }) {
  const [open, setOpen] = useState(false);
  const evidence = result.evidence ?? [];
  const k = result.k ?? evidence.length;

  if (evidence.length === 0) {
    return (
      <p className="py-2 text-center text-sm text-zinc-500 dark:text-zinc-400">
        The index returned no historical cases for this message.
      </p>
    );
  }

  return (
    <div className="min-w-0">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 gap-1 px-2 text-[11px] text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        aria-expanded={open}
        aria-controls="phase7-demo-evidence"
        onClick={() => setOpen((value) => !value)}
      >
        {open ? (
          <ChevronDown className="size-3.5" aria-hidden="true" />
        ) : (
          <ChevronRight className="size-3.5" aria-hidden="true" />
        )}
        {open ? "Hide" : "Show"} the {formatInt(k)} historical cases the agent
        saw
      </Button>
      {open ? (
        <div
          id="phase7-demo-evidence"
          className={cn(
            "mt-2 max-h-[28rem] space-y-3 overflow-y-auto pr-1 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800",
            CUSTOM_SCROLLBAR,
          )}
        >
          {evidence.map((item, index) => (
            <EvidenceRow
              key={item.pair_id ?? `${item.rank ?? "r"}-${index}`}
              item={item}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function EvidenceRow({ item }: { item: AgentEvidenceItem }) {
  const score = item.score;
  const width = isFiniteNumber(score)
    ? Math.min(Math.max(score, 0), 1) * 100
    : 0;
  const confidence = item.predicted_confidence;

  return (
    <article className="min-w-0 rounded-lg border border-zinc-100 bg-zinc-50/60 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge
          variant="outline"
          className="font-mono text-[10px] tabular-nums"
          title="rank by cosine similarity"
        >
          #{item.rank ?? "—"}
        </Badge>
        {isFiniteNumber(score) ? (
          <Badge className="border-emerald-300 bg-emerald-100 font-mono text-[10px] tabular-nums text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
            cos {formatScore(score)}
          </Badge>
        ) : null}
        <Badge
          variant="outline"
          className="font-mono text-[10px]"
          title={`predicted intent: ${item.predicted_intent ?? "—"}`}
        >
          {item.predicted_intent ?? "—"}
          {isFiniteNumber(confidence) ? (
            <span className="ml-1 tabular-nums text-zinc-400 dark:text-zinc-500">
              {formatPercent(confidence, 0)}
            </span>
          ) : null}
        </Badge>
        {/* cosine mini progress bar, 0..1 */}
        <span
          className="ml-auto hidden h-1.5 w-24 overflow-hidden rounded-full bg-zinc-200 sm:inline-flex dark:bg-zinc-800"
          role="img"
          aria-label={`cosine similarity ${formatScore(score)} on a 0 to 1 scale`}
        >
          <span
            className="h-full rounded-full bg-emerald-500 dark:bg-emerald-400"
            style={{ width: `${width}%` }}
          />
        </span>
      </div>

      <p className="mt-2 text-xs leading-relaxed text-zinc-700 dark:text-zinc-300">
        <span className="sr-only">Historical customer message: </span>
        {item.customer_message ?? "—"}
      </p>
      <blockquote className="mt-2 border-l-2 border-emerald-300/70 pl-2.5 text-xs italic leading-relaxed text-zinc-600 dark:border-emerald-700/60 dark:text-zinc-400">
        <span className="sr-only">Historical AppleSupport reply: </span>
        {item.support_response ?? "—"}
      </blockquote>

      <p className="mt-2 font-mono text-[10px] tabular-nums text-zinc-400 dark:text-zinc-500">
        conversation{" "}
        {item.conversation_id !== undefined && item.conversation_id !== null
          ? String(item.conversation_id)
          : "—"}
        {item.turn !== undefined && item.turn !== null ? ` · turn ${item.turn}` : ""}
        {item.pair_id ? (
          <span
            className="ml-1.5"
            title="pair id in models/retrieval_corpus.jsonl.gz"
          >
            · pair {item.pair_id}
          </span>
        ) : null}
      </p>
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* Friendly unreachable card                                           */
/* ------------------------------------------------------------------ */

function ServiceUnreachableCard({
  detail,
  onRetry,
}: {
  detail: string;
  onRetry: () => void;
}) {
  return (
    <Alert
      variant="destructive"
      className="border-red-200 bg-red-50 text-red-900 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-100"
    >
      <ServerCog className="size-4" aria-hidden="true" />
      <AlertTitle>The live agent service is unreachable</AlertTitle>
      <AlertDescription className="text-red-800 dark:text-red-300">
        <p className="leading-relaxed">
          The agent console is served by a separate mini-service
          (mini-services/retrieval-service on port 3030) that is not answering
          right now. The evaluation artifacts above are unaffected — only this
          interactive console is.
        </p>
        <p className="mt-1.5 font-mono text-[10px] leading-relaxed opacity-80">
          {detail}
        </p>
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

/* ------------------------------------------------------------------ */
/* Small chips                                                         */
/* ------------------------------------------------------------------ */

function BoolChip({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: boolean | undefined;
  /** "good": false is a compliance miss (amber); "neutral": false is just a behaviour not observed */
  tone?: "good" | "neutral";
}) {
  const known = value === true || value === false;
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1 text-[10px]",
        value === true &&
          "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
        value === false &&
          tone === "good" &&
          "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300",
      )}
      title={`${label}: ${known ? String(value) : "—"}`}
    >
      {value === true ? (
        <Check className="size-3" aria-hidden="true" />
      ) : (
        <X className="size-3" aria-hidden="true" />
      )}
      {label}
    </Badge>
  );
}
