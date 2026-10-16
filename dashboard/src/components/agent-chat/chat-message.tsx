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
  type ChatWebResearch,
  type ChatWebSource,
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
  const ackKind = meta.handoff?.ack_kind;

  /* The escalation note above the bubble is kind-aware: a greeting gets no
     ceremony (the reply reads like a normal human greeting), other kinds get
     one honest line about what was sent and what a human takes over. */
  const handoffNote =
    !isEscalate || ackKind === "greeting"
      ? null
      : ackKind === "researched"
        ? "Researched from live web sources (official pages, Reddit, Twitter/X, forums) — a human specialist follows up in DMs for anything account-specific:"
        : ackKind === "self_service"
          ? "Self-service options sent · a human specialist will follow up in DMs for anything account-specific:"
          : ackKind === "clarify"
            ? "Gathering a few details first so we can help accurately:"
            : ackKind === "secure_continue"
              ? "Human handoff · secure reply sent:"
              : "Human handoff · safe reply sent:";

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
          {/* escalate: kind-aware handoff note ABOVE the bubble */}
          {handoffNote ? (
            <div
              className={cn(
                "rounded-lg border-l-2 px-2.5 py-1.5 text-[11px] leading-relaxed",
                ackKind === "researched"
                  ? "border-teal-500 bg-teal-50 text-teal-800 dark:border-teal-600 dark:bg-teal-950/40 dark:text-teal-300"
                  : "border-amber-400 bg-amber-50 text-amber-800 dark:border-amber-500 dark:bg-amber-950/40 dark:text-amber-300",
              )}
            >
              <span className="font-medium">{handoffNote}</span>
              {reasons.length > 0 ? (
                <span className="ml-1 opacity-80">
                  (policy{" "}
                  <span className="font-mono text-[10px]">
                    {reasons
                      .map((reason) => reason.rule ?? "?")
                      .join(" · ")}
                  </span>
                  )
                </span>
              ) : null}
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
  const ackKind = meta.handoff?.ack_kind;
  const reasons: ChatPolicyReason[] =
    meta.handoff?.reasons ?? meta.policy?.reasons ?? [];

  const totalChip = isFiniteNumber(timings?.total_ms)
    ? `${(timings.total_ms / 1000).toFixed(1)}s`
    : null;
  const llmChip = isFiniteNumber(timings?.llm_ms)
    ? isEscalate && !(timings.llm_ms > 0)
      ? "0 LLM calls"
      : `LLM ${(timings.llm_ms / 1000).toFixed(1)}s`
    : null;
  const webChip = isFiniteNumber(timings?.web_research_ms)
    ? `web ${Math.round(timings.web_research_ms / 100) / 10}s`
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
          ackKind === "researched" ? (
            <Badge
                           className="gap-1 border-teal-200 bg-teal-50 px-1.5 text-[10px] font-medium text-teal-800 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-300"
              title={meta.reply_status ?? "researched_reply"}
            >
              Web-researched answer · sources cited
            </Badge>
          ) : (
            <Badge
              className="gap-1 border-amber-200 bg-amber-50 px-1.5 text-[10px] font-medium text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
              title={meta.reply_status ?? "handoff_acknowledgment"}
            >
              {meta.handoff?.ack_kind === "greeting" ||
              meta.handoff?.ack_kind === "clarify"
                ? "Gathering details · reply sent"
                : meta.handoff?.ack_kind === "self_service"
                  ? "Human handoff · self-service reply sent"
                  : "Human handoff · secure reply sent"}
            </Badge>
          )
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
              intent.arbitration
                ? `${intent.arbitration}${
                    intent.logreg_label
                      ? ` — logreg head said ${intent.logreg_label}${
                          isFiniteNumber(intent.logreg_confidence)
                            ? ` (${intent.logreg_confidence.toFixed(2)})`
                            : ""
                        }`
                      : intent.lexical_label
                        ? ` — lexical head said ${intent.lexical_label}`
                        : ""
                  }`
                : intent.runner_up
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
                ? `embed ${Math.round(timings.embed_ms)} ms · FAISS ${Math.round(timings.faiss_search_ms)} ms${
                    isFiniteNumber(timings?.web_research_ms)
                      ? ` · live web research ${Math.round(timings.web_research_ms)} ms`
                      : ""
                  }`
                : isFiniteNumber(timings?.web_research_ms)
                  ? `live web research ${Math.round(timings.web_research_ms)} ms`
                  : "end-to-end latency"
            }
          >
            {totalChip}
            {llmChip ? <span className="ml-1 opacity-70">· {llmChip}</span> : null}
            {webChip ? <span className="ml-1 opacity-70">· {webChip}</span> : null}
          </Badge>
        ) : null}
      </div>

      {open ? (
        <div
          id={summaryId}
          className="mt-1.5 space-y-2 rounded-lg border border-zinc-200/80 bg-zinc-50/70 p-2.5 dark:border-zinc-800 dark:bg-zinc-900/50"
        >
          {/* live web sources (both paths — the open-web grounding) */}
          <WebSourcesList research={meta.web_research} />

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
        {item.source ? (
          <Badge
            variant="outline"
            className={
              item.source === "curated"
                ? "px-1 font-mono text-[10px] text-amber-700 dark:text-amber-300"
                : "px-1 font-mono text-[10px] text-zinc-500 dark:text-zinc-400"
            }
            title={
              item.source === "curated"
                ? "bundled curated corpus — complete, self-contained guidance (steps and links included)"
                : "real twcs dataset match — original reply had its link stripped during extraction"
            }
          >
            {item.source === "curated" ? "curated" : "twcs"}
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
/* Live web sources (open-web grounding — both paths)                  */
/* ------------------------------------------------------------------ */

const WEB_KIND_META: Record<
  string,
  { label: string; chip: string; dot: string }
> = {
  official: {
    label: "Official",
    chip: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
    dot: "bg-emerald-500",
  },
  reddit: {
    label: "Reddit",
    chip: "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-300",
    dot: "bg-orange-500",
  },
  twitter: {
    label: "Twitter/X",
    chip: "border-zinc-300 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
    dot: "bg-zinc-500",
  },
  forum: {
    label: "Forum",
    chip: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
    dot: "bg-amber-500",
  },
  web: {
    label: "Web",
    chip: "border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400",
    dot: "bg-zinc-400",
  },
};

function WebSourcesList({
  research,
}: {
  research: ChatWebResearch | null | undefined;
}) {
  const sources = research?.sources ?? [];
  if (!research || sources.length === 0) return null;
  const searchSeconds =
    isFiniteNumber(research.search_ms) || isFiniteNumber(research.read_ms)
      ? `${(((research.search_ms ?? 0) + (research.read_ms ?? 0)) / 1000).toFixed(1)}s`
      : null;
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Researched live from {sources.length} web source
        {sources.length === 1 ? "" : "s"}
        {searchSeconds ? (
          <span className="ml-1 font-mono normal-case text-zinc-400 dark:text-zinc-500">
            · {searchSeconds}
          </span>
        ) : null}
      </p>
      <ul className="mt-1 space-y-1.5">
        {sources.map((source, index) => (
          <WebSourceRow
            key={`${source.url ?? index}-${index}`}
            source={source}
          />
        ))}
      </ul>
      {research.queries && research.queries.length > 0 ? (
        <p
          className="mt-1.5 font-mono text-[10px] leading-relaxed text-zinc-400 dark:text-zinc-500"
          title="the search queries the agent ran for this turn"
        >
          queries: {research.queries.map((q) => `"${q}"`).join(", ")}
        </p>
      ) : null}
    </div>
  );
}

function WebSourceRow({ source }: { source: ChatWebSource }) {
  const [expanded, setExpanded] = useState(false);
  const kind = WEB_KIND_META[source.kind ?? "web"] ?? WEB_KIND_META.web;
  const body = source.extracted ?? source.snippet ?? "";
  const host = (source.host ?? "").replace(/^www\./, "");

  return (
    <li className="min-w-0 rounded-md border border-zinc-200/70 bg-white/70 p-2 dark:border-zinc-800 dark:bg-zinc-900/60">
      <div className="flex flex-wrap items-center gap-1">
        <Badge
          variant="outline"
          className={`gap-1 px-1 font-mono text-[10px] ${kind.chip}`}
          title={`${kind.label} source${
            source.kind === "official"
              ? " — official Apple guidance page"
              : source.kind === "reddit"
                ? " — community thread (Reddit)"
                : source.kind === "twitter"
                  ? " — post/thread on Twitter/X"
                  : source.kind === "forum"
                    ? " — community discussion forum"
                    : " — general web result"
          }`}
        >
          <span
            aria-hidden="true"
            className={`size-1.5 rounded-full ${kind.dot}`}
          />
          {kind.label}
        </Badge>
        <span className="min-w-0 truncate font-mono text-[10px] text-zinc-500 dark:text-zinc-400">
          {host || "web"}
          {source.date ? (
            <span className="opacity-70"> · {source.date}</span>
          ) : null}
        </span>
      </div>
      {source.url ? (
        <a
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 block truncate text-[11px] font-medium leading-relaxed text-teal-700 underline decoration-teal-300 underline-offset-2 transition-colors hover:text-teal-800 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-teal-600 dark:text-teal-300 dark:decoration-teal-700 dark:hover:text-teal-200"
          title={source.title ?? source.url}
        >
          {source.title || source.url}
        </a>
      ) : (
        <p className="mt-1 truncate text-[11px] font-medium leading-relaxed text-zinc-700 dark:text-zinc-300">
          {source.title ?? "—"}
        </p>
      )}
      {body ? (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          className="mt-0.5 w-full text-left focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-teal-600"
        >
          <p
            className={cn(
              "text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-400",
              !expanded && "line-clamp-2",
            )}
          >
            <span className="sr-only">Source content: </span>
            {body}
          </p>
          <span className="mt-0.5 inline-block text-[10px] font-medium text-zinc-400 underline decoration-dotted underline-offset-2 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300">
            {expanded ? "show less" : "show more"}
          </span>
        </button>
      ) : null}
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Typing indicator                                                    */
/* ------------------------------------------------------------------ */

export function TypingIndicator() {
  return (
    <div className="flex items-start gap-2" role="status" aria-live="polite">
      <span className="sr-only">The agent is researching the web…</span>
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
          researching the web + evidence…
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
          conversations, and — when the question needs current or public
          knowledge — I research the live web (official Apple pages, Reddit,
          Twitter/X, forums) and cite my sources. A safety policy still guards
          every send.
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
        The first two get evidence-grounded answers with live web references;
        the others demo the safety policy — account, billing and order topics
        get a web-researched self-service answer plus a human follow-up in DMs
        by design.
      </p>
    </div>
  );
}
