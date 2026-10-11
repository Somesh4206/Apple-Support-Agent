import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  experimental: {
    /**
     * This sandbox has 4 GB RAM. Turbopack's native (non-V8) memory grows to
     * ~2.8–3.0 GB once every route is compiled, and the kernel OOM killer
     * murdered next-server repeatedly during QA rounds (each kill = connection
     * refused + Turbopack DB corruption + cold reboot). With this limit the
     * dev server instead performs a GRACEFUL self-restart on memory pressure —
     * the .next cache stays warm so recovery takes seconds, and no manual
     * intervention is needed.
     * 1024 MB (was 1600 until Phase 3): the Phase 3 section made the root
     * bundle heavier, and 1600 no longer left room for the user's Preview
     * Panel reload + agent-browser (~600 MB) on top of the warm server
     * (~2.5 GB). Measured: kernel OOM at 3.38 GB anon-rss with 1600; with
     * 1024 the warm server settles ~2.0–2.2 GB and both browsers fit.
     *
     * 2026-10 round: with the product landing (agent view) now lazy-split
     * from the nine-phase documentation (next/dynamic), the root graph is
     * 21 chunks instead of 37 — 1024 is comfortable again and keeps the
     * kernel OOM killer out of the picture (graceful turbopack restarts
     * instead).
     */
    turbopackMemoryLimit: 1024,
  },
};

export default nextConfig;
