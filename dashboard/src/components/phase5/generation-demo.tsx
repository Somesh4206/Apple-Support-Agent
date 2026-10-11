"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Eye,
  Loader2,
  PenLine,
  RefreshCw,
  Server,
  ServerCog,
  Sparkles,
  TriangleAlert,
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
  CUSTOM_SCROLLBAR,
  DEMO_K_OPTIONS,
  EXAMPLE_MESSAGES,
  intentName,
  MAX_INPUT_CHARS,
  type GenerateEvidenceItem,
  type GenerateResponse,
  type RetrievalHealthResponse,
} from "@/lib/phase5";
import { cn } from "@/lib/utils";

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/* Relative gateway URLs ONLY — the generation service lives on port 3030
   and is reached through the Caddy gateway via the XTransformPort query
   parameter. Never an absolute http://localhost URL. */
const HEALTH_URL = "/api/phase4/health?XTransformPort=3030";
const GENERATE_URL = "/api/phase5/generate?XTransformPort=3030";
const WARMUP_URL = "/api/phase4/warmup?XTransformPort=3030";

type WorkerState =
  | "unknown"
  | "idle"
  | "loading"
  | "ready"
  | "dead"
  | "unreachable";

type GenerateErrorKind = "network" | "service" | null;

/**
 * Subsection F — THE live demo: type a support message and the full Phase 5
 * pipeline runs against the live retrieval service
 * (mini-services/retrieval-service, port 3030): the Phase 3 head labels the
 * message, the Phase 4 FAISS index retrieves the top-K historical pairs, the
 * z-ai LLM (backend only) drafts ONE grounded reply under the six safety
 * rules, and the reply is scored with the same transparent heuristics the
 * evaluation used. The worker loads lazily (~15 s) — the UI says so; if the
 * service is unreachable, everything above still renders from the JSON
 * artifact.
 */
