"""Phase 6 — explainable rule-based escalation policy.

Decides, from signals that are all available *before* any reply is drafted,
whether a customer message may be auto-handled (grounded draft published
without human review) or must be escalated to a human agent.

Design constraints (assignment §10 / decision log D25):
* **Rule-based and explainable** — every decision returns the full list of
  rules that fired, with the observed values. No learned component, no
  thresholds tuned on the test labels (the two numeric gates reuse the
  Phase 3/4/5 thresholds already fixed in ``.env``).
* **Runtime-honest** — consumes only what the live pipeline produces for an
  unseen message: the Phase 3 head's predicted intent + confidence, the
  Phase 4 top-1 retrieval score, and the raw message text. It never looks
  at golden labels.
* **Safety-asymmetric** — a wrongful auto-handle (false auto) is far more
  costly than a wrongful escalation (a human reviews a message they did not
  need to). The policy therefore prefers conservative failure.

Rule inventory (any firing rule ⇒ escalate; all rules are always evaluated
so the reason list is complete):

``E2 private-state domain``
    Predicted intent ∈ {billing_purchases, repair_warranty, account_icloud,
    security_privacy, support_process}. These are domains where the correct
    next step depends on private state the system cannot see (an order, a
    repair quote, an account, verified identity, official contact channels).
    Four of the five mirror the Phase 2 taxonomy's
    ``typically_escalated`` hints; ``account_icloud`` is a documented Phase 6
    refinement of the Phase 2 hint ("recovery steps are well covered") —
    sign-in/lockout reports are indistinguishable from takeover-adjacent
    situations at the intent level, and public advice on password matters
    can compound the lockout. See decision_log D25.

``E3 unmatched intent``
    Predicted intent ``other`` — no groundable issue class; an evidence
    draft would be built on irrelevant cases.

``E4 sensitive content``
    The message itself contains payment/order language (e.g. "bought … not
    received", "refund", "charged"), an email address, a phone number, or a
    card-like number. Defense-in-depth: catches domain misclassifications
    (the Phase 3 head is imperfect) and keeps private data out of the public
    timeline.

``G1 intent-confidence gate``
    ``intent_confidence < INTENT_CONFIDENCE_THRESHOLD`` (0.60) — the Phase 3
    confidence preview measured 0.780 mean on correct vs 0.508 on wrong
    predictions; below the threshold the intent cannot be trusted to route
    the draft.

``G2 retrieval-evidence gate``
    ``top1_score < RETRIEVAL_THRESHOLD`` (0.65) — the Phase 4 threshold
    preview measured Recall@5 0.826 above vs 0.586 below; a draft grounded
    on weaker evidence is more likely to be a clarifying question than an
    answer, which a human should own.

The evaluation lives in ``scripts/evaluate_escalation.py`` (ground truth:
``evaluation/escalation_labels.json``).
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from src.config import get_settings
from src.intents.taxonomy import TAXONOMY_BY_LABEL

# --- rule constants ------------------------------------------------------- #

# Phase 2 taxonomy hints (typically_escalated) …
_PRIVATE_STATE_DOMAINS: frozenset[str] = frozenset(
    label
    for label, cls in TAXONOMY_BY_LABEL.items()
    if cls.typically_escalated and label != "other"
)
# … plus the documented Phase 6 refinement (see module docstring / D25):
_PRIVATE_STATE_DOMAINS = _PRIVATE_STATE_DOMAINS | frozenset({"account_icloud"})

_UNMATCHED_INTENT = "other"

# E4 — transparent content patterns (kept deliberately small and readable;
# every pattern is listed in the evaluation output when it fires).
_E4_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    (
        "order_or_payment_language",
        re.compile(
            r"\b(?:"
            r"refund|money\s+back|"
            r"charged?\s+(?:me|twice|for\s+something)|wrong(?:ly)?\s+charged|"
            r"bought\b[^.!?]{0,80}?\b(?:not\s+gotten|not\s+received|never\s+(?:came|arrived))|"
            r"purchased?\b[^.!?]{0,80}?\b(?:not\s+(?:gotten|received)|never\s+(?:came|arrived))|"
            r"order\b[^.!?]{0,80}?\b(?:never\s+(?:came|arrived)|not\s+received)"
            r")\b",
            re.IGNORECASE,
        ),
    ),
    (
        "email_address",
        re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}"),
    ),
    (
        "phone_number",
        re.compile(r"(?:\+?\d[\d\s().-]{7,}\d)"),
    ),
    (
        "card_like_number",
        re.compile(r"\b(?:\d[ -]?){12,15}\d\b"),
    ),
)

# --- decision types ------------------------------------------------------- #


@dataclass(frozen=True)
class EscalationReason:
    """One fired rule with the evidence that made it fire."""

    rule: str  # "E2" | "E3" | "E4" | "G1" | "G2"
    name: str  # "private_state_domain" | …
    detail: str  # human-readable explanation with observed values


@dataclass(frozen=True)
class EscalationDecision:
    """Full explainable outcome of the policy for one message."""

    action: str  # "auto_handle" | "escalate"
    reasons: tuple[EscalationReason, ...] = field(default_factory=tuple)
    intent_confidence: float = 0.0
    top1_score: float = 0.0
    predicted_intent: str = ""
    thresholds: dict[str, float] = field(default_factory=dict)

    @property
    def rule_ids(self) -> tuple[str, ...]:
        return tuple(r.rule for r in self.reasons)

    def to_json(self) -> dict:
        return {
            "action": self.action,
            "reasons": [
                {"rule": r.rule, "name": r.name, "detail": r.detail}
                for r in self.reasons
            ],
            "predicted_intent": self.predicted_intent,
            "intent_confidence": round(self.intent_confidence, 4),
            "top1_score": round(self.top1_score, 4),
            "thresholds": self.thresholds,
        }


# --- the policy ------------------------------------------------------------ #


def decide_escalation(
    message: str,
    predicted_intent: str,
    intent_confidence: float,
    top1_score: float,
) -> EscalationDecision:
    """Apply the rule-based policy to one message's runtime signals."""
    settings = get_settings()
    intent_threshold = settings.intent_confidence_threshold
    retrieval_threshold = settings.retrieval_threshold

    reasons: list[EscalationReason] = []

    # E2 — private-state domain
    if predicted_intent in _PRIVATE_STATE_DOMAINS:
        reasons.append(
            EscalationReason(
                rule="E2",
                name="private_state_domain",
                detail=(
                    f"predicted intent '{predicted_intent}' is a private-state "
                    "domain (order/quote/account/security/support-process): "
                    "the correct next step depends on private information the "
                    "system cannot see"
                ),
            )
        )

    # E3 — unmatched intent
    if predicted_intent == _UNMATCHED_INTENT:
        reasons.append(
            EscalationReason(
                rule="E3",
                name="unmatched_intent",
                detail=(
                    "predicted intent 'other' — no groundable issue class, an "
                    "evidence-grounded draft would rest on irrelevant cases"
                ),
            )
        )

    # E4 — sensitive content in the message itself
    for name, pattern in _E4_PATTERNS:
        match = pattern.search(message)
        if match:
            reasons.append(
                EscalationReason(
                    rule="E4",
                    name=f"content:{name}",
                    detail=(
                        f"message contains {name.replace('_', ' ')} "
                        f"(match: \"{match.group(0)[:60]}\") — payment/order "
                        "matters or private data must not be handled by a "
                        "public auto-reply"
                    ),
                )
            )

    # G1 — intent-confidence gate
    if intent_confidence < intent_threshold:
        reasons.append(
            EscalationReason(
                rule="G1",
                name="intent_confidence_below_threshold",
                detail=(
                    f"intent confidence {intent_confidence:.3f} < "
                    f"{intent_threshold:.2f} — the Phase 3 head's prediction "
                    "cannot be trusted to route a public reply"
                ),
            )
        )

    # G2 — retrieval-evidence gate
    if top1_score < retrieval_threshold:
        reasons.append(
            EscalationReason(
                rule="G2",
                name="retrieval_score_below_threshold",
                detail=(
                    f"top-1 retrieval score {top1_score:.3f} < "
                    f"{retrieval_threshold:.2f} — evidence too weak to ground "
                    "a public reply"
                ),
            )
        )

    action = "escalate" if reasons else "auto_handle"
    return EscalationDecision(
        action=action,
        reasons=tuple(reasons),
        intent_confidence=intent_confidence,
        top1_score=top1_score,
        predicted_intent=predicted_intent,
        thresholds={
            "intent_confidence": intent_threshold,
            "retrieval": retrieval_threshold,
        },
    )


