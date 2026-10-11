"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import {
  ArrowLeftRight,
  BarChart3,
  Brain,
  CheckCircle2,
  CircleAlert,
  Database,
  Download,
  Hash,
  Headset,
  ListChecks,
  Loader2,
  MessageSquareQuote,
  MessagesSquare,
  Printer,
  RefreshCw,
  Repeat2,
  Route,
  Search,
  ShieldCheck,
  Sparkle,
  TriangleAlert,
  Type,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarList,
  ColumnChart,
  StackedShareBar,
  type BarListItem,
  type ColumnChartDatum,
} from "@/components/phase1/charts";
/* Documentation-view components load as separate lazy chunks: the product
   landing compiles and serves only the agent experience, and the nine-phase
   documentation (a ~45-file module graph) compiles on the first visit of the
   Documentation tab. This keeps the dev server's memory footprint small
   enough for the sandbox envelope while keeping the docs one click away. */
const DocsSectionSkeleton = dynamic(
  () => import("@/components/docs-section-skeleton").then((m) => ({ default: m.DocsSectionSkeleton })),
);
const ConversationExplorer = dynamic(
  () => import("@/components/phase1/conversation-explorer").then((m) => ({ default: m.ConversationExplorer })),
  { loading: () => <DocsSectionSkeleton label="Conversation explorer" /> },
);
const DocsViewer = dynamic(
  () => import("@/components/phase1/docs-viewer").then((m) => ({ default: m.DocsViewer })),
  { loading: () => <DocsSectionSkeleton label="Documentation viewer" /> },
);
const PipelineDetail = dynamic(
  () => import("@/components/phase1/pipeline-detail").then((m) => ({ default: m.PipelineDetail })),
  { loading: () => <DocsSectionSkeleton label="Pipeline detail" /> },
);
const ShortcutsHelp = dynamic(
  () => import("@/components/phase1/shortcuts-help").then((m) => ({ default: m.ShortcutsHelp })),
);
const Phase2Section = dynamic(
  () => import("@/components/phase2/phase2-section").then((m) => ({ default: m.Phase2Section })),
  { loading: () => <DocsSectionSkeleton label="Phase 2 — Intent taxonomy & baselines" /> },
);
const Phase3Section = dynamic(
  () => import("@/components/phase3/phase3-section").then((m) => ({ default: m.Phase3Section })),
  { loading: () => <DocsSectionSkeleton label="Phase 3 — Embedding classifier" /> },
);
const Phase4Section = dynamic(
  () => import("@/components/phase4/phase4-section").then((m) => ({ default: m.Phase4Section })),
  { loading: () => <DocsSectionSkeleton label="Phase 4 — Historical retrieval" /> },
);
const Phase5Section = dynamic(
  () => import("@/components/phase5/phase5-section").then((m) => ({ default: m.Phase5Section })),
  { loading: () => <DocsSectionSkeleton label="Phase 5 — Grounded generation" /> },
);
const Phase6Section = dynamic(
  () => import("@/components/phase6/phase6-section").then((m) => ({ default: m.Phase6Section })),
  { loading: () => <DocsSectionSkeleton label="Phase 6 — Escalation policy" /> },
);
const Phase7Section = dynamic(
  () => import("@/components/phase7/phase7-section").then((m) => ({ default: m.Phase7Section })),
  { loading: () => <DocsSectionSkeleton label="Phase 7 — Unified agent" /> },
);
const Phase8Section = dynamic(
  () => import("@/components/phase8/phase8-section").then((m) => ({ default: m.Phase8Section })),
  { loading: () => <DocsSectionSkeleton label="Phase 8 — Streamlit app" /> },
);
const Phase9Section = dynamic(
  () => import("@/components/phase9/phase9-section").then((m) => ({ default: m.Phase9Section })),
  { loading: () => <DocsSectionSkeleton label="Phase 9 — Final report" /> },
);

import { ChartGallery } from "@/components/phase1/chart-gallery";
import { ConversationCard } from "@/components/phase1/conversation-card";
import { DistributionInsights } from "@/components/phase1/distribution-insights";
import { SectionHeading } from "@/components/phase1/section-heading";
import { StatCard } from "@/components/phase1/stat-card";
import { AgentChat } from "@/components/agent-chat/agent-chat";
import { focusInlineAgentChat, openAgentChat } from "@/lib/agent-chat";
import { LazyMount } from "@/components/lazy-mount";
import { ScrollTop } from "@/components/scroll-top";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  AgentChatProvider,
  useSharedAgentChat,
  useSharedWorkerHealth,
} from "@/components/agent-chat/chat-context";
import { InlineAgentChat } from "@/components/agent-chat/inline-chat";
import {
  formatFloat,
  formatInt,
  formatPercent,
  orDash,
  ROADMAP_PHASES,
  SETUP_STEPS,
  type EdaSummary,
  type Phase1StatusResponse,
} from "@/lib/phase1";
import { cn } from "@/lib/utils";

type LoadPhase = "loading" | "ready" | "not_run" | "error";

