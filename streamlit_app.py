#!/usr/bin/env python3
"""Phase 8 — Streamlit app: the Apple Support AI agent console.

A minimal, honest UI over the unified agent built in Phases 3–7:

    customer message
      → Phase 3 intent head (predicted intent + confidence)
      → Phase 4 FAISS retrieval (top-K historical evidence)
      → Phase 6 escalation policy (BEFORE any LLM call)
      → auto_handle ⇒ Phase 5 grounded reply, ready to send
        escalate     ⇒ structured human handoff (no LLM call spent)

The app itself contains NO ML code and NO LLM access: it is a thin client
for the live service (``mini-services/retrieval-service``, port 3030) so
that the whole pipeline has exactly one implementation — the same one the
offline evaluations and the web dashboard use. Start the service first:

    cd mini-services/retrieval-service && bun run dev    # port 3030

Then run the app:

    streamlit run streamlit_app.py --server.port 8501 --server.headless true

Everything displayed comes from the service response: decision, reasons,
gates, evidence, reply (or handoff), heuristic scores and timings.
"""
from __future__ import annotations

import json
import urllib.error
import urllib.request

import streamlit as st

SERVICE_BASE = "http://localhost:3030"
AGENT_URL = f"{SERVICE_BASE}/api/phase7/agent"
HEALTH_URL = f"{SERVICE_BASE}/api/phase4/health"
WARMUP_URL = f"{SERVICE_BASE}/api/phase4/warmup"
REQUEST_TIMEOUT_S = 150

DISCLAIMER = (
    "Historical evidence (2017 era) — drafts are grounded in similar past "
    "cases, not current Apple policy."
)

EXAMPLES = [
    "my App Store is not working!!!!",
    "Why did the new iPhone update do nothing but kill my battery life now??",
    "do you have a price quote on getting a screen fixed for iPhone 7 Plus?",
    "Why does my iPad keep asking me to sign into iCloud every 30 seconds?",
    "I wrote you an email about a MacBook Pro I've bought but never received.",
]


# --------------------------------------------------------------------- #
# service helpers                                                         #
# --------------------------------------------------------------------- #

