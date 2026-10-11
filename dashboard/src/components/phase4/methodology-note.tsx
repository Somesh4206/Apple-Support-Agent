import { ScrollText } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SubsectionHeading } from "@/components/phase2/subsection-heading";
import { orDash } from "@/lib/phase1";

interface MethodologyNoteProps {
  /** the verbatim relevance definition from phase4_summary.json */
  definition: string | undefined;
}

/**
 * Subsection C — the relevance definition, verbatim from the artifact, plus
 * the honest caveat that keeps the numbers interpretable: the corpus is
 * unlabeled, so retrieved pairs carry Phase 3 head predictions, and that
 * classifier noise is part of the measurement rather than something hidden.
 */
export function MethodologyNote({ definition }: MethodologyNoteProps) {
  return (
    <section aria-labelledby="phase4-methodology-heading" className="space-y-4">
      <SubsectionHeading
        id="phase4-methodology-heading"
        icon={ScrollText}
        title="What counts as a hit — the relevance definition"
        description="Retrieval needs a relevance rule before Recall@K means anything. This is the one the evaluation uses, exactly as written to the artifact."
      />

      <Card className="gap-0">
        <CardHeader className="border-b">
          <CardTitle className="text-sm">
            Predicted-label agreement, with the noise reported
          </CardTitle>
          <CardDescription className="text-xs">
            The corpus is unlabeled — the definition had to choose a proxy, and
            the proxy&apos;s error rate is stated inside the definition itself.
          </CardDescription>
        </CardHeader>
        <CardContent className="mt-4">
          <blockquote className="min-w-0 rounded-lg border border-zinc-200/80 bg-zinc-100/60 px-3 py-2.5 text-xs leading-relaxed text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
            <span className="sr-only">Relevance definition: </span>
            {orDash(definition)}
          </blockquote>
          <p className="mt-3 flex items-start gap-2 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
            <ScrollText
              className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
              aria-hidden="true"
            />
            Read this before judging the bars above: corpus labels come from the
            Phase 3 logreg head, whose own test error is baked into every
            &ldquo;hit&rdquo; and &ldquo;miss&rdquo;. A retrieved pair can be
            semantically perfect yet count as a miss because the head mislabeled
            it — which is exactly why the qualitative examples below (and the
            live demo) let you judge similarity directly, with your own eyes,
            instead of trusting the label pipeline end-to-end.
          </p>
        </CardContent>
      </Card>
    </section>
  );
}
