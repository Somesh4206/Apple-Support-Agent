"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import {
  OPEN_CHAT_EVENT,
  SEEN_STORAGE_KEY,
} from "@/lib/agent-chat";
import {
  useSharedAgentChat,
  useSharedWorkerHealth,
} from "@/components/agent-chat/chat-context";
import { AgentChatLauncher } from "@/components/agent-chat/launcher";
import { ChatPanel } from "@/components/agent-chat/panel";

export { openAgentChat } from "@/lib/agent-chat";

function readSeen(): boolean {
  try {
    return window.localStorage.getItem(SEEN_STORAGE_KEY) === "1";
  } catch {
    return true; /* storage unavailable — never nag with the dot */
  }
}

/* tiny external store for the launcher's "seen" flag so the attention
   dot derives without a setState-in-effect (react-hooks rule) and without
   hydration mismatches (server snapshot: seen) */
const seenListeners = new Set<() => void>();
function subscribeSeen(notify: () => void): () => void {
  seenListeners.add(notify);
  return () => seenListeners.delete(notify);
}
function persistSeen(): void {
  try {
    window.localStorage.setItem(SEEN_STORAGE_KEY, "1");
  } catch {
    /* best effort */
  }
  for (const notify of seenListeners) notify();
}

/**
 * The floating live-agent chat: launcher (bottom-right) + panel, wired to
 * the stateful chat endpoints on the retrieval mini-service (port 3030,
 * through the gateway).
 *
 * - when the landing page mounts <AgentChatProvider> (it always does), this
 *   shares the SAME session as the hero's embedded chat — the conversation
 *   follows the user around the page
 * - session id persists in localStorage (apple-support-ai-agent-session);
 *   the panel refetches the transcript (GET) the first time it opens — the
 *   server is the source of truth, so a conversation survives reloads
 * - worker health comes from the shared provider poller (30 s / 3 s warming)
 * - the hero CTA (and anything else) opens the panel by dispatching the
 *   window event "apple-support:open-agent-chat" (openAgentChat helper)
 */
export function AgentChat() {
  const chat = useSharedAgentChat();
  const { worker, health } = useSharedWorkerHealth();

  const [open, setOpen] = useState(false);
  const [autoFocusSignal, bumpAutoFocus] = useState(0);

  const seen = useSyncExternalStore(
    subscribeSeen,
    () => readSeen(),
    () => true,
  );
  const attentionDot = !seen;

  const loadedOnceRef = useRef(false);
  const loadSession = chat.loadSession;

  const openPanel = useCallback(() => {
    setOpen(true);
    persistSeen();
    bumpAutoFocus((value) => value + 1);
    if (!loadedOnceRef.current) {
      loadedOnceRef.current = true;
      void loadSession();
    }
  }, [loadSession]);

  const closePanel = useCallback(() => {
    setOpen(false);
  }, []);

  /* hero CTA → open */
  useEffect(() => {
    const onOpenEvent = () => openPanel();
    window.addEventListener(OPEN_CHAT_EVENT, onOpenEvent);
    return () => window.removeEventListener(OPEN_CHAT_EVENT, onOpenEvent);
  }, [openPanel]);

  return (
    <>
      <AgentChatLauncher
        open={open}
        showAttentionDot={attentionDot}
        onOpen={openPanel}
      />
      {open ? (
        <ChatPanel
          chat={chat}
          worker={worker}
          health={health}
          onClose={closePanel}
          autoFocusSignal={autoFocusSignal}
        />
      ) : null}
    </>
  );
}
