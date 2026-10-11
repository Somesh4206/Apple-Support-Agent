import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/phase1/export — discoverability alias for the CSV download.
 *
 * The real export logic lives on /api/phase1/conversations (format=csv);
 * this route exists because "export" is the URL people naturally guess for
 * a download endpoint. It forwards the whitelisted filter parameters and
 * 307-redirects to the canonical conversations route.
 *
 * Query params (all optional, same semantics as /api/phase1/conversations):
 *   q, minTurns, maxTurns, conversationId, sort — forwarded when present
 */
const FORWARDED_PARAMS = [
  "q",
  "minTurns",
  "maxTurns",
  "conversationId",
  "sort",
] as const;

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const target = new URL("/api/phase1/conversations", url.origin);
  for (const key of FORWARDED_PARAMS) {
    const value = url.searchParams.get(key);
    if (value !== null && value.trim() !== "") {
      target.searchParams.set(key, value);
    }
  }
  target.searchParams.set("format", "csv");
  return NextResponse.redirect(target, 307);
}