def policy_description() -> dict:
    """Machine-readable description of the rule inventory (for the report,
    the evaluation output and the dashboard)."""
    settings = get_settings()
    return {
        "type": "rule-based, explainable (no learned component)",
        "decision": "escalate if ANY rule fires; auto_handle only when all rules pass",
        "safety_asymmetry": (
            "a false auto-handle is far costlier than a false escalation — "
            "the policy is deliberately conservative"
        ),
        "rules": [
            {
                "id": "E2",
                "name": "private_state_domain",
                "fires_when": "predicted intent ∈ {"
                + ", ".join(sorted(_PRIVATE_STATE_DOMAINS))
                + "}",
                "why": "the correct next step depends on private state the "
                "system cannot see (order, quote, account, identity, "
                "official channels); public generic advice risks harm",
                "provenance": "Phase 2 taxonomy typically_escalated hints "
                "(4 of 5) + documented Phase 6 account_icloud refinement "
                "(decision log D25)",
            },
            {
                "id": "E3",
                "name": "unmatched_intent",
                "fires_when": "predicted intent == 'other'",
                "why": "no groundable issue class; an evidence draft would "
                "rest on irrelevant historical cases",
                "provenance": "Phase 2 taxonomy (the unmatched pool)",
            },
            {
                "id": "E4",
                "name": "sensitive_content",
                "fires_when": "message matches one of "
                + str([name for name, _ in _E4_PATTERNS]),
                "why": "payment/order language or private data (email, "
                "phone, card-like number) in the message must not be "
                "answered — or echoed — by a public auto-reply",
                "provenance": "Phase 5 safety rule 4, applied at the "
                "decision layer as defense-in-depth against intent "
                "misclassification",
            },
            {
                "id": "G1",
                "name": "intent_confidence_gate",
                "fires_when": f"intent_confidence < {settings.intent_confidence_threshold:.2f}",
                "why": "Phase 3 measured 0.780 mean confidence on correct "
                "vs 0.508 on wrong test predictions; below the threshold "
                "the routing itself is unreliable",
                "provenance": "INTENT_CONFIDENCE_THRESHOLD fixed since "
                "Phase 3 (.env, single source of truth)",
            },
            {
                "id": "G2",
                "name": "retrieval_evidence_gate",
                "fires_when": f"top1_score < {settings.retrieval_threshold:.2f}",
                "why": "Phase 4 measured Recall@5 0.826 above vs 0.586 "
                "below the threshold; weak evidence produces clarifying "
                "questions, which a human should own",
                "provenance": "RETRIEVAL_THRESHOLD fixed since Phase 4 "
                "(.env, single source of truth)",
            },
        ],
        "inputs": [
            "predicted intent (Phase 3 logreg head)",
            "intent confidence (Phase 3)",
            "top-1 retrieval score (Phase 4 FAISS)",
            "raw message text (E4 patterns)",
        ],
    }
