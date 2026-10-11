"use client";

import {
  BookOpenCheck,
  CircleCheck,
  FileJson,
  FlaskConical,
  GitBranch,
  Scale,
  ScrollText,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SectionHeading } from "@/components/phase1/section-heading";
import { SubsectionHeading } from "@/components/phase2/subsection-heading";

/** One row of the final results table: the headline measured numbers of a
 *  phase, exactly as recorded in its evaluation artifact. */
const PHASE_RESULTS: {
  n: number;
  title: string;
  headline: string;
  metrics: string[];
}[] = [
  {
    n: 1,
    title: "Data foundation",
    headline: "2,811,774 tweets scanned · 80,966 AppleSupport conversations",
    metrics: [
      "106,137 customer↔support pairs",
      "7/7 structural validations PASS",
      "avg 2.94 turns / 100.8 chars per message",
    ],
  },
  {
    n: 2,
    title: "Taxonomy & baselines",
    headline: "10 intent classes · golden set 200 (142/29/29, seed 42)",
    metrics: [
      "keyword rules: acc 0.483 / macro-F1 0.391",
      "majority: acc 0.655 / macro-F1 0.079",
      "TF-IDF+LogReg: acc 0.621 / macro-F1 0.078",
    ],
  },
  {
    n: 3,
    title: "Embedding classifier",
    headline: "MiniLM + LogReg head: acc 0.655 · macro-F1 0.303 (test)",
    metrics: [
      "weighted-F1 0.659",
      "zero-hyperparam centroids: macro-F1 0.389",
      "confidence 0.780 on correct vs 0.508 on wrong",
    ],
  },
  {
    n: 4,
    title: "Historical retrieval",
    headline: "105,871 golden-isolated pairs · exact-cosine FAISS",
    metrics: [
      "Recall@1/3/5 = 0.586 / 0.655 / 0.759",
      "MRR@5 0.651",
      "majority-vote retrieval acc 0.690",
    ],
  },
  {
    n: 5,
    title: "Grounded generation",
    headline: "29/29 replies · 0 unsupported specifics · 100% safety framing",
    metrics: [
      "grounding overlap mean 0.474 (lexical proxy)",
      "escalation consistency 13/13",
      "599.9 ms mean LLM latency (glm-4-plus)",
    ],
  },
  {
    n: 6,
    title: "Escalation policy",
    headline: "False-auto rate 0/10 (CI95 [0.000, 0.309]) · recall 1.000",
    metrics: [
      "precision 0.714 · F1 0.833",
      "over-escalation 4/19 (the honest cost)",
      "5 explainable rules, none tuned on test labels",
    ],
  },
  {
    n: 7,
    title: "Unified agent",
    headline: "TS↔Python policy consistency 29/29 · false-auto 0 live",
    metrics: [
      "15 auto / 14 escalate on the golden test set",
      "48.3% of LLM calls skipped by policy",
      "auto 734.9 ms vs escalate 28.1 ms end-to-end",
    ],
  },
  {
    n: 8,
    title: "Streamlit app",
    headline: "Thin client over the same live agent service (one code path)",
    metrics: [
      "AppTest: 0 exceptions, both paths verified",
      "live browser screenshots captured",
      "no ML or LLM code in the app itself",
    ],
  },
  {
    n: 9,
    title: "Report & evaluation",
    headline: "This section — every phase measured, nothing fabricated",
    metrics: [
      "report.md §1–§17 + decision log D1–D27",
      "per-phase JSON artifacts + reproduce commands",
      "honest limitations stated with exact CIs",
    ],
  },
];

const ARTIFACTS: { label: string; path: string; note: string }[] = [
  {
    label: "Phase 1–5 results",
    path: "hiver-support-agent/evaluation/results/",
    note: "eda_summary.json · baseline/embedding/retrieval/generation results + per-phase summaries",
  },
  {
    label: "Phase 6 results",
    path: "evaluation/results/escalation_results.json",
    note: "policy rules, per-example decisions vs ground truth, exact CIs, ablation",
  },
  {
    label: "Phase 7 results",
    path: "evaluation/results/agent_results.json",
    note: "29 live agent calls, cross-implementation consistency, cost & latency",
  },
  {
    label: "Ground truth",
    path: "evaluation/escalation_labels.json",
    note: "29 test openers, fixed criteria, single-annotator protocol documented",
  },
  {
    label: "Final report",
    path: "hiver-support-agent/reports/report.md",
    note: "§1–§17: problem → data → methods → measured results → safety → limitations",
  },
  {
    label: "Decision log",
    path: "hiver-support-agent/reports/decision_log.md",
    note: "D1–D27: every design decision with its reasoning and trade-offs",
  },
  {
    label: "Live service",
    path: "mini-services/retrieval-service/",
    note: "Bun :3030 + Python worker + z-ai LLM — search, generation and the unified agent",
  },
  {
    label: "Streamlit app",
    path: "hiver-support-agent/streamlit_app.py",
    note: "Phase 8 console over the live agent endpoint",
  },
];

const LIMITATIONS: string[] = [
  "n = 29 test split: every Phase 6/7 rate carries its exact Clopper-Pearson CI — 0 false-autos in 10 should-escalate messages bounds the true rate below ~31% at 95% confidence, not at zero.",
  "Grounding overlap is a lexical proxy (token overlap with the evidence), not semantic entailment; a reply can be faithful with fresh wording or unfaithful while reusing evidence words.",
  "LLM outputs are nondeterministic: generation metrics describe the recorded run (timestamps in each artifact), not a stable pipeline property.",
  "Escalation ground truth is one annotator's judgement against fixed written criteria; no inter-annotator agreement exists.",
  "Historical evidence (2017 era) is used for retrieval and grounding only — it is not current Apple policy, pricing or support practice; every user-facing surface states this.",
];

