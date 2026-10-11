import { NextResponse } from "next/server";

import { ensureRetrievalService } from "@/lib/ensure-retrieval-service";

export async function GET() {
  // Every /api hit is also a cheap liveness guard for the retrieval
  // mini-service: if port 3030 is down, the Next.js server process (which
  // survives between tool calls, unlike shell-spawned processes) re-spawns
  // it detached. Idempotent and memoized per server process.
  const ensured = await ensureRetrievalService();
  return NextResponse.json({
    message: "Hello, world!",
    retrieval_service: ensured,
  });
}
