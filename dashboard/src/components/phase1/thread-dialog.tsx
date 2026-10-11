"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Check,
  ChevronDown,
  Clock,
  Copy,
  CornerDownRight,
  FileCode2,
  Loader2,
  MessageSquareText,
  SearchX,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { copyText } from "@/lib/clipboard";
import {
  formatInt,
  type Phase1ThreadResponse,
} from "@/lib/phase1";

/* ------------------------------------------------------------------ */
/* Highlight helper (shared logic with the conversation card)           */
/* ------------------------------------------------------------------ */

const HIGHLIGHT_MARK_CLASS =
  "rounded-sm bg-amber-200/70 px-0.5 dark:bg-amber-400/30 dark:text-amber-100";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renderHighlighted(text: string, query: string): ReactNode {
  const parts = text.split(new RegExp(`(${escapeRegExp(query)})`, "gi"));
  return parts.map((part, index) =>
    index % 2 === 1 ? (
      <mark key={index} className={HIGHLIGHT_MARK_CLASS}>
        {part}
      </mark>
    ) : (
      <Fragment key={index}>{part}</Fragment>
    ),
  );
}

function BubbleText({
  text,
  highlight,
}: {
  text: string;
  highlight: string | undefined;
}) {
  const trimmed = text?.trim();
  if (!trimmed) {
    return <>—</>;
  }
  const query = highlight?.trim();
  if (query && query.length >= 2) {
    return <>{renderHighlighted(trimmed, query)}</>;
  }
  return <>{trimmed}</>;
}

/* ------------------------------------------------------------------ */
/* Thread duration helpers                                              */
/* ------------------------------------------------------------------ */

const MONTHS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
] as const;

/**
 * Safely parses the Twitter/legacy date format used in twcs.csv
 * ("Tue Oct 31 18:08:04 +0000 2017") without relying on non-standard
 * Date parsing. Returns undefined for anything unexpected.
 */
function parseTwitterDate(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const match =
    /^(?:\w{3})\s+(\w{3})\s+(\d{1,2})\s+(\d{2}):(\d{2}):(\d{2})\s+([+-]\d{4})\s+(\d{4})$/.exec(
      value.trim(),
    );
  if (!match) {
    return undefined;
  }
  const month = MONTHS.indexOf(match[1].toLowerCase() as (typeof MONTHS)[number]);
  const day = Number.parseInt(match[2], 10);
  // Regex capture groups: 1=month, 2=day, 3=hh, 4=mm, 5=ss, 6=tz, 7=year.
  const year = Number.parseInt(match[7], 10);
  const hours = Number.parseInt(match[3], 10);
  const minutes = Number.parseInt(match[4], 10);
  const seconds = Number.parseInt(match[5], 10);
  const tzOffsetMinutes =
    Math.trunc(Number.parseInt(match[6], 10) / 100) * 60 +
    (Math.abs(Number.parseInt(match[6], 10)) % 100);
  if (
    month < 0 ||
    Number.isNaN(day) ||
    Number.isNaN(year) ||
    Number.isNaN(hours) ||
    Number.isNaN(minutes) ||
    Number.isNaN(seconds)
  ) {
    return undefined;
  }
  const utc = Date.UTC(year, month, day, hours, minutes, seconds);
  if (Number.isNaN(utc)) {
    return undefined;
  }
  // Convert to UTC: for +0100, local time is ahead, so subtract the offset.
  const sign = match[6].startsWith("-") ? -1 : 1;
  return utc - sign * tzOffsetMinutes * 60_000;
}

/** Human span between two timestamps: "3 days", "2 h 15 min", "45 min". */
function formatThreadSpan(from: number, to: number): string | undefined {
  const minutes = Math.round((to - from) / 60_000);
  if (!Number.isFinite(minutes) || minutes < 0) {
    return undefined;
  }
  if (minutes === 0) {
    return "under a minute";
  }
  const days = Math.floor(minutes / (60 * 24));
  const hours = Math.floor((minutes % (60 * 24)) / 60);
  const mins = minutes % 60;
  if (days > 0) {
    return `${formatInt(days)} ${days === 1 ? "day" : "days"}${
      hours > 0 ? ` ${formatInt(hours)} h` : ""
    }`;
  }
  if (hours > 0) {
    return `${formatInt(hours)} h${mins > 0 ? ` ${formatInt(mins)} min` : ""}`;
  }
  return `${formatInt(mins)} min`;
}