def _get(url: str, timeout: int = 5) -> dict | None:
    try:
        with urllib.request.urlopen(url, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        return None


def _post(url: str, payload: dict, timeout: int) -> dict:
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url, data=data, headers={"Content-Type": "application/json"}, method="POST"
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def service_health() -> dict | None:
    return _get(HEALTH_URL)


def call_agent(message: str) -> dict:
    """Call the live agent; returns the parsed response or an error dict."""
    try:
        out = _post(AGENT_URL, {"message": message}, REQUEST_TIMEOUT_S)
    except urllib.error.HTTPError as exc:
        try:
            body = json.loads(exc.read().decode("utf-8"))
            return {"ok": False, "error": body.get("error", str(exc))}
        except Exception:
            return {"ok": False, "error": str(exc)}
    except (urllib.error.URLError, TimeoutError) as exc:
        return {"ok": False, "error": f"service unreachable: {exc}"}
    return out


def warmup_service() -> dict | None:
    try:
        return _post(WARMUP_URL, {}, REQUEST_TIMEOUT_S)
    except Exception:
        return None


# --------------------------------------------------------------------- #
# UI                                                                      #
# --------------------------------------------------------------------- #

def main() -> None:
    st.set_page_config(
        page_title="Apple Support AI — agent console",
        page_icon="🎧",
        layout="wide",
    )

    st.title("🎧 Apple Support AI — agent console")
    st.caption(
        "Evidence-grounded customer-support prototype (Hiver technical "
        "assignment). Phase 8 UI over the Phase 7 unified agent."
    )
    st.warning(DISCLAIMER)

    # ---- sidebar: service state + policy summary ---------------------- #
    with st.sidebar:
        st.header("Service")
        health = service_health()
        if health is None:
            st.error(
                "Live service unreachable on :3030.\n\n"
                "Start it first:\n`cd mini-services/retrieval-service && bun run dev`"
            )
        else:
            worker = health.get("worker", "?")
            if worker == "ready":
                st.success(
                    f"Worker ready — {health.get('corpus_size', 0):,} evidence "
                    f"pairs indexed ({health.get('model', '')})"
                )
            else:
                st.warning(f"Worker {worker} — it loads lazily on the first request (~15 s).")
                if st.button("Warm up now"):
                    with st.spinner("Loading encoder + FAISS index + corpus…"):
                        warmup_service()
                    st.rerun()

        st.header("Escalation policy (Phase 6)")
        st.markdown(
            """
**Escalate** (any rule fires):
- **E2** private-state domain — billing / repair / account / security / support-process
- **E3** unmatched intent (`other`)
- **E4** sensitive content — payment language, email, phone, card number
- **G1** intent confidence < 0.60
- **G2** top-1 retrieval score < 0.65

**Auto-handle** only when every rule passes — then (and only then) is an
LLM call spent on a grounded draft.
            """
        )
        st.caption(
            "Ground truth on the golden test set: false-auto 0/10, recall "
            "1.00, over-escalation 4/19 (phase6_summary.json)."
        )

    # ---- input ---------------------------------------------------------#
    st.subheader("Customer message")
    message = st.text_area(
        "Type a customer message (or pick an example):",
        value=st.session_state.get("prefill", ""),
        height=110,
        max_chars=500,
        label_visibility="collapsed",
    )
    st.caption(f"{len(message)}/500 characters")

    cols = st.columns([1, 1, 6])
    with cols[0]:
        submitted = st.button("Ask the agent", type="primary", use_container_width=True)
    with cols[1]:
        if st.button("Clear", use_container_width=True):
            st.session_state["prefill"] = ""
            st.rerun()

    example = st.selectbox(
        "Examples (from the golden test set):",
        [""] + EXAMPLES,
        index=0,
    )
    if example and example != st.session_state.get("prefill"):
        st.session_state["prefill"] = example
        st.rerun()

    if not submitted and not message:
        st.info("Type a message above (or pick an example) and press **Ask the agent**.")
        return
    if not message.strip():
        st.error("The message is empty.")
        return

    # ---- call the agent ------------------------------------------------#
    with st.spinner("Phase 3 intent → Phase 4 retrieval → Phase 6 policy …"):
        out = call_agent(message.strip())
    if not out.get("ok"):
        st.error(f"Agent call failed: `{out.get('error')}`")
        return

    decision = out["decision"]
    intent = out["query_intent"]
    gates = out["gates"]
    policy = out["policy"]
    timings = out.get("timings", {})

    # ---- decision banner ---------------------------------------------- #
    if decision == "auto_handle":
        st.success(
            f"**Decision: AUTO-HANDLE** — every policy rule passed; a grounded "
            "draft reply was generated and is ready to send."
        )
    else:
        st.error(
            "**Decision: ESCALATE to a human** — no reply was generated and "
            "no LLM call was spent. Reasons below."
        )

    # ---- signals ------------------------------------------------------- #
    c1, c2, c3, c4 = st.columns(4)
    c1.metric(
        "Predicted intent",
        intent["label"],
        f"confidence {intent['confidence']:.3f}",
    )
    c2.metric(
        "Top-1 retrieval score",
        f"{gates['top1_score']:.3f}",
        "gate pass" if gates["retrieval_pass"] else "gate FAIL (< 0.65)",
        delta_color="normal" if gates["retrieval_pass"] else "inverse",
    )
    c3.metric(
        "Intent gate",
        "pass" if gates["intent_pass"] else "FAIL",
        "≥ 0.60" if gates["intent_pass"] else "< 0.60",
        delta_color="normal" if gates["intent_pass"] else "inverse",
    )
    c4.metric(
        "End-to-end",
        f"{timings.get('total_ms', 0):.0f} ms",
        f"LLM {timings.get('llm_ms', 0):.0f} ms",
    )

    # ---- reasons ------------------------------------------------------- #
    if policy.get("reasons"):
        st.markdown("**Why escalate (rule trace):**")
        for r in policy["reasons"]:
            st.markdown(f"- `{r['rule']}` **{r['name']}** — {r['detail']}")

    # ---- reply / handoff ----------------------------------------------- #
    if decision == "auto_handle":
        st.subheader("Draft reply (ready to send)")
        st.markdown(f"> {out['reply']}")
        scores = out.get("scores", {})
        s1, s2, s3, s4 = st.columns(4)
        s1.metric("Grounding overlap", f"{scores.get('grounding_overlap', 0):.3f}")
        s2.metric(
            "Unsupported specifics",
            str(len(scores.get("unsupported_specifics", []))),
            "clean" if not scores.get("unsupported_specifics") else "CHECK",
            delta_color="normal" if not scores.get("unsupported_specifics") else "inverse",
        )
        s3.metric("Framing compliant", "yes" if scores.get("framing_compliant") else "NO")
        s4.metric("Length", f"{scores.get('length_chars', 0)} chars")
    else:
        handoff = out.get("handoff", {})
        st.subheader("Human handoff bundle")
        st.markdown(f"**Next step:** {handoff.get('next_step')}")
        st.markdown(
            "**Suggested public acknowledgment** (optional template — never "
            "sent automatically):"
        )
        st.info(f"> {handoff.get('suggested_public_acknowledgment', '')}")
        st.caption(handoff.get("note_for_agent", ""))

    # ---- evidence ------------------------------------------------------ #
    evidence = out.get("evidence", [])
    if evidence:
        with st.expander(f"Evidence — top-{len(evidence)} historical cases (Phase 4)"):
            for ev in evidence:
                st.markdown(
                    f"**[{ev['rank']}]** similarity `{ev['score']:.3f}` · "
                    f"issue `{ev.get('predicted_intent', '?')}`"
                )
                st.markdown(f"- 🧑 Customer: {ev['customer_message']}")
                st.markdown(f"- 🎧 Support: {ev['support_response']}")
                st.divider()

    st.caption(
        "All content above was produced by the live service "
        "(`mini-services/retrieval-service`): Phase 3 head + Phase 4 FAISS + "
        "Phase 6 policy + Phase 5 generation. This app adds no logic of its own."
    )


if __name__ == "__main__":
    main()
