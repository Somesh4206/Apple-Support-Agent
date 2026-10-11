import { intentName, type ChatMessage } from "@/lib/agent-chat";

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

function formatTimestamp(iso: string | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function percent(value: number | undefined): string {
  return isFiniteNumber(value)
    ? `${Math.round(Math.min(Math.max(value, 0), 1) * 100)}%`
    : "—";
}

/**
 * Builds a Markdown transcript of the conversation and triggers a download
 * as `apple-support-agent-chat-<sessionid8>.md`. Pure DOM (Blob + object
 * URL) — no external libraries.
 */
export function downloadAgentChatTranscript(
  messages: ChatMessage[],
  sessionId: string | null,
): void {
  const lines: string[] = [];
  const stamp8 = sessionId ? sessionId.slice(0, 8) : "session";
  const exportedAt = new Date().toISOString();

  lines.push("# Apple Support AI — live agent chat transcript");
  lines.push("");
  lines.push(
    `- Session: \`${sessionId ?? "unknown"}\``,
    `- Exported: ${exportedAt}`,
    `- Messages: ${messages.length}`,
    "- Source: live multi-turn agent (mini-service port 3030) — prototype grounded in 2017-era AppleSupport history, not current Apple policy.",
  );
  lines.push("");
  lines.push("---");
  lines.push("");

  for (const message of messages) {
    const stamp = formatTimestamp(message.created_at);
    const who = message.role === "user" ? "Customer" : "Agent";
    if (message.role === "user") {
      lines.push(`## ${who}${stamp ? ` — ${stamp}` : ""}`);
      lines.push("");
      lines.push(`> ${(message.content ?? "").replace(/\n/g, "\n> ")}`);
      lines.push("");
      continue;
    }

    const meta = message.meta ?? {};
    const decision =
      message.decision === "auto_handle"
        ? "auto-handled (reply ready to send)"
        : message.decision === "escalate"
          ? "escalated to human (no auto-reply)"
          : "";
    lines.push(
      `## ${who}${stamp ? ` — ${stamp}` : ""}${decision ? ` · ${decision}` : ""}`,
    );
    lines.push("");
    lines.push(`> ${(message.content ?? "").replace(/\n/g, "\n> ")}`);
    lines.push("");

    const intent = meta.query_intent;
    if (intent?.label) {
      lines.push(
        `- Intent: ${intentName(intent.label)} (${intent.label ?? "—"}, confidence ${percent(intent.confidence)})`,
      );
    }
    if (meta.reply_status) {
      lines.push(`- Reply status: ${meta.reply_status}`);
    }
    if (meta.policy?.action) {
      lines.push(`- Policy action: ${meta.policy.action}`);
    }

    const reasons = meta.handoff?.reasons ?? meta.policy?.reasons ?? [];
    for (const reason of reasons) {
      lines.push(
        `- Rule fired: ${reason.rule ?? "—"} (${reason.name ?? "—"})${reason.detail ? ` — ${reason.detail}` : ""}`,
      );
    }

    const scores = meta.scores;
    if (scores) {
      const chips: string[] = [];
      if (isFiniteNumber(scores.grounding_overlap)) {
        chips.push(`grounding overlap ${percent(scores.grounding_overlap)}`);
      }
      if (scores.framing_compliant !== undefined) {
        chips.push(`framing ${scores.framing_compliant ? "compliant" : "non-compliant"}`);
      }
      if (isFiniteNumber(scores.length_chars)) {
        chips.push(`length ${scores.length_chars} chars`);
      }
      if (chips.length > 0) {
        lines.push(`- Reply scores: ${chips.join(" · ")}`);
      }
    }

    const timings = meta.timings;
    if (timings && isFiniteNumber(timings.total_ms)) {
      const llm = isFiniteNumber(timings.llm_ms) ? timings.llm_ms : 0;
      lines.push(
        `- Latency: ${(timings.total_ms / 1000).toFixed(1)}s total · ${Math.round(llm)} ms LLM`,
      );
    }

    const evidence = meta.evidence ?? [];
    if (evidence.length > 0) {
      lines.push(`- Grounded in ${evidence.length} similar historical case(s):`);
      for (const item of evidence) {
        lines.push(
          `  - #${item.rank ?? "—"} cos ${isFiniteNumber(item.score) ? item.score.toFixed(2) : "—"} · intent ${item.predicted_intent ?? "—"}${isFiniteNumber(item.predicted_confidence) ? ` (${percent(item.predicted_confidence)})` : ""}`,
        );
        if (item.customer_message) {
          lines.push(`    - customer: ${item.customer_message}`);
        }
        if (item.support_response) {
          lines.push(`    - support: ${item.support_response}`);
        }
      }
    }

    lines.push("");
  }

  const blob = new Blob([lines.join("\n")], {
    type: "text/markdown;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `apple-support-agent-chat-${stamp8}.md`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  /* give the browser a tick to start the download before revoking */
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
