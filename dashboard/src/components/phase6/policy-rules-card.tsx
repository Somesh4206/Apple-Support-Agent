import { ListChecks } from "lucide-react";

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
import type { Phase6Policy } from "@/lib/phase6";

/** E-rules are hard domain/content escalations; G-rules are the numeric
 *  gates — the tint difference makes the two families legible at a glance. */
const RULE_FAMILY: Record<string, "domain" | "gate"> = {
  E2: "domain",
  E3: "domain",
  E4: "domain",
  G1: "gate",
  G2: "gate",
};

/**
 * Subsection A — the five escalation rules, field-exact from
 * phase6_summary.json → policy.rules: id badge, name, when it fires, why it
 * exists and where it came from. "Escalate if ANY rule fires" is the whole
 * decision procedure — the card shows there is nothing else.
 */
export function PolicyRulesCard({ policy }: { policy: Phase6Policy }) {
  const rules = policy.rules ?? [];

  return (
    <section aria-labelledby="phase6-rules-heading" className="space-y-4">
      <SubsectionHeading
        id="phase6-rules-heading"
        icon={ListChecks}
        title="The five rules — the whole policy"
        description="Rule-based and explainable by construction: no learned component, no tuning on the test labels. If any rule fires the message escalates; only when all five pass does the agent answer on its own."
      />

      <Card className="gap-0">
        <CardHeader className="border-b">
          <CardTitle className="text-sm">
            {orDash(policy.decision)}
          </CardTitle>
          <CardDescription className="text-xs">
            {orDash(policy.safety_asymmetry)}
          </CardDescription>
        </CardHeader>
        <CardContent className="mt-4">
          {rules.length === 0 ? (
            <p className="py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
              No policy rules available.
            </p>
          ) : (
            <ul className="space-y-3">
              {rules.map((rule, position) => {
                const family = ruleFamily(rule.id);
                return (
                  <li
                    key={rule.id ?? position}
                    className="min-w-0 rounded-lg border border-zinc-100 bg-zinc-50/60 p-3 dark:border-zinc-800 dark:bg-zinc-900/40"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        className={
                          family === "gate"
                            ? "border-amber-200 bg-amber-50 font-mono text-emerald-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
                            : "border-red-200 bg-red-50 font-mono text-red-800 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-300"
                        }
                        title={
                          family === "gate"
                            ? "numeric gate (Phase 3/4 threshold)"
                            : "domain / content escalation rule"
                        }
                      >
                        {orDash(rule.id)}
                      </Badge>
                      <span className="font-mono text-xs font-medium text-zinc-700 dark:text-zinc-300">
                        {orDash(rule.name)}
                      </span>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-zinc-700 dark:text-zinc-300">
                      <span className="font-medium">Fires when</span>{" "}
                      {orDash(rule.fires_when)}
                    </p>
                    <p className="mt-1.5 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                      <span className="font-medium">Why</span> —{" "}
                      {orDash(rule.why)}
                    </p>
                    <p className="mt-1.5 border-t border-zinc-100 pt-1.5 text-[11px] leading-relaxed text-zinc-500 dark:border-zinc-800 dark:text-zinc-500">
                      <span className="font-medium">Provenance</span> —{" "}
                      {orDash(rule.provenance)}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}

          {policy.inputs && policy.inputs.length > 0 ? (
            <p className="mt-4 rounded-lg border border-zinc-200/80 bg-zinc-100/60 px-3 py-2 text-[11px] leading-relaxed text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
              The policy sees exactly these runtime signals:{" "}
              {policy.inputs
                .map((input) => `${input}`)
                .join(" · ")}
              . Nothing else about the customer, the account or the conversation
              is consulted.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}

function ruleFamily(id: string | undefined): "domain" | "gate" {
  if (id && RULE_FAMILY[id] !== undefined) return RULE_FAMILY[id];
  return "domain";
}
