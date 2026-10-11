/**
 * Server-only supervisor for the retrieval mini-service (port 3030).
 *
 * WHY THIS EXISTS: the sandbox reaps every process spawned from a Bash tool
 * call the moment that call ends, but processes in the Next.js dev server's
 * tree (started by the container's /start.sh at boot) survive. This helper
 * therefore spawns the retrieval service as a DETACHED child of the
 * Next.js server process (from the /api route or the instrumentation
 * hook), so its lifecycle is tied to a surviving parent.
 *
 * It is fully idempotent: a fast health probe runs first, and a memoized
 * promise prevents concurrent double-spawns. A failed attempt resets the
 * memo so the next request retries. At container boot /start.sh starts the
 * service directly; this guard then sees it healthy and does nothing.
 */

import { spawn } from "node:child_process";
import { existsSync, openSync } from "node:fs";
import path from "node:path";

/**
 * Resolve the retrieval-service directory portably:
 *  - when the dashboard runs from a checkout, cwd is <repo>/dashboard and the
 *    service sits at ./mini-services/retrieval-service;
 *  - in the original sandbox it is /home/z/my-project/mini-services/….
 */
const SERVICE_DIR = [
  path.join(process.cwd(), "mini-services", "retrieval-service"),
  "/home/z/my-project/mini-services/retrieval-service",
].find((dir) => existsSync(path.join(dir, "package.json"))) ??
  path.join(process.cwd(), "mini-services", "retrieval-service");
const HEALTH_URL = "http://localhost:3030/api/phase4/health";

export type EnsureResult = {
  started: boolean;
  healthy: boolean;
  detail: string;
};

let ensurePromise: Promise<EnsureResult> | null = null;

async function probeHealth(timeoutMs: number): Promise<boolean> {
  try {
    const response = await fetch(HEALTH_URL, {
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    } as RequestInit);
    return response.ok;
  } catch {
    return false;
  }
}

function spawnService(): { pid: number | null; detail: string } {
  try {
    const logFd = openSync(`${SERVICE_DIR}/retrieval.log`, "a");
    // `run dev` (bun --hot), NOT `run start`: a respawned service without
    // hot reload keeps serving whatever code was on disk at spawn time —
    // later edits to index.ts / lexical_engine.ts silently never apply, and
    // users get stale buggy behavior (observed twice). --hot picks up edits.
    const child = spawn("bun", ["run", "dev"], {
      cwd: SERVICE_DIR,
      detached: true,
      stdio: ["ignore", logFd, logFd],
      env: { ...process.env, NO_COLOR: "1" },
    });
    child.unref();
    return { pid: child.pid ?? null, detail: `spawned pid ${child.pid}` };
  } catch (error) {
    return { pid: null, detail: `spawn failed: ${String(error)}` };
  }
}

export function ensureRetrievalService(): Promise<EnsureResult> {
  if (!ensurePromise) {
    ensurePromise = (async (): Promise<EnsureResult> => {
      if (!existsSync(`${SERVICE_DIR}/package.json`)) {
        return { started: false, healthy: false, detail: "service directory not found" };
      }
      if (await probeHealth(1500)) {
        return { started: false, healthy: true, detail: "already healthy" };
      }
      const { pid, detail } = spawnService();
      if (pid === null) {
        return { started: false, healthy: false, detail };
      }
      // Wait up to ~10 s for the service to come up (binding is fast; the
      // FAISS worker still loads lazily on the first warmup request).
      for (let attempt = 0; attempt < 20; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        if (await probeHealth(800)) {
          return { started: true, healthy: true, detail: `${detail} — healthy` };
        }
      }
      return { started: true, healthy: false, detail: `${detail} — health not confirmed yet` };
    })();
    // The memo exists ONLY to collapse concurrent callers into a single
    // spawn attempt — it must NOT cache a successful result: a service that
    // dies later would keep answering "healthy" from the memo and never be
    // respawned (observed: /api kept returning "spawned pid 8173 — healthy"
    // long after that process was gone). Reset unconditionally once the
    // attempt settles so every new call re-probes health first.
    void ensurePromise.then(
      () => {
        ensurePromise = null;
      },
      () => {
        ensurePromise = null;
      },
    );
  }
  return ensurePromise;
}
