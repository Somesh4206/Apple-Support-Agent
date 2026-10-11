"use client";

import { Fragment, useCallback, useState, type ReactNode } from "react";
import { Check, Copy, MessagesSquare, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { copyText } from "@/lib/clipboard";
import { orDash } from "@/lib/phase1";

export interface ConversationCardProps {
  conversation_id?: string;
  turn?: number;
  customer_message?: string;
  support_response?: string;
  created_at?: string;
  /**
   * Text rendered in the turn badge — e.g. "3 turns" for the EDA sample
   * cards (conversation length) or "Turn 4" for explorer pairs (turn index).
   */
  turnLabel: string;
  /**
   * Optional search term (only the conversation explorer passes this).
   * Case-insensitive occurrences are wrapped in <mark> inside both message
   * bubbles; the text stays semantic and copyable (no innerHTML).
   */
  highlight?: string;
  /**
   * When true (only the conversation explorer sets this), the card header
   * shows a copy button that puts the full pair transcript on the clipboard.
   */
  copyable?: boolean;
  /**
   * When provided (only the conversation explorer sets this), the card
   * header shows a "view full thread" button that opens the ThreadDialog
   * for this conversation.
   */
  onViewThread?: () => void;
  /**
   * Term-frequency relevance score from sort=relevance (customer hits ×2 +
   * support hits). Rendered as an emerald badge so the ranking explains
   * itself; absent in every other sort mode.
   */
  relevanceScore?: number;
}

/** Amber mark styling shared with the explorer's search highlighting. */
const HIGHLIGHT_MARK_CLASS =
  "rounded-sm bg-amber-200/70 px-0.5 dark:bg-amber-400/30 dark:text-amber-100";

/** Escapes regex metacharacters so a query like "c++" is matched literally. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Splits `text` on case-insensitive occurrences of `query` (a single capture
 * group makes every odd-index part a match) and wraps matches in <mark>.
 */
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

/** Message bubble body: plain text, or highlighted when a query is active. */
function BubbleText({
  text,
  highlight,
}: {
  text: string | undefined;
  highlight: string | undefined;
}) {
  const trimmed = text?.trim();
  if (!trimmed) {
    return <>{orDash(text)}</>;
  }
  const query = highlight?.trim();
  if (query && query.length >= 2) {
    return <>{renderHighlighted(trimmed, query)}</>;
  }
  return <>{trimmed}</>;
}

/**
 * Chat card shared by the EDA sample section and the conversation explorer:
 * customer bubble left (zinc), historical AppleSupport reply right (emerald).
 */
export function ConversationCard({
  conversation_id,
  turn,
  customer_message,
  support_response,
  created_at,
  turnLabel,
  highlight,
  copyable = false,
  onViewThread,
  relevanceScore,
}: ConversationCardProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    const transcript = [
      `Conversation ${conversation_id ?? "—"} · ${turnLabel}`,
      created_at ? `Timestamp: ${created_at}` : null,
      "",
      `Customer: ${(customer_message ?? "").trim() || "—"}`,
      "",
      `AppleSupport (historical): ${(support_response ?? "").trim() || "—"}`,
      "",
      "Source: twcs.csv via the Apple Support AI Phase 1 pipeline (conversation_pairs.csv)",
    ]
      .filter((line) => line !== null)
      .join("\n");

    const ok = await copyText(transcript);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
      toast({
        title: "Conversation copied",
        description: `Conversation ${conversation_id ?? "—"} (${turnLabel}) is on your clipboard as plain text.`,
      });
    } else {
      toast({
        title: "Copy failed",
        description: "Your browser blocked clipboard access — select the text manually instead.",
        variant: "destructive",
      });
    }
  }, [conversation_id, turnLabel, created_at, customer_message, support_response, toast]);

  const id = conversation_id?.trim();
  const shortId = id ? (id.length > 10 ? `${id.slice(0, 10)}…` : id) : "—";
  return (
    <Card className="h-full gap-0 p-4 transition-all duration-200 hover:shadow-md motion-safe:hover:-translate-y-0.5 focus-within:ring-1 focus-within:ring-emerald-500/40 dark:hover:shadow-emerald-500/10 print:break-inside-avoid">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-zinc-100 pb-3 dark:border-zinc-800">
        <span
          className="font-mono text-xs text-zinc-500 dark:text-zinc-400"
          title={id}
        >
          conv {shortId}
        </span>
        <Badge
          variant="outline"
          className="border-zinc-200 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
        >
          {turnLabel}
        </Badge>
        {typeof relevanceScore === "number" && relevanceScore > 0 ? (
          <Badge
            variant="outline"
            className="gap-1 border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/70 dark:bg-emerald-950/40 dark:text-emerald-300"
            title="Relevance score — every case-insensitive occurrence of your search counts, customer-message hits weigh double."
          >
            <Sparkles className="size-3" aria-hidden="true" />
            {relevanceScore} pts
          </Badge>
        ) : null}
        <span className="ml-auto text-xs text-zinc-400 dark:text-zinc-500">
          {orDash(created_at)}
        </span>
        {copyable ? (
          <button
            type="button"
            onClick={handleCopy}
            className={
              "inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-500 transition-colors hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 print:hidden " +
              (copied ? "border-emerald-300 text-emerald-600 dark:border-emerald-800 dark:text-emerald-400" : "")
            }
            aria-label={
              copied
                ? "Conversation copied to clipboard"
                : `Copy conversation ${id ?? ""} transcript to clipboard`
            }
            title={copied ? "Copied!" : "Copy this conversation as text"}
          >
            {copied ? (
              <Check className="size-3.5" aria-hidden="true" />
            ) : (
              <Copy className="size-3.5" aria-hidden="true" />
            )}
          </button>
        ) : null}
        {onViewThread ? (
          <button
            type="button"
            onClick={onViewThread}
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-500 transition-colors hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 print:hidden"
            aria-label={`View the full thread of conversation ${id ?? ""}`}
            title="View the full conversation thread"
          >
            <MessagesSquare className="size-3.5" aria-hidden="true" />
          </button>
        ) : null}
      </div>
      <div className="mt-3 space-y-3">
        <div className="flex flex-col items-start gap-1">
          <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Customer
          </span>
          <p className="max-w-[88%] break-words rounded-xl bg-zinc-100 p-3.5 text-sm leading-relaxed text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100">
            <BubbleText text={customer_message} highlight={highlight} />
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 text-right">
          <span className="text-[10px] font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
            AppleSupport (historical)
          </span>
          <p className="max-w-[88%] break-words rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-sm leading-relaxed text-zinc-800 dark:border-emerald-800/70 dark:bg-emerald-950/40 dark:text-emerald-50">
            <BubbleText text={support_response} highlight={highlight} />
          </p>
        </div>
      </div>
    </Card>
  );
}
