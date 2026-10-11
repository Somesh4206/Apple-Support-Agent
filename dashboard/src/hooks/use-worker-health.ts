"use client";

import { useCallback, useEffect, useState } from "react";

import { HEALTH_URL, type RetrievalHealthResponse } from "@/lib/agent-chat";

export type ChatWorkerState =
  | "unknown"
  | "idle"
  | "loading"
  | "ready"
  | "dead"
  | "unreachable";

/**
 * Polls the retrieval mini-service health (gateway URL, XTransformPort).
 * 30 s cadence when everything is healthy; 3 s while the worker is warming
 * up or unreachable so the UI flips to "online" live. Accepts an `active`
 * flag so purely background consumers (e.g. the top nav) can stay cheap.
 */
export function useWorkerHealth(active = true): {
  worker: ChatWorkerState;
  health: RetrievalHealthResponse | null;
} {
  const [worker, setWorker] = useState<ChatWorkerState>("unknown");
  const [health, setHealth] = useState<RetrievalHealthResponse | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(HEALTH_URL, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = (await response.json()) as RetrievalHealthResponse;
      setHealth(payload);
      if (
        payload.worker === "idle" ||
        payload.worker === "loading" ||
        payload.worker === "ready" ||
        payload.worker === "dead"
      ) {
        setWorker(payload.worker);
      } else {
        setWorker("unknown");
      }
    } catch {
      setWorker("unreachable");
      setHealth(null);
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    void refresh();
    const warming =
      worker === "loading" ||
      worker === "idle" ||
      worker === "unknown" ||
      worker === "unreachable";
    const timer = setInterval(() => void refresh(), warming ? 3000 : 30000);
    return () => clearInterval(timer);
  }, [active, worker, refresh]);

  return { worker, health };
}
