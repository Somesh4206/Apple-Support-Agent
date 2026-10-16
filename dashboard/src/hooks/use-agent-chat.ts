"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  CHAT_URL,
  MAX_INPUT_CHARS,
  SESSION_STORAGE_KEY,
  createChatSessionId,
  type ChatConversation,
  type ChatError,
  type ChatMessage,
  type ChatMessageMeta,
  type ChatSessionResponse,
  type ChatTurnResponse,
} from "@/lib/agent-chat";

const SESSION_ID_RE = /^[A-Za-z0-9_-]{6,64}$/;

function readStoredSessionId(): string | null {
  try {
    const stored = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (stored && SESSION_ID_RE.test(stored)) {
      return stored;
    }
  } catch {
    /* storage unavailable — fall through to an in-memory id */
  }
  return null;
}

function persistSessionId(id: string): void {
  try {
    window.localStorage.setItem(SESSION_STORAGE_KEY, id);
  } catch {
    /* storage unavailable — the chat still works for this mount */
  }
}

export interface UseAgentChat {
  /** current session id (null until the mount effect reads/creates it) */
  sessionId: string | null;
  /** the transcript — user + agent messages, oldest first */
  messages: ChatMessage[];
  /** "idle" | "sending" (a POST is in flight) */
  sendState: "idle" | "sending";
  /** transcript GET state — skeleton shimmer while "loading" */
  loadState: "idle" | "loading" | "ready" | "error";
  /** last POST failure (inline alert); cleared on the next successful send */
  error: ChatError | null;
  /** conversation envelope from the service (state/escalations/turns) */
  conversation: ChatConversation | null;
  /** last text that failed to send — feeds the Retry button */
  lastFailedText: string | null;
  /** POST one turn; resolves with the turn payload, or null on failure */
  sendMessage: (text: string) => Promise<ChatTurnResponse | null>;
  /** GET the transcript and replace local state (source of truth) */
  loadSession: () => Promise<void>;
  /** DELETE the session, mint a fresh id, clear everything */
  resetSession: () => Promise<void>;
  clearError: () => void;
}

/**
 * Stateful client for the live agent chat on the retrieval mini-service
 * (port 3030, through the gateway). Session identity lives in
 * localStorage; the transcript lives in React state only and is refetched
 * (GET) whenever the panel opens — the server is the source of truth.
 *
 * All fetches use relative gateway URLs with { cache: "no-store" }.
 */
