"use client";

import { useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  MessagesSquare,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SubsectionHeading } from "@/components/phase2/subsection-heading";
import { formatInt, orDash } from "@/lib/phase1";
import { formatScore } from "@/lib/phase2";
import {
  CUSTOM_SCROLLBAR,
  intentName,
  type Phase5Config,
  type Phase5EvidenceItem,
  type Phase5QualitativeExample,
} from "@/lib/phase5";
import { cn } from "@/lib/utils";

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

interface QualitativeExamplesProps {
  examples: Phase5QualitativeExample[];
  /** the run's gate thresholds, for the pass/fail context labels */
  config: Phase5Config | undefined;
}

/**
 * Subsection E — five worked generation examples, field-exact from the
 * artifact: the golden opener, the predicted intent and gates, the generated
 * reply itself (the main content), its heuristic scores, and the three
 * historical evidence pairs behind it, collapsible per example. The recorded
 * run lists them lowest → highest grounding overlap.
 */
export function QualitativeExamples({
  examples,
  config,
}: QualitativeExamplesProps) {
  const intentThreshold = config?.intent_confidence_threshold;
  const retrievalThreshold = config?.retrieval_threshold;

  return (
    <section
      aria-labelledby="phase5-examples-heading"
      className="space-y-4"
    >
      <SubsectionHeading
        id="phase5-examples-heading"
        icon={MessagesSquare}
        title="Five generated replies, read with your own eyes"
        description="Grounding percentages hide what a reply actually says — these examples show the opener, the gates, the drafted reply, its scores and the historical evidence behind it."
      />

      <Card className="gap-0">
        <CardHeader className="border-b">
          <CardTitle className="text-sm">
            Golden test openers → their grounded replies
          </CardTitle>
          <CardDescription className="text-xs">
            {examples.length > 0
              ? "Ordered lowest → highest grounding overlap, as recorded. Profanity in the openers is quoted verbatim — they are the real golden evaluation set."
              : "No qualitative examples available."}
          </CardDescription>
        </CardHeader>
        <CardContent className="mt-4 space-y-4">
          {examples.length === 0 ? (
            <p className="py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
              No qualitative examples available.
            </p>
          ) : (
            examples.map((example, index) => (
              <ExampleCard
                key={index}
                example={example}
                index={index + 1}
                intentThreshold={intentThreshold}
                retrievalThreshold={retrievalThreshold}
              />
            ))
          )}
        </CardContent>
      </Card>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* One worked example                                                  */
/* ------------------------------------------------------------------ */

function ExampleCard({
  example,
  index,
  intentThreshold,
  retrievalThreshold,
}: {
  example: Phase5QualitativeExample;
  index: number;
  intentThreshold: number | undefined;
  retrievalThreshold: number | undefined;
}) {
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const gates = example.gates ?? {};
  const scores = example.scores ?? {};
  const evidence = example.evidence_top3 ?? [];
  const grounding =
    example.grounding_overlap ?? scores.grounding_overlap;
  const unsupported = scores.unsupported_specifics ?? [];

  return (
    <article className="min-w-0 rounded-lg border border-zinc-100 bg-zinc-50/60 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
      {/* -------- the golden opener -------- */}
      <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Example {formatInt(index)} — golden test opener
      </p>
      <blockquote className="mt-1 border-l-2 border-zinc-200 pl-2.5 text-xs leading-relaxed text-zinc-700 dark:border-zinc-700 dark:text-zinc-300">
        <span className="sr-only">Customer message: </span>
        &ldquo;{orDash(example.message)}&rdquo;
      </blockquote>

      {/* -------- intent chips -------- */}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <Badge
          variant="outline"
          className="text-[10px] font-mono"
          title={`golden intent: ${intentName(example.golden_label)} (${orDash(example.golden_label)})`}
        >
          golden: {orDash(example.golden_label)}
        </Badge>
        <Badge
          className="border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
          title={`predicted intent (Phase 3 head): ${intentName(example.predicted_intent)} (${orDash(example.predicted_intent)})`}
        >
          {intentName(example.predicted_intent)}
          {isFiniteNumber(example.intent_confidence) ? (
            <span className="ml-1 font-mono tabular-nums">
              {formatScore(example.intent_confidence)}
            </span>
          ) : null}
        </Badge>
        {isFiniteNumber(example.top1_score) ? (
          <Badge
            variant="outline"
            className="font-mono text-[10px] tabular-nums"
            title="top-1 cosine similarity from the Phase 4 index"
          >
            top-1 cos {formatScore(example.top1_score)}
          </Badge>
        ) : null}
        {isFiniteNumber(grounding) ? (
          <Badge
            variant="outline"
            className="ml-auto font-mono text-[10px] tabular-nums"
            title="share of the reply's content tokens present in the evidence"
          >
            grounding {formatScore(grounding)}
          </Badge>
        ) : null}
      </div>

      {/* -------- gates row -------- */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <GateBadge
          pass={gates.intent_pass}
          label="intent gate"
          value={gates.intent_confidence}
          threshold={intentThreshold}
        />
        <GateBadge
          pass={gates.retrieval_pass}
          label="retrieval gate"
          value={gates.top1_score}
          threshold={retrievalThreshold}
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
              : "at least one gate fails — a Phase 6 agent would escalate"
          }
        >
          {gates.auto_handle_eligible === true
            ? "auto-handle eligible"
            : "would escalate"}
        </Badge>
      </div>

      {/* -------- the generated reply — the main content -------- */}
      <div className="mt-3 min-w-0 rounded-lg border border-emerald-200/80 bg-emerald-50/70 p-3 dark:border-emerald-900/60 dark:bg-emerald-950/20">
        <p className="text-[10px] font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
          Generated reply
        </p>
        <blockquote className="mt-1 border-l-2 border-emerald-400/80 pl-2.5 text-sm leading-relaxed text-emerald-950 dark:border-emerald-700/70 dark:text-emerald-100">
          {orDash(example.reply)}
        </blockquote>
      </div>

      {/* -------- scores row -------- */}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {isFiniteNumber(grounding) ? (
          <Badge
            variant="outline"
            className="font-mono text-[10px] tabular-nums"
            title="share of the reply's content tokens present in the evidence"
          >
            grounding {formatScore(grounding)}
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
        {isFiniteNumber(scores.length_chars) ? (
          <Badge
            variant="outline"
            className="font-mono text-[10px] tabular-nums"
            title="reply length in characters (budget 280)"
          >
            {formatInt(scores.length_chars)} chars
          </Badge>
        ) : null}
      </div>

      {/* -------- collapsible evidence -------- */}
      {evidence.length > 0 ? (
        <div className="mt-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-[11px] text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            aria-expanded={evidenceOpen}
            aria-controls={`phase5-example-${index}-evidence`}
            onClick={() => setEvidenceOpen((open) => !open)}
          >
            {evidenceOpen ? (
              <ChevronDown className="size-3.5" aria-hidden="true" />
            ) : (
              <ChevronRight className="size-3.5" aria-hidden="true" />
            )}
            {evidenceOpen ? "Hide" : "Show"} the {formatInt(evidence.length)}{" "}
            historical cases behind this reply
          </Button>
          {evidenceOpen ? (
            <div
              id={`phase5-example-${index}-evidence`}
              className={cn(
                "mt-2 max-h-96 space-y-3 overflow-y-auto pr-1 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800",
                CUSTOM_SCROLLBAR,
              )}
            >
              {evidence.map((item, itemIndex) => (
                <EvidenceRow
                  key={item.pair_id ?? `${item.rank ?? "r"}-${itemIndex}`}
                  item={item}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* Evidence rows — the same styling as the Phase 4 retrieval demo      */
/* ------------------------------------------------------------------ */

function EvidenceRow({ item }: { item: Phase5EvidenceItem }) {
  const score = item.score;
  const width = isFiniteNumber(score)
    ? Math.min(Math.max(score, 0), 1) * 100
    : 0;

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
        {orDash(item.customer_message)}
      </p>
      <blockquote className="mt-2 border-l-2 border-emerald-300/70 pl-2.5 text-xs italic leading-relaxed text-zinc-600 dark:border-emerald-700/60 dark:text-zinc-400">
        <span className="sr-only">Historical AppleSupport reply: </span>
        {orDash(item.support_response)}
      </blockquote>

      <p className="mt-2 font-mono text-[10px] tabular-nums text-zinc-400 dark:text-zinc-500">
        conversation {orDash(item.conversation_id)}
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
      }${isFiniteNumber(threshold) ? ` vs threshold ${threshold.toFixed(2)}` : ""}`}
    >
      {label}{" "}
      {passed ? "✓" : failed ? "✗" : "—"}
      {isFiniteNumber(value) ? (
        <span className="ml-1 font-mono tabular-nums">
          {formatScore(value)}
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