/**
 * "Phase 9 — Report & evaluation" section. The closing panel of the
 * dashboard: the complete measured story across all nine phases, where
 * every artifact lives, and the honest limitations of what was measured.
 * Numbers are field-exact with the per-phase summary JSONs served by the
 * sections above — this section adds the cross-phase view, not new claims.
 */
export function Phase9Section() {
  return (
    <section aria-labelledby="phase9-heading" className="space-y-4">
      <SectionHeading
        id="phase9-heading"
        icon={ScrollText}
        title="Phase 9 — Final report & evaluation"
        description="The complete measured story: nine phases from a 2.8-million-tweet corpus to an evidence-grounded agent that decides safely between auto-handling and escalation. Every number on this page comes from a recorded, reproducible evaluation — nothing is fabricated."
      />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CircleCheck className="size-4 text-emerald-600" aria-hidden="true" />
            Assignment complete — all nine phases delivered end-to-end
          </CardTitle>
          <CardDescription>
            Data foundation → taxonomy &amp; golden set → baselines → embedding
            classifier → FAISS retrieval → grounded generation → escalation
            policy → unified agent → Streamlit app → this report. Each phase
            was built only after the prior one was working and tested, and
            each shipped a quantitative evaluation before the next began.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="space-y-0">
            {PHASE_RESULTS.map((phase, i) => (
              <li
                key={phase.n}
                className={
                  i === 0
                    ? "pb-4"
                    : "border-t border-zinc-100 py-4 dark:border-zinc-800/80"
                }
              >
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-semibold text-white">
                    {phase.n}
                  </span>
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    {phase.title}
                  </h3>
                  <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                    {phase.headline}
                  </p>
                </div>
                <ul className="mt-1.5 flex flex-wrap gap-1.5 pl-9">
                  {phase.metrics.map((m) => (
                    <li key={m}>
                      <Badge
                        variant="outline"
                        className="border-zinc-200 bg-zinc-50 font-normal text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400"
                      >
                        {m}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileJson className="size-4 text-zinc-500" aria-hidden="true" />
              Artifacts &amp; reproducibility
            </CardTitle>
            <CardDescription>
              Where every measured claim lives, and how to regenerate it —
              deterministic seed 42, configuration-driven thresholds, run
              metadata persisted per execution.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {ARTIFACTS.map((a) => (
                <li key={a.path} className="text-sm">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                      {a.label}
                    </span>
                    <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                      {a.path}
                    </code>
                  </div>
                  <p className="mt-0.5 text-xs leading-relaxed text-zinc-500 dark:text-zinc-500">
                    {a.note}
                  </p>
                </li>
              ))}
            </ul>
            <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs leading-relaxed text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
              <p className="flex items-center gap-1.5 font-medium text-zinc-700 dark:text-zinc-300">
                <FlaskConical className="size-3.5" aria-hidden="true" />
                Reproduce
              </p>
              <p className="mt-1">
                <code className="font-mono">
                  python scripts/prepare_data.py
                </code>{" "}
                →{" "}
                <code className="font-mono">run_eda.py</code> →{" "}
                <code className="font-mono">build_golden_set.py</code> →{" "}
                <code className="font-mono">train_baselines.py</code> →{" "}
                <code className="font-mono">train_embedding_classifier.py</code>{" "}
                →{" "}
                <code className="font-mono">build_retrieval_index.py</code> →{" "}
                <code className="font-mono">evaluate_generation.py</code> →{" "}
                <code className="font-mono">evaluate_escalation.py</code> →{" "}
                <code className="font-mono">evaluate_agent.py</code> — full
                commands and prerequisites in the repository README.
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Scale className="size-4 text-amber-600" aria-hidden="true" />
                Honest limitations
              </CardTitle>
              <CardDescription>
                The constraints every number above should be read within —
                stated up front, not buried.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2.5">
                {LIMITATIONS.map((lim) => (
                  <li
                    key={lim}
                    className="flex gap-2 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400"
                  >
                    <span
                      aria-hidden="true"
                      className="mt-1 size-1.5 shrink-0 rounded-full bg-amber-500"
                    />
                    {lim}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card className="border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/60 dark:bg-emerald-950/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base text-emerald-900 dark:text-emerald-200">
                <BookOpenCheck className="size-4" aria-hidden="true" />
                Closing statement
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm leading-relaxed text-emerald-900/90 dark:text-emerald-200/90">
              <p>
                The system classifies customer issues, retrieves historically
                similar support cases, generates replies grounded strictly in
                them, and decides safely between auto-handling and escalation
                — with every component measured, every threshold documented,
                and every limitation disclosed.
              </p>
              <p className="mt-2 flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-300/80">
                <GitBranch className="size-3.5" aria-hidden="true" />
                hiver-support-agent · reports/report.md · decision_log.md
                D1–D27 · evaluation/results/*.json
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <SubsectionHeading
        id="phase9-read-more"
        icon={BookOpenCheck}
        title="Where to read more"
        description="The full narrative — problem definition, dataset, methods, measured results, safety analysis and future work — lives in the ML repository's report; the dashboard you are reading is its visual companion."
      />
    </section>
  );
}
