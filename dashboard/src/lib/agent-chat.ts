/**
 * Shared types and helpers for the LIVE multi-turn support-agent chat
 * (Task 10-c) — a floating launcher + panel on the dashboard that talks to
 * the stateful chat endpoints on the retrieval mini-service (port 3030,
 * reached through the gateway via the XTransformPort query parameter).
 *
 * The contract is implemented in mini-services/retrieval-service/index.ts
 * (GET/POST/DELETE /api/agent/chat). Every field is optional, the same
 * defensive style as the phase libs: the chat must render gracefully when
 * keys are missing and must never fabricate numbers.
 *
 * intentName is re-exported from @/lib/phase7 (which re-exports the Phase 4
 * map) so the chips cannot drift from the rest of the dashboard.
 */

export { intentName } from "@/lib/phase7";
export type { RetrievalHealthResponse } from "@/lib/phase4";

/* ------------------------------------------------------------------ */
/* Endpoints + client constants                                        */
/* ------------------------------------------------------------------ */

/** The stateful chat endpoint (POST a turn, GET the transcript, DELETE a session). */
export const CHAT_URL = "/api/agent/chat?XTransformPort=3030";

/** Worker health used for the status dot (same endpoint the Phase 4/5/7 demos poll). */
export const HEALTH_URL = "/api/phase4/health?XTransformPort=3030";

/** localStorage key holding the current chat session id. */
export const SESSION_STORAGE_KEY = "apple-support-ai-agent-session";

/** localStorage key marking the launcher attention dot as seen (first open). */
export const SEEN_STORAGE_KEY = "apple-support-ai-agent-seen";

/** Window event that opens the chat panel (dispatched by the hero CTA). */
export const OPEN_CHAT_EVENT = "apple-support:open-agent-chat";

/** Message length cap enforced by the chat service (500 chars). */
export const MAX_INPUT_CHARS = 500;

/**
 * Suggestion chips for the empty state — short customer-style messages.
 * Ordered for the best demo flow: the first two auto-handle (grounded
 * grounded answers with evidence), the rest demonstrate the escalation
 * policy — private-state topics (account/billing) and payment language
 * hand off to a human by design.
 */
export const CHAT_EXAMPLE_MESSAGES: string[] = [
  "My iPhone won't turn on at all",
  "iOS update made my phone slow",
  "My iPhone battery drains really fast",
  "How do I reset my Apple ID password?",
  "I was charged twice for my Apple Music subscription",
  "Where is my order? I never received it",
];

/* ------------------------------------------------------------------ */
/* Shared response fragments                                            */
/* ------------------------------------------------------------------ */

export type ChatRole = "user" | "agent";
export type ChatDecision = "auto_handle" | "escalate";

export interface ChatQueryIntent {
  label?: string;
  confidence?: number;
  runner_up?: string | null;
  runner_up_confidence?: number | null;
  /** present when the logreg head and the lexical keyword head disagreed
   *  and the ensemble had to pick a winner (hybrid retrieval path) */
  arbitration?: string;
  logreg_label?: string;
  logreg_confidence?: number;
  lexical_label?: string;
}

export interface ChatGates {
  intent_confidence?: number;
  top1_score?: number;
  intent_pass?: boolean;
  retrieval_pass?: boolean;
  auto_handle_eligible?: boolean;
  thresholds?: {
    intent?: number;
    retrieval?: number;
  };
}

export interface ChatPolicy {
  /** "auto_handle" | "escalate" */
  action?: string;
  reasons?: ChatPolicyReason[];
  thresholds?: {
    intent?: number;
    retrieval?: number;
  };
  provenance?: string;
}

export interface ChatPolicyReason {
  /** E2 | E3 | E4 | G1 | G2 */
  rule?: string;
  name?: string;
  detail?: string;
}

export interface ChatEvidenceItem {
  rank?: number;
  /** cosine similarity, 0..1 */
  score?: number;
  pair_id?: string;
  conversation_id?: number | string | null;
  turn?: number | null;
  customer_message?: string;
  support_response?: string;
  predicted_intent?: string | null;
  predicted_confidence?: number | null;
  /** which corpus served this pair: "curated" (bundled, complete guidance)
   *  or "twcs" (real dataset match; original links were stripped) */
  source?: "curated" | "twcs";
}

/* ------------------------------------------------------------------ */
/* Live web research (open-web grounding)                              */
/* ------------------------------------------------------------------ */

export type ChatWebSourceKind =
  | "reddit"
  | "twitter"
  | "forum"
  | "official"
  | "web";

/** One live web source the agent researched for a turn (search result or
 *  page extract — official Apple pages, Reddit threads, Twitter/X posts,
 *  forum discussions). */
export interface ChatWebSource {
  title?: string;
  url?: string;
  host?: string;
  kind?: ChatWebSourceKind;
  snippet?: string;
  date?: string;
  /** which search query surfaced this source */
  query?: string;
  /** page_reader extract — present only for the deep-read source */
  extracted?: string;
}

/** Envelope for the live web research performed on a turn. */
export interface ChatWebResearch {
  used?: boolean;
  queries?: string[];
  sources?: ChatWebSource[];
  search_ms?: number;
  read_ms?: number;
  error?: string;
}

export interface ChatScores {
  grounding_overlap?: number;
  unsupported_specifics?: string[];
  framing_compliant?: boolean;
  clarifying_question?: boolean;
  dm_redirect?: boolean;
  personal_data_solicited?: boolean;
  length_chars?: number;
  length_words?: number;
}