export function GenerationDemo({
  defaultK,
  llmModel,
}: {
  /** config.top_k from phase5_summary.json — the demo's default k */
  defaultK?: number;
  /** config.llm — named in the description ("glm-4-plus") */
  llmModel?: string;
}) {
  const [worker, setWorker] = useState<WorkerState>("unknown");
  const [health, setHealth] = useState<RetrievalHealthResponse | null>(null);

  const [message, setMessage] = useState("");
  const [k, setK] = useState<number>(
    defaultK !== undefined && DEMO_K_OPTIONS.includes(defaultK)
      ? defaultK
      : 5,
  );
  const [generateState, setGenerateState] = useState<"idle" | "loading">(
    "idle",
  );
  const [warming, setWarming] = useState(false);
  const [validation, setValidation] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [generateErrorKind, setGenerateErrorKind] =
    useState<GenerateErrorKind>(null);
  const [result, setResult] = useState<GenerateResponse | null>(null);

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
      generateState === "loading" ||
      warming;
    if (!active) return;
    const timer = setInterval(() => {
      void refreshHealth();
    }, 2500);
    return () => clearInterval(timer);
  }, [worker, generateState, warming, refreshHealth]);

  /* ---------------- generate + warmup ---------------- */

  const runGenerate = useCallback(
    async (messageText: string, kValue: number) => {
      const trimmed = messageText.trim();
      if (!trimmed) {
        setValidation(
          "Type a message first — even a few words are enough (e.g. one of the examples below).",
        );
        return;
      }
      if (trimmed.length > MAX_INPUT_CHARS) {
        setValidation(
          `That message is ${trimmed.length} characters — the generator caps input at ${MAX_INPUT_CHARS}.`,
        );
        return;
      }
      setValidation(null);
      setGenerateError(null);
      setGenerateErrorKind(null);
      setGenerateState("loading");
      /* First request on a cold worker loads encoder + index (~15 s) before
         the LLM is even called — say so instead of letting the UI look
         frozen. */
      setWarming(worker === "idle" || worker === "loading" || worker === "unknown");
      const requestId = ++requestIdRef.current;
      try {
        const response = await fetch(GENERATE_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: trimmed, k: kValue }),
        });
        const payload = (await response.json()) as GenerateResponse;
        if (requestId !== requestIdRef.current) return; // superseded
        if (!response.ok || !payload.ok) {
          throw new Error(
            payload.error ??
              `The generation failed with HTTP ${response.status}.`,
          );
        }
        setResult(payload);
      } catch (error) {
        if (requestId !== requestIdRef.current) return; // superseded
        setResult(null);
        setGenerateError(
          error instanceof Error
            ? error.message
            : "The generation service could not be reached.",
        );
        setGenerateErrorKind(
          error instanceof TypeError ? "network" : "service",
        );
        void refreshHealth();
      } finally {
        if (requestId === requestIdRef.current) {
          setWarming(false);
          setGenerateState("idle");
        }
      }
    },
    [worker, refreshHealth],
  );

  const runWarmup = useCallback(async () => {
    setWarming(true);
    setGenerateError(null);
    setGenerateErrorKind(null);
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
  const nearLimit = charCount >= MAX_INPUT_CHARS * 0.9;

  return (
    <section aria-labelledby="phase5-demo-heading" className="space-y-4">
      <SubsectionHeading
        id="phase5-demo-heading"
        icon={Sparkles}
        title="Try it — draft a grounded reply yourself"
        description={
          llmModel
            ? `This box runs the real pipeline: your message is classified by the Phase 3 head, matched against the Phase 4 FAISS index, and one reply is drafted by ${llmModel} (z-ai SDK, backend only) under the six safety rules — then scored with the same heuristics the evaluation used.`
            : "This box runs the real pipeline: your message is classified by the Phase 3 head, matched against the Phase 4 FAISS index, and one reply is drafted by the z-ai LLM (backend only) under the six safety rules — then scored with the same heuristics the evaluation used."
        }
      />

      <Card className="gap-0">
        <CardHeader className="border-b">
          <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
            <span>Live grounded generation</span>
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
            the gateway). The worker loads lazily: the first draft pays a
            one-time ~15 s load of the encoder + index, then the LLM adds a
            few hundred milliseconds.
          </CardDescription>
        </CardHeader>
        <CardContent className="mt-4 space-y-4">
          {/* -------- input row: textarea + k + generate -------- */}
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <label
                htmlFor="phase5-demo-message"
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
                {charCount}/{MAX_INPUT_CHARS}
              </span>
            </div>
            <Textarea
              id="phase5-demo-message"
              value={message}
              maxLength={MAX_INPUT_CHARS}
              rows={3}
              placeholder="e.g. my iphone battery drains way too fast since the new update"
              className="min-h-[5.5rem] resize-y text-sm"
              aria-describedby="phase5-demo-message-hint"
              onChange={(event) => setMessage(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  void runGenerate(message, k);
                }
              }}
            />
            <p
              id="phase5-demo-message-hint"
              className="text-[11px] text-zinc-500 dark:text-zinc-400"
            >
              Type like a customer would — typos and all. ⌘/Ctrl + Enter also
              drafts the reply.
            </p>
          </div>

          {/* -------- controls: k selector + generate button -------- */}
          <div className="flex flex-wrap items-center gap-2">
            <fieldset className="flex items-center gap-1.5">
              <legend className="sr-only">
                Number of evidence pairs to ground the reply
              </legend>
              <span
                className="text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
                aria-hidden="true"
              >
                top-k
              </span>
              {DEMO_K_OPTIONS.map((option) => (
                <Button
                  key={option}
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-pressed={k === option}
                  className={cn(
                    "h-8 min-w-8 px-2.5 font-mono text-xs tabular-nums",
                    k === option &&
                      "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-950/60 dark:hover:text-emerald-200",
                  )}
                  onClick={() => setK(option)}
                >
                  {option}
                </Button>
              ))}
            </fieldset>
            <Button
              type="button"
              size="sm"
              className="ml-auto h-9 gap-1.5"
              disabled={generateState === "loading"}
              onClick={() => void runGenerate(message, k)}
            >
              {generateState === "loading" ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <PenLine className="size-4" aria-hidden="true" />
              )}
              {generateState === "loading" ? "drafting…" : "Draft reply"}
            </Button>
          </div>

          {/* -------- example chips -------- */}
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Or fill in an example
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {EXAMPLE_MESSAGES.map((example) => (
                <button
                  key={example}
                  type="button"
                  className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] leading-relaxed text-zinc-600 transition-colors hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:border-emerald-800 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-300"
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

          {/* -------- warm-up state (first draft loads the worker) -------- */}
          {generateState === "loading" && warming ? (
            <div
              role="status"
              className="flex items-start gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2.5 dark:border-emerald-900/60 dark:bg-emerald-950/20"
            >
              <Loader2
                className="mt-0.5 size-4 shrink-0 animate-spin text-emerald-600 dark:text-emerald-400"
                aria-hidden="true"
              />
              <p className="text-xs leading-relaxed text-emerald-800 dark:text-emerald-300/90">
                Warming up the retrieval service — the first draft loads the
                encoder + FAISS index (~15 s) before the LLM writes anything.
                This happens once; the service then stays warm and later
                drafts take under a second.
              </p>
            </div>
          ) : null}

          {/* -------- generation in flight (worker already warm) -------- */}
          {generateState === "loading" && !warming ? (
            <div role="status" className="space-y-2" aria-busy="true">
              <p className="sr-only">Drafting the grounded reply…</p>
              <Skeleton className="skeleton-shimmer h-24 w-full" />
              <Skeleton className="skeleton-shimmer h-16 w-full" />
            </div>
          ) : null}

          {/* -------- errors -------- */}
          {generateError && generateErrorKind === "network" ? (
            <ServiceUnreachableCard
              detail={generateError}
              onRetry={() => {
                void refreshHealth();
                void runGenerate(message, k);
              }}
            />
          ) : generateError ? (
            <Alert
              variant="destructive"
              className="border-red-200 bg-red-50 text-red-900 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-100"
            >
              <TriangleAlert className="size-4" aria-hidden="true" />
              <AlertTitle>The draft failed</AlertTitle>
              <AlertDescription className="text-red-800 dark:text-red-300">
                <p>{generateError}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 h-11 border-red-200 bg-white text-red-700 hover:bg-red-50 hover:text-red-800 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-950/60 dark:hover:text-red-200"
                  onClick={() => void runGenerate(message, k)}
                >
                  <RefreshCw className="size-4" aria-hidden="true" />
                  Retry draft
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}

          {/* -------- results -------- */}
          {result ? (
            <div className="space-y-4" aria-live="polite">
              <ReplyCard result={result} />
              <EvidenceSection result={result} />
              <TimingsFooter result={result} />
              <PromptDisclosure result={result} />
            </div>
          ) : null}

          {/* -------- historical-data + nondeterminism note -------- */}
          <p className="flex items-start gap-2 rounded-lg border border-zinc-200/80 bg-zinc-100/60 px-3 py-2 text-[11px] leading-relaxed text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
            <TriangleAlert
              className="mt-0.5 size-3.5 shrink-0 text-amber-500 dark:text-amber-400"
              aria-hidden="true"
            />
            The demo runs the same pipeline the evaluation numbers above were
            measured with. LLM drafts are nondeterministic, so your reply may
            differ from the recorded run — and the evidence behind it is
            2017-era historical support, not current Apple policy.
          </p>
        </CardContent>
      </Card>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Service status chip                                                 */
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
          idle — loads on first draft (~15 s)
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
/* (a) The reply card — intent, gates, reply, scores, disclaimer        */
/* ------------------------------------------------------------------ */

function ReplyCard({ result }: { result: GenerateResponse }) {
  const intent = result.query_intent;
  const confidence = intent?.confidence;
  const confidenceWidth = isFiniteNumber(confidence)
    ? Math.min(Math.max(confidence, 0), 1) * 100
    : 0;
  const gates = result.gates ?? {};
  const scores = result.scores ?? {};
  const unsupported = scores.unsupported_specifics ?? [];
  const lengthChars = scores.length_chars;
  const maxReplyChars = result.llm?.max_reply_chars;
  const intentThreshold = gates.thresholds?.intent;
  const retrievalThreshold = gates.thresholds?.retrieval;
  const top1Score = gates.top1_score;

  const srSummary = [
    `Drafted reply: ${result.reply ?? "—"}`,
    `Predicted intent ${intentName(intent?.label)}${
      isFiniteNumber(confidence) ? ` (confidence ${formatScore(confidence)})` : ""
    }.`,
    `Gates: intent ${
      gates.intent_pass === true ? "pass" : gates.intent_pass === false ? "fail" : "—"
    }, retrieval ${
      gates.retrieval_pass === true ? "pass" : gates.retrieval_pass === false ? "fail" : "—"
    }, auto-handle ${
      gates.auto_handle_eligible === true ? "eligible" : "would escalate"
    }.`,
    `Grounding overlap ${
      isFiniteNumber(scores.grounding_overlap)
        ? formatPercent(scores.grounding_overlap)
        : "—"
    }, ${formatInt(unsupported.length)} unsupported specifics.`,
  ].join(" ");

  return (
    <div
      className="min-w-0 rounded-lg border border-zinc-100 bg-zinc-50/60 p-3 dark:border-zinc-800 dark:bg-zinc-900/40"
    >
      <p className="sr-only">{srSummary}</p>

      {/* your message + the head's read on it */}
      <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Your message
      </p>
      <blockquote className="mt-1 border-l-2 border-zinc-200 pl-2.5 text-xs leading-relaxed text-zinc-700 dark:border-zinc-700 dark:text-zinc-300">
        &ldquo;{result.message}&rdquo;
      </blockquote>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <span className="text-[10px] text-zinc-500 dark:text-zinc-400">
          predicted intent (Phase 3 head)
        </span>
        <Badge className="border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
          {intentName(intent?.label)}
        </Badge>
        {isFiniteNumber(confidence) ? (
          <span className="font-mono text-[10px] tabular-nums text-zinc-500 dark:text-zinc-400">
            conf {formatScore(confidence)}
          </span>
        ) : null}
      </div>
      <div
        className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
        role="img"
        aria-label={`Phase 3 head confidence for your message: ${formatScore(confidence)}`}
      >
        <div
          className="h-full rounded-full bg-emerald-500 dark:bg-emerald-400"
          style={{ width: `${confidenceWidth}%` }}
        />
      </div>
      {intent?.runner_up ? (
        <p className="mt-1.5 text-[10px] text-zinc-500 dark:text-zinc-400">
          runner-up: {intentName(intent.runner_up)}
          {isFiniteNumber(intent.runner_up_confidence)
            ? ` (${formatScore(intent.runner_up_confidence)})`
            : ""}
        </p>
      ) : null}

      {/* the reply itself — the main content */}
      <div className="mt-3.5 min-w-0 rounded-lg border border-emerald-200/80 bg-emerald-50/70 p-3 dark:border-emerald-900/60 dark:bg-emerald-950/20">
        <p className="text-[10px] font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
          Generated reply
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
      </div>

      {/* gates row */}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <GateBadge
          pass={gates.intent_pass}
          label="intent gate"
          threshold={intentThreshold}
          value={confidence}
        />
        <GateBadge
          pass={gates.retrieval_pass}
          label="retrieval gate"
          threshold={retrievalThreshold}
          value={top1Score}
        />
        <Badge
          className={
            gates.auto_handle_eligible === true
              ? "border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
              : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
          }
          title={
            gates.auto_handle_eligible === true
              ? "both gates pass — a Phase 6 agent could auto-handle this reply"
              : "at least one gate fails — a Phase 6 agent would escalate to a human"
          }
        >
          {gates.auto_handle_eligible === true
            ? "auto-handle eligible"
            : "would escalate"}
        </Badge>
      </div>

      {/* scores row */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {isFiniteNumber(scores.grounding_overlap) ? (
          <Badge
            variant="outline"
            className="font-mono text-[10px] tabular-nums"
            title="share of the reply's content tokens present in the evidence"
          >
            grounding{" "}
            {formatPercent(scores.grounding_overlap)}
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
        {scores.personal_data_solicited === true ? (
          <Badge className="border-rose-200 bg-rose-100 text-rose-700 dark:border-rose-900 dark:bg-rose-950/60 dark:text-rose-300">
            personal data solicited
          </Badge>
        ) : scores.personal_data_solicited === false ? (
          <Badge
            variant="outline"
            className="border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
            title="the reply never asks for or repeats private details in public"
          >
            no personal data solicited
          </Badge>
        ) : null}
      </div>

      {/* the 2017-era historical disclaimer, field-exact from the response */}
      {result.meta?.disclaimer ? (
        <p className="mt-2.5 flex items-start gap-2 rounded-lg border border-zinc-200/80 bg-zinc-100/60 px-3 py-2 text-[11px] leading-relaxed text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
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

/* ------------------------------------------------------------------ */
/* (b) Evidence — the historical cases behind the reply                 */
/* ------------------------------------------------------------------ */

function EvidenceSection({ result }: { result: GenerateResponse }) {
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
        aria-controls="phase5-demo-evidence"
        onClick={() => setOpen((value) => !value)}
      >
        {open ? (
          <ChevronDown className="size-3.5" aria-hidden="true" />
        ) : (
          <ChevronRight className="size-3.5" aria-hidden="true" />
        )}
        {open ? "Hide" : "Show"} the {formatInt(k)} historical cases behind
        this reply
      </Button>
      {open ? (
        <div
          id="phase5-demo-evidence"
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

function EvidenceRow({ item }: { item: GenerateEvidenceItem }) {
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
          title={`predicted intent: ${intentName(
            item.predicted_intent ?? undefined,
          )} (${item.predicted_intent ?? "—"})`}
        >
          {intentName(item.predicted_intent ?? undefined)}
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
/* (c) Timings + model footer                                          */
/* ------------------------------------------------------------------ */

function TimingsFooter({ result }: { result: GenerateResponse }) {
  const timings = result.timings ?? {};
  const embedMs = timings.embed_ms;
  const faissMs = timings.faiss_search_ms;
  const llmMs = timings.llm_ms;
  const totalMs = timings.total_ms;
  const model = result.llm?.model;
  const corpusSize = result.meta?.corpus_size;

  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-500 dark:text-zinc-400">
      <span className="font-mono tabular-nums">
        {isFiniteNumber(embedMs) ? `${Math.round(embedMs)} ms embed` : "—"}
        {" · "}
        {isFiniteNumber(faissMs) ? `${Math.round(faissMs)} ms FAISS` : "—"}
        {" · "}
        {isFiniteNumber(llmMs) ? `${Math.round(llmMs)} ms LLM` : "—"}
        {" · "}
        {isFiniteNumber(totalMs) ? `${Math.round(totalMs)} ms total` : "—"}
      </span>
      <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-600">
        ·
      </span>
      <span>
        drafted by {model ?? "the z-ai LLM"} over{" "}
        {isFiniteNumber(corpusSize) ? formatInt(corpusSize) : "—"} indexed pairs
      </span>
    </p>
  );
}

/* ------------------------------------------------------------------ */
/* (d) The prompt sent to the LLM                                      */
/* ------------------------------------------------------------------ */

function PromptDisclosure({ result }: { result: GenerateResponse }) {
  const [open, setOpen] = useState(false);
  const system = result.prompt?.system;
  const user = result.prompt?.user;

  if (!system && !user) return null;

  return (
    <div className="min-w-0">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 gap-1.5 text-xs"
        aria-expanded={open}
        aria-controls="phase5-demo-prompt"
        onClick={() => setOpen((value) => !value)}
      >
        <Eye className="size-3.5" aria-hidden="true" />
        {open ? "Hide the prompt sent to the LLM" : "View the prompt sent to the LLM"}
        <ChevronDown
          className={cn(
            "size-3.5 transition-transform",
            open && "rotate-180",
          )}
          aria-hidden="true"
        />
      </Button>
      {open ? (
        <div id="phase5-demo-prompt" className="mt-2 space-y-3">
          {(
            [
              ["System prompt", system],
              ["User prompt", user],
            ] as const
          ).map(([label, text]) =>
            text ? (
              <div key={label} className="min-w-0">
                <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  {label}
                </p>
                <pre
                  className={cn(
                    "mt-1 max-h-96 overflow-y-auto rounded-lg border border-zinc-200 bg-white p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-300",
                    CUSTOM_SCROLLBAR,
                  )}
                >
                  {text}
                </pre>
              </div>
            ) : null,
          )}
        </div>
      ) : null}
    </div>
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
      <AlertTitle>The live generation service is unreachable</AlertTitle>
      <AlertDescription className="text-red-800 dark:text-red-300">
        <p className="leading-relaxed">
          The live demo is served by a separate mini-service
          (mini-services/retrieval-service on port 3030) that is not answering
          right now. The evaluation artifacts above are unaffected — only this
          interactive demo is.
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

function GateBadge({
  pass,
  label,
  value,
  threshold,
}: {
  pass: boolean | undefined;
  label: string;
  value: number | undefined;
  threshold: number | undefined;
}) {
  const passed = pass === true;
  const failed = pass === false;
  return (
    <Badge
      className={cn(
        "text-[10px]",
        passed &&
          "border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300",
        failed &&
          "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300",
      )}
      title={`${label}: ${
        isFiniteNumber(value) ? formatScore(value) : "—"
      }${
        isFiniteNumber(threshold) ? ` vs threshold ${threshold.toFixed(2)}` : ""
      }`}
    >
      {label}{" "}
      {passed ? "✓" : failed ? "✗" : "—"}
      {isFiniteNumber(value) ? (
        <span className="ml-1 font-mono tabular-nums">
          {formatScore(value)}
        </span>
      ) : null}
      {isFiniteNumber(threshold) ? (
        <span className="ml-1 font-mono tabular-nums opacity-70">
          @{threshold.toFixed(2)}
        </span>
      ) : null}
    </Badge>
  );
}

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