/** Span of a loaded thread: first → last message. undefined when unknowable. */
function threadSpan(thread: Phase1ThreadResponse): string | undefined {
  const first = thread.items[0];
  const last = thread.items[thread.items.length - 1];
  if (!first || !last || thread.items.length < 2) {
    return undefined;
  }
  const from = parseTwitterDate(first.created_at);
  const to = parseTwitterDate(last.created_at);
  if (from === undefined || to === undefined) {
    return undefined;
  }
  return formatThreadSpan(from, to);
}

/* ------------------------------------------------------------------ */
/* Thread dialog                                                        */
/* ------------------------------------------------------------------ */

export interface ThreadDialogProps {
  /** Conversation whose full thread should be shown; null = closed. */
  conversationId: string | null;
  /** Turn the user opened the thread from — scrolled to and ringed. */
  focusTurn?: number;
  /** Active search term, highlighted inside the thread bubbles. */
  highlight?: string;
  onClose: () => void;
}

/**
 * Full-thread viewer: fetches every reconstructed pair of one conversation
 * (GET /api/phase1/conversations?conversationId=…) and renders it as a
 * scrolling customer ↔ AppleSupport chat with turn markers, copy-as-text
 * and an auto-scrolled "you came from here" ring on the origin turn.
 */
export function ThreadDialog({
  conversationId,
  focusTurn,
  highlight,
  onClose,
}: ThreadDialogProps) {
  const { toast } = useToast();
  const [state, setState] = useState<
    "loading" | "error" | "ready" | "empty"
  >("loading");
  const [thread, setThread] = useState<Phase1ThreadResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  /* Jump-to-turn: the value being typed, the resolved turn we flash, and
     the last announcement for the aria-live status line. */
  const [jumpDraft, setJumpDraft] = useState("");
  const [jumpedTurn, setJumpedTurn] = useState<number | null>(null);
  const [jumpNote, setJumpNote] = useState("");
  const jumpTimerRef = useRef<number | null>(null);
  const jumpInputRef = useRef<HTMLInputElement | null>(null);

  const open = conversationId !== null;

  useEffect(() => {
    if (!conversationId) {
      return;
    }
    const controller = new AbortController();
    let active = true;
    setState("loading");
    setThread(null);
    setErrorMessage("");

    const run = async () => {
      try {
        const response = await fetch(
          `/api/phase1/conversations?conversationId=${encodeURIComponent(
            conversationId,
          )}`,
          { cache: "no-store", signal: controller.signal },
        );
        if (!response.ok) {
          throw new Error(`Request failed with HTTP ${response.status}`);
        }
        const payload = (await response.json()) as Phase1ThreadResponse;
        if (!active) {
          return;
        }
        if (payload.ok && payload.items.length > 0) {
          setThread(payload);
          setState("ready");
        } else if (payload.ok) {
          setThread(payload);
          setState("empty");
        } else {
          setErrorMessage(
            payload.message ?? "The thread could not be loaded.",
          );
          setState("error");
        }
      } catch (err) {
        if (!active) {
          return;
        }
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }
        setErrorMessage(
          err instanceof Error ? err.message : "Unable to load the thread.",
        );
        setState("error");
      }
    };

    void run();
    return () => {
      active = false;
      controller.abort();
    };
  }, [conversationId, reloadKey]);

  // Scroll the origin turn into view once the thread has rendered.
  useEffect(() => {
    if (state !== "ready" || focusTurn === undefined || !conversationId) {
      return;
    }
    const timer = window.setTimeout(() => {
      const el = document.getElementById(
        `thread-turn-${conversationId}-${focusTurn}`,
      );
      el?.scrollIntoView({ block: "center", behavior: "auto" });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [state, focusTurn, conversationId]);

  // Reset the jump-to-turn draft whenever a different thread loads.
  useEffect(() => {
    setJumpDraft("");
    setJumpedTurn(null);
    setJumpNote("");
    return () => {
      if (jumpTimerRef.current !== null) {
        window.clearTimeout(jumpTimerRef.current);
      }
    };
  }, [conversationId, reloadKey]);

  /* Keyboard-only route to the jump control: "j" focuses the turn input
     while the thread dialog is open (ignored while typing in fields, with
     modifiers, or on short threads where the control is hidden). */
  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key.toLowerCase() !== "j" ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      ) {
        return;
      }
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName.toLowerCase() === "input" ||
          target.tagName.toLowerCase() === "textarea" ||
          target.isContentEditable)
      ) {
        return;
      }
      const input = jumpInputRef.current;
      if (!input) {
        return;
      }
      event.preventDefault();
      input.focus();
      input.select();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  /**
   * Jump-to-turn: resolves the requested turn number against the thread —
   * exact match preferred, otherwise the first turn at or after it, clamped
   * to the last pair. Scrolls the block into view and flashes it amber.
   */
  const handleJumpToTurn = useCallback(() => {
    if (!thread || thread.items.length === 0 || !conversationId) {
      return;
    }
    const requested = Number.parseInt(jumpDraft, 10);
    if (!Number.isFinite(requested) || requested < 1) {
      setJumpNote("Enter a turn number of 1 or more.");
      jumpInputRef.current?.focus();
      return;
    }
    const turns = thread.items.map((item) => item.turn);
    const target =
      turns.find((turn) => turn === requested) ??
      turns.find((turn) => turn >= requested) ??
      turns[turns.length - 1];
    const element = document.getElementById(
      `thread-turn-${conversationId}-${target}`,
    );
    if (!element) {
      return;
    }
    element.scrollIntoView({ block: "center", behavior: "smooth" });
    setJumpedTurn(target);
    setJumpNote(
      target === requested
        ? `Jumped to turn ${target}.`
        : `No turn ${requested} — jumped to the nearest one, turn ${target}.`,
    );
    if (jumpTimerRef.current !== null) {
      window.clearTimeout(jumpTimerRef.current);
    }
    jumpTimerRef.current = window.setTimeout(() => {
      setJumpedTurn(null);
      jumpTimerRef.current = null;
    }, 1700);
  }, [thread, jumpDraft, conversationId]);

  const handleCopyThread = useCallback(async () => {
    if (!thread || thread.items.length === 0) {
      return;
    }
    const lines: string[] = [
      `Conversation ${thread.conversationId} — ${thread.turns} customer↔support pair${thread.turns === 1 ? "" : "s"}`,
      thread.startedAt ? `Started: ${thread.startedAt}` : "",
      "Source: twcs.csv via the Apple Support AI Phase 1 pipeline (conversation_pairs.csv)",
      "",
    ];
    for (const item of thread.items) {
      lines.push(`[Turn ${item.turn}] Customer: ${item.customer_message.trim()}`);
      lines.push(
        `[Turn ${item.turn}] AppleSupport (historical): ${item.support_response.trim()}`,
      );
      lines.push("");
    }
    const ok = await copyText(lines.join("\n").trimEnd());
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
      toast({
        title: "Thread copied",
        description: `All ${formatInt(thread.turns)} turns of conversation ${thread.conversationId} are on your clipboard.`,
      });
    } else {
      toast({
        title: "Copy failed",
        description:
          "Your browser blocked clipboard access — select the text manually instead.",
        variant: "destructive",
      });
    }
  }, [thread, toast]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <MessageSquareText
              className="size-5 text-emerald-600 dark:text-emerald-400"
              aria-hidden="true"
            />
            <span className="font-mono text-base">
              Conversation {conversationId ?? ""}
            </span>
          </DialogTitle>
          <DialogDescription>
            {thread
              ? `${formatInt(thread.turns)} customer↔support pair${thread.turns === 1 ? "" : "s"} reconstructed by the Phase 1 pipeline, in structural turn order.`
              : "Every reconstructed pair of this conversation, in structural turn order."}
            {thread ? (() => {
              const span = threadSpan(thread);
              return span ? (
                <>
                  {" "}
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100/70 px-2 py-0.5 text-[11px] font-medium text-emerald-800 ring-1 ring-emerald-200/60 dark:bg-emerald-950/50 dark:text-emerald-300 dark:ring-emerald-800/50">
                    <Clock
                      className="size-3"
                      aria-hidden="true"
                    />
                    spanned {span}
                  </span>
                </>
              ) : null;
            })() : null}
          </DialogDescription>
        </DialogHeader>

        {state === "loading" ? (
          <div aria-busy="true" aria-live="polite" className="space-y-3">
            <p className="sr-only">Loading the conversation thread…</p>
            <Skeleton className="skeleton-shimmer h-10 w-3/5" />
            <Skeleton className="skeleton-shimmer h-10 w-4/5" />
            <Skeleton className="skeleton-shimmer ml-auto h-10 w-2/3" />
            <Skeleton className="skeleton-shimmer h-10 w-3/4" />
            <Skeleton className="skeleton-shimmer ml-auto h-10 w-1/2" />
          </div>
        ) : null}

        {state === "error" ? (
          <Alert variant="destructive">
            <AlertTitle>Could not load the thread</AlertTitle>
            <AlertDescription>
              <p>{errorMessage || "The thread request failed."}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 h-11"
                onClick={() => setReloadKey((key) => key + 1)}
              >
                <Loader2 className="size-4" aria-hidden="true" />
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}

        {state === "empty" ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-zinc-200 bg-zinc-50 py-10 text-center dark:border-zinc-800 dark:bg-zinc-900/40">
            <span className="flex size-11 items-center justify-center rounded-full bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500">
              <SearchX className="size-5" aria-hidden="true" />
            </span>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              No reconstructed pairs found for this conversation id.
            </p>
          </div>
        ) : null}

        {state === "ready" && thread ? (
          <>
            <div
              role="region"
              aria-label="Conversation thread"
              className="max-h-[60vh] space-y-5 overflow-y-auto rounded-lg border border-zinc-100 bg-zinc-50/50 p-4 dark:border-zinc-800 dark:bg-zinc-900/30"
            >
              {thread.items.map((item) => {
                const isOrigin = item.turn === focusTurn;
                const isFlashed = item.turn === jumpedTurn;
                return (
                  <div
                    key={`${item.conversation_id}-${item.turn}`}
                    id={`thread-turn-${item.conversation_id}-${item.turn}`}
                    className={
                      "space-y-2 rounded-xl scroll-mt-4 p-2 transition-colors " +
                      (isOrigin
                        ? "bg-amber-50 ring-1 ring-amber-200 dark:bg-amber-950/20 dark:ring-amber-900/60 "
                        : "") +
                      (isFlashed ? "turn-flash " : "")
                    }
                  >
                    <p className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                      <span className="font-mono">Turn {formatInt(item.turn)}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-normal normal-case">{item.created_at}</span>
                      {isOrigin ? (
                        <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
                          you opened from here
                        </span>
                      ) : null}
                    </p>
                    <div className="flex flex-col items-start gap-1">
                      <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                        Customer
                      </span>
                      <p className="max-w-[85%] break-words rounded-xl bg-white p-3 text-sm leading-relaxed text-zinc-800 shadow-sm dark:bg-zinc-800 dark:text-zinc-100">
                        <BubbleText
                          text={item.customer_message}
                          highlight={highlight}
                        />
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 text-right">
                      <span className="text-[10px] font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                        AppleSupport (historical)
                      </span>
                      <p className="max-w-[85%] break-words rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm leading-relaxed text-zinc-800 dark:border-emerald-800/70 dark:bg-emerald-950/40 dark:text-emerald-50">
                        <BubbleText
                          text={item.support_response}
                          highlight={highlight}
                        />
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-zinc-400 dark:text-zinc-500">
                {thread.cache === "warm" ? "Served from the warm cache" : "Parsed fresh"} ·{" "}
                {thread.elapsedMs !== undefined
                  ? `${formatInt(thread.elapsedMs)} ms`
                  : "—"}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {/* Jump-to-turn: long threads span dozens of turns — this
                    skips straight to a turn number (nearest match). */}
                {thread.turns >= 3 ? (
                  <div
                    className="flex items-center gap-1.5 print:hidden"
                    role="group"
                    aria-label="Jump to a turn"
                  >
                    <CornerDownRight
                      className="size-4 text-zinc-400 dark:text-zinc-500"
                      aria-hidden="true"
                    />
                    <input
                      ref={jumpInputRef}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={thread.items[thread.items.length - 1]?.turn}
                      value={jumpDraft}
                      onChange={(event) => setJumpDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          handleJumpToTurn();
                        }
                      }}
                      placeholder="Turn #"
                      aria-label="Turn number to jump to"
                      title="Jump to a turn — or press j anywhere in this dialog"
                      aria-keyshortcuts="j"
                      className="h-11 w-20 rounded-md border border-zinc-200 bg-white px-2.5 text-sm tabular-nums text-zinc-800 shadow-sm transition-colors placeholder:font-normal placeholder:text-zinc-400 focus-visible:border-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500"
                    />
                    <span
                      className="hidden text-[10px] text-zinc-400 sm:inline dark:text-zinc-500"
                      aria-hidden="true"
                    >
                      or press{" "}
                      <kbd className="inline-flex h-4 min-w-4 items-center justify-center rounded border border-zinc-300 bg-zinc-50 px-1 font-mono text-[10px] leading-none text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
                        j
                      </kbd>
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-11"
                      onClick={handleJumpToTurn}
                      disabled={!jumpDraft.trim()}
                    >
                      Go
                    </Button>
                  </div>
                ) : null}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-11 gap-1.5"
                  onClick={() => void handleCopyThread()}
                >
                  {copied ? (
                    <Check className="size-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                  ) : (
                    <Copy className="size-4" aria-hidden="true" />
                  )}
                  {copied ? "Copied" : "Copy thread as text"}
                </Button>
              </div>
            </div>
            {jumpNote ? (
              <p
                aria-live="polite"
                className="text-right text-xs text-amber-700 dark:text-amber-400 print:hidden"
              >
                {jumpNote}
              </p>
            ) : null}
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
