"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Loader2,
  RefreshCw,
  Search,
  Server,
  ServerCog,
  Sparkles,
  TriangleAlert,
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
  DEMO_EXAMPLE_QUERIES,
  DEMO_K_DEFAULT,
  DEMO_K_OPTIONS,
  DEMO_QUERY_MAX_CHARS,
  intentName,
  type RetrievalHealthResponse,
  type RetrievalSearchResponse,
} from "@/lib/phase4";
import { cn } from "@/lib/utils";

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/* Relative gateway URLs ONLY — the retrieval mini-service lives on port
   3030 and is reached through the Caddy gateway via the XTransformPort
   query parameter. Never an absolute http://localhost URL. */
const HEALTH_URL = "/api/phase4/health?XTransformPort=3030";
const SEARCH_URL = "/api/phase4/search?XTransformPort=3030";
const WARMUP_URL = "/api/phase4/warmup?XTransformPort=3030";

type WorkerState =
  | "unknown"
  | "idle"
  | "loading"
  | "ready"
  | "dead"
  | "unreachable";

type SearchErrorKind = "network" | "service" | null;

/**
 * Subsection G — THE live demo: type a support message and search the real
 * FAISS index over the indexed evidence pairs, served by the retrieval
 * mini-service (mini-services/retrieval-service, port 3030). The worker
 * loads its ~830 MB of artifacts lazily on the first request (~15 s), so the
 * UI carries an explicit warm-up state; if the service is unreachable the
 * rest of the section is unaffected (it renders from the JSON artifact).
 */
