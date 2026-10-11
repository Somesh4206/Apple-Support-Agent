"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MAX_INPUT_CHARS } from "@/lib/agent-chat";
import { cn } from "@/lib/utils";

/**
 * The composer footer — auto-height textarea (1..3 rows), Enter sends /
 * Shift+Enter newline, a char counter that appears past 400, and the
 * always-visible 2017-era prototype disclaimer.
 */
export function ChatComposer({
  sending,
  onSend,
  autoFocusSignal,
}: {
  sending: boolean;
  onSend: (text: string) => void;
  /** increments whenever the panel opens, so focus lands on the composer */
  autoFocusSignal: number;
}) {
  const [draft, setDraft] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  /* auto-height, capped at ~3 rows */
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 78)}px`;
  }, [draft]);

  /* focus the composer when the panel opens */
  useEffect(() => {
    if (autoFocusSignal > 0) {
      textareaRef.current?.focus();
    }
  }, [autoFocusSignal]);

  const trimmed = draft.trim();
  const canSend = !sending && trimmed.length > 0 && trimmed.length <= MAX_INPUT_CHARS;
  const showCounter = draft.length > 400;

  const submit = () => {
    if (!canSend) return;
    onSend(trimmed);
    setDraft("");
    /* height snaps back to one row on the next effect pass */
  };

  return (
    <div className="border-t border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-end gap-2">
        <div className="relative min-w-0 flex-1">
          <Textarea
            ref={textareaRef}
            value={draft}
            rows={1}
            maxLength={MAX_INPUT_CHARS}
            placeholder="Type your message — Enter to send, Shift+Enter for a new line"
            aria-label="Message the support agent"
            disabled={sending}
            className="min-h-[44px] resize-none overflow-hidden border-zinc-200 bg-white px-3 py-2.5 text-sm leading-relaxed shadow-none placeholder:text-zinc-400 focus-visible:ring-emerald-600/60 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:placeholder:text-zinc-500"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
          />
          {showCounter ? (
            <span
              className={cn(
                "pointer-events-none absolute bottom-1.5 right-2 rounded bg-white/85 px-1 font-mono text-[10px] tabular-nums dark:bg-zinc-900/85",
                draft.length >= MAX_INPUT_CHARS
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-zinc-400 dark:text-zinc-500",
              )}
            >
              {draft.length}/{MAX_INPUT_CHARS}
            </span>
          ) : null}
        </div>
        <Button
          type="button"
          size="icon"
          aria-label="Send message"
          title="Send (Enter)"
          disabled={!canSend}
          onClick={submit}
          className="size-11 shrink-0 rounded-xl bg-emerald-600 text-white shadow-sm hover:bg-emerald-500 focus-visible:ring-emerald-600/60 disabled:opacity-50 dark:bg-emerald-500 dark:hover:bg-emerald-400"
        >
          {sending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <ArrowUp className="size-4" aria-hidden="true" />
          )}
        </Button>
      </div>
      <p className="mt-2 text-[10px] leading-relaxed text-zinc-400 dark:text-zinc-500">
        Prototype grounded in 2017-era AppleSupport history — not current Apple
        policy.
      </p>
    </div>
  );
}
