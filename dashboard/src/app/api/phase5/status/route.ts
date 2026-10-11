import { readFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/phase5/status — the Phase 5 summary artifact
 * (hiver-support-agent/evaluation/results/phase5_summary.json, written by
 * scripts/evaluate_generation.py through the live retrieval service): the
 * grounded-generation run configuration, the five-step pipeline and six
 * safety rules, the reply-quality evaluation on the golden test openers
 * (grounding overlap, unsupported specifics, safety framing, gate preview)
 * and the live-service pointer for the interactive generation demo.
 *
 * `?format=raw` streams the artifact byte-for-byte as a download
 * (Content-Disposition: attachment; filename="phase5_summary.json") instead
 * of the re-serialized JSON envelope.
 */

const SUMMARY_PATH = path.join(
  process.cwd(),
  "hiver-support-agent",
  "evaluation",
  "results",
  "phase5_summary.json",
);

const NOT_RUN_MESSAGE = [
  "Phase 5 results have not been generated yet.",
  "To produce them (Phases 1–4 must exist inside hiver-support-agent/):",
  "(1) start the live service from the project root:",
  "`cd mini-services/retrieval-service && bun run dev` (port 3030, worker loads lazily);",
  "(2) run `python scripts/evaluate_generation.py` inside hiver-support-agent/ — it generates",
  "evidence-grounded replies for the 29 golden TEST openers through the live service",
  "(Phase 3 head + Phase 4 index + z-ai LLM) and writes",
  "evaluation/results/phase5_summary.json, the file this dashboard reads.",
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
  // evaluate_generation.py (with a download disposition) instead of
  // the re-serialized JSON envelope.
  if (rawDownload) {
    return new NextResponse(text, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": 'attachment; filename="phase5_summary.json"',
        "Cache-Control": "no-store",
      },
    });
  }

  try {
    const parsed = JSON.parse(text) as unknown;
    return NextResponse.json({ ok: true, status: "READY", data: parsed });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        status: "NOT_RUN",
        message:
          "phase5_summary.json exists but is not valid JSON. Re-run `python scripts/evaluate_generation.py` inside hiver-support-agent/ (with the live retrieval service running on port 3030) to regenerate it, then refresh the dashboard.",
      },
      { status: 200 },
    );
  }
}
