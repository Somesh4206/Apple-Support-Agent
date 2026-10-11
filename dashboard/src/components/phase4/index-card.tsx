import {
  Database,
  Dices,
  HardDrive,
  Layers,
  ShieldCheck,
  Timer,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SubsectionHeading } from "@/components/phase2/subsection-heading";
import { formatFloat, formatInt, orDash } from "@/lib/phase1";
import type { Phase4Corpus, Phase4EmbeddingModel } from "@/lib/phase4";

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

interface IndexCardProps {
  corpus: Phase4Corpus;
  model: Phase4EmbeddingModel;
  seed: number | undefined;
}

/**
 * Subsection A — the evidence index: how many historical pairs are embedded,
 * which encoder was reused, what FAISS index type holds them, and the golden
 * isolation that guarantees evaluation openers can never retrieve their own
 * conversations. All values render straight from phase4_summary.json
 * (the excluded-pair count is derived from total − indexed, never asserted).
 */
export function IndexCard({ corpus, model, seed }: IndexCardProps) {
  /* 106,137 − 105,871 = 266 golden-conversation pairs excluded — derived
     from the artifact's own numbers, never hardcoded. */
  const totalPairs = corpus.total_pairs;
  const indexedPairs = corpus.indexed_pairs;
  const excludedPairs =
    isFiniteNumber(totalPairs) && isFiniteNumber(indexedPairs)
      ? totalPairs - indexedPairs
      : undefined;

  /* "22.3M (frozen; retrieval embeds, it never trains)" -> value "22.3M",
     note the parenthesised half; both halves render, never fabricated. */
  const parametersValue = model.parameters?.split("(")[0]?.trim();

  const embedSeconds = corpus.embedding_seconds;
  const embedLabel = isFiniteNumber(embedSeconds)
    ? `≈ ${embedSeconds.toFixed(2)} s`
    : "—";
  const embedSub = corpus.embedding_cache_hit
    ? "served from the embedding cache"
    : "computed fresh for this run";

  const selfCheck = corpus.self_retrieval_check?.toUpperCase();
  const selfCheckPassed = selfCheck === "PASS";

  return (
    <section aria-labelledby="phase4-index-heading" className="space-y-4">
      <SubsectionHeading
        id="phase4-index-heading"
        icon={Database}
        title="The evidence index"
        description="Every historical customer↔support pair from the Phase 1 corpus, embedded once with the same frozen encoder Phase 3 used — then queried by new messages to find the most similar past cases."
      />

      <Card className="gap-0">
        <CardHeader className="border-b">
          <CardTitle className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
            <span className="font-mono text-xs font-semibold text-emerald-700 dark:text-emerald-300">
              {orDash(model.id)}
            </span>
            <span className="text-xs font-normal text-zinc-500 dark:text-zinc-400">
              the same frozen encoder as Phase 3, reused as the retrieval
              embedder
            </span>
          </CardTitle>
          <CardDescription className="text-xs">
            {orDash(parametersValue)} parameters, frozen — retrieval embeds,
            it never trains, so the index is a pure lookup structure over
            historical evidence, not a learned model.
          </CardDescription>
        </CardHeader>
        <CardContent className="mt-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <MiniStat
              icon={Database}
              label="Indexed pairs"
              value={formatInt(indexedPairs)}
              sub="historical evidence pairs"
            />
            <MiniStat
              icon={ShieldCheck}
              label="Golden pairs excluded"
              value={formatInt(excludedPairs)}
              sub={`pairs from the ${formatInt(corpus.golden_excluded)} golden conversations`}
            />
            <MiniStat
              icon={Layers}
              label="Embedding"
              value={
                isFiniteNumber(model.dim) ? `${formatInt(model.dim)}-d` : "—"
              }
              sub="one vector per customer message"
            />
            <MiniStat
              icon={HardDrive}
              label="Index size"
              value={
                isFiniteNumber(corpus.index_size_mb)
                  ? `${corpus.index_size_mb.toFixed(1)} MB`
                  : "—"
              }
              sub="faiss.IndexFlatIP (exact cosine)"
            />
            <MiniStat
              icon={Timer}
              label="Embed corpus"
              value={embedLabel}
              sub={embedSub}
            />
            <MiniStat
              icon={Timer}
              label="Build index"
              value={
                isFiniteNumber(corpus.index_build_seconds)
                  ? `${corpus.index_build_seconds.toFixed(2)} s`
                  : "—"
              }
              sub={`embedded field: ${orDash(corpus.embedded_field)}`}
            />
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <div className="min-w-0 rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 dark:border-emerald-900/60 dark:bg-emerald-950/20">
              <p className="flex flex-wrap items-center gap-2 text-xs font-medium text-emerald-900 dark:text-emerald-200">
                <ShieldCheck
                  className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                  aria-hidden="true"
                />
                Golden isolation — why {formatInt(excludedPairs)} pairs are
                missing
              </p>
              <p className="mt-1.5 text-[11px] leading-relaxed text-emerald-900/80 dark:text-emerald-300/80">
                {formatInt(totalPairs)} total evidence pairs were embedded, but
                every pair belonging to the {formatInt(corpus.golden_excluded)}{" "}
                golden conversations was dropped before indexing — leaving{" "}
                {formatInt(indexedPairs)} searchable pairs. Without this, a
                golden evaluation opener could retrieve its own conversation
                and score a trivially perfect hit; with it, every retrieved
                neighbour is genuine historical evidence the evaluation never
                saw.
              </p>
            </div>
            <div className="min-w-0 rounded-lg border border-zinc-100 bg-zinc-50/60 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
              <p className="flex flex-wrap items-center gap-2 text-xs font-medium text-zinc-700 dark:text-zinc-300">
                <Dices
                  className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                  aria-hidden="true"
                />
                Reproducibility
              </p>
              <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-400">
                <span>
                  Random seed:{" "}
                  <span className="font-mono font-semibold tabular-nums">
                    {orDash(String(seed ?? ""))}
                  </span>
                </span>
                <span>Runtime: {orDash(model.runtime)}</span>
                <span className="flex flex-wrap items-center gap-1.5">
                  Self-retrieval check:
                  {selfCheckPassed ? (
                    <Badge className="border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                      {selfCheck}
                    </Badge>
                  ) : (
                    <Badge className="border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
                      {orDash(corpus.self_retrieval_check)}
                    </Badge>
                  )}
                </span>
              </p>
              <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                The self-retrieval check re-queries each indexed vector and
                expects itself back at rank 1 — a build-integrity guard for the{" "}
                {isFiniteNumber(corpus.index_size_mb)
                  ? `${formatFloat(corpus.index_size_mb, 1)} MB`
                  : "—"}{" "}
                exact index.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function MiniStat({
  icon: Icon,
  label,
  value,
  sub,
  valueTitle,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string;
  valueTitle?: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-zinc-100 bg-zinc-50/60 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        <Icon
          className="size-3 shrink-0 text-emerald-600 dark:text-emerald-400"
          aria-hidden="true"
        />
        <span className="truncate">{label}</span>
      </div>
      <p
        className="mt-1 truncate text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-100"
        title={valueTitle ?? value}
      >
        {value}
      </p>
      {sub ? (
        <p
          className="mt-0.5 text-[10px] leading-relaxed text-zinc-500 dark:text-zinc-400"
          title={sub}
        >
          {sub}
        </p>
      ) : null}
    </div>
  );
}
