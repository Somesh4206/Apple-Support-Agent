import { readFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/phase2/status — the Phase 2 summary artifact
 * (hiver-support-agent/evaluation/results/phase2_summary.json, written by
 * scripts/train_baselines.py): the 10-class intent taxonomy, the golden-set
 * manifest (200 labelled examples, 70/15/15 conversation-level split) and the
 * three measured baselines (keyword rules / majority / TF-IDF + LogReg) with
 * the test confusion matrix.
 *
 * `?format=raw` streams the artifact byte-for-byte as a download
 * (Content-Disposition: attachment; filename="phase2_summary.json") instead
 * of the re-serialized JSON envelope.
 */

const SUMMARY_PATH = path.join(
  process.cwd(),
  "hiver-support-agent",
  "evaluation",
  "results",
  "phase2_summary.json",
);

const NOT_RUN_MESSAGE = [
  "Phase 2 results have not been generated yet.",
  "To produce them, run the following inside hiver-support-agent/",
  "(Phase 1 outputs must exist — see the Phase 1 panel above):",
  "(1) `python scripts/build_golden_set.py sample` — draws the deterministic 200-example sampling frame and the labelling worksheet;",
  "(2) label every worksheet row by meaning, then `python scripts/build_golden_set.py build` — validates the labels and writes the golden set + 70/15/15 split;",
  "(3) `python scripts/train_baselines.py` — measures the baselines and writes evaluation/results/phase2_summary.json, the file this dashboard reads.",
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

  // format=raw serves the artifact exactly as written by train_baselines.py
  // (with a download disposition) instead of the re-serialized JSON envelope.
  if (rawDownload) {
    return new NextResponse(text, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": 'attachment; filename="phase2_summary.json"',
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
          "phase2_summary.json exists but is not valid JSON. Re-run `python scripts/train_baselines.py` inside hiver-support-agent/ to regenerate it, then refresh the dashboard.",
      },
      { status: 200 },
    );
  }
}
