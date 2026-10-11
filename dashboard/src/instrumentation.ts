/**
 * Next.js instrumentation hook — runs once per server process at startup.
 *
 * Performs only a LIGHTWEIGHT stat of the conversation_pairs.csv artifact
 * (logged so NOT_RUN states are visible in dev.log). The heavy parse of
 * the 36 MB CSV (106k rows → several hundred MB of resident JS objects)
 * is deliberately NOT pre-warmed anymore: this sandbox has 4 GB RAM and
 * five kernel OOM kills were observed when Turbopack route-compile memory
 * spikes stacked on top of the pre-warmed cache. The cache is built
 * lazily by the first /api/phase1/conversations request (cold parse
 * ~3–6 s, then cached by mtime in phase1-server.ts) — a much safer
 * ordering: compiles complete before the big resident allocation exists.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }
  // Ensure the retrieval mini-service (port 3030) is alive — spawned
  // detached from THIS (surviving) server process when down. Idempotent:
  // at container boot /start.sh already starts it, so this is a no-op
  // health probe; after crashes it self-heals the agent backend.
  // Fire-and-forget so server startup is never blocked by the wait loop.
  try {
    const { ensureRetrievalService } = await import("@/lib/ensure-retrieval-service");
    void ensureRetrievalService().then((result) => {
      console.log(`[instrumentation] retrieval-service: ${result.detail}`);
    });
  } catch (error) {
    console.log(
      `[instrumentation] retrieval-service guard failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  try {
    const { statConversationPairsArtifact } = await import("@/lib/phase1-server");
    const info = await statConversationPairsArtifact();
    console.log(
      info.exists
        ? `[instrumentation] conversation artifact present: ${info.path} (${info.sizeBytes.toLocaleString("en-US")} bytes) — cache will be built lazily on first request`
        : `[instrumentation] conversation artifact missing (${info.path}) — explorer will show NOT_RUN until the Phase 1 pipeline is executed`,
    );
  } catch (error) {
    console.log(
      `[instrumentation] startup artifact check failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
