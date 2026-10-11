import { readFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/phase3/status — the Phase 3 summary artifact
 * (hiver-support-agent/evaluation/results/phase3_summary.json, written by
 * scripts/train_embedding_classifier.py): the frozen all-MiniLM-L6-v2 encoder
 * description, the two classifier heads (LogReg head + prototype centroids)
 * with CV-selected hyperparameters, the five-model comparison on the same
 * golden test split as Phase 2, the confidence preview and the per-example
 * error analysis.
 *
 * `?format=raw` streams the artifact byte-for-byte as a download
 * (Content-Disposition: attachment; filename="phase3_summary.json") instead
 * of the re-serialized JSON envelope.
 */

const SUMMARY_PATH = path.join(
  process.cwd(),
  "hiver-support-agent",
  "evaluation",
  "results",
  "phase3_summary.json",
);

const NOT_RUN_MESSAGE = [
  "Phase 3 results have not been generated yet.",
  "To produce them, run the following inside hiver-support-agent/",
  "(Phase 2 must exist — the golden set and its split are the Phase 3 evaluation set):",
  "(1) `pip install -r requirements.txt` — adds sentence-transformers for the frozen encoder;",
  "(2) `python scripts/train_embedding_classifier.py` — embeds the golden set with all-MiniLM-L6-v2,",
  "fits both heads on the train split, evaluates on the untouched test split and writes",
  "evaluation/results/phase3_summary.json, the file this dashboard reads.",
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
  // train_embedding_classifier.py (with a download disposition) instead of
  // the re-serialized JSON envelope.
  if (rawDownload) {
    return new NextResponse(text, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": 'attachment; filename="phase3_summary.json"',
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
          "phase3_summary.json exists but is not valid JSON. Re-run `python scripts/train_embedding_classifier.py` inside hiver-support-agent/ to regenerate it, then refresh the dashboard.",
      },
      { status: 200 },
    );
  }
}
