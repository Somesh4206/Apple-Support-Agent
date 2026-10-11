"use client";

import { createContext, useContext, type ReactNode } from "react";

import { useAgentChat, type UseAgentChat } from "@/hooks/use-agent-chat";
import {
  useWorkerHealth,
  type ChatWorkerState,
} from "@/hooks/use-worker-health";
import type { RetrievalHealthResponse } from "@/lib/agent-chat";

/**
 * The single agent-chat session shared across every surface that renders
 * it, plus the one worker-health poller feeding all status UIs.
 *
 * The landing page mounts <AgentChatProvider> at the root: the hero's
 * embedded <InlineAgentChat>, the floating launcher + panel, and the top
 * navigation status pill then share the SAME transcript, session id and
 * worker state — a message typed in the hero chat is instantly visible in
 * the floating panel, because everything consumes this one context.
 */
export interface AgentChatBundle {
  chat: UseAgentChat;
  worker: ChatWorkerState;
  health: RetrievalHealthResponse | null;
}

const AgentChatContext = createContext<AgentChatBundle | null>(null);

export function AgentChatProvider({ children }: { children: ReactNode }) {
  const chat = useAgentChat();
  const { worker, health } = useWorkerHealth();
  return (
    <AgentChatContext.Provider value={{ chat, worker, health }}>
      {children}
    </AgentChatContext.Provider>
  );
}

/**
 * Consume the shared session. Falls back to creating a local one when no
 * provider is mounted, so <AgentChat /> stays usable standalone.
 */
export function useSharedAgentChat(): UseAgentChat {
  const shared = useContext(AgentChatContext);
  const local = useAgentChat();
  return shared?.chat ?? local;
}

/** Consume the shared worker-health (single poller for the whole page). */
export function useSharedWorkerHealth(): {
  worker: ChatWorkerState;
  health: RetrievalHealthResponse | null;
} {
  const shared = useContext(AgentChatContext);
  const local = useWorkerHealth();
  return shared ? { worker: shared.worker, health: shared.health } : local;
}
