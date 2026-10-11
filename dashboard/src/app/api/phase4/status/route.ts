import { readFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/phase4/status — the Phase 4 summary artifact
 * (hiver-support-agent/evaluation/results/phase4_summary.json, written by
 * scripts/build_retrieval_index.py): the MiniLM-embedded evidence index over
 * historical customer↔support pairs (golden conversations excluded), the
 * Recall@1/3/5 + MRR@5 evaluation on the golden test openers, the retrieval
 * threshold preview for Phase 5/6 grounding, and the live-service pointer
 * for the interactive retrieval demo.
 *
 * `?format=raw` streams the artifact byte-for-byte as a download
 * (Content-Disposition: attachment; filename="phase4_summary.json") instead
 * of the re-serialized JSON envelope.
 */

const SUMMARY_PATH = path.join(
  process.cwd(),
  "hiver-support-agent",
  "evaluation",
  "results",
  "phase4_summary.json",
);

const NOT_RUN_MESSAGE = [
  "Phase 4 results have not been generated yet.",
  "To produce them, run the following inside hiver-support-agent/",
  "(Phases 1–3 must exist — the retrieval corpus is filtered against the golden isolation manifest,",
  "and retrieved pairs are labelled by the Phase 3 head):",
  "(1) `pip install -r requirements.txt` — adds faiss-cpu for the exact nearest-neighbour index;",
  "(2) `python scripts/build_retrieval_index.py` — embeds the historical evidence pairs with the frozen",
  "all-MiniLM-L6-v2 encoder, excludes the golden conversations, builds the FAISS index, evaluates",
  "Recall@1/3/5 on the golden test openers and writes evaluation/results/phase4_summary.json,",
  "the file this dashboard reads.",
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
  // build_retrieval_index.py (with a download disposition) instead of
  // the re-serialized JSON envelope.
  if (rawDownload) {
    return new NextResponse(text, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": 'attachment; filename="phase4_summary.json"',
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
          "phase4_summary.json exists but is not valid JSON. Re-run `python scripts/build_retrieval_index.py` inside hiver-support-agent/ to regenerate it, then refresh the dashboard.",
      },
      { status: 200 },
    );
  }
}