export function RetrievalDemo({
  indexedPairs,
}: {
  /** corpus.indexed_pairs from phase4_summary.json (display only) */
  indexedPairs?: number;
}) {
  const [worker, setWorker] = useState<WorkerState>("unknown");
  const [health, setHealth] = useState<RetrievalHealthResponse | null>(null);

  const [query, setQuery] = useState("");
  const [k, setK] = useState<number>(DEMO_K_DEFAULT);
  const [searchState, setSearchState] = useState<"idle" | "loading">("idle");
  const [warming, setWarming] = useState(false);
  const [validation, setValidation] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchErrorKind, setSearchErrorKind] = useState<SearchErrorKind>(null);
  const [result, setResult] = useState<RetrievalSearchResponse | null>(null);

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
      searchState === "loading" ||
      warming;
    if (!active) return;
    const timer = setInterval(() => {
      void refreshHealth();
    }, 2500);
    return () => clearInterval(timer);
  }, [worker, searchState, warming, refreshHealth]);

  /* ---------------- search + warmup ---------------- */

  const runSearch = useCallback(
    async (queryText: string, kValue: number) => {
      const trimmed = queryText.trim();
      if (!trimmed) {
        setValidation(
          "Type a message first — even a few words are enough (e.g. one of the examples below).",
        );
        return;
      }
      if (trimmed.length > DEMO_QUERY_MAX_CHARS) {
        setValidation(
          `That message is ${trimmed.length} characters — the service caps queries at ${DEMO_QUERY_MAX_CHARS}.`,
        );
        return;
      }
      setValidation(null);
      setSearchError(null);
      setSearchErrorKind(null);
      setSearchState("loading");
      /* First request on a cold worker loads encoder + index (~15 s) —
         say so instead of letting the UI look frozen. */
      setWarming(worker === "idle" || worker === "loading" || worker === "unknown");
      const requestId = ++requestIdRef.current;
      try {
        const response = await fetch(SEARCH_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: trimmed, k: kValue }),
        });
        const payload = (await response.json()) as RetrievalSearchResponse;
        if (requestId !== requestIdRef.current) return; // superseded
        if (!response.ok || !payload.ok) {
          throw new Error(
            payload.error ?? `The search failed with HTTP ${response.status}.`,
          );
        }
        setResult(payload);
      } catch (error) {
        if (requestId !== requestIdRef.current) return; // superseded
        setResult(null);
        setSearchError(
          error instanceof Error
            ? error.message
            : "The retrieval service could not be reached.",
        );
        setSearchErrorKind(
          error instanceof TypeError ? "network" : "service",
        );
        void refreshHealth();
      } finally {
        if (requestId === requestIdRef.current) {
          setWarming(false);
          setSearchState("idle");
        }
      }
    },
    [worker, refreshHealth],
  );

  const runWarmup = useCallback(async () => {
    setWarming(true);
    setSearchError(null);
    setSearchErrorKind(null);
    try {
      await fetch(WARMUP_URL, { method: "POST" });
    } catch {
      /* health refresh below surfaces the failure */
    } finally {
      setWarming(false);
      void refreshHealth();
    }
  }, [refreshHealth]);

  const applyExample = useCallback(
    (example: string) => {
      setQuery(example);
      setValidation(null);
      void runSearch(example, k);
    },
    [k, runSearch],
  );

  const charCount = query.length;
  const nearLimit = charCount >= DEMO_QUERY_MAX_CHARS * 0.9;

  return (
    <section aria-labelledby="phase4-demo-heading" className="space-y-4">
      <SubsectionHeading
        id="phase4-demo-heading"
        icon={Sparkles}
        title="Try it — search the live index yourself"
        description={
          indexedPairs !== undefined
            ? `This box runs the real thing: your message is embedded with the frozen MiniLM encoder, matched against the ${formatInt(
                indexedPairs,
              )}-pair FAISS index by exact cosine, and the Phase 3 head labels both your message and every retrieved pair.`
            : "This box runs the real thing: your message is embedded with the frozen MiniLM encoder, matched against the FAISS evidence index by exact cosine, and the Phase 3 head labels both your message and every retrieved pair."
        }
      />

      <Card className="gap-0">
        <CardHeader className="border-b">
          <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
            <span>Live retrieval</span>
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
            the gateway). The worker loads lazily: the first search pays a
            one-time ~15 s load of the encoder + index, then answers in
            tens of milliseconds.
          </CardDescription>
        </CardHeader>
        <CardContent className="mt-4 space-y-4">
          {/* -------- input row: textarea + k + search -------- */}
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <label
                htmlFor="phase4-demo-query"
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
                {charCount}/{DEMO_QUERY_MAX_CHARS}
              </span>
            </div>
            <Textarea
              id="phase4-demo-query"
              value={query}
              maxLength={DEMO_QUERY_MAX_CHARS}
              rows={3}
              placeholder="e.g. my iphone battery drains crazy fast since the update"
              className="min-h-[5.5rem] resize-y text-sm"
              aria-describedby="phase4-demo-query-hint"
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  void runSearch(query, k);
                }
              }}
            />
            <p
              id="phase4-demo-query-hint"
              className="text-[11px] text-zinc-500 dark:text-zinc-400"
            >
              Type like a customer would — typos and all. ⌘/Ctrl + Enter also
              searches.
            </p>
          </div>

          {/* -------- controls: k selector + search button -------- */}
          <div className="flex flex-wrap items-center gap-2">
            <fieldset className="flex items-center gap-1.5">
              <legend className="sr-only">
                Number of neighbours to retrieve
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
              disabled={searchState === "loading"}
              onClick={() => void runSearch(query, k)}
            >
              {searchState === "loading" ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Search className="size-4" aria-hidden="true" />
              )}
              {searchState === "loading" ? "Searching…" : "Search"}
            </Button>
          </div>

          {/* -------- example chips -------- */}
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Or try an example
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {DEMO_EXAMPLE_QUERIES.map((example) => (
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

          {/* -------- warm-up state (first search loads the worker) -------- */}
          {searchState === "loading" && warming ? (
            <div
              role="status"
              className="flex items-start gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2.5 dark:border-emerald-900/60 dark:bg-emerald-950/20"
            >
              <Loader2
                className="mt-0.5 size-4 shrink-0 animate-spin text-emerald-600 dark:text-emerald-400"
                aria-hidden="true"
              />
              <p className="text-xs leading-relaxed text-emerald-800 dark:text-emerald-300/90">
                Warming up the retrieval service — the first search loads the
                encoder + FAISS index (~15 s). This happens once; the service
                then stays warm and answers in tens of milliseconds.
              </p>
            </div>
          ) : null}

          {/* -------- search in flight (worker already warm) -------- */}
          {searchState === "loading" && !warming ? (
            <div role="status" className="space-y-2" aria-busy="true">
              <p className="sr-only">Searching the index…</p>
              <Skeleton className="skeleton-shimmer h-16 w-full" />
              <Skeleton className="skeleton-shimmer h-16 w-full" />
            </div>
          ) : null}

          {/* -------- errors -------- */}
          {searchError && searchErrorKind === "network" ? (
            <ServiceUnreachableCard
              detail={searchError}
              onRetry={() => {
                void refreshHealth();
                void runSearch(query, k);
              }}
            />
          ) : searchError ? (
            <Alert
              variant="destructive"
              className="border-red-200 bg-red-50 text-red-900 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-100"
            >
              <TriangleAlert className="size-4" aria-hidden="true" />
              <AlertTitle>The search failed</AlertTitle>
              <AlertDescription className="text-red-800 dark:text-red-300">
                <p>{searchError}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 h-11 border-red-200 bg-white text-red-700 hover:bg-red-50 hover:text-red-800 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-950/60 dark:hover:text-red-200"
                  onClick={() => void runSearch(query, k)}
                >
                  <RefreshCw className="size-4" aria-hidden="true" />
                  Retry search
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}

          {/* -------- results -------- */}
          {result ? (
            <div className="space-y-4" aria-live="polite">
              <QueryIntentSummary result={result} />
              <ResultList result={result} />
              <TimingsFooter result={result} />
            </div>
          ) : null}

          {/* -------- historical-data disclaimer -------- */}
          <p className="flex items-start gap-2 rounded-lg border border-zinc-200/80 bg-zinc-100/60 px-3 py-2 text-[11px] leading-relaxed text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
            <TriangleAlert
              className="mt-0.5 size-3.5 shrink-0 text-amber-500 dark:text-amber-400"
              aria-hidden="true"
            />
            Historical 2017-era AppleSupport replies are shown as retrieval
            evidence — not current Apple policy. The demo searches the same
            index the Recall@K numbers above were measured on.
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
          idle — loads on first search (~15 s)
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
/* "Your message" — the Phase 3 head's read on the query itself         */
/* ------------------------------------------------------------------ */

function QueryIntentSummary({ result }: { result: RetrievalSearchResponse }) {
  const intent = result.query_intent;
  const confidence = intent?.confidence;
  const width = isFiniteNumber(confidence)
    ? Math.min(Math.max(confidence, 0), 1) * 100
    : 0;

  return (
    <div className="min-w-0 rounded-lg border border-zinc-100 bg-zinc-50/60 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
      <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Your message
      </p>
      <blockquote className="mt-1 border-l-2 border-zinc-200 pl-2.5 text-xs leading-relaxed text-zinc-700 dark:border-zinc-700 dark:text-zinc-300">
        &ldquo;{result.query}&rdquo;
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
          style={{ width: `${width}%` }}
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
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Retrieved pairs                                                     */
/* ------------------------------------------------------------------ */

function ResultList({ result }: { result: RetrievalSearchResponse }) {
  const results = result.results ?? [];

  if (results.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-zinc-500 dark:text-zinc-400">
        The index returned no neighbours for this message.
      </p>
    );
  }

  const srSummary = `${results.length} nearest historical pairs retrieved: ${results
    .map(
      (item) =>
        `rank ${item.rank ?? "?"}, cosine ${
          isFiniteNumber(item.score) ? formatScore(item.score) : "—"
        }, predicted intent ${intentName(item.predicted_intent)}`,
    )
    .join("; ")}.`;

  return (
    <div className="min-w-0 space-y-3">
      <p className="sr-only">{srSummary}</p>
      <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Top-{result.k ?? results.length} nearest historical pairs
      </p>
      <div className="max-h-[28rem] space-y-3 overflow-y-auto pr-1 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-zinc-300 dark:[&::-webkit-scrollbar-thumb]:bg-zinc-700 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-zinc-100 dark:[&::-webkit-scrollbar-track]:bg-zinc-800/80">
        {results.map((item, index) => (
          <ResultRow
            key={item.pair_id ?? `${item.rank ?? "r"}-${index}`}
            item={item}
          />
        ))}
      </div>
    </div>
  );
}

function ResultRow({ item }: { item: RetrievalSearchResultRow }) {
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
          title={`predicted intent: ${intentName(item.predicted_intent)} (${item.predicted_intent ?? "—"})`}
        >
          {intentName(item.predicted_intent)}
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
        conversation {item.conversation_id ?? "—"} · turn{" "}
        {item.turn ?? "—"}
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
/* Timings footer                                                      */
/* ------------------------------------------------------------------ */

function TimingsFooter({ result }: { result: RetrievalSearchResponse }) {
  const embedMs = result.timings?.embed_ms;
  const faissMs = result.timings?.faiss_search_ms;
  const corpusSize = result.meta?.corpus_size;

  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-500 dark:text-zinc-400">
      <span className="font-mono tabular-nums">
        {isFiniteNumber(embedMs) ? `${Math.round(embedMs)} ms embed` : "—"}
        {" · "}
        {isFiniteNumber(faissMs)
          ? `${Math.round(faissMs)} ms FAISS`
          : "—"}
      </span>
      <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-600">
        ·
      </span>
      <span>
        searched {formatInt(corpusSize)} pairs with{" "}
        {result.meta?.index ?? "the exact cosine index"}
      </span>
    </p>
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
      <AlertTitle>The live retrieval service is unreachable</AlertTitle>
      <AlertDescription className="text-red-800 dark:text-red-300">
        <p className="leading-relaxed">
          The live search is served by a separate mini-service
          (mini-services/retrieval-service on port 3030) that is not answering
          right now. Everything else in this section still renders from the
          phase4_summary.json artifact — only the interactive demo is affected.
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

/* Local alias to keep the import list short. */
type RetrievalSearchResultRow = NonNullable<
  RetrievalSearchResponse["results"]
>[number];
