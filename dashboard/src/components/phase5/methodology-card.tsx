"use client";

import { useState } from "react";
import { ChevronDown, Eye, ListOrdered, ShieldCheck, Workflow } from "lucide-react";

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
import {
  CUSTOM_SCROLLBAR,
  type Phase5PromptDesign,
} from "@/lib/phase5";
import { cn } from "@/lib/utils";

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

interface MethodologyCardProps {
  pipeline: string[] | undefined;
  safetyRules: string[] | undefined;
  promptDesign: Phase5PromptDesign | undefined;
  /** config.llm — the model id the pipeline names in its LLM step */
  llmModel: string | undefined;
}

/**
 * Subsection A — how a grounded reply is made: the five-step pipeline, the
 * six non-negotiable safety rules (assignment §16, quoted verbatim), and the
 * prompt design with a disclosure showing the actual system + user prompt
 * recorded for an exemplar message.
 */
export function MethodologyCard({
  pipeline,
  safetyRules,
  promptDesign,
  llmModel,
}: MethodologyCardProps) {
  const [promptOpen, setPromptOpen] = useState(false);
  const steps = pipeline ?? [];
  const rules = safetyRules ?? [];
  const exemplar = promptDesign?.exemplar;

  const srSummary = [
    steps.length > 0
      ? `Pipeline: ${steps.join(" → ")}.`
      : "No pipeline steps available.",
    rules.length > 0
      ? `Safety rules: ${rules.join(" ")}`
      : "No safety rules available.",
  ].join(" ");

  return (
    <section aria-labelledby="phase5-methodology-heading" className="space-y-4">
      <SubsectionHeading
        id="phase5-methodology-heading"
        icon={Workflow}
        title="How a grounded reply is made"
        description="Intent from the Phase 3 head, evidence from the Phase 4 index, one LLM draft under six non-negotiable safety rules — then transparent heuristic scoring of every reply."
      />

      <Card className="gap-0">
        <CardHeader className="border-b">
          <CardTitle className="text-sm">
            Five steps from customer message to scored reply
          </CardTitle>
          <CardDescription className="text-xs">
            The generation pipeline, verbatim from the artifact
            {llmModel ? (
              <>
                {" "}
                — the LLM step runs <span className="font-mono">{llmModel}</span>{" "}
                through the z-ai SDK, backend only
              </>
            ) : null}
            .
          </CardDescription>
        </CardHeader>
        <CardContent className="mt-4">
          <p className="sr-only">{srSummary}</p>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* -------- left: the numbered pipeline flow -------- */}
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                <ListOrdered className="size-3 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                Pipeline
              </p>
              {steps.length === 0 ? (
                <p className="mt-2 py-2 text-sm text-zinc-500 dark:text-zinc-400">
                  No pipeline steps available.
                </p>
              ) : (
                <ol className="mt-2 space-y-0">
                  {steps.map((step, index) => (
                    <li key={step} className="relative flex gap-3 pb-3 last:pb-0">
                      {index < steps.length - 1 ? (
                        <span
                          aria-hidden="true"
                          className="absolute left-[11px] top-6 h-[calc(100%-1rem)] w-px bg-zinc-200 dark:bg-zinc-800"
                        />
                      ) : null}
                      <span
                        aria-hidden="true"
                        className="relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 font-mono text-[10px] font-semibold text-emerald-700 dark:border-emerald-800/70 dark:bg-emerald-950/40 dark:text-emerald-300"
                      >
                        {index + 1}
                      </span>
                      <p className="min-w-0 flex-1 text-xs leading-relaxed text-zinc-700 dark:text-zinc-300">
                        {step}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            {/* -------- right: the six safety rules, verbatim -------- */}
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                <ShieldCheck className="size-3 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                Safety rules — non-negotiable (assignment §16)
              </p>
              {rules.length === 0 ? (
                <p className="mt-2 py-2 text-sm text-zinc-500 dark:text-zinc-400">
                  No safety rules available.
                </p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {rules.map((rule) => (
                    <li
                      key={rule}
                      className="min-w-0 rounded-lg border border-zinc-100 bg-zinc-50/60 px-3 py-2 text-xs leading-relaxed text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-300"
                    >
                      {rule}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* -------- prompt design + the actual-prompt disclosure -------- */}
          <div className="mt-6 min-w-0 rounded-lg border border-zinc-100 bg-zinc-50/60 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
            <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs font-medium text-zinc-700 dark:text-zinc-300">
              <span>The grounded prompt</span>
              {isFiniteNumber(promptDesign?.system_prompt_words) ? (
                <span className="font-mono text-[10px] font-normal tabular-nums text-zinc-500 dark:text-zinc-400">
                  {formatInt(promptDesign?.system_prompt_words)}-word system
                  prompt
                </span>
              ) : null}
            </p>
            {promptDesign?.user_prompt_template ? (
              <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-400">
                <span className="font-medium">User prompt assembles:</span>{" "}
                {promptDesign.user_prompt_template}
              </p>
            ) : (
              <p className="mt-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                No user-prompt template available.
              </p>
            )}

            {exemplar ? (
              <div className="mt-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  aria-expanded={promptOpen}
                  aria-controls="phase5-prompt-disclosure"
                  onClick={() => setPromptOpen((open) => !open)}
                >
                  <Eye className="size-3.5" aria-hidden="true" />
                  {promptOpen ? "Hide the actual prompt" : "View the actual prompt"}
                  <ChevronDown
                    className={cn(
                      "size-3.5 transition-transform",
                      promptOpen && "rotate-180",
                    )}
                    aria-hidden="true"
                  />
                </Button>
                {promptOpen ? (
                  <div
                    id="phase5-prompt-disclosure"
                    className="mt-3 space-y-3"
                  >
                    {exemplar.message ? (
                      <p className="text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                        Recorded for the message:{" "}
                        <span className="italic">
                          &ldquo;{exemplar.message}&rdquo;
                        </span>
                      </p>
                    ) : null}
                    {(
                      [
                        ["System prompt", exemplar.system_prompt],
                        ["User prompt", exemplar.user_prompt],
                      ] as const
                    ).map(([label, text]) => (
                      <div key={label} className="min-w-0">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                          {label}
                        </p>
                        <pre
                          className={cn(
                            "mt-1 max-h-96 overflow-y-auto rounded-lg border border-zinc-200 bg-white p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-300",
                            CUSTOM_SCROLLBAR,
                          )}
                        >
                          {orDash(text)}
                        </pre>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
