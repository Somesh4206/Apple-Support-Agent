import { readFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const SUMMARY_PATH = path.join(
  process.cwd(),
  "hiver-support-agent",
  "data",
  "processed",
  "eda_summary.json",
);

const NOT_RUN_MESSAGE = [
  "Phase 1 results have not been generated yet.",
  "To produce them:",
  "(1) place twcs.csv in hiver-support-agent/data/raw/ — download instructions are in hiver-support-agent/data/README.md;",
  "(2) run `python scripts/find_author_ids.py` inside hiver-support-agent/ and set APPLE_SUPPORT_AUTHOR_ID in hiver-support-agent/.env;",
  "(3) run `python scripts/prepare_data.py`;",
  "(4) run `python scripts/run_eda.py`.",
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

  // format=raw serves the artifact exactly as written by run_eda.py (with a
  // download disposition) instead of the re-serialized JSON envelope.
  if (rawDownload) {
    return new NextResponse(text, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": 'attachment; filename="eda_summary.json"',
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
          "eda_summary.json exists but is not valid JSON. Re-run `python scripts/run_eda.py` inside hiver-support-agent/ to regenerate it, then refresh the dashboard.",
      },
      { status: 200 },
    );
  }
}
