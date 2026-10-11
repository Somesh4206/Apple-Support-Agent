import { NextResponse } from "next/server";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import type { Phase1Doc, Phase1DocsResponse } from "@/lib/phase1";

export const dynamic = "force-dynamic";

/** Whitelisted project documents served to the dashboard docs viewer. */
const DOC_WHITELIST: Array<
  Omit<Phase1Doc, "bytes" | "modifiedAt" | "content"> & { absolutePath: string }
> = [
  {
    slug: "report",
    title: "Technical report",
    description:
      "Phase 1 results and methodology — every metric is computed by executed code.",
    path: "reports/report.md",
    absolutePath: path.join(
      process.cwd(),
      "hiver-support-agent",
      "reports",
      "report.md",
    ),
  },
  {
    slug: "readme",
    title: "README",
    description:
      "Repository overview: setup, pipeline stages, Phase 1 outputs and how to run them.",
    path: "README.md",
    absolutePath: path.join(process.cwd(), "hiver-support-agent", "README.md"),
  },
  {
    slug: "decision-log",
    title: "Decision log",
    description:
      "D1–D12: the engineering decisions behind the Phase 1 pipeline and their rationale.",
    path: "reports/decision_log.md",
    absolutePath: path.join(
      process.cwd(),
      "hiver-support-agent",
      "reports",
      "decision_log.md",
    ),
  },
];

/**
 * GET /api/phase1/docs — serve the whitelisted markdown documents written
 * for the Phase 1 handover (report, README, decision log) so the dashboard
 * can render them without any client-side filesystem access.
 *
 * Docs live OUTSIDE data/processed/ (they are repo files, not pipeline
 * outputs), so a missing docs directory is an UNREADABLE state, not NOT_RUN.
 */
export async function GET() {
  const docs: Phase1Doc[] = [];
  const missing: string[] = [];

  for (const entry of DOC_WHITELIST) {
    try {
      const [content, info] = await Promise.all([
        readFile(entry.absolutePath, "utf-8"),
        stat(entry.absolutePath),
      ]);
      docs.push({
        slug: entry.slug,
        title: entry.title,
        description: entry.description,
        path: entry.path,
        bytes: content.length,
        modifiedAt: info.mtime.toISOString(),
        content,
      });
    } catch {
      missing.push(entry.path);
    }
  }

  if (docs.length === 0) {
    const payload: Phase1DocsResponse = {
      ok: false,
      status: "UNREADABLE",
      message:
        "None of the project documents could be read — the dashboard expects hiver-support-agent/README.md and reports/ to be present in the repository.",
    };
    return NextResponse.json(payload, { status: 200 });
  }

  const payload: Phase1DocsResponse = {
    ok: true,
    status: "READY",
    docs,
    message:
      missing.length > 0
        ? `Note: ${missing.join(", ")} could not be read.`
        : undefined,
  };
  return NextResponse.json(payload, { status: 200 });
}