export interface ChatHandoff {
  next_step?: string;
  reasons?: ChatPolicyReason[];
  /** how the auto-sent escalation reply was chosen ("researched" = live
   *  web-researched answer with cited sources) */
  ack_kind?:
    | "greeting"
    | "self_service"
    | "clarify"
    | "secure_continue"
    | "researched";
  suggested_public_acknowledgment?: string;
  note_for_agent?: string;
  evidence_for_review?: ChatEvidenceItem[];
}

export interface ChatLlm {
  model?: string;
  attempts?: number;
  max_reply_chars?: number;
}

export interface ChatTimings {
  embed_ms?: number;
  faiss_search_ms?: number;
  web_research_ms?: number;
  llm_ms?: number;
  total_ms?: number;
}

export interface ChatConversation {
  /** "fresh" | "auto" | "escalated" */
  state?: string;
  escalations?: number;
  turns?: number;
  re_engaged_after_escalation?: boolean;
}

/* ------------------------------------------------------------------ */
/* Chat messages                                                       */
/* ------------------------------------------------------------------ */

/**
 * One row of the transcript. `meta` is null for user messages; for agent
 * messages it carries the persisted turn metadata (reply_status, intent,
 * gates, policy, evidence, scores / handoff). The live client additionally
 * stores `timings` on freshly posted turns (not persisted server-side).
 */
export interface ChatMessage {
  id?: number;
  session_id?: string;
  role?: ChatRole;
  content?: string;
  decision?: ChatDecision | null;
  meta?: ChatMessageMeta | null;
  created_at?: string;
  /** client-only marker for the optimistic user bubble before the POST lands */
  pending?: boolean;
}

export interface ChatMessageMeta {
  /** "ready_to_send" | "handoff_acknowledgment" | "researched_reply" */
  reply_status?: string;
  query_intent?: ChatQueryIntent;
  gates?: ChatGates;
  policy?: ChatPolicy;
  evidence?: ChatEvidenceItem[];
  scores?: ChatScores;
  llm?: ChatLlm;
  handoff?: ChatHandoff;
  /** live web research performed for this turn (open-web grounding) */
  web_research?: ChatWebResearch | null;
  /** client-side enrichment from the POST response timings */
  timings?: ChatTimings;
}

/* ------------------------------------------------------------------ */
/* POST /api/agent/chat — one turn                                     */
/* ------------------------------------------------------------------ */

export interface ChatTurnResponse {
  ok?: boolean;
  session_id?: string;
  user_message?: {
    id?: number;
    role?: ChatRole;
    content?: string;
    created_at?: string;
  };
  agent_message?: {
    id?: number;
    role?: ChatRole;
    content?: string;
    decision?: ChatDecision;
    created_at?: string;
  };
  decision?: ChatDecision;
  /** "ready_to_send" (auto) | "handoff_acknowledgment" (escalate) | "researched_reply" (escalate, web-researched) */
  reply_status?: string;
  query_intent?: ChatQueryIntent;
  gates?: ChatGates;
  policy?: ChatPolicy;
  evidence?: ChatEvidenceItem[];
  scores?: ChatScores;
  llm?: ChatLlm;
  handoff?: ChatHandoff;
  web_research?: ChatWebResearch | null;
  conversation?: ChatConversation;
  timings?: ChatTimings;
  meta?: {
    corpus_size?: number;
    worker_state?: string;
    disclaimer?: string;
  };
  /** present on 400 (validation) / 503 (worker or LLM failure) */
  error?: string;
  worker?: string;
}

/* ------------------------------------------------------------------ */
/* GET /api/agent/chat — transcript + session envelope                 */
/* ------------------------------------------------------------------ */

export interface ChatSessionResponse {
  ok?: boolean;
  session_id?: string;
  messages?: ChatMessage[];
  conversation?: ChatConversation;
  session?: {
    messages?: number;
    escalations?: number;
    last_activity?: string | null;
  };
  server?: {
    total_sessions?: number;
    worker_state?: string;
    corpus_size?: number;
  };
  /** present on 400 */
  error?: string;
}

/* ------------------------------------------------------------------ */
/* DELETE /api/agent/chat — session reset                              */
/* ------------------------------------------------------------------ */

export interface ChatDeleteResponse {
  ok?: boolean;
  session_id?: string;
  deleted?: number;
  error?: string;
}

/* ------------------------------------------------------------------ */
/* Client-side error model                                             */
/* ------------------------------------------------------------------ */

export interface ChatError {
  kind: "network" | "service" | "validation";
  message: string;
  /** worker state reported by a 503 ("loading" | "dead"), when given */
  worker?: string;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Generates a fresh session id (32 hex chars, matches [A-Za-z0-9_-]{6,64}). */
export function createChatSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().replace(/-/g, "");
  }
  /* extremely defensive fallback (old runtimes) */
  return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

/** Opens the floating chat panel (listened for by <AgentChat />). */
export function openAgentChat(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OPEN_CHAT_EVENT));
}

/** Window event focusing the landing page's embedded chat composer. */
export const FOCUS_COMPOSER_EVENT = "apple-support:focus-agent-composer";

/**
 * Scrolls the embedded landing-page chat into view and focuses its
 * composer (listened for by <InlineAgentChat />).
 */
export function focusInlineAgentChat(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(FOCUS_COMPOSER_EVENT));
  document
    .getElementById("inline-agent-chat")
    ?.scrollIntoView({ behavior: "smooth", block: "center" });
}
