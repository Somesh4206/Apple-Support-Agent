"use client";

import { useEffect, useRef } from "react";
import {
  Bot,
  Download,
  Loader2,
  RefreshCw,
  TriangleAlert,
  X,
} from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CUSTOM_SCROLLBAR } from "@/lib/phase5";
import type { UseAgentChat } from "@/hooks/use-agent-chat";
import { cn } from "@/lib/utils";
import {
  AgentChatMessage,
  EmptyConversation,
  TypingIndicator,
  UserChatMessage,
} from "@/components/agent-chat/chat-message";
import { ChatComposer } from "@/components/agent-chat/composer";
import { downloadAgentChatTranscript } from "@/components/agent-chat/export-transcript";
import type { ChatWorkerState } from "@/hooks/use-worker-health";
import type { RetrievalHealthResponse } from "@/lib/phase4";

export type { ChatWorkerState } from "@/hooks/use-worker-health";

function StatusDot({
  worker,
  health,
}: {
  worker: ChatWorkerState;
  health?: RetrievalHealthResponse | null;
}) {
  const dataset = health?.dataset;
  const pairs = dataset?.corpus_pairs ?? health?.corpus_size ?? 0;
  const backend = health?.retrieval_backend;
  const datasetLabel =
    worker === "ready" && dataset?.connected !== false
      ? pairs > 0
        ? `dataset connected · ${pairs.toLocaleString("en-US")} pairs`
        : "dataset connected"
      : null;
  const tooltip = [
    `agent service: ${worker}`,
    backend ? `retrieval backend: ${backend}` : null,
    dataset?.source ? `evidence source: ${dataset.source}` : null,
    health?.model ? `model: ${health.model}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  const label =
    worker === "ready"
      ? "service ready"
      : worker === "loading"
        ? "warming up…"
        : worker === "idle"
          ? "idle — warms on first message"
          : worker === "dead"
            ? "worker failed"
            : worker === "unreachable"
              ? "unreachable"
              : "checking…";
  return (
    <span
      className="flex min-w-0 items-center gap-1.5"
      role="status"
      title={tooltip}
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          worker === "ready" && "bg-emerald-500 dark:bg-emerald-400",
          (worker === "loading" || worker === "idle") &&
            "animate-pulse bg-amber-500 dark:bg-amber-400",
          (worker === "dead" || worker === "unreachable") && "bg-red-500 dark:bg-red-400",
          worker === "unknown" && "bg-zinc-400 dark:bg-zinc-500",
        )}
      />
      <span
        className={cn(
          "truncate text-[11px]",
          worker === "ready"
            ? "text-emerald-700 dark:text-emerald-300"
            : worker === "dead" || worker === "unreachable"
              ? "text-red-600 dark:text-red-400"
              : "text-amber-700 dark:text-amber-400",
        )}
      >
        {label}
        {datasetLabel ? (
          <span className="text-zinc-400 dark:text-zinc-500"> · {datasetLabel}</span>
        ) : null}
      </span>
    </span>
  );
}

/**
 * The floating chat panel — nearly full-width on phones, a 400px card on
 * desktop. Owns the transcript rendering, banners, inline errors and the
 * composer; state comes from the useAgentChat hook.
 */
export function ChatPanel({
  chat,
  worker,
  health,
  onClose,
  autoFocusSignal,
}: {
  chat: UseAgentChat;
  worker: ChatWorkerState;
  health?: RetrievalHealthResponse | null;
  onClose: () => void;
  autoFocusSignal: number;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const hasMessages = chat.messages.length > 0;
  const lastAgentDecision = [...chat.messages]
    .reverse()
    .find((message) => message.role === "agent")?.decision;
  const inHumanReview =
    chat.conversation?.state === "escalated" || lastAgentDecision === "escalate";
  const warming = worker === "loading" || worker === "idle" || worker === "unknown";

  /* auto-scroll to the newest message (smooth, inside the log only) */
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [chat.messages.length, chat.sendState, chat.error]);

  /* Escape closes the panel — the dialog pattern. Focus "inside" includes
     the common no-focus (body) case; a focus on some OTHER page element is
     left alone so that element can handle Escape itself. */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const active = document.activeElement;
      const focusInside =
        (panelRef.current?.contains(active) ?? false) ||
        active === document.body ||
        active === null;
      if (focusInside) {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const onNewConversation = () => {
    void chat.resetSession();
  };

  const onDownload = () => {
    downloadAgentChatTranscript(chat.messages, chat.sessionId);
  };

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Live agent chat"
      className="animate-in fade-in slide-in-from-bottom-4 fixed inset-x-3 bottom-3 z-50 flex h-[78dvh] w-auto flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl duration-200 sm:inset-x-auto sm:bottom-5 sm:right-5 sm:h-[min(620px,calc(100dvh-5rem))] sm:w-[400px] sm:max-w-[calc(100vw-2.5rem)] dark:border-zinc-800 dark:bg-zinc-950 print:hidden"
    >
      {/* typing dots keyframes — scoped class names, subtle bounce */}
      <style>{`@keyframes agentDotBounce{0%,80%,100%{transform:translateY(0);opacity:.55}40%{transform:translateY(-3px);opacity:1}}.agent-dot{animation:agentDotBounce 1.1s ease-in-out infinite}`}</style>

      {/* ------------------------- header ------------------------- */}
      <div className="flex items-center gap-2 border-b border-zinc-200 bg-white px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-950">
        <span
          aria-hidden="true"
          className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-sm shadow-emerald-600/25 dark:bg-emerald-500"
        >
          <Bot className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold leading-tight text-zinc-900 whitespace-normal sm:truncate dark:text-zinc-100">
            Apple Support AI — Live Agent
          </p>
          <StatusDot worker={worker} health={health} />
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {hasMessages ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                  aria-label="Start a new conversation"
                  title="New conversation"
                >
                  <RefreshCw className="size-4" aria-hidden="true" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="max-w-[calc(100vw-2rem)]">
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Start a new conversation?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    This clears the current transcript on the agent service
                    (it cannot be recovered afterwards) and mints a fresh
                    session id. Consider downloading the transcript first.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep chatting</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-emerald-600 text-white hover:bg-emerald-500 dark:bg-emerald-500 dark:hover:bg-emerald-400"
                    onClick={onNewConversation}
                  >
                    Start fresh
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className="size-8 rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
              aria-label="Start a new conversation"
              title="New conversation"
              onClick={onNewConversation}
            >
              <RefreshCw className="size-4" aria-hidden="true" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="size-8 rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            aria-label="Download transcript"
            title="Download transcript (Markdown)"
            disabled={!hasMessages}
            onClick={onDownload}
          >
            <Download className="size-4" aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            aria-label="Close chat"
            title="Close (Esc)"
            onClick={onClose}
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      {/* ------------------------ banners ------------------------ */}
      {inHumanReview ? (
        <div
          role="status"
          className="flex items-center gap-2 border-b border-amber-200/80 bg-amber-50 px-3.5 py-1.5 text-[11px] leading-relaxed text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300"
        >
          <TriangleAlert
            className="size-3.5 shrink-0 text-amber-500 dark:text-amber-400"
            aria-hidden="true"
          />
          In human-review queue — you can keep the conversation going; policy
          re-checks every message.
        </div>
      ) : null}
      {warming && !inHumanReview ? (
        <div
          role="status"
          className="flex items-center gap-2 border-b border-amber-200/80 bg-amber-50 px-3.5 py-1.5 text-[11px] leading-relaxed text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300"
        >
          <Loader2
            className="size-3.5 shrink-0 animate-spin text-amber-500 dark:text-amber-400"
            aria-hidden="true"
          />
          Warming up the retrieval worker (~15 s) — your first message may
          take a moment.
        </div>
      ) : null}

      {/* ---------------------- messages area ---------------------- */}
      <div
        ref={scrollRef}
        role="log"
        aria-live="polite"
        aria-label="Conversation with the support agent"
        className={cn(
          "flex-1 overflow-y-auto overscroll-contain px-3 py-4",
          CUSTOM_SCROLLBAR,
        )}
      >
        {chat.loadState === "loading" ? (
          <div
            aria-busy="true"
            className="space-y-4"
            aria-label="Loading conversation history"
          >
            <p className="sr-only">Loading the saved conversation…</p>
            <div className="flex justify-end" aria-hidden="true">
              <Skeleton className="skeleton-shimmer h-10 w-2/3 rounded-2xl rounded-br-md" />
            </div>
            <div className="flex items-start gap-2" aria-hidden="true">
              <Skeleton className="skeleton-shimmer size-7 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="skeleton-shimmer h-14 w-5/6 rounded-2xl rounded-tl-md" />
                <Skeleton className="skeleton-shimmer h-3 w-24" />
              </div>
            </div>
            <div className="flex justify-end" aria-hidden="true">
              <Skeleton className="skeleton-shimmer h-10 w-1/2 rounded-2xl rounded-br-md" />
            </div>
            <div className="flex items-start gap-2" aria-hidden="true">
              <Skeleton className="skeleton-shimmer size-7 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="skeleton-shimmer h-12 w-2/3 rounded-2xl rounded-tl-md" />
                <Skeleton className="skeleton-shimmer h-3 w-28" />
              </div>
            </div>
          </div>
        ) : !hasMessages ? (
          <EmptyConversation
            onPickExample={(text) => void chat.sendMessage(text)}
            corpusSize={health?.corpus_size ?? health?.dataset?.corpus_pairs}
          />
        ) : (
          <div className="space-y-4">
            {chat.messages.map((message) =>
              message.role === "user" ? (
                <UserChatMessage key={message.id} message={message} />
              ) : (
                <AgentChatMessage key={message.id} message={message} />
              ),
            )}
            {chat.sendState === "sending" ? <TypingIndicator /> : null}
          </div>
        )}

        {/* inline error — auto-dismisses on the next successful send */}
        {chat.error ? (
          <div
            role="alert"
            className={cn(
              "mt-4 rounded-lg border px-3 py-2.5 text-xs leading-relaxed",
              chat.error.kind === "network"
                ? "border-red-200 bg-red-50 text-red-800 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-300"
                : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-300",
            )}
          >
            <p className="flex items-start gap-2">
              <TriangleAlert
                className={cn(
                  "mt-0.5 size-3.5 shrink-0",
                  chat.error.kind === "network"
                    ? "text-red-500 dark:text-red-400"
                    : "text-amber-500 dark:text-amber-400",
                )}
                aria-hidden="true"
              />
              {chat.error.message}
            </p>
            {chat.lastFailedText ? (
              <Button
                variant="outline"
                size="sm"
                className="mt-2 h-9 gap-1.5"
                disabled={chat.sendState === "sending"}
                onClick={() => {
                  void chat.sendMessage(chat.lastFailedText ?? "");
                }}
              >
                <RefreshCw className="size-3.5" aria-hidden="true" />
                Retry
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* ------------------------ composer ------------------------ */}
      <ChatComposer
        sending={chat.sendState === "sending"}
        autoFocusSignal={autoFocusSignal}
        onSend={(text) => void chat.sendMessage(text)}
      />
    </div>
  );
}