export function useAgentChat(): UseAgentChat {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sendState, setSendState] = useState<"idle" | "sending">("idle");
  const [loadState, setLoadState] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [error, setError] = useState<ChatError | null>(null);
  const [conversation, setConversation] = useState<ChatConversation | null>(
    null,
  );
  const [lastFailedText, setLastFailedText] = useState<string | null>(null);

  const sessionIdRef = useRef<string | null>(null);
  const sendingRef = useRef(false);
  const lastFailedTextRef = useRef<string | null>(null);

  /* -------- mount: read or create the session id (client only) -------- */
  useEffect(() => {
    const stored = readStoredSessionId();
    const id = stored ?? createChatSessionId();
    if (id !== stored) {
      persistSessionId(id);
    }
    sessionIdRef.current = id;
    setSessionId(id);
  }, []);

  /* ------------------------ send one turn ---------------------------- */
  const sendMessage = useCallback(
    async (text: string): Promise<ChatTurnResponse | null> => {
      const trimmed = text.trim();
      if (!trimmed) {
        setError({
          kind: "validation",
          message: "Type a message first — even a few words are enough.",
        });
        return null;
      }
      if (trimmed.length > MAX_INPUT_CHARS) {
        setError({
          kind: "validation",
          message: `That message is ${trimmed.length} characters — the agent caps input at ${MAX_INPUT_CHARS}.`,
        });
        return null;
      }
      const sid = sessionIdRef.current;
      if (!sid) {
        setError({
          kind: "validation",
          message: "The chat session is still starting up — try again in a moment.",
        });
        return null;
      }
      if (sendingRef.current) {
        return null; // a turn is already in flight
      }

      sendingRef.current = true;
      setSendState("sending");
      setError(null);

      /* optimistic user bubble — replaced by the persisted row on success,
         removed again on failure */
      const optimisticId = -Date.now();
      const optimistic: ChatMessage = {
        id: optimisticId,
        role: "user",
        content: trimmed,
        decision: null,
        meta: null,
        created_at: new Date().toISOString(),
        pending: true,
      };
      setMessages((current) => [...current, optimistic]);

      try {
        const response = await fetch(CHAT_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ session_id: sid, message: trimmed }),
        });
        const payload = (await response.json()) as ChatTurnResponse;
        if (!response.ok || payload.ok !== true) {
          throw Object.assign(
            new Error(
              payload.error ??
                `The agent call failed with HTTP ${response.status}.`,
            ),
            {
              status: response.status,
              worker: payload.worker,
              network: false,
            },
          );
        }

        /* success — swap the optimistic bubble for the persisted user row
           and append the agent row with the full turn metadata (the live
           POST carries more than the persisted meta: full-k evidence,
           llm info, timings). */
        const userRow: ChatMessage = {
          id: payload.user_message?.id ?? optimisticId,
          session_id: payload.session_id ?? sid,
          role: "user",
          content: payload.user_message?.content ?? trimmed,
          decision: null,
          meta: null,
          created_at:
            payload.user_message?.created_at ?? optimistic.created_at,
        };
        const agentMeta: ChatMessageMeta = {
          reply_status: payload.reply_status,
          query_intent: payload.query_intent,
          gates: payload.gates,
          policy: payload.policy,
          evidence: payload.evidence,
          scores: payload.scores,
          llm: payload.llm,
          handoff: payload.handoff,
          web_research: payload.web_research,
          timings: payload.timings,
        };
        const agentRow: ChatMessage = {
          id: payload.agent_message?.id ?? optimisticId - 1,
          session_id: payload.session_id ?? sid,
          role: "agent",
          content: payload.agent_message?.content ?? "",
          decision: payload.agent_message?.decision ?? payload.decision ?? null,
          meta: agentMeta,
          created_at:
            payload.agent_message?.created_at ?? new Date().toISOString(),
        };
        setMessages((current) => [
          ...current.filter((message) => message.id !== optimisticId),
          userRow,
          agentRow,
        ]);
        if (payload.conversation) {
          setConversation(payload.conversation);
        }
        lastFailedTextRef.current = null;
        setLastFailedText(null);
        setError(null);
        return payload;
      } catch (cause) {
        /* failure — remove the optimistic bubble (the spec'd rollback), keep
           the text around for the Retry button */
        setMessages((current) =>
          current.filter((message) => message.id !== optimisticId),
        );
        lastFailedTextRef.current = trimmed;
        setLastFailedText(trimmed);

        const isNetwork = cause instanceof TypeError;
        const status =
          cause && typeof cause === "object" && "status" in cause
            ? Number((cause as { status?: number }).status)
            : undefined;
        const worker =
          cause && typeof cause === "object" && "worker" in cause
            ? (cause as { worker?: string }).worker
            : undefined;
        const detail =
          cause instanceof Error
            ? cause.message
            : "The agent service could not be reached.";

        if (isNetwork) {
          setError({
            kind: "network",
            message:
              "The agent service is unreachable right now — this chat runs on a separate mini-service. Your message was not sent.",
          });
        } else if (status === 400) {
          setError({
            kind: "validation",
            message: detail,
          });
        } else {
          /* 503: the worker may be loading or dead — say which when known */
          setError({
            kind: "service",
            message:
              worker === "loading" || worker === "idle"
                ? "Agent service is warming up — this can take ~15 s after a restart. Your message was not sent yet; retry in a moment."
                : worker === "dead"
                  ? "Agent service unavailable (worker failed on the backend) — retrying is safe; nothing was sent."
                  : "Agent service unavailable, retrying… your message was not sent yet.",
            worker,
          });
        }
        return null;
      } finally {
        sendingRef.current = false;
        setSendState("idle");
      }
    },
    [],
  );

  /* ------------------------ load transcript -------------------------- */
  const loadSession = useCallback(async (): Promise<void> => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    setLoadState("loading");
    setError(null);
    try {
      const response = await fetch(`${CHAT_URL}&session_id=${encodeURIComponent(sid)}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as ChatSessionResponse;
      if (!response.ok || payload.ok !== true) {
        throw new Error(
          payload.error ?? `The transcript request failed with HTTP ${response.status}.`,
        );
      }
      setMessages(payload.messages ?? []);
      setConversation(payload.conversation ?? null);
      setLoadState("ready");
    } catch {
      setMessages([]);
      setLoadState("error");
    }
  }, []);

  /* ------------------------ reset session ---------------------------- */
  const resetSession = useCallback(async (): Promise<void> => {
    const sid = sessionIdRef.current;
    if (sid) {
      try {
        await fetch(`${CHAT_URL}&session_id=${encodeURIComponent(sid)}`, {
          method: "DELETE",
          cache: "no-store",
        });
      } catch {
        /* the service is best-effort here; the local reset still proceeds */
      }
    }
    const fresh = createChatSessionId();
    persistSessionId(fresh);
    sessionIdRef.current = fresh;
    setSessionId(fresh);
    setMessages([]);
    setConversation(null);
    setError(null);
    lastFailedTextRef.current = null;
    setLastFailedText(null);
    setLoadState("ready");
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    sessionId,
    messages,
    sendState,
    loadState,
    error,
    conversation,
    lastFailedText,
    sendMessage,
    loadSession,
    resetSession,
    clearError,
  };
}
