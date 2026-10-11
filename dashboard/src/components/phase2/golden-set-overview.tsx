import {
  ClipboardCheck,
  Database,
  Dices,
  EyeOff,
  FileJson,
  ListChecks,
  Scissors,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/phase1/stat-card";
import { StackedShareBar } from "@/components/phase1/charts";
import { formatInt, orDash } from "@/lib/phase1";
import { SubsectionHeading } from "@/components/phase2/subsection-heading";
import { type Phase2GoldenSet } from "@/lib/phase2";

interface GoldenSetOverviewProps {
  golden: Phase2GoldenSet;
  /** summary.random_seed — the KPI card needs it */
  seed: number | undefined;
}

/**
 * Subsection B — the golden set: KPI cards (examples / sampling frame /
 * split / seed), the segmented 70/15/15 split bar, the labelling methodology
 * and the historical-window callout (period_note).
 */
export function GoldenSetOverview({ golden, seed }: GoldenSetOverviewProps) {
  const labeling = golden.labeling;
  const train = golden.split_sizes?.train;
  const val = golden.split_sizes?.val;
  const test = golden.split_sizes?.test;
  const splitSummary = `Golden-set split: ${formatInt(train)} train, ${formatInt(
    val,
  )} validation, ${formatInt(test)} test examples — ${orDash(golden.split_strategy)}.`;
  /* Realized ratios computed from the data (142/200 = 71.0% …) so the copy
     can never drift from the artifact. */
  const ratio = (n: number | undefined) =>
    golden.total && typeof n === "number" && golden.total > 0
      ? `${((n / golden.total) * 100).toFixed(1)}%`
      : "—";

  return (
    <section aria-labelledby="phase2-golden-heading" className="space-y-4">
      <SubsectionHeading
        id="phase2-golden-heading"
        icon={ClipboardCheck}
        title="Golden set"
        description="A manually labelled, conversation-level-stratified evaluation set drawn from the Phase 1 sampling frame. All values are rendered from phase2_summary.json."
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          icon={ListChecks}
          label="Golden examples"
          value={formatInt(golden.total)}
          sub="manually labelled openers"
        />
        <StatCard
          icon={Database}
          label="Sampling frame"
          value={formatInt(golden.sampling_frame_size)}
          sub={golden.sampling_frame ?? "customer-initiated openers"}
        />
        <StatCard
          icon={Scissors}
          label="Split 70 / 15 / 15"
          value={`${formatInt(train)} / ${formatInt(val)} / ${formatInt(test)}`}
          sub="train / val / test examples"
        />
        <StatCard
          icon={Dices}
          label="Random seed"
          value={formatInt(seed)}
          sub="reproducible sampling + split"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="min-w-0 gap-0">
          <CardHeader className="border-b">
            <CardTitle className="text-sm">
              Train / validation / test split
            </CardTitle>
            <CardDescription className="text-xs">
              {orDash(golden.split_strategy)}
            </CardDescription>
          </CardHeader>
          <CardContent className="mt-4">
            <StackedShareBar
              segments={[
                {
                  label: "Train",
                  count: train,
                  barClassName: "bg-emerald-600 dark:bg-emerald-500",
                },
                {
                  label: "Validation",
                  count: val,
                  barClassName: "bg-emerald-400 dark:bg-emerald-400",
                },
                {
                  label: "Test",
                  count: test,
                  barClassName: "bg-zinc-400 dark:bg-zinc-500",
                },
              ]}
              srSummary={splitSummary}
            />
            <p className="mt-4 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
              Conversation-level split — every example of one conversation
              lands in the same partition, so no split can “memorise” a thread
              it saw in training. The split is stratified by label with
              per-class rounding to train, which is why the realized ratios
              are {ratio(train)} / {ratio(val)} / {ratio(test)} rather than
              exactly 70 / 15 / 15.
            </p>
          </CardContent>
        </Card>

        <Card className="min-w-0 gap-0">
          <CardHeader className="border-b">
            <CardTitle className="text-sm">Labelling methodology</CardTitle>
            <CardDescription className="text-xs">
              How the 200 golden labels were produced and guarded.
            </CardDescription>
          </CardHeader>
          <CardContent className="mt-4">
            <ul className="space-y-3.5">
              <li className="flex gap-3">
                <ClipboardCheck
                  className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
                    Manual labelling ({orDash(labeling?.method)})
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                    {orDash(labeling?.labeler)}
                  </p>
                </div>
              </li>
              <li className="flex gap-3">
                <EyeOff
                  className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
                    No keyword hints shown
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                    The labelling worksheet shows no keyword hints, so the
                    labels are not biased toward the Phase 1 keyword topics the
                    keyword-rules baseline reuses.
                  </p>
                </div>
              </li>
              <li className="flex gap-3">
                <ShieldCheck
                  className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
                    Automated validation gate
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                    {orDash(labeling?.validation)}
                  </p>
                </div>
              </li>
              <li className="flex gap-3">
                <FileJson
                  className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                  aria-hidden="true"
                />
                <div className="min-w-0 space-y-1">
                  <p className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
                    Isolation manifest &amp; artifacts
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      golden.isolation_manifest,
                      labeling?.worksheet,
                      labeling?.labels_file,
                    ]
                      .filter((path): path is string => Boolean(path?.trim()))
                      .map((path) => (
                        <code
                          key={path}
                          className="rounded-md bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] text-zinc-600 ring-1 ring-zinc-200/70 dark:bg-zinc-900 dark:text-zinc-300 dark:ring-zinc-800"
                        >
                          {path}
                        </code>
                      ))}
                  </div>
                  <p className="mt-0.5 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                    Golden conversation ids are recorded in an isolation
                    manifest so later phases can exclude them from any
                    retrieval corpus.
                  </p>
                </div>
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>

      <Alert className="border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-200">
        <TriangleAlert className="size-4" aria-hidden="true" />
        <AlertTitle>Metrics measure a historical window</AlertTitle>
        <AlertDescription className="text-amber-800 dark:text-amber-300/90">
          {orDash(golden.period_note)}
          {golden.date_range?.start || golden.date_range?.end
            ? ` Labelled openers span ${orDash(golden.date_range?.start)} → ${orDash(
                golden.date_range?.end,
              )}.`
            : ""}
        </AlertDescription>
      </Alert>
    </section>
  );
}
