import { NextResponse } from "next/server";

import { readChartPng } from "@/lib/phase1-server";

export const dynamic = "force-dynamic";

/**
 * GET /api/phase1/chart?name=<chart> — one of the six matplotlib PNGs the
 * EDA script writes into data/processed/charts/. Names are whitelisted;
 * anything else returns 404. Charts change only when the pipeline re-runs,
 * so responses carry a one-hour browser cache.
 */
export async function GET(request: Request) {
  const name = new URL(request.url).searchParams.get("name");
  const png = await readChartPng(name);
  if (!png) {
    return NextResponse.json(
      {
        ok: false,
        message: `Unknown or missing chart: ${name ?? "(none)"}. Available charts are listed in the dashboard chart gallery.`,
      },
      { status: 404 },
    );
  }
  return new NextResponse(new Uint8Array(png), {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