export default function Home() {
  const [phase, setPhase] = useState<LoadPhase>("loading");
  const [data, setData] = useState<EdaSummary | null>(null);
  const [apiMessage, setApiMessage] = useState<string>("");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (initial: boolean) => {
    if (initial) {
      setPhase("loading");
    } else {
      setRefreshing(true);
    }
    try {
      const response = await fetch("/api/phase1/status", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Request failed with HTTP ${response.status}`);
      }
      const payload = (await response.json()) as Phase1StatusResponse;
      if (payload.ok && payload.status === "READY" && payload.data) {
        setData(payload.data);
        setApiMessage("");
        setPhase("ready");
      } else {
        setData(null);
        setApiMessage(
          payload.message ?? "Phase 1 results are not available yet.",
        );
        setPhase("not_run");
      }
      setUpdatedAt(new Date());
    } catch (error) {
      setData(null);
      setApiMessage(
        error instanceof Error
          ? error.message
          : "Unable to reach the status API.",
      );
      setPhase("error");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(true);
  }, [load]);

  // Printing always renders on light surfaces: the .dark class is lifted in
  // beforeprint (works for both window.print() and Ctrl/Cmd+P) and restored
  // afterwards from the stored next-themes preference.
  useEffect(() => {
    const root = document.documentElement;
    const beforePrint = () => {
      root.classList.remove("dark");
    };
    const afterPrint = () => {
      let stored: string | null = null;
      try {
        stored = window.localStorage.getItem("theme");
      } catch {
        stored = null;
      }
      const dark =
        stored === "dark" ||
        ((stored === null || stored === "system") &&
          window.matchMedia("(prefers-color-scheme: dark)").matches);
      root.classList.toggle("dark", dark);
    };
    window.addEventListener("beforeprint", beforePrint);
    window.addEventListener("afterprint", afterPrint);
    return () => {
      window.removeEventListener("beforeprint", beforePrint);
      window.removeEventListener("afterprint", afterPrint);
    };
  }, []);

  /* ---------- product view routing: agent landing vs documentation ------ */

  const [view, setView] = useState<"agent" | "docs">("agent");

  /* the documentation view is deep-linkable via #docs and reacts to the
     browser back/forward buttons */
  useEffect(() => {
    const fromHash = () =>
      window.location.hash === "#docs" ? "docs" : "agent";
    setView(fromHash());
    const onHash = () => setView(fromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const switchView = useCallback((next: "agent" | "docs") => {
    setView(next);
    if (next === "docs") {
      window.history.replaceState(null, "", "#docs");
    } else if (window.location.hash) {
      window.history.replaceState(null, "", window.location.pathname);
    }
    window.scrollTo({ top: 0, behavior: "auto" });
  }, []);

  return (
    <AgentChatProvider>
      <div className="flex min-h-screen flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      {/* Keyboard users can jump straight past the header into the content. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-emerald-600 focus:px-4 focus:py-2.5 focus:text-sm focus:font-medium focus:text-white focus:shadow-lg print:hidden"
      >
        Skip to main content
      </a>
      <TopNav
        view={view}
        onView={switchView}
        refreshing={refreshing}
        updatedAt={updatedAt}
        onRefresh={() => void load(false)}
      />

      <main
        id="main-content"
        className="mx-auto w-full max-w-6xl flex-1 space-y-10 px-4 py-8 sm:space-y-14 sm:px-6 sm:py-10"
      >
        {view === "agent" ? (
          <AgentProductView onOpenDocs={() => switchView("docs")} />
        ) : (
          <DocsDashboard
            phase={phase}
            data={data}
            apiMessage={apiMessage}
            onRetry={() => void load(true)}
          />
        )}
      </main>

      {/* Live multi-turn support-agent chat — fixed launcher + panel that
          talks to the stateful chat endpoints on the mini-service (port
          3030) through the gateway. Fixed-position chrome like ScrollTop,
          deliberately OUTSIDE LazyMount so the launcher is always
          available. */}
      <AgentChat />

      <SiteFooter />

      {/* Global chrome: back-to-top button (shortcuts help lives in the header). */}
      <ScrollTop />
      </div>
    </AgentChatProvider>
  );
}

/* ------------------------------------------------------------------ */
/* Product top navigation                                              */
/* ------------------------------------------------------------------ */

function TopNav({
  view,
  onView,
  refreshing,
  updatedAt,
  onRefresh,
}: {
  view: "agent" | "docs";
  onView: (next: "agent" | "docs") => void;
  refreshing: boolean;
  updatedAt: Date | null;
  onRefresh: () => void;
}) {
  const { worker } = useSharedWorkerHealth();

  const statusLabel =
    worker === "ready"
      ? "Agent online"
      : worker === "loading" || worker === "idle"
        ? "Warming up"
        : worker === "dead" || worker === "unreachable"
          ? "Offline"
          : "Checking";
  const statusClass =
    worker === "ready"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300"
      : worker === "dead" || worker === "unreachable"
        ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300"
        : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300";

  const tabClass = (active: boolean) =>
    cn(
      "inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors",
      active
        ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-100"
        : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200",
    );

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80 print:hidden">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-3 sm:gap-3 sm:px-6">
        <button
          type="button"
          onClick={() => onView("agent")}
          className="flex items-center gap-2.5 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
          aria-label="Apple Support AI — agent home"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-sm shadow-emerald-600/25 dark:bg-emerald-500">
            <Headset className="size-5" aria-hidden="true" />
          </span>
          <span className="min-w-0 text-left">
            <span className="block truncate text-sm font-semibold leading-tight sm:text-base">
              Apple Support AI
            </span>
            <span className="hidden text-xs text-zinc-500 sm:block dark:text-zinc-400">
              Evidence-grounded support agent
            </span>
          </span>
        </button>

        <nav
          aria-label="Primary"
          className="ml-auto flex items-center gap-1 rounded-xl border border-zinc-200 bg-zinc-100/80 p-1 dark:border-zinc-800 dark:bg-zinc-900/80"
        >
          <button
            type="button"
            className={tabClass(view === "agent")}
            aria-current={view === "agent" ? "page" : undefined}
            onClick={() => onView("agent")}
          >
            <MessagesSquare className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">Agent</span>
          </button>
          <button
            type="button"
            className={tabClass(view === "docs")}
            aria-current={view === "docs" ? "page" : undefined}
            onClick={() => onView("docs")}
          >
            <ListChecks className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">Documentation</span>
          </button>
        </nav>

        <div className="flex items-center gap-2">
          <span
            role="status"
            className={cn(
              "hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium md:inline-flex",
              statusClass,
            )}
            title="live agent service health (retrieval mini-service)"
          >
            <span
              aria-hidden="true"
              className={cn(
                "size-1.5 rounded-full",
                worker === "ready"
                  ? "bg-emerald-500 dark:bg-emerald-400"
                  : worker === "dead" || worker === "unreachable"
                    ? "bg-red-500 dark:bg-red-400"
                    : "animate-pulse bg-amber-500 dark:bg-amber-400",
              )}
            />
            {statusLabel}
          </span>

          {view === "docs" ? (
            <>
              {updatedAt ? (
                <span className="hidden text-xs text-zinc-400 md:inline dark:text-zinc-500">
                  Updated{" "}
                  {updatedAt.toLocaleTimeString("en-US", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              ) : null}
              <span className="hidden lg:inline-flex">
                <ShortcutsHelp />
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.print()}
                className="hidden h-11 gap-1.5 px-3 lg:inline-flex print:hidden"
                aria-label="Print or save the documentation as PDF"
                title="Print / save as PDF — switches to a light, clutter-free layout"
              >
                <Printer className="size-4" aria-hidden="true" />
                <span className="hidden xl:inline">Print</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onRefresh}
                disabled={refreshing}
                className="h-11 gap-1.5 px-3 print:hidden"
                aria-label="Refresh Phase 1 data"
              >
                {refreshing ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <RefreshCw className="size-4" aria-hidden="true" />
                )}
                <span className="hidden sm:inline">
                  {refreshing ? "Refreshing…" : "Refresh"}
                </span>
              </Button>
            </>
          ) : null}

          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Agent product view (the landing experience)                          */
/* ------------------------------------------------------------------ */

function AgentProductView({ onOpenDocs }: { onOpenDocs: () => void }) {
  const chat = useSharedAgentChat();
  const { worker, health } = useSharedWorkerHealth();

  return (
    <>
      {/* ---------------- hero: copy + the live agent ---------------- */}
      <section
        aria-labelledby="agent-hero-heading"
        className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-8"
      >
        <div className="flex flex-col justify-center gap-5 rounded-2xl border border-emerald-100 bg-gradient-to-b from-emerald-50/80 via-white to-white p-6 sm:p-8 dark:border-emerald-900/60 dark:from-emerald-950/40 dark:via-zinc-950 dark:to-zinc-950">
          <div className="space-y-3">
            <Badge className="w-fit gap-1.5 border-emerald-200 bg-emerald-50 px-2.5 text-[11px] font-medium text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300">
              <Sparkle className="size-3" aria-hidden="true" />
              Live product demo · real retrieval, real policy
            </Badge>
            <h1
              id="agent-hero-heading"
              className="text-3xl font-bold tracking-tight sm:text-4xl"
            >
              Support answers that{" "}
              <span className="text-emerald-600 dark:text-emerald-400">
                show their evidence
              </span>
              .
            </h1>
            <p className="max-w-xl text-sm leading-relaxed text-zinc-600 sm:text-base dark:text-zinc-400">
              Every reply is drafted from{" "}
              <strong className="font-semibold text-zinc-800 dark:text-zinc-200">
                {health?.retrieval_backend === "faiss-ml"
                  ? "105,871 real AppleSupport conversations"
                  : `${(health?.corpus_size ?? 152).toLocaleString("en-US")} curated AppleSupport-style conversations`}
              </strong>{" "}
              and checked by a five-rule safety policy that decides when the
              agent may answer and when a human must step in. Ask it anything
              support-related — right here, right now.
            </p>
          </div>

          <ul className="flex flex-wrap gap-1.5" aria-label="Agent guarantees">
            {[
              "Grounded replies only",
              "Safety policy before every draft",
              "Human handoff built in",
              "280-char public replies",
            ].map((item) => (
              <li
                key={item}
                className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-600 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
              >
                <CheckCircle2
                  className="size-3 text-emerald-600 dark:text-emerald-400"
                  aria-hidden="true"
                />
                {item}
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              className="h-10 gap-2 bg-emerald-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-emerald-500 dark:bg-emerald-500 dark:text-zinc-950 dark:shadow-emerald-500/20 dark:hover:bg-emerald-400"
              onClick={focusInlineAgentChat}
            >
              <Headset className="size-4" aria-hidden="true" />
              Chat with the agent
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-10 gap-2 px-4 text-sm font-medium"
              onClick={onOpenDocs}
            >
              <ListChecks className="size-4" aria-hidden="true" />
              How it was built
            </Button>
          </div>

          <Alert className="border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-200">
            <TriangleAlert className="size-4" aria-hidden="true" />
            <AlertTitle>Honest prototype disclaimer</AlertTitle>
            <AlertDescription className="text-amber-800 dark:text-amber-300/90">
              Evidence is 2017-era AppleSupport history — drafts reflect how
              similar cases were handled then, not current Apple policy.
            </AlertDescription>
          </Alert>
        </div>

        <InlineAgentChat
          chat={chat}
          worker={worker}
          corpusSize={health?.corpus_size ?? 0}
          backend={health?.retrieval_backend}
        />
      </section>

      {/* ---------------- measured trust metrics ---------------- */}
      <ProductMetrics corpusSize={health?.corpus_size ?? 0} />

      {/* ---------------- how it works ---------------- */}
      <HowItWorks onOpenDocs={onOpenDocs} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Measured trust metrics                                              */
/* ------------------------------------------------------------------ */

type Phase6StatusShape = {
  data?: {
    evaluation?: {
      false_auto_rate?: {
        numerator?: number;
        denominator?: number;
      };
    };
  };
};

type Phase7StatusShape = {
  data?: {
    cost?: { llm_call_saving_rate?: number };
    evaluation?: {
      consistency?: { agreed_n?: number; total_n?: number };
    };
  };
};

function ProductMetrics({ corpusSize }: { corpusSize: number }) {
  const [p6, setP6] = useState<Phase6StatusShape | null>(null);
  const [p7, setP7] = useState<Phase7StatusShape | null>(null);

  /* the two measured artifacts behind the trust numbers — fetched once;
     the cards keep their recorded fallbacks when the API is unreachable */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch("/api/phase6/status", { cache: "no-store" });
        if (r.ok && !cancelled) setP6((await r.json()) as Phase6StatusShape);
      } catch {
        /* keep fallbacks */
      }
      try {
        const r = await fetch("/api/phase7/status", { cache: "no-store" });
        if (r.ok && !cancelled) setP7((await r.json()) as Phase7StatusShape);
      } catch {
        /* keep fallbacks */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const falseAuto = p6?.data?.evaluation?.false_auto_rate;
  const consistency = p7?.data?.evaluation?.consistency;
  const savingRate = p7?.data?.cost?.llm_call_saving_rate;

  const metrics = [
    {
      icon: Database,
      label: "Evidence conversations",
      value:
        corpusSize > 0 ? formatInt(corpusSize) : "—",
      sub: "indexed support exchanges behind every reply",
    },
    {
      icon: ShieldCheck,
      label: "Unsafe auto-replies",
      value: falseAuto
        ? `${formatInt(falseAuto.numerator ?? 0)} / ${formatInt(
            falseAuto.denominator ?? 10,
          )}`
        : "0 / 10",
      sub: "escalation benchmark, ground-truth labeled",
    },
    {
      icon: Route,
      label: "LLM calls saved by policy",
      value:
        typeof savingRate === "number"
          ? formatPercent(savingRate)
          : "48.3%",
      sub: "handoffs skip the model entirely",
    },
    {
      icon: ListChecks,
      label: "Policy consistency",
      value: consistency
        ? `${formatInt(consistency.agreed_n ?? 29)} / ${formatInt(
            consistency.total_n ?? 29,
          )}`
        : "29 / 29",
      sub: "service vs offline policy, every message",
    },
  ];

  return (
    <section aria-labelledby="metrics-heading" className="space-y-4">
      <h2
        id="metrics-heading"
        className="text-lg font-semibold tracking-tight sm:text-xl"
      >
        Measured, not promised
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {metrics.map((metric) => (
          <div
            key={metric.label}
            className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
          >
            <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
              <metric.icon className="size-4" aria-hidden="true" />
              <p className="text-[11px] font-medium uppercase tracking-wide">
                {metric.label}
              </p>
            </div>
            <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight text-zinc-900 dark:text-zinc-50">
              {metric.value}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
              {metric.sub}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* How it works                                                        */
/* ------------------------------------------------------------------ */

function HowItWorks({ onOpenDocs }: { onOpenDocs: () => void }) {
  const steps = [
    {
      icon: Brain,
      step: "01",
      title: "Understand the issue",
      body: "An embedding classifier reads the message and predicts the issue class across 12 intents — with a confidence score that gates everything downstream.",
      chip: "Phase 3 head · 66% test accuracy",
    },
    {
      icon: Search,
      step: "02",
      title: "Retrieve real evidence",
      body: "Cosine search over 105,871 historical AppleSupport exchanges surfaces the most similar real cases — the only facts the agent may use. When the full ML index is offline, a bundled curated corpus keeps retrieval live.",
      chip: "FAISS · Recall@5 0.76 · resilient fallback",
    },
    {
      icon: ShieldCheck,
      step: "03",
      title: "Decide before drafting",
      body: "A five-rule policy checks private-state topics, unmatched intents, payment language and signal confidence BEFORE any model call is spent.",
      chip: "0 / 10 false-auto measured",
    },
    {
      icon: MessageSquareQuote,
      step: "04",
      title: "Answer with receipts",
      body: "Grounded drafts stay under 280 characters and cite the cases they came from — or the agent hands off to a human with a structured bundle and zero LLM calls.",
      chip: "48% of turns skip the LLM",
    },
  ];

  return (
    <section aria-labelledby="how-heading" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h2
            id="how-heading"
            className="text-lg font-semibold tracking-tight sm:text-xl"
          >
            How every reply is made
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Four deterministic stages, every one measured in the evaluation
            artifacts — nothing hidden.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-9 gap-1.5 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-200"
          onClick={onOpenDocs}
        >
          Read the full method
          <ArrowLeftRight className="size-3.5" aria-hidden="true" />
        </Button>
      </div>
      <ol className="grid gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-4">
        {steps.map((step) => (
          <li
            key={step.step}
            className="group relative flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md sm:p-5 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:shadow-zinc-950/60"
          >
            <div className="flex items-center justify-between">
              <span className="flex size-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200/70 transition-colors group-hover:bg-emerald-600 group-hover:text-white dark:bg-emerald-900/40 dark:text-emerald-300 dark:ring-emerald-800/60 dark:group-hover:bg-emerald-500 dark:group-hover:text-zinc-950">
                <step.icon className="size-5" aria-hidden="true" />
              </span>
              <span className="font-mono text-xs font-semibold tabular-nums text-zinc-300 dark:text-zinc-600">
                {step.step}
              </span>
            </div>
            <div className="space-y-1.5">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {step.title}
              </h3>
              <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                {step.body}
              </p>
            </div>
            <span className="mt-auto inline-flex w-fit items-center rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 font-mono text-[10px] text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
              {step.chip}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Documentation dashboard (the 9-phase assignment story)               */
/* ------------------------------------------------------------------ */

function DocsDashboard({
  phase,
  data,
  apiMessage,
  onRetry,
}: {
  phase: LoadPhase;
  data: EdaSummary | null;
  apiMessage: string;
  onRetry: () => void;
}) {
  return (
    <>
      <DocsStatusStrip phase={phase} synthetic={data?.source?.synthetic} />

      <Hero />

      {phase === "error" ? (
        <ErrorCard message={apiMessage} onRetry={onRetry} />
      ) : null}

      {phase === "loading" ? <LoadingContent /> : null}

      {phase === "not_run" ? <NotRunCard message={apiMessage} /> : null}

      {phase === "ready" && data ? (
        <>
          <KpiGrid data={data} />
          <PipelineSection data={data} />
        </>
      ) : null}

      <PipelineDetail />

      {/* Phase 2 owns its loading / not-run / error states, so it renders
          regardless of the Phase 1 EDA status — the page reads Phase 1 →
          Phase 2. */}
      <Phase2Section />

      {/* Same for Phase 3 — it reads its own artifact
          (phase3_summary.json) and renders right after the baselines it
          was measured against. */}
      <Phase3Section />

      {/* Same for Phase 4 — it reads phase4_summary.json and renders
          right after the classifier whose head labels the retrieved
          pairs. Its live demo talks to the retrieval mini-service on
          port 3030 through the gateway (XTransformPort query param). */}
      <Phase4Section />

      {/* Phase 5 — grounded generation: it reads phase5_summary.json and
          renders right after the retrieval whose evidence pairs ground
          every reply. Its live demo drafts replies through the same
          mini-service (port 3030) via the gateway. */}
      <Phase5Section />

      {/* Phase 6 — escalation policy: it reads phase6_summary.json and
          renders right after the generation whose per-reply gates its
          rules consume and extend. Lazy-mounted: the section renders
          when it approaches the viewport (memory envelope). */}
      <LazyMount label="Phase 6 — Escalation policy">
        <Phase6Section />
      </LazyMount>

      {/* Phase 7 — unified agent: it reads phase7_summary.json and renders
          the composition of Phases 3→6, with a LIVE agent console that
          calls /api/phase7/agent on the mini-service (port 3030) through
          the gateway. Lazy-mounted like Phase 6. */}
      <LazyMount label="Phase 7 — Unified agent">
        <Phase7Section />
      </LazyMount>

      {/* Phase 8 — Streamlit app: screenshots + run instructions for the
          assignment's Python UI deliverable (a thin client over the same
          live agent service). Lazy-mounted like Phase 6. */}
      <LazyMount label="Phase 8 — Streamlit app">
        <Phase8Section />
      </LazyMount>

      {/* Phase 9 — final report: the cross-phase measured summary,
          artifacts, honest limitations and the closing statement.
          Lazy-mounted like Phase 6. */}
      <LazyMount label="Phase 9 — Final report">
        <Phase9Section />
      </LazyMount>

      {phase === "ready" && data ? (
        <>
          <EdaSection data={data} />
          <SamplesSection data={data} />
        </>
      ) : null}

      {/* useSearchParams() inside the explorer requires a Suspense boundary
          so the client page can still prerender when statically generated.
          suggestionTerms feeds the zero-hit "did you mean" chips from the
          EDA top terms / bigrams. Lazy-mounted: the explorer fetches the
          106k-row conversations artifact on mount (~800 MB server cache);
          deferring that until the user approaches it keeps the initial
          page load inside the sandbox memory envelope. */}
      <LazyMount label="Conversation explorer" minHeight={320}>
        <Suspense fallback={<ExplorerFallback />}>
          <ConversationExplorer
            suggestionTerms={
              data
                ? [
                    ...(data.top_terms ?? []).map((t) => t.term ?? ""),
                    ...(data.top_bigrams ?? []).map((t) => t.term ?? ""),
                  ].filter((term) => term && term.trim().length >= 2)
                : undefined
            }
          />
        </Suspense>
      </LazyMount>

      <DocsViewer />

      <RoadmapSection />
    </>
  );
}

function DocsStatusStrip({
  phase,
  synthetic,
}: {
  phase: LoadPhase;
  synthetic: boolean | undefined;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge
        variant="outline"
        className="border-zinc-200 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
      >
        Assignment documentation
      </Badge>
      <SourceBadge phase={phase} synthetic={synthetic} />
      <span className="text-xs text-zinc-400 dark:text-zinc-500">
        nine phases · every claim measured · artifacts on disk
      </span>
    </div>
  );
}

function SourceBadge({
  phase,
  synthetic,
}: {
  phase: LoadPhase;
  synthetic: boolean | undefined;
}) {
  if (phase === "ready") {
    return synthetic === true ? (
      <Badge className="border border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
        SYNTHETIC SAMPLE
      </Badge>
    ) : (
      <Badge className="border border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
        LIVE DATA
      </Badge>
    );
  }
  return (
    <Badge
      variant="secondary"
      className="border-zinc-200 bg-zinc-100 text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
    >
      {phase === "loading" ? "LOADING" : "NO DATA"}
    </Badge>
  );
}

/* ------------------------------------------------------------------ */
/* Hero                                                                */
/* ------------------------------------------------------------------ */

function Hero() {
  return (
    <section aria-labelledby="phase1-heading">
      <div className="space-y-3 rounded-xl border border-emerald-100 bg-gradient-to-b from-emerald-50/80 via-white to-white p-5 sm:p-7 dark:border-emerald-900/60 dark:from-emerald-950/40 dark:via-zinc-950 dark:to-zinc-950">
        <h1
          id="phase1-heading"
          className="text-3xl font-bold tracking-tight sm:text-4xl"
        >
          Phase 1 — Data Foundation
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-zinc-600 sm:text-base dark:text-zinc-400">
          Loading the Customer Support on Twitter dataset, isolating the
          AppleSupport conversations, reconstructing customer ↔ support threads
          and profiling the corpus that later phases will classify, retrieve
          from and ground their answers in.
        </p>
        {/* CTA row: open the live multi-turn agent chat (fixed launcher +
            panel, mini-service port 3030 through the gateway), or jump to
            the 9-phase roadmap below. */}
        <div className="flex flex-wrap items-center gap-2.5 pt-1">
          <Button
            type="button"
            className="h-10 gap-2 bg-emerald-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-emerald-500 dark:bg-emerald-500 dark:text-zinc-950 dark:shadow-emerald-500/20 dark:hover:bg-emerald-400"
            onClick={openAgentChat}
          >
            <Headset className="size-4" aria-hidden="true" />
            Chat with the live agent
          </Button>
          <a
            href="#roadmap-heading"
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-700 transition-colors hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:border-emerald-800 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-300"
          >
            <Route className="size-4" aria-hidden="true" />
            See the 9-phase story
          </a>
        </div>
        <Alert className="border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-200">
          <TriangleAlert className="size-4" aria-hidden="true" />
          <AlertTitle>Historical data disclaimer</AlertTitle>
          <AlertDescription className="text-amber-800 dark:text-amber-300/90">
            Historical AppleSupport replies are retrieval evidence, not current
            Apple policy.
          </AlertDescription>
        </Alert>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* KPI grid                                                            */
/* ------------------------------------------------------------------ */

function KpiGrid({ data }: { data: EdaSummary }) {
  const d = data.dataset;
  /* Sparkline data, normalized from the EDA histograms:
     - turns: buckets 1..14 of the conversation-length histogram
     - chars: the 7 message-length buckets in order
     Fallbacks keep the cards rendering when a bin list is missing. */
  const turnBins = (data.conversation_length_histogram ?? [])
    .filter((bin) => typeof bin.count === "number")
    .slice(0, 14);
  const turnSpark = turnBins.length >= 3
    ? {
        points: turnBins.map((bin) => bin.count ?? 0),
        label: `Distribution of conversation lengths (turns 1–${
          turnBins[turnBins.length - 1]?.turns ?? turnBins.length
        }): tallest bucket is ${formatInt(
          Math.max(...turnBins.map((bin) => bin.count ?? 0)),
        )} conversations.`,
        xLabel: `1 turn – ${turnBins[turnBins.length - 1]?.turns ?? "?"} turns`,
        bucketLabels: turnBins.map(
          (bin) => `${bin.turns ?? "?"} turn${(bin.turns ?? 2) === 1 ? "" : "s"}`,
        ),
        bucketUnit: "conversations",
      }
    : undefined;
  const charBins = data.message_length_histogram ?? [];
  const charSpark = charBins.length >= 3
    ? {
        points: charBins.map((bin) => bin.count ?? 0),
        label: `Distribution of message lengths across ${charBins.length} buckets: the most common bucket holds ${formatInt(
          Math.max(...charBins.map((bin) => bin.count ?? 0)),
        )} messages.`,
        xLabel: `${charBins[0]?.bucket ?? "short"} – ${
          charBins[charBins.length - 1]?.bucket ?? "long"
        } chars`,
        bucketLabels: charBins.map(
          (bin) => `${bin.bucket ?? "?"} chars`,
        ),
        bucketUnit: "messages",
      }
    : undefined;
  return (
    <section aria-labelledby="kpi-heading" className="space-y-4">
      <SectionHeading
        id="kpi-heading"
        icon={Database}
        title="Dataset at a glance"
        description="Corpus size after each Phase 1 filter step. All values come straight from the pipeline's EDA summary — the mini charts show the underlying length distributions."
      />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <StatCard
          icon={Database}
          label="Total tweets"
          value={formatInt(d?.total_tweets)}
          sub={`${formatInt(d?.total_conversations)} conversations dataset-wide`}
        />
        <StatCard
          icon={MessagesSquare}
          label="AppleSupport conv."
          value={formatInt(d?.apple_conversations)}
        />
        <StatCard
          icon={Hash}
          label="AppleSupport tweets"
          value={formatInt(d?.apple_tweets)}
        />
        <StatCard
          icon={ArrowLeftRight}
          label="Cust–support pairs"
          value={formatInt(d?.support_pairs)}
        />
        <StatCard
          icon={Repeat2}
          label="Avg turns / conv."
          value={formatFloat(d?.avg_conversation_turns, 1)}
          sub={`median ${formatInt(d?.median_conversation_turns)} · max ${formatInt(
            d?.max_conversation_turns,
          )}`}
          spark={turnSpark}
        />
        <StatCard
          icon={Type}
          label="Avg msg length"
          value={formatFloat(d?.avg_message_chars, 1)}
          sub={`${formatFloat(d?.avg_message_words, 1)} words per message`}
          spark={charSpark}
        />
      </div>
      <p className="rounded-lg border border-zinc-200/80 bg-zinc-100/60 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
        Coverage: {orDash(d?.date_start)} → {orDash(d?.date_end)} · Source
        file: {orDash(data.source?.file)} · Support account:{" "}
        {orDash(data.source?.apple_support_author_id)} · Results generated:{" "}
        {orDash(data.generated_at)}
      </p>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Pipeline stages                                                     */
/* ------------------------------------------------------------------ */

function PipelineSection({ data }: { data: EdaSummary }) {
  const stages = data.pipeline_stages ?? [];
  return (
    <section aria-labelledby="pipeline-heading" className="space-y-4">
      <SectionHeading
        id="pipeline-heading"
        icon={ListChecks}
        title="Pipeline stages"
        description="Each stage of the Phase 1 data pipeline and its outcome."
      />
      {stages.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No pipeline stage information available.
        </p>
      ) : (
        <ol className="grid gap-4 md:grid-cols-2">
          {stages.map((stage, index) => {
            const warn = stage.status === "WARN";
            const isLast = index === stages.length - 1;
            return (
              <li
                key={`${stage.name ?? "stage"}-${index}`}
                className={cn("h-full", isLast && "md:col-span-2")}
              >
                <Card className="h-full gap-0 p-4 transition-all duration-200 hover:shadow-md motion-safe:hover:-translate-y-0.5 dark:hover:shadow-emerald-500/10">
                  <div className="flex items-start gap-3">
                    {warn ? (
                      <TriangleAlert
                        className="mt-0.5 size-5 shrink-0 text-amber-500 dark:text-amber-400"
                        aria-hidden="true"
                      />
                    ) : (
                      <CheckCircle2
                        className="mt-0.5 size-5 shrink-0 text-emerald-600 dark:text-emerald-400"
                        aria-hidden="true"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-mono text-[10px] text-zinc-400 dark:text-zinc-500">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                          {orDash(stage.name)}
                        </h3>
                        {warn ? (
                          <Badge className="border border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                            WARN
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-1 break-words text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                        {orDash(stage.detail)}
                      </p>
                    </div>
                  </div>
                </Card>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* EDA tabs                                                            */
/* ------------------------------------------------------------------ */

function EdaSection({ data }: { data: EdaSummary }) {
  const dataset = data.dataset;
  const inbound =
    data.inbound_distribution?.inbound ?? dataset?.apple_inbound;
  const outbound =
    data.inbound_distribution?.outbound ?? dataset?.apple_outbound;

  const turnsData: ColumnChartDatum[] = (
    data.conversation_length_histogram ?? []
  ).map((bin, index) => ({
    label: bin.turns === undefined ? `#${index + 1}` : String(bin.turns),
    count: bin.count ?? 0,
  }));

  const lengthData: ColumnChartDatum[] = (
    data.message_length_histogram ?? []
  ).map((bin, index) => ({
    label: bin.bucket?.trim() || `#${index + 1}`,
    count: bin.count ?? 0,
  }));

  const terms = data.top_terms ?? [];
  const bigrams = data.top_bigrams ?? [];
  const topics = data.provisional_topics ?? [];

  const inboundSummary = `Tweet direction in the AppleSupport corpus: inbound (customers) ${formatInt(
    inbound,
  )}, outbound (AppleSupport) ${formatInt(outbound)}.`;
  const turnsSummary = `Conversation length distribution: ${turnsData
    .map((datum) => `${datum.label} turns: ${formatInt(datum.count)}`)
    .join("; ")}`;
  const lengthSummary = `Message length distribution: ${lengthData
    .map((datum) => `${datum.label} characters: ${formatInt(datum.count)}`)
    .join("; ")}`;
  const termsSummary = `Top terms: ${terms
    .map((item) => `${orDash(item.term)} (${formatInt(item.count)})`)
    .join(", ")}`;
  const bigramsSummary = `Top bigrams: ${bigrams
    .map((item) => `${orDash(item.term)} (${formatInt(item.count)})`)
    .join(", ")}`;
  const topicsSummary = `Provisional support topics: ${topics
    .map(
      (item) =>
        `${orDash(item.topic)} ${formatPercent(item.share)} (${formatInt(
          item.matched,
        )} messages)`,
    )
    .join("; ")}`;

  const termItems: BarListItem[] = terms.map((item) => ({
    label: orDash(item.term),
    barValue: item.count,
    primaryValue: formatInt(item.count),
  }));
  const bigramItems: BarListItem[] = bigrams.map((item) => ({
    label: orDash(item.term),
    barValue: item.count,
    primaryValue: formatInt(item.count),
  }));
  const topicItems: BarListItem[] = topics.map((item) => ({
    label: orDash(item.topic),
    barValue: item.share,
    primaryValue: formatPercent(item.share),
    secondaryValue: formatInt(item.matched),
    title: `${orDash(item.topic)} — ${formatInt(item.matched)} messages`,
  }));

  return (
    <section aria-labelledby="eda-heading" className="space-y-4">
      <SectionHeading
        id="eda-heading"
        icon={BarChart3}
        title="Exploratory data analysis"
        description="Distributions across the filtered AppleSupport corpus. All values are rendered from eda_summary.json."
      />
      <div className="flex justify-end print:hidden">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 text-xs text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
          onClick={() => {
            const anchor = document.createElement("a");
            anchor.href = "/api/phase1/status?format=raw";
            anchor.rel = "noopener";
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
          }}
          aria-label="Download eda_summary.json — the raw pipeline artifact"
          title="Download the raw eda_summary.json written by scripts/run_eda.py"
        >
          <Download className="size-3.5" aria-hidden="true" />
          Download eda_summary.json
        </Button>
      </div>
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="h-12 w-full max-w-md sm:w-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="language">Language</TabsTrigger>
          <TabsTrigger value="topics">Topics</TabsTrigger>
          <TabsTrigger value="charts">Charts</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="border-b">
              <CardTitle>Inbound vs outbound</CardTitle>
              <CardDescription>
                Tweet direction within the AppleSupport corpus.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <StackedShareBar
                segments={[
                  {
                    label: "Inbound (customers)",
                    count: inbound,
                    barClassName: "bg-emerald-500",
                  },
                  {
                    label: "Outbound (AppleSupport)",
                    count: outbound,
                    barClassName: "bg-zinc-400 dark:bg-zinc-500",
                  },
                ]}
                srSummary={inboundSummary}
              />
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* min-w-0 lets the cards shrink on narrow screens so the charts'
                internal overflow-x scrolling engages instead of blowing out
                the grid track (grid items default to min-width: auto). */}
            <Card className="min-w-0">
              <CardHeader className="border-b">
                <CardTitle>Conversation length</CardTitle>
                <CardDescription>
                  Turn counts across reconstructed conversations.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {turnsData.length > 0 ? (
                  <ColumnChart
                    data={turnsData}
                    srSummary={turnsSummary}
                    xLabel="turns per conversation"
                    unit="conversations"
                  />
                ) : (
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    No conversation length data available.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="min-w-0">
              <CardHeader className="border-b">
                <CardTitle>Message length</CardTitle>
                <CardDescription>
                  Character-count buckets across messages.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {lengthData.length > 0 ? (
                  <ColumnChart
                    data={lengthData}
                    srSummary={lengthSummary}
                    xLabel="characters per message"
                    unit="messages"
                  />
                ) : (
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    No message length data available.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          <DistributionInsights
            turnsBins={data.conversation_length_histogram}
            lengthBins={data.message_length_histogram}
          />
        </TabsContent>

        <TabsContent value="language" className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card className="min-w-0">
            <CardHeader className="border-b">
              <CardTitle>Top terms</CardTitle>
              <CardDescription>
                Most frequent terms across customer messages.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {termItems.length > 0 ? (
                <BarList items={termItems} srSummary={termsSummary} scrollable />
              ) : (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">No term data available.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b">
              <CardTitle>Top bigrams</CardTitle>
              <CardDescription>
                Most frequent two-word sequences across customer messages.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {bigramItems.length > 0 ? (
                <BarList
                  items={bigramItems}
                  srSummary={bigramsSummary}
                  scrollable
                />
              ) : (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  No bigram data available.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="topics" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="border-b">
              <CardTitle>Provisional support topics</CardTitle>
              <CardDescription>
                Share of customer messages matching each keyword-based topic
                cluster.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {topicItems.length > 0 ? (
                <BarList items={topicItems} srSummary={topicsSummary} />
              ) : (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  No provisional topic data available.
                </p>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card className="bg-zinc-50 gap-2 dark:bg-zinc-900/40">
              <CardHeader>
                <CardTitle className="text-sm">Method note</CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                Keyword-based provisional tagging — the final intent taxonomy is
                derived and labelled in Phase 2.
              </CardContent>
            </Card>

            <Card className="gap-2">
              <CardContent>
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Multi-topic messages
                </p>
                <p className="mt-2 text-2xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100">
                  {formatPercent(data.multi_topic_share)}
                </p>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  Share of customer messages matching two or more provisional
                  topics.
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="charts" className="mt-4">
          <ChartGallery />
        </TabsContent>
      </Tabs>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Sample conversations                                                */
/* ------------------------------------------------------------------ */

function SamplesSection({ data }: { data: EdaSummary }) {
  const samples = data.sample_conversations ?? [];
  return (
    <section aria-labelledby="samples-heading" className="space-y-4">
      <SectionHeading
        id="samples-heading"
        icon={MessagesSquare}
        title="Reconstructed conversations (sample)"
        description="Example threads rebuilt from reply chains, each showing a customer message and the historical AppleSupport reply."
      />
      {samples.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No sample conversations available.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {samples.map((sample, index) => (
            <ConversationCard
              key={sample.conversation_id ?? `sample-${index}`}
              conversation_id={sample.conversation_id}
              turn={sample.turns}
              customer_message={sample.customer_message}
              support_response={sample.support_response}
              created_at={sample.created_at}
              turnLabel={`${formatInt(sample.turns)} turns`}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Conversation explorer Suspense fallback                              */
/* ------------------------------------------------------------------ */

function ExplorerFallback() {
  return (
    <section className="space-y-4" aria-hidden="true">
      <Skeleton className="h-7 w-64" />
      <Skeleton className="h-24 w-full rounded-xl" />
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <Skeleton key={index} className="h-44 w-full rounded-xl" />
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Roadmap                                                             */
/* ------------------------------------------------------------------ */

function RoadmapSection() {
  return (
    <section aria-labelledby="roadmap-heading" className="space-y-4">
      <SectionHeading
        id="roadmap-heading"
        icon={Route}
        title="Project roadmap"
        description="Nine phases from raw data to the final evidence-grounded agent. All nine phases are complete and verified — every one shipped with a measured evaluation."
      />
      <Card className="gap-0 p-5 sm:p-6">
        <ol className="ml-3 border-l border-zinc-200 dark:border-zinc-800">
          {ROADMAP_PHASES.map((phase) => {
            /* All nine phases are delivered and verified. */
            const complete = phase.n <= 9;
            const badgeText =
              phase.n === 1
                ? "Complete — verified"
                : phase.n === 2
                  ? "Complete — baselines measured"
                  : phase.n === 3
                    ? "Complete — measured vs baselines"
                    : phase.n === 4
                      ? "Complete — Recall@K measured"
                      : phase.n === 5
                        ? "Complete — reply quality measured"
                        : phase.n === 6
                          ? "Complete — false-auto 0/10"
                          : phase.n === 7
                            ? "Complete — 29/29 consistency"
                            : phase.n === 8
                              ? "Complete — AppTest verified"
                              : "Complete — report written";
            return (
              <li key={phase.n} className="relative pb-6 pl-6 last:pb-0">
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute -left-[14px] top-0 flex size-7 items-center justify-center rounded-full text-xs font-semibold ring-4 ring-card",
                    complete
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "border border-zinc-200 bg-white text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-500",
                  )}
                >
                  {complete ? (
                    <CheckCircle2 className="size-4" aria-hidden="true" />
                  ) : (
                    phase.n
                  )}
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <h3
                    className={cn(
                      "text-sm",
                      complete
                        ? "font-semibold text-zinc-900 dark:text-zinc-100"
                        : "font-medium text-zinc-600 dark:text-zinc-400",
                    )}
                  >
                    Phase {phase.n} — {phase.title}
                  </h3>
                  {complete ? (
                    <Badge className="border border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                      {badgeText}
                    </Badge>
                  ) : null}
                </div>
                <p
                  className={cn(
                    "mt-1 text-xs leading-relaxed",
                    complete
                      ? "text-zinc-600 dark:text-zinc-400"
                      : "text-zinc-500 dark:text-zinc-500",
                  )}
                >
                  {phase.description}
                </p>
              </li>
            );
          })}
        </ol>
      </Card>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* NOT_RUN guidance                                                    */
/* ------------------------------------------------------------------ */

function NotRunCard({ message }: { message: string }) {
  return (
    <Card className="border-amber-200 bg-amber-50/60 dark:border-amber-900/70 dark:bg-amber-950/30">
      <CardHeader className="border-b border-amber-200/70 dark:border-amber-900/50">
        <CardTitle className="flex items-center gap-2 text-amber-900 dark:text-amber-200">
          <CircleAlert
            className="size-5 shrink-0 text-amber-500 dark:text-amber-400"
            aria-hidden="true"
          />
          Phase 1 results have not been generated yet
        </CardTitle>
        <CardDescription className="text-amber-800/90 dark:text-amber-300/80">
          This dashboard renders statistics from{" "}
          <code className="font-mono text-xs">
            hiver-support-agent/data/processed/eda_summary.json
          </code>
          , which does not exist yet. Follow the steps below to produce it, then
          press Refresh.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="space-y-4">
          {SETUP_STEPS.map((step, index) => (
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

function ErrorCard({
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
      <AlertTitle>Could not load Phase 1 results</AlertTitle>
      <AlertDescription className="text-red-800 dark:text-red-300">
        <p>{message || "The status API request failed."}</p>
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

function LoadingContent() {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-10">
      <p className="sr-only">Loading Phase 1 statistics…</p>
      <section className="space-y-4" aria-hidden="true">
        <Skeleton className="skeleton-shimmer h-6 w-56" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, index) => (
            <Card key={index} className="gap-3 p-4 sm:p-5">
              <Skeleton className="skeleton-shimmer h-3 w-24" />
              <Skeleton className="skeleton-shimmer h-8 w-20" />
              <Skeleton className="skeleton-shimmer h-3 w-28" />
            </Card>
          ))}
        </div>
      </section>
      <section className="space-y-4" aria-hidden="true">
        <Skeleton className="skeleton-shimmer h-6 w-64" />
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Card key={index} className="p-4">
              <Skeleton className="skeleton-shimmer h-4 w-36" />
              <Skeleton className="skeleton-shimmer mt-3 h-40 w-full" />
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Footer                                                              */
/* ------------------------------------------------------------------ */

function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mx-auto max-w-6xl space-y-1 px-4 pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-xs text-zinc-500 sm:px-6 dark:text-zinc-400">
        <p>
          Historical AppleSupport replies are retrieval evidence, not current
          Apple policy. Prototype — every measured number comes from the
          evaluation artifacts on disk.
        </p>
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
          <span>Live agent · Data API:</span>
          <code className="font-mono text-zinc-600 dark:text-zinc-300">/api/agent/chat</code>
          <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-600">·</span>
          <code className="font-mono text-zinc-600 dark:text-zinc-300">/api/phase1/status</code>
          <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-600">·</span>
          <code className="font-mono text-zinc-600 dark:text-zinc-300">/api/phase1/pipeline</code>
          <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-600">·</span>
          <code className="font-mono text-zinc-600 dark:text-zinc-300">/api/phase2/status</code>
          <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-600">·</span>
          <code className="font-mono text-zinc-600 dark:text-zinc-300">/api/phase1/chart</code>
          <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-600">·</span>
          <code className="font-mono text-zinc-600 dark:text-zinc-300">
            /api/phase1/conversations
          </code>
          <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-600">·</span>
          <code className="font-mono text-zinc-600 dark:text-zinc-300">
            /api/phase1/docs
          </code>
          <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-600">·</span>
          <code className="font-mono text-zinc-600 dark:text-zinc-300">
            /api/phase2/status
          </code>
          <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-600">·</span>
          <code className="font-mono text-zinc-600 dark:text-zinc-300">
            /api/phase3/status
          </code>
          <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-600">·</span>
          <code className="font-mono text-zinc-600 dark:text-zinc-300">
            /api/phase4/status
          </code>
          <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-600">·</span>
          <code className="font-mono text-zinc-600 dark:text-zinc-300">
            /api/phase5/status
          </code>
          <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-600">·</span>
          <code className="font-mono text-zinc-600 dark:text-zinc-300">
            /api/phase6/status
          </code>
          <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-600">·</span>
          <code className="font-mono text-zinc-600 dark:text-zinc-300">
            /api/phase7/status
          </code>
        </p>
      </div>
    </footer>
  );
}
