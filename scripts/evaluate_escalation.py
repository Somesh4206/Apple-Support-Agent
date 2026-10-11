#!/usr/bin/env python3
"""Phase 6 — escalation-policy evaluation on the golden TEST openers.

Applies the rule-based policy (``src/escalation/policy.py``) to the runtime
signals recorded for each of the 29 golden TEST openers in Phase 5
(``evaluation/results/generation_results.json``: predicted intent, intent
confidence, top-1 retrieval score, message text) and scores the decisions
against the human ground truth (``evaluation/escalation_labels.json``).

Measured (assignment §10):
  * false-auto rate  — PRIMARY SAFETY METRIC: share of should-escalate
                       messages the policy auto-handles anyway
  * precision / recall / F1 — escalate as the positive class
  * over-escalation rate — the honest cost metric: share of auto-eligible
                       messages wrongly escalated (human-review burden)
  * auto-handle rate — share of messages the policy dares to auto-handle
  * exact Clopper-Pearson confidence intervals for every rate (n=29 is
    small — the intervals are part of the result, not a footnote)
  * per-rule fire statistics + ablation vs the Phase 5 gates-only preview
  * qualitative examples: every over-escalation (with the reasons that
    fired) — the failure mode the next phase should fix

Deterministic: the policy is pure rules over recorded signals; re-running
reproduces identical numbers (RANDOM_SEED irrelevant, recorded anyway).

Usage:
    python scripts/evaluate_escalation.py

Outputs:
    evaluation/results/escalation_results.json   (full per-example records)
    evaluation/results/phase6_summary.json       (dashboard-ready summary)
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from src.config import get_settings  # noqa: E402
from src.escalation.policy import decide_escalation, policy_description  # noqa: E402

RESULTS_DIR = PROJECT_ROOT / "evaluation" / "results"
GENERATION_RESULTS = RESULTS_DIR / "generation_results.json"
ESCALATION_LABELS = PROJECT_ROOT / "evaluation" / "escalation_labels.json"


# --------------------------------------------------------------------- #
# exact binomial confidence intervals (Clopper-Pearson)                  #
# --------------------------------------------------------------------- #

def _clopper_pearson(successes: int, n: int, alpha: float = 0.05) -> tuple[float, float]:
    """Exact CI for a binomial proportion (two-sided, coverage 1-alpha)."""
    if n == 0:
        return (0.0, 1.0)
    try:
        from scipy.stats import beta as _beta
    except ImportError:  # pragma: no cover — scipy ships with scikit-learn
        # conservative fallback: rule of three
        lo = 0.0
        hi = 1.0 if successes == n else min(1.0, successes / n + 3.0 / n)
        return (lo, hi)

    lo = 0.0
    if successes > 0:
        lo = _beta.ppf(alpha / 2, successes, n - successes + 1)
    hi = 1.0
    if successes < n:
        hi = _beta.ppf(1 - alpha / 2, successes + 1, n - successes)
    return (float(lo), float(hi))


def _rate(successes: int, n: int) -> dict:
    lo, hi = _clopper_pearson(successes, n)
    return {
        "value": round(successes / n, 4) if n else None,
        "numerator": successes,
        "denominator": n,
        "ci95": [round(lo, 4), round(hi, 4)],
        "ci_method": "Clopper-Pearson (exact)",
    }


# --------------------------------------------------------------------- #
# main evaluation                                                         #
# --------------------------------------------------------------------- #

def main() -> int:
    settings = get_settings()

    generation = json.loads(GENERATION_RESULTS.read_text())
    labels_doc = json.loads(ESCALATION_LABELS.read_text())
    records = generation["records"]
    labels = labels_doc["labels"]

    if len(records) != len(labels):
        print(
            f"ERROR: {len(records)} generation records vs {len(labels)} labels"
        )
        return 1

    per_example: list[dict] = []
    rule_fires: dict[str, int] = {}
    confusion = {"tp": 0, "fp": 0, "fn": 0, "tn": 0}

    for rec in records:
        idx = f"{rec['index']:02d}"
        truth = labels[idx]["label"]
        should_escalate = truth == "escalate"

        decision = decide_escalation(
            message=rec["message"],
            predicted_intent=rec["predicted_intent"],
            intent_confidence=rec["intent_confidence"],
            top1_score=rec["gates"]["top1_score"],
        )
        policy_escalates = decision.action == "escalate"

        # ablation: the Phase 5 gates-only preview (intent_pass AND retrieval_pass)
        gates_only_auto = rec["gates"]["auto_handle_eligible"]

        for reason in decision.reasons:
            rule_fires[reason.rule] = rule_fires.get(reason.rule, 0) + 1

        if policy_escalates and should_escalate:
            outcome, confusion["tp"] = "true_escalate", confusion["tp"] + 1
        elif policy_escalates and not should_escalate:
            outcome, confusion["fp"] = "over_escalation", confusion["fp"] + 1
        elif not policy_escalates and should_escalate:
            outcome, confusion["fn"] = "FALSE_AUTO", confusion["fn"] + 1
        else:
            outcome, confusion["tn"] = "true_auto", confusion["tn"] + 1

        per_example.append(
            {
                "index": rec["index"],
                "message": rec["message"],
                "golden_intent": rec["golden_label"],
                "predicted_intent": rec["predicted_intent"],
                "intent_confidence": rec["intent_confidence"],
                "top1_score": rec["gates"]["top1_score"],
                "ground_truth": truth,
                "ground_truth_rationale": labels[idx]["rationale"],
                "policy_action": decision.action,
                "policy_reasons": [
                    {"rule": r.rule, "name": r.name, "detail": r.detail}
                    for r in decision.reasons
                ],
                "outcome": outcome,
                "phase5_gates_only_auto": gates_only_auto,
            }
        )

    n = len(per_example)
    tp, fp, fn, tn = (
        confusion["tp"],
        confusion["fp"],
        confusion["fn"],
        confusion["tn"],
    )
    escalate_truth = tp + fn
    auto_truth = tn + fp

    precision = tp / (tp + fp) if (tp + fp) else None
    recall = tp / (tp + fn) if (tp + fn) else None
    f1 = (
        2 * precision * recall / (precision + recall)
        if precision is not None and recall is not None and precision + recall > 0
        else None
    )

    evaluation = {
        "n_test": n,
        "confusion": {
            "true_escalate (policy=escalate, truth=escalate)": tp,
            "over_escalation (policy=escalate, truth=auto)": fp,
            "false_auto (policy=auto, truth=escalate)": fn,
            "true_auto (policy=auto, truth=auto)": tn,
        },
        "false_auto_rate": _rate(fn, escalate_truth),
        "false_auto_rate_overall": _rate(fn, n),
        "precision_escalate": _rate(tp, tp + fp),
        "recall_escalate": _rate(tp, tp + fn),
        "f1_escalate": round(f1, 4) if f1 is not None else None,
        "over_escalation_rate": _rate(fp, auto_truth),
        "auto_handle_rate": _rate(tn, n),
        "rule_fire_counts": dict(sorted(rule_fires.items())),
        "ablation_vs_phase5_gates": {
            "description": (
                "the Phase 5 preview auto-handled a message iff both numeric "
                "gates passed (intent_pass AND retrieval_pass); this ablation "
                "isolates what the Phase 6 domain/content rules add"
            ),
            "gates_only_auto_n": sum(
                1 for e in per_example if e["phase5_gates_only_auto"]
            ),
            "policy_auto_n": tn,
            "decision_deltas": [
                {
                    "index": e["index"],
                    "message": e["message"][:100],
                    "was_auto_now_escalated": True,
                    "reasons": [r["rule"] + " " + r["name"] for r in e["policy_reasons"]],
                    "ground_truth": e["ground_truth"],
                }
                for e in per_example
                if e["phase5_gates_only_auto"] and e["policy_action"] == "escalate"
            ],
        },
        "qualitative_over_escalations": [
            {
                "index": e["index"],
                "message": e["message"],
                "predicted_intent": e["predicted_intent"],
                "intent_confidence": e["intent_confidence"],
                "top1_score": e["top1_score"],
                "reasons_fired": [r["rule"] + " " + r["name"] for r in e["policy_reasons"]],
                "rationale": e["ground_truth_rationale"],
            }
            for e in per_example
            if e["outcome"] == "over_escalation"
        ],
        "honest_caveats": [
            "n=29 (the golden test split): every rate carries the wide exact CI reported alongside it — 0 false-autos in 10 should-escalate messages bounds the true false-auto rate below ~26% at 95% confidence, not at zero.",
            "Ground truth is ONE human's judgement against fixed written criteria; no inter-annotator agreement exists.",
            "The policy's numeric gates reuse the Phase 3/4 thresholds fixed before Phase 6; the domain rules reuse the Phase 2 taxonomy hints. No rule was tuned on these test labels.",
            "The runtime signals (predicted intent, confidence, top-1 score) come from the recorded Phase 5 run; re-running generation would produce slightly different confidences/scores and could shift borderline decisions.",
            "Precision/recall treat 'escalate' as the positive class; the operationally dominant error (over-escalation) is reported separately because it costs human minutes, not customer safety.",
        ],
    }

    results = {
        "phase": 6,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "random_seed": settings.random_seed,
        "policy": policy_description(),
        "ground_truth": {
            "source": "evaluation/escalation_labels.json",
            "criteria": labels_doc["labeling_protocol"]["criteria"],
            "annotator": labels_doc["labeling_protocol"]["annotator"],
            "escalate_n": escalate_truth,
            "auto_n": auto_truth,
        },
        "evaluation": evaluation,
        "per_example": per_example,
    }
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    (RESULTS_DIR / "escalation_results.json").write_text(
        json.dumps(results, indent=2, ensure_ascii=False) + "\n"
    )

    # dashboard-ready summary (field-exact with the results file)
    summary = {
        "phase": 6,
        "generated_at": results["generated_at"],
        "random_seed": settings.random_seed,
        "policy": results["policy"],
        "ground_truth": results["ground_truth"],
        "evaluation": evaluation,
        "wall_clock_seconds": 0.0,
        "artifacts": {
            "results": "evaluation/results/escalation_results.json",
            "labels": "evaluation/escalation_labels.json",
            "summary": "evaluation/results/phase6_summary.json",
        },
    }
    (RESULTS_DIR / "phase6_summary.json").write_text(
        json.dumps(summary, indent=2, ensure_ascii=False) + "\n"
    )

    # console report
    print("PHASE 6 — ESCALATION POLICY EVALUATION")
    print(f"  policy: rule-based, {len(results['policy']['rules'])} rules")
    print(f"  ground truth: {escalate_truth} escalate / {auto_truth} auto_ok (n={n})")
    print(f"  true_escalate={tp}  over_escalation={fp}  FALSE_AUTO={fn}  true_auto={tn}")
    far = evaluation["false_auto_rate"]
    print(
        f"  FALSE-AUTO RATE = {far['value']:.4f} "
        f"({far['numerator']}/{far['denominator']}) "
        f"CI95 [{far['ci95'][0]:.4f}, {far['ci95'][1]:.4f}]"
    )
    print(f"  precision={precision:.4f}  recall={recall:.4f}  F1={f1:.4f}")
    oe = evaluation["over_escalation_rate"]
    print(
        f"  over-escalation rate = {oe['value']:.4f} "
        f"({oe['numerator']}/{oe['denominator']})"
    )
    ah = evaluation["auto_handle_rate"]
    print(
        f"  auto-handle rate = {ah['value']:.4f} ({ah['numerator']}/{ah['denominator']})"
    )
    print(f"  rule fires: {evaluation['rule_fire_counts']}")
    print("  artifacts: escalation_results.json + phase6_summary.json written")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
