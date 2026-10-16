"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bot,
  Download,
  Loader2,
  MessageSquareText,
  RefreshCw,
  TriangleAlert,
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
import { formatInt } from "@/lib/phase1";
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
import { FOCUS_COMPOSER_EVENT } from "@/lib/agent-chat";
import { type ChatWorkerState } from "@/components/agent-chat/panel";

/**
 * Short human label for the retrieval backend serving the evidence — shown
 * in the header so "is the dataset connected?" is answered at a glance.
 * Since the hybrid merge, the ML path always blends the real twcs index
 * with the bundled curated corpus (complete guidance pairs). Live web
 * research (open-web grounding) runs on top for every researchable turn.
 */
function backendLabel(backend?: string): string {
  if (backend === "faiss-ml") return "twcs ML + curated + live web research";
  if (backend === "builtin-lexical") return "curated set + live web research";
  return "evidence + live web research";
}

/**
 * The embedded, product-level chat — the landing page centerpiece.
 *
 * Same session, transcript and rendering as the floating panel (both share
 * the AgentChatProvider context), but styled as a first-class surface: a
 * tall card that fills its grid column on desktop and the full width on
 * mobile, with the worker status in its header.
 */
export function InlineAgentChat({
  chat,
  worker,
  corpusSize = 0,
  backend,
  className,
}: {
  chat: UseAgentChat;
  worker: ChatWorkerState;
  /** live corpus size from the service health — 0 while warming up */
  corpusSize?: number;
  /** "faiss-ml" | "builtin-lexical" — which retrieval engine serves evidence */
  backend?: string;
  className?: string;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [composerFocusSignal, bumpComposerFocus] = useState(0);

  const hasMessages = chat.messages.length > 0;
  const inHumanReview = chat.conversation?.state === "escalated";
  const warming =
    worker === "loading" || worker === "idle" || worker === "unknown";

  /* "Chat with the agent" hero CTA → scroll the embedded chat into view
     and drop focus into the composer */
  useEffect(() => {
    const onFocus = () => bumpComposerFocus((value) => value + 1);
    window.addEventListener(FOCUS_COMPOSER_EVENT, onFocus);
    return () => window.removeEventListener(FOCUS_COMPOSER_EVENT, onFocus);
  }, []);

  /* auto-scroll on new messages / state changes */
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [chat.messages.length, chat.sendState, chat.error]);

  const statusColor =
    worker === "ready"
      ? "bg-emerald-500 dark:bg-emerald-400"
      : worker === "dead" || worker === "unreachable"
        ? "bg-red-500 dark:bg-red-400"
        : "bg-amber-500 dark:bg-amber-400";
  const statusLabel =
    worker === "ready"
      ? "Agent online"
      : worker === "loading" || worker === "idle"
        ? "Warming up…"
        : worker === "dead" || worker === "unreachable"
          ? "Service offline"
          : "Checking…";

  return (
    <div
      id="inline-agent-chat"
      className={cn(
        "flex h-[min(640px,calc(100dvh-11rem))] flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl shadow-zinc-200/50 dark:border-zinc-800 dark:bg-zinc-950 dark:shadow-zinc-950/50 print:hidden",
        className,
      )}
      aria-label="Live support agent conversation"
    >
      {/* typing dots keyframes (shared with the floating panel's indicator) */}
      <style>{`@keyframes agentDotBounce{0%,80%,100%{transform:translateY(0);opacity:.55}40%{transform:translateY(-3px);opacity:1}}.agent-dot{animation:agentDotBounce 1.1s ease-in-out infinite}`}</style>

      {/* header */}
      <div className="flex items-center gap-2.5 border-b border-zinc-200 bg-gradient-to-r from-emerald-50/80 to-white px-4 py-3 dark:border-zinc-800 dark:from-emerald-950/30 dark:to-zinc-950">
        <span
          aria-hidden="true"
          className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-md shadow-emerald-600/25 dark:bg-emerald-500"
        >
          <Bot className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight text-zinc-900 dark:text-zinc-100">
            Apple Support AI · Agent
          </p>
          <p className="flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
            <span className={cn("size-1.5 rounded-full", statusColor)} />
            {statusLabel}
            <span aria-hidden="true">·</span>
            {corpusSize > 0
              ? `grounded in ${formatInt(corpusSize)} conversations · ${backendLabel(backend)}`
              : "loading evidence index…"}
          </p>
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
                  <AlertDialogTitle>Start a new conversation?</AlertDialogTitle>
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
                    onClick={() => void chat.resetSession()}
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
              onClick={() => void chat.resetSession()}
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
            onClick={() => downloadAgentChatTranscript(chat.messages, chat.sessionId)}
          >
            <Download className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      {/* banners */}
      {inHumanReview ? (
        <div
          role="status"
          className="flex items-center gap-2 border-b border-amber-200/80 bg-amber-50 px-4 py-1.5 text-[11px] leading-relaxed text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300"
        >
          <TriangleAlert className="size-3.5 shrink-0 text-amber-500 dark:text-amber-400" aria-hidden="true" />
          In human-review queue — keep the conversation going; policy re-checks
          every message.
        </div>
      ) : warming ? (
        <div
          role="status"
          className="flex items-center gap-2 border-b border-amber-200/80 bg-amber-50 px-4 py-1.5 text-[11px] leading-relaxed text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300"
        >
          <Loader2 className="size-3.5 shrink-0 animate-spin text-amber-500 dark:text-amber-400" aria-hidden="true" />
          Warming up the retrieval worker (~15 s) — your first message may take
          a moment.
        </div>
      ) : null}

      {/* messages */}
      <div
        ref={scrollRef}
        role="log"
        aria-live="polite"
        aria-label="Conversation with the support agent"
        className={cn(
          "flex-1 overflow-y-auto overscroll-contain px-3.5 py-4 sm:px-4",
          CUSTOM_SCROLLBAR,
        )}
      >
        {chat.loadState === "loading" ? (
          <div aria-busy="true" className="space-y-4" aria-label="Loading conversation history">
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
          </div>
        ) : !hasMessages ? (
          <EmptyConversation
            onPickExample={(text) => void chat.sendMessage(text)}
            corpusSize={corpusSize}
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
                onClick={() => void chat.sendMessage(chat.lastFailedText ?? "")}
              >
                <RefreshCw className="size-3.5" aria-hidden="true" />
                Retry
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* composer */}
      <ChatComposer
        sending={chat.sendState === "sending"}
        autoFocusSignal={composerFocusSignal}
        onSend={(text) => {
          void chat.sendMessage(text);
        }}
      />
    </div>
  );
}

/** Small feature chip used beside the hero copy. */
export function HeroChatBadge({ icon: Icon, children }: { icon: typeof Bot; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-600 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
      <Icon className="size-3 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
      {children}
    </span>
  );
}

/** Scroll-hint pill under the hero copy pointing at the chat. */
export function ChatNowHint({ onClick }: { onClick: () => void }) {
  return (
    <Button
      type="button"
      size="sm"
      onClick={onClick}
      className="h-9 gap-2 rounded-full bg-emerald-600 px-4 text-xs font-semibold text-white shadow-md shadow-emerald-600/25 hover:bg-emerald-500 dark:bg-emerald-500 dark:text-zinc-950 dark:hover:bg-emerald-400"
    >
      <MessageSquareText className="size-3.5" aria-hidden="true" />
      Start chatting now
    </Button>
  );
}
