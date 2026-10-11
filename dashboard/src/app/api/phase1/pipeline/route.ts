import { NextResponse } from "next/server";

import { readPipelineRun } from "@/lib/phase1-server";
import type { Phase1PipelineResponse } from "@/lib/phase1";

export const dynamic = "force-dynamic";

/**
 * GET /api/phase1/pipeline — the Phase 1 run manifest
 * (hiver-support-agent/data/processed/pipeline_run.json): scan stats,
 * cleaning report, reconstruction stats, validation checks and timings.
 */
export async function GET() {
  const result = await readPipelineRun();
  if (!result.ok || !result.data) {
    const payload: Phase1PipelineResponse = {
      ok: false,
      status: result.code === "NOT_RUN" ? "NOT_RUN" : "ERROR",
      message: result.message,
    };
    return NextResponse.json(payload, { status: 200 });
  }
  const payload: Phase1PipelineResponse = {
    ok: true,
    status: "READY",
    data: result.data,
  };
  return NextResponse.json(payload, { status: 200 });
}
