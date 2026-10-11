import { readFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/phase6/status — the Phase 6 summary artifact
 * (hiver-support-agent/evaluation/results/phase6_summary.json, written by
 * scripts/evaluate_escalation.py): the five-rule explainable escalation
 * policy, the hand-labelled ground truth methodology, and the evaluation on
 * the 29 golden TEST openers (false-auto rate with exact Clopper-Pearson
 * CIs, precision/recall/F1, over-escalations, rule fire counts, the
 * gates-vs-policy ablation and the qualitative false-positive examples).
 *
 * `?format=raw` streams the artifact byte-for-byte as a download
 * (Content-Disposition: attachment; filename="phase6_summary.json") instead
 * of the re-serialized JSON envelope.
 */

const SUMMARY_PATH = path.join(
  process.cwd(),
  "hiver-support-agent",
  "evaluation",
  "results",
  "phase6_summary.json",
);

/** Full per-example records (escalation_results.json) — read alongside the
 *  summary so the ablation card can show the exact runtime signals behind
 *  each decision delta. Optional: the section renders without it. */
const RESULTS_PATH = path.join(
  process.cwd(),
  "hiver-support-agent",
  "evaluation",
  "results",
  "escalation_results.json",
);

const NOT_RUN_MESSAGE = [
  "Phase 6 results have not been generated yet.",
  "To produce them (Phases 1–5 must exist inside hiver-support-agent/):",
  "run `python scripts/evaluate_escalation.py` inside hiver-support-agent/ — it applies the",
  "five-rule escalation policy to the recorded Phase 5 runtime signals for the 29 golden",
  "TEST openers, compares every decision against evaluation/escalation_labels.json and",
  "writes evaluation/results/phase6_summary.json, the file this dashboard reads.",
  "Then refresh the dashboard.",
].join(" ");

export async function GET(request: Request) {
  const url = new URL(request.url);
  const rawDownload = url.searchParams.get("format") === "raw";

  let text: string;
  try {
    text = await readFile(SUMMARY_PATH, "utf-8");
  } catch (error) {
    const isMissing =
      error instanceof Error &&
      (error as NodeJS.ErrnoException).code === "ENOENT";
    const message = isMissing
      ? NOT_RUN_MESSAGE
      : `${NOT_RUN_MESSAGE} (The summary file exists but could not be read: ${
          error instanceof Error ? error.message : String(error)
        })`;
    // NOT_RUN is a valid state, not a server error.
    return NextResponse.json(
      { ok: false, status: "NOT_RUN", message },
      { status: 200 },
    );
  }

  // format=raw serves the artifact exactly as written by
  // evaluate_escalation.py (with a download disposition) instead of
  // the re-serialized JSON envelope.
  if (rawDownload) {
    return new NextResponse(text, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": 'attachment; filename="phase6_summary.json"',
        "Cache-Control": "no-store",
      },
    });
  }

  try {
    const parsed = JSON.parse(text) as {
      evaluation?: {
        ablation_vs_phase5_gates?: { decision_deltas?: { index?: number }[] };
      };
    };
    /* Best-effort detail lookup: for every decision delta in the ablation,
       fetch the matching per-example record (predicted intent, confidence,
       top-1 score, ground-truth rationale) from escalation_results.json.
       Absent/unparseable → the payload simply omits the field. */
    let ablationDetails: unknown[] | undefined;
    const deltaIndices = (
      parsed.evaluation?.ablation_vs_phase5_gates?.decision_deltas ?? []
    )
      .map((delta) => delta.index)
      .filter((index): index is number => typeof index === "number");
    if (deltaIndices.length > 0) {
      try {
        const resultsText = await readFile(RESULTS_PATH, "utf-8");
        const results = JSON.parse(resultsText) as {
          per_example?: { index?: number }[];
        };
        const matched = (results.per_example ?? []).filter((record) =>
          deltaIndices.includes(record.index as number),
        );
        if (matched.length > 0) ablationDetails = matched;
      } catch {
        /* details are optional — the summary alone still renders */
      }
    }
    return NextResponse.json({
      ok: true,
      status: "READY",
      data: parsed,
      ...(ablationDetails ? { ablation_details: ablationDetails } : {}),
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        status: "NOT_RUN",
        message:
          "phase6_summary.json exists but is not valid JSON. Re-run `python scripts/evaluate_escalation.py` inside hiver-support-agent/ to regenerate it, then refresh the dashboard.",
      },
      { status: 200 },
    );
  }
}
