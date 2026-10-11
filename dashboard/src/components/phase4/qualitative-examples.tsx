import { MessagesSquare } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SubsectionHeading } from "@/components/phase2/subsection-heading";
import { orDash } from "@/lib/phase1";
import { formatScore } from "@/lib/phase2";
import { intentName, type Phase4QualitativeExample } from "@/lib/phase4";
import { cn } from "@/lib/utils";

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

interface QualitativeExamplesProps {
  examples: Phase4QualitativeExample[];
}

/**
 * Subsection F — five worked retrieval examples, straight from the artifact:
 * the golden opener, the outcome badge, and the top-1 retrieved pair with
 * its cosine score, predicted intent and both message halves. Where the
 * top-1's predicted intent differs from the golden label, that difference is
 * annotated rather than smoothed over — the label noise the relevance
 * definition discloses is visible here case by case.
 */
export function QualitativeExamples({ examples }: QualitativeExamplesProps) {
  const hits = examples.filter((example) => example.outcome === "hit").length;

  return (
    <section
      aria-labelledby="phase4-examples-heading"
      className="space-y-4"
    >
      <SubsectionHeading
        id="phase4-examples-heading"
        icon={MessagesSquare}
        title="Five retrievals, read with your own eyes"
        description="Label-agreement numbers hide what the neighbours actually look like — these examples show the query, the top-1 historical pair and how similar they really are."
      />

      <Card className="gap-0">
        <CardHeader className="border-b">
          <CardTitle className="text-sm">
            Golden test openers → their nearest historical evidence
          </CardTitle>
          <CardDescription className="text-xs">
            {examples.length > 0
              ? `${hits} of ${examples.length} shown examples are hits within the retrieved top-K; where the top-1 shows a different intent, the hit landed at a lower rank (or is a near-miss worth judging yourself).`
              : "No qualitative examples available."}
          </CardDescription>
        </CardHeader>
        <CardContent className="mt-4">
          {examples.length === 0 ? (
            <p className="py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
              No qualitative examples available.
            </p>
          ) : (
            <div className="max-h-96 space-y-3 overflow-y-auto pr-1 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-zinc-300 dark:[&::-webkit-scrollbar-thumb]:bg-zinc-700 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-zinc-100 dark:[&::-webkit-scrollbar-track]:bg-zinc-800/80">
              {examples.map((example, index) => (
                <ExampleRow key={index} example={example} />
              ))}
            </div>
          )}
          <p className="mt-3 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
            Customer messages and AppleSupport replies are quoted verbatim
            from the 2017-era historical corpus (profanity included) — they are
            evidence of what was actually retrieved, not curated examples.
          </p>
        </CardContent>
      </Card>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* One worked example                                                  */
/* ------------------------------------------------------------------ */

function ExampleRow({ example }: { example: Phase4QualitativeExample }) {
  const top1 = example.top1 ?? {};
  const isHit = example.outcome === "hit";
  /* Derived, honest annotation: does the top-1's predicted intent itself
     match the golden label (a rank-1 label hit), or did the counted hit
     land at a lower rank / disagree at rank 1? */
  const top1MatchesGolden =
    top1.predicted_label !== undefined &&
    top1.predicted_label === example.golden_label;

  return (
    <article className="min-w-0 rounded-lg border border-zinc-100 bg-zinc-50/60 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge
          className={cn(
            "text-[10px]",
            isHit
              ? "border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
              : "border-rose-200 bg-rose-100 text-rose-700 dark:border-rose-900 dark:bg-rose-950/60 dark:text-rose-300",
          )}
          title={`outcome: ${orDash(example.outcome)}`}
        >
          {isHit ? "hit" : example.outcome ? "no hit" : "—"}
        </Badge>
        <Badge
          variant="outline"
          className="text-[10px] font-mono"
          title={`golden intent: ${intentName(example.golden_label)} (${orDash(example.golden_label)})`}
        >
          golden: {orDash(example.golden_label)}
        </Badge>
        {isFiniteNumber(top1.score) ? (
          <Badge
            variant="outline"
            className="ml-auto font-mono text-[10px] tabular-nums"
            title="cosine similarity between the opener and the top-1 retrieved pair"
          >
            top-1 cos {formatScore(top1.score)}
          </Badge>
        ) : null}
      </div>

      <blockquote className="mt-2 border-l-2 border-zinc-200 pl-2.5 text-xs leading-relaxed text-zinc-700 dark:border-zinc-700 dark:text-zinc-300">
        <span className="sr-only">Query (golden test opener): </span>
        &ldquo;{orDash(example.query)}&rdquo;
      </blockquote>

      <div className="mt-2.5 rounded-lg border border-zinc-200/70 bg-white/70 p-2.5 dark:border-zinc-700/60 dark:bg-zinc-950/40">
        <p className="flex flex-wrap items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Top-1 retrieved pair
          <span
            className={cn(
              "rounded-full border px-1.5 py-px font-mono text-[9px] font-semibold normal-case tracking-normal",
              top1MatchesGolden
                ? "border-emerald-300 bg-emerald-100 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                : "border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400",
            )}
            title={`predicted intent: ${intentName(top1.predicted_label)} (${orDash(top1.predicted_label)})`}
          >
            {orDash(top1.predicted_label)}
          </span>
          {!top1MatchesGolden && example.outcome === "hit" ? (
            <span className="normal-case font-normal tracking-normal text-amber-600 dark:text-amber-400">
              — hit landed at a lower rank, top-1 intent differs
            </span>
          ) : null}
          {!top1MatchesGolden && example.outcome !== "hit" ? (
            <span className="normal-case font-normal tracking-normal text-rose-600 dark:text-rose-400">
              — top-1 intent differs from golden
            </span>
          ) : null}
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-zinc-700 dark:text-zinc-300">
          <span className="sr-only">Historical customer message: </span>
          {orDash(top1.customer_message)}
        </p>
        <blockquote className="mt-2 border-l-2 border-emerald-300/70 pl-2.5 text-xs italic leading-relaxed text-zinc-600 dark:border-emerald-700/60 dark:text-zinc-400">
          <span className="sr-only">Historical AppleSupport reply: </span>
          {orDash(top1.support_response)}
        </blockquote>
      </div>
    </article>
  );
}
