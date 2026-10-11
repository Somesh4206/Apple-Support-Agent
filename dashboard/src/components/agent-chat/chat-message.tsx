"use client";

import { useState } from "react";
import { Bot, ChevronDown, ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  CHAT_EXAMPLE_MESSAGES,
  intentName,
  type ChatEvidenceItem,
  type ChatMessage,
  type ChatPolicyReason,
} from "@/lib/agent-chat";
import { cn } from "@/lib/utils";

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

function formatTime(iso: string | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* ------------------------------------------------------------------ */
/* User message                                                        */
/* ------------------------------------------------------------------ */

export function UserChatMessage({ message }: { message: ChatMessage }) {
  return (
    <div className="flex flex-col items-end gap-1">
      <div
        className={cn(
          "max-w-[85%] rounded-2xl rounded-br-md px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words text-white shadow-sm",
          message.pending
            ? "bg-emerald-600/70 dark:bg-emerald-500/60"
            : "bg-emerald-600 dark:bg-emerald-500",
        )}
      >
        {message.content}
      </div>
      <span className="pr-1 font-mono text-[10px] tabular-nums text-zinc-400 dark:text-zinc-500">
        {formatTime(message.created_at)}
        {message.pending ? " · sending…" : ""}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Agent message (bubble + collapsible metadata strip)                 */
/* ------------------------------------------------------------------ */

export function AgentChatMessage({ message }: { message: ChatMessage }) {
  const isEscalate = message.decision === "escalate";
  const meta = message.meta ?? {};
  const reasons: ChatPolicyReason[] =
    meta.handoff?.reasons ?? meta.policy?.reasons ?? [];

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex w-full min-w-0 items-start gap-2">
        <span
          aria-hidden="true"
          className={cn(
            "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg",
            isEscalate
              ? "bg-amber-100 text-amber-700 ring-1 ring-amber-200/70 dark:bg-amber-900/40 dark:text-amber-300 dark:ring-amber-800/60"
              : "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200/70 dark:bg-emerald-900/40 dark:text-emerald-300 dark:ring-emerald-800/60",
          )}
        >
          <Bot className="size-4" />
        </span>
        <div className="min-w-0 flex-1 space-y-1.5">
          {/* escalate: the amber handoff note ABOVE the bubble */}
          {isEscalate ? (
            <div className="rounded-lg border-l-2 border-amber-400 bg-amber-50 px-2.5 py-1.5 text-[11px] leading-relaxed text-amber-800 dark:border-amber-500 dark:bg-amber-950/40 dark:text-amber-300">
              <span className="font-medium">Human handoff</span> — policy
              fired:{" "}
              <span className="font-mono text-[10px]">
                {reasons.length > 0
                  ? reasons
                      .map((reason) => reason.rule ?? "?")
                      .join(" · ")
                  : "—"}
              </span>
              . Suggested acknowledgment (never auto-sent):
            </div>
          ) : null}

          <div className="max-w-[92%] rounded-2xl rounded-tl-md border border-zinc-200 bg-zinc-100 px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words text-zinc-800 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
            {message.content}
          </div>

          <TurnMetadataStrip message={message} />
        </div>
      </div>
      <span className="pl-9 font-mono text-[10px] tabular-nums text-zinc-400 dark:text-zinc-500">
        {formatTime(message.created_at)}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Compact metadata strip (collapsed: chips · expanded: full detail)    */
/* ------------------------------------------------------------------ */

function TurnMetadataStrip({ message }: { message: ChatMessage }) {
  const [open, setOpen] = useState(false);
  const isEscalate = message.decision === "escalate";
  const meta = message.meta ?? {};
  const intent = meta.query_intent;
  const timings = meta.timings;
  const evidence = meta.evidence ?? [];
  const reasons: ChatPolicyReason[] =
    meta.handoff?.reasons ?? meta.policy?.reasons ?? [];

  const totalChip = isFiniteNumber(timings?.total_ms)
    ? `${(timings.total_ms / 1000).toFixed(1)}s`
    : null;
  const llmChip = isFiniteNumber(timings?.llm_ms)
    ? isEscalate
      ? "0 LLM calls"
      : `LLM ${(timings.llm_ms / 1000).toFixed(1)}s`
    : null;

  const summaryId = `agent-turn-meta-${message.id ?? "local"}`;

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls={summaryId}
          className="flex size-6 shrink-0 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-emerald-600 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
          aria-label={open ? "Hide turn details" : "Show turn details"}
        >
          {open ? (
            <ChevronDown className="size-3.5" aria-hidden="true" />
          ) : (
            <ChevronRight className="size-3.5" aria-hidden="true" />
          )}
        </button>

        {/* decision badge */}
        {isEscalate ? (
          <Badge
            className="gap-1 border-amber-200 bg-amber-50 px-1.5 text-[10px] font-medium text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
            title={meta.reply_status ?? "handoff_acknowledgment"}
          >
            Escalated to human · no auto-reply
          </Badge>
        ) : (
          <Badge
            className="gap-1 border-emerald-200 bg-emerald-50 px-1.5 text-[10px] font-medium text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
            title={meta.reply_status ?? "ready_to_send"}
          >
            Auto-handled · reply ready to send
          </Badge>
        )}

        {/* intent + confidence */}
        {intent?.label ? (
          <Badge
            variant="outline"
            className="px-1.5 font-mono text-[10px] text-zinc-600 dark:text-zinc-300"
            title={
              intent.runner_up
                ? `runner-up: ${intent.runner_up} ${
                    isFiniteNumber(intent.runner_up_confidence)
                      ? `(${intent.runner_up_confidence.toFixed(2)})`
                      : ""
                  }`
                : "predicted intent + confidence (Phase 3 head)"
            }
          >
            {intent.label}
            {isFiniteNumber(intent.confidence) ? (
              <span className="tabular-nums">
                {" · "}
                {Math.round(intent.confidence * 100)}%
              </span>
            ) : null}
          </Badge>
        ) : null}

        {/* latency */}
        {totalChip ? (
          <Badge
            variant="outline"
            className="px-1.5 font-mono text-[10px] tabular-nums text-zinc-500 dark:text-zinc-400"
            title={
              isFiniteNumber(timings?.embed_ms) &&
              isFiniteNumber(timings?.faiss_search_ms)
                ? `embed ${Math.round(timings.embed_ms)} ms · FAISS ${Math.round(timings.faiss_search_ms)} ms`
                : "end-to-end latency"
            }
          >
            {totalChip}
            {llmChip ? <span className="ml-1 opacity-70">· {llmChip}</span> : null}
          </Badge>
        ) : null}
      </div>

      {open ? (
        <div
          id={summaryId}
          className="mt-1.5 space-y-2 rounded-lg border border-zinc-200/80 bg-zinc-50/70 p-2.5 dark:border-zinc-800 dark:bg-zinc-900/50"
        >
          {/* escalate: rule trace with tooltips */}
          {isEscalate ? (
            <div className="min-w-0">
              <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Rules fired
              </p>
              <div className="mt-1 flex flex-wrap gap-1">
                {reasons.length === 0 ? (
                  <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    No rule detail persisted for this turn.
                  </span>
                ) : (
                  reasons.map((reason, index) => (
                    <Badge
                      key={`${reason.rule ?? index}-${index}`}
                      className="border-amber-200 bg-amber-50 px-1.5 font-mono text-[10px] text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
                      title={reason.detail ?? reason.name ?? reason.rule ?? ""}
                    >
                      {reason.rule ?? "—"}{" "}
                      <span className="font-sans font-normal">
                        {reason.name ?? ""}
                      </span>
                    </Badge>
                  ))
                )}
              </div>
              {meta.handoff?.note_for_agent ? (
                <p className="mt-1.5 text-[11px] leading-relaxed text-amber-800/90 dark:text-amber-300/80">
                  {meta.handoff.note_for_agent}
                </p>
              ) : null}
              {evidence.length > 0 ? (
                <EvidenceList evidence={evidence} labelFor="review" />
              ) : null}
            </div>
          ) : (
            <>
              {/* auto: the evidence the reply was grounded in */}
              <EvidenceList evidence={evidence} labelFor="grounding" />
              <AutoScoresLine message={message} />
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Auto path: scores line                                              */
/* ------------------------------------------------------------------ */

function AutoScoresLine({ message }: { message: ChatMessage }) {
  const scores = message.meta?.scores;
  if (!scores) {
    return (
      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
        No reply scores persisted for this turn.
      </p>
    );
  }
  const chips: string[] = [];
  if (isFiniteNumber(scores.grounding_overlap)) {
    chips.push(
      `grounding overlap ${Math.round(scores.grounding_overlap * 100)}%`,
    );
  }
  if (scores.framing_compliant !== undefined) {
    chips.push(`framing ${scores.framing_compliant ? "✓" : "✗"}`);
  }
  if (isFiniteNumber(scores.length_chars)) {
    chips.push(`${scores.length_chars} chars`);
  }
  if (scores.unsupported_specifics && scores.unsupported_specifics.length > 0) {
    chips.push(
      `unsupported: ${scores.unsupported_specifics.join(", ")}`,
    );
  }
  return (
    <p
      className={cn(
        "font-mono text-[10px] tabular-nums leading-relaxed",
        chips.length > 0
          ? "text-zinc-500 dark:text-zinc-400"
          : "text-zinc-400 dark:text-zinc-500",
      )}
      title="same transparent heuristics as the Phase 5 demo"
    >
      {chips.length > 0 ? chips.join(" · ") : "no scores for this turn"}
    </p>
  );
}

/* ------------------------------------------------------------------ */
/* Evidence list (auto grounding / escalate review)                    */
/* ------------------------------------------------------------------ */

function EvidenceList({
  evidence,
  labelFor,
}: {
  evidence: ChatEvidenceItem[];
  labelFor: "grounding" | "review";
}) {
  if (evidence.length === 0) return null;
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {labelFor === "grounding"
          ? `Grounded in ${evidence.length} similar case${evidence.length === 1 ? "" : "s"}`
          : `Evidence for review (${evidence.length})`}
      </p>
      <ul className="mt-1 space-y-1.5">
        {evidence.map((item, index) => (
          <EvidenceRow
            key={item.pair_id ?? `${item.rank ?? "r"}-${index}`}
            item={item}
          />
        ))}
      </ul>
    </div>
  );
}

function EvidenceRow({ item }: { item: ChatEvidenceItem }) {
  const [expanded, setExpanded] = useState(false);
  const intent = item.predicted_intent;
  const confidence = item.predicted_confidence;

  return (
    <li className="min-w-0 rounded-md border border-zinc-200/70 bg-white/70 p-2 dark:border-zinc-800 dark:bg-zinc-900/60">
      <div className="flex flex-wrap items-center gap-1">
        <Badge
          variant="outline"
          className="px-1 font-mono text-[10px] tabular-nums"
          title="rank by cosine similarity"
        >
          #{item.rank ?? "—"}
        </Badge>
        {isFiniteNumber(item.score) ? (
          <Badge
            variant="outline"
            className="px-1 font-mono text-[10px] tabular-nums text-emerald-700 dark:text-emerald-300"
            title="cosine similarity"
          >
            {item.score.toFixed(2)}
          </Badge>
        ) : null}
        {intent ? (
          <Badge
            variant="outline"
            className="px-1 font-mono text-[10px] text-zinc-600 dark:text-zinc-300"
            title={intentName(intent)}
          >
            {intent}
            {isFiniteNumber(confidence) ? (
              <span className="tabular-nums opacity-70">
                {" "}
                {Math.round(confidence * 100)}%
              </span>
            ) : null}
          </Badge>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        className="mt-1 w-full text-left focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-emerald-600"
      >
        <p
          className={cn(
            "text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-300",
            !expanded && "line-clamp-2",
          )}
        >
          <span className="sr-only">Historical customer message: </span>
          {item.customer_message ?? "—"}
        </p>
        <p
          className={cn(
            "mt-0.5 text-[11px] italic leading-relaxed text-zinc-500 dark:text-zinc-400",
            !expanded && "line-clamp-2",
          )}
        >
          <span className="sr-only">Historical AppleSupport reply: </span>
          {item.support_response ?? "—"}
        </p>
        <span className="mt-0.5 inline-block text-[10px] font-medium text-zinc-400 underline decoration-dotted underline-offset-2 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300">
          {expanded ? "show less" : "show more"}
        </span>
      </button>
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Typing indicator                                                    */
/* ------------------------------------------------------------------ */

export function TypingIndicator() {
  return (
    <div className="flex items-start gap-2" role="status" aria-live="polite">
      <span className="sr-only">The agent is checking evidence…</span>
      <span
        aria-hidden="true"
        className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200/70 dark:bg-emerald-900/40 dark:text-emerald-300 dark:ring-emerald-800/60"
      >
        <Bot className="size-4" />
      </span>
      <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-md border border-zinc-200 bg-zinc-100 px-3.5 py-3 dark:border-zinc-800 dark:bg-zinc-900">
        <span className="agent-dot size-1.5 rounded-full bg-zinc-400 dark:bg-zinc-500" />
        <span
          className="agent-dot size-1.5 rounded-full bg-zinc-400 dark:bg-zinc-500"
          style={{ animationDelay: "0.15s" }}
        />
        <span
          className="agent-dot size-1.5 rounded-full bg-zinc-400 dark:bg-zinc-500"
          style={{ animationDelay: "0.3s" }}
        />
        <span className="ml-1 text-[11px] text-zinc-500 dark:text-zinc-400">
          checking evidence…
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Empty state (welcome + suggestion chips)                            */
/* ------------------------------------------------------------------ */

export function EmptyConversation({
  onPickExample,
  corpusSize,
}: {
  onPickExample: (text: string) => void;
  /** live pairs count from the service health — falls back to a neutral copy */
  corpusSize?: number;
}) {
  const pairs =
    corpusSize && corpusSize > 0
      ? corpusSize.toLocaleString("en-US")
      : "thousands of";
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-3 py-6 text-center">
      <span
        aria-hidden="true"
        className="flex size-11 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-md shadow-emerald-600/25 dark:bg-emerald-500"
      >
        <Bot className="size-5" />
      </span>
      <div className="max-w-[19rem] space-y-2">
        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Hi! I&apos;m the Apple Support AI agent.
        </p>
        <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
          Every reply I draft is grounded in {pairs} historical support
          conversations, and a safety policy decides whether I may answer or
          must hand you to a human.
        </p>
      </div>
      <div className="flex max-w-[21rem] flex-wrap justify-center gap-1.5">
        {CHAT_EXAMPLE_MESSAGES.map((example) => (
          <button
            key={example}
            type="button"
            className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-left text-[11px] leading-relaxed text-zinc-600 transition-colors hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:border-emerald-800 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-300"
            onClick={() => onPickExample(example)}
          >
            {example}
          </button>
        ))}
      </div>
      <p className="max-w-[19rem] text-[10px] leading-relaxed text-zinc-400 dark:text-zinc-500">
        The first two get evidence-grounded answers; the others demo the
        safety policy — account, billing and order topics hand off to a human
        by design.
      </p>
    </div>
  );
}
