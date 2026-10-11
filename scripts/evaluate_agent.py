#!/usr/bin/env python3
"""Phase 7 — unified-agent end-to-end evaluation.

Composes everything the previous phases built and measures the composition:

    customer message
      → Phase 3 head (predicted intent + confidence)
      → Phase 4 FAISS retrieval (top-K evidence, top-1 score)
      → Phase 6 escalation policy (BEFORE any LLM call is spent)
      → auto_handle  ⇒ Phase 5 grounded generation, reply ready to send
        escalate     ⇒ structured human handoff (no LLM call at all)

For every golden TEST opener (the same 29 used by Phases 3–6) this script
calls the live agent endpoint (``POST /api/phase7/agent`` on the retrieval
service) and measures:

  * decision consistency — the service's TypeScript policy mirror must agree
    with ``src/escalation/policy.py`` on every message given the same
    runtime signals (a cross-implementation assertion, not a judgement)
  * end-to-end decision quality — the fresh live decisions scored against
    the Phase 6 ground-truth labels (false-auto / precision / recall)
  * composition correctness — auto decisions carry a scored reply; escalated
    decisions carry a handoff bundle and spent ZERO LLM time
  * cost — LLM calls and LLM milliseconds saved by gating generation behind
    the policy (vs Phase 5, which generated a draft for every message)
  * latency — end-to-end for auto vs escalated paths

Usage:
    # the live service must be running (mini-services/retrieval-service):
    #   cd mini-services/retrieval-service && bun run dev     # port 3030
    python scripts/evaluate_agent.py

Outputs:
    evaluation/results/agent_results.json   (full per-example records)
    evaluation/results/phase7_summary.json  (dashboard-ready summary)
"""
from __future__ import annotations

import csv
import json
import statistics
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from src.config import get_settings  # noqa: E402
from src.escalation.policy import decide_escalation, policy_description  # noqa: E402

SERVICE_BASE = "http://localhost:3030"
AGENT_URL = f"{SERVICE_BASE}/api/phase7/agent"
HEALTH_URL = f"{SERVICE_BASE}/api/phase4/health"
WARMUP_URL = f"{SERVICE_BASE}/api/phase4/warmup"
REQUEST_TIMEOUT_S = 150
RETRIES_PER_EXAMPLE = 2

RESULTS_PATH = PROJECT_ROOT / "evaluation" / "results" / "agent_results.json"
SUMMARY_PATH = PROJECT_ROOT / "evaluation" / "results" / "phase7_summary.json"
GOLDEN_CSV = PROJECT_ROOT / "evaluation" / "golden_set.csv"
ESCALATION_LABELS = PROJECT_ROOT / "evaluation" / "escalation_labels.json"

AGENT_STEPS = [
    "Phase 3 logreg head → predicted intent + confidence for the message",
    "Phase 4 FAISS index → top-K most similar historical evidence pairs",
    "Phase 6 escalation policy → auto_handle / escalate (rule-based, explainable) — decided BEFORE any LLM call",
    "auto_handle ⇒ Phase 5 grounded generation (six safety rules) → reply ready to send + heuristic scores",
    "escalate ⇒ structured human handoff: reasons, top-3 evidence, optional acknowledgment template — no LLM call spent",
]


# --------------------------------------------------------------------- #
# HTTP helpers                                                            #
# --------------------------------------------------------------------- #

def _get(url: str, timeout: int = 10) -> dict:
    with urllib.request.urlopen(url, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _post(url: str, payload: dict, timeout: int) -> dict:
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url, data=data, headers={"Content-Type": "application/json"}, method="POST"
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _wait_worker_ready(timeout_s: int) -> None:
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        try:
            if _get(HEALTH_URL).get("worker") == "ready":
                return
        except urllib.error.URLError:
            pass
        time.sleep(3)


def _ensure_service() -> dict:
    try:
        health = _get(HEALTH_URL)
    except urllib.error.URLError as exc:
        raise SystemExit(
            f"live service not reachable at {SERVICE_BASE} ({exc}).\n"
            "Start it first:  cd mini-services/retrieval-service && bun run dev"
        ) from exc
    if health.get("worker") != "ready":
        print("worker idle — warming up (model + index + corpus)…", flush=True)
        _post(WARMUP_URL, {}, REQUEST_TIMEOUT_S)
    return _get(HEALTH_URL)


def _agent(message: str, k: int) -> dict:
    last_err: Exception | None = None
    for attempt in range(1, RETRIES_PER_EXAMPLE + 1):
        try:
            return _post(AGENT_URL, {"message": message, "k": k}, REQUEST_TIMEOUT_S)
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as exc:
            last_err = exc
            _wait_worker_ready(timeout_s=120)
            time.sleep(1.5 * attempt)
    raise RuntimeError(
        f"agent call failed after {RETRIES_PER_EXAMPLE} attempts: {last_err}"
    )


def _mean(xs: list[float]) -> float:
    return round(statistics.fmean(xs), 4) if xs else 0.0


# --------------------------------------------------------------------- #
# main evaluation                                                         #
# --------------------------------------------------------------------- #

def main() -> int:
    settings = get_settings()
    k = settings.top_k

    health = _ensure_service()
    print(
        f"service ready: corpus_size={health.get('corpus_size')} "
        f"model={health.get('model')}",
        flush=True,
    )

    with GOLDEN_CSV.open(newline="", encoding="utf-8") as fh:
        rows = [r for r in csv.DictReader(fh) if r["split"] == "test"]
    labels_doc = json.loads(ESCALATION_LABELS.read_text())
    labels = labels_doc["labels"]
    print(f"golden TEST openers: {len(rows)}", flush=True)

    records: list[dict] = []
    failures: list[dict] = []
    consistency_mismatches: list[dict] = []
    t_start = time.time()

    for i, row in enumerate(rows, 1):
        message = row["text"].strip()
        idx = f"{i:02d}"
        print(f"[{i:2d}/{len(rows)}] {message[:70]!r}", flush=True)
        try:
            out = _agent(message, k)
        except Exception as exc:
            failures.append({"index": i, "message": message, "error": str(exc)})
            print(f"    FAILED: {exc}", flush=True)
            continue
        if not out.get("ok"):
            failures.append(
                {"index": i, "message": message, "error": str(out.get("error"))}
            )
            print(f"    FAILED: {out.get('error')}", flush=True)
            continue

        intent = out["query_intent"]
        decision = out["decision"]
        top1 = out["gates"]["top1_score"]

        # ---- cross-implementation consistency assertion --------------- #
        py_decision = decide_escalation(
            message=message,
            predicted_intent=intent["label"],
            intent_confidence=intent["confidence"],
            top1_score=top1,
        )
        consistent = py_decision.action == decision
        rule_ids_service = sorted(r["rule"] for r in out["policy"]["reasons"])
        rule_ids_python = sorted(r.rule for r in py_decision.reasons)
        rules_consistent = rule_ids_service == rule_ids_python
        if not (consistent and rules_consistent):
            consistency_mismatches.append(
                {
                    "index": i,
                    "message": message[:100],
                    "service_action": decision,
                    "python_action": py_decision.action,
                    "service_rules": rule_ids_service,
                    "python_rules": rule_ids_python,
                }
            )
            print(
                f"    CONSISTENCY MISMATCH: service={decision} {rule_ids_service} "
                f"python={py_decision.action} {rule_ids_python}",
                flush=True,
            )

        # ---- composition correctness --------------------------------- #
        structure_ok = True
        if decision == "auto_handle":
            structure_ok = (
                isinstance(out.get("reply"), str)
                and out.get("reply_status") == "ready_to_send"
                and "scores" in out
            )
        else:
            handoff = out.get("handoff") or {}
            structure_ok = (
                out.get("reply") is None
                and out.get("reply_status") == "not_generated_by_policy"
                and handoff.get("next_step") == "human_review"
                and isinstance(handoff.get("reasons"), list)
                and len(handoff["reasons"]) > 0
                and (out.get("timings") or {}).get("llm_ms") == 0
            )
        if not structure_ok:
            print(f"    STRUCTURE PROBLEM on {decision}", flush=True)

        records.append(
            {
                "index": i,
                "conversation_id": row["conversation_id"],
                "message": message,
                "golden_label": row["label"],
                "ground_truth": labels[idx]["label"],
                "predicted_intent": intent["label"],
                "intent_confidence": round(intent["confidence"], 4),
                "top1_score": round(top1, 4),
                "policy_action": decision,
                "policy_reasons": [
                    {"rule": r["rule"], "name": r["name"], "detail": r["detail"]}
                    for r in out["policy"]["reasons"]
                ],
                "python_policy_agrees": consistent and rules_consistent,
                "structure_ok": structure_ok,
                "reply": out.get("reply"),
                "reply_status": out.get("reply_status"),
                "scores": out.get("scores"),
                "handoff": out.get("handoff"),
                "llm": out.get("llm"),
                "timings": out.get("timings"),
            }
        )
        print(
            f"    decision={decision} rules={rule_ids_service} "
            f"llm_ms={(out.get('timings') or {}).get('llm_ms')} "
            f"total_ms={(out.get('timings') or {}).get('total_ms')}",
            flush=True,
        )

    wall_clock = round(time.time() - t_start, 1)

    # ---- aggregate ---------------------------------------------------- #
    n = len(records)
    auto_records = [r for r in records if r["policy_action"] == "auto_handle"]
    esc_records = [r for r in records if r["policy_action"] == "escalate"]

    tp = sum(1 for r in records if r["policy_action"] == "escalate" and r["ground_truth"] == "escalate")
    fp = sum(1 for r in records if r["policy_action"] == "escalate" and r["ground_truth"] == "auto_ok")
    fn = sum(1 for r in records if r["policy_action"] == "auto_handle" and r["ground_truth"] == "escalate")
    tn = sum(1 for r in records if r["policy_action"] == "auto_handle" and r["ground_truth"] == "auto_ok")
    precision = tp / (tp + fp) if (tp + fp) else None
    recall = tp / (tp + fn) if (tp + fn) else None

    llm_ms_auto = [
        (r["timings"] or {}).get("llm_ms", 0) or 0 for r in auto_records
    ]
    total_ms_auto = [
        (r["timings"] or {}).get("total_ms", 0) or 0 for r in auto_records
    ]
    total_ms_esc = [
        (r["timings"] or {}).get("total_ms", 0) or 0 for r in esc_records
    ]

    # Phase 5 generated a draft for EVERY message; the agent skips the LLM
    # for escalations — that is the measured cost saving.
    llm_calls_saved = len(esc_records)
    llm_ms_saved = _mean([])  # placeholder, computed below from phase5 stats
    try:
        phase5 = json.loads(
            (PROJECT_ROOT / "evaluation" / "results" / "phase5_summary.json").read_text()
        )
        phase5_mean_llm_ms = phase5["evaluation"]["test"]["latency"]["mean_llm_ms"]
    except Exception:
        phase5_mean_llm_ms = None

    grounding = [
        r["scores"]["grounding_overlap"]
        for r in auto_records
        if r.get("scores")
    ]

    evaluation = {
        "n_test": n,
        "n_success": n,
        "failures": failures,
        "consistency": {
            "description": (
                "the service's TypeScript policy mirror vs the Python policy "
                "applied to the same runtime signals (predicted intent, "
                "confidence, top-1 score) — must agree on every message"
            ),
            "agreed_n": sum(1 for r in records if r["python_policy_agrees"]),
            "total_n": n,
            "all_agree": all(r["python_policy_agrees"] for r in records) if records else False,
            "mismatches": consistency_mismatches,
        },
        "structure_ok_n": sum(1 for r in records if r["structure_ok"]),
        "decisions": {
            "auto_handle_n": len(auto_records),
            "escalate_n": len(esc_records),
            "auto_rate": round(len(auto_records) / n, 4) if n else None,
        },
        "end_to_end_quality": {
            "confusion": {
                "true_escalate": tp,
                "over_escalation": fp,
                "false_auto": fn,
                "true_auto": tn,
            },
            "false_auto_rate": round(fn / (tp + fn), 4) if (tp + fn) else None,
            "precision_escalate": round(precision, 4) if precision is not None else None,
            "recall_escalate": round(recall, 4) if recall is not None else None,
            "note": (
                "fresh live decisions on rebuilt artifacts — may differ "
                "marginally from the Phase 6 offline evaluation if intent "
                "confidences / retrieval scores shifted across rebuilds; "
                "both runs are reported, neither is hidden"
            ),
        },
        "cost": {
            "llm_calls_made": len(auto_records),
            "llm_calls_skipped_by_policy": llm_calls_saved,
            "llm_call_saving_rate": round(llm_calls_saved / n, 4) if n else None,
            "mean_llm_ms_auto": _mean(llm_ms_auto),
            "phase5_mean_llm_ms_per_reply": phase5_mean_llm_ms,
            "estimated_llm_ms_saved": (
                round(llm_calls_saved * phase5_mean_llm_ms, 1)
                if phase5_mean_llm_ms is not None
                else None
            ),
        },
        "latency": {
            "mean_total_ms_auto": _mean(total_ms_auto),
            "mean_total_ms_escalate": _mean(total_ms_esc),
            "note": "escalations skip the LLM entirely — their end-to-end time is embedding + FAISS + policy only",
        },
        "auto_reply_quality": {
            "n": len(grounding),
            "mean_grounding_overlap": _mean(grounding),
            "note": "same transparent Phase 5 heuristics, computed by the service for the replies it did generate",
        },
        "honest_caveats": [
            "LLM outputs are nondeterministic: the auto-path replies and their scores describe the recorded run (see generated_at).",
            "n=29 (golden test split); the end-to-end decision rates inherit the Phase 6 confidence-interval caveat.",
            "Latency is measured on a shared sandbox VM and varies with load; relative auto-vs-escalate gap is the meaningful signal.",
            "The consistency assertion checks the DECISION and rule ids; reason prose may differ in wording between implementations.",
        ],
    }

    results = {
        "phase": 7,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "random_seed": settings.random_seed,
        "config": {
            "top_k": k,
            "intent_confidence_threshold": settings.intent_confidence_threshold,
            "retrieval_threshold": settings.retrieval_threshold,
            "endpoint": AGENT_URL,
            "llm": "glm-4-plus via z-ai-web-dev-sdk (backend-only)",
        },
        "agent_steps": AGENT_STEPS,
        "policy": policy_description(),
        "service_health": health,
        "evaluation": evaluation,
        "records": records,
        "failures": failures,
        "wall_clock_seconds": wall_clock,
    }
    (RESULTS_PATH).write_text(json.dumps(results, indent=2, ensure_ascii=False) + "\n")

    summary = {
        "phase": 7,
        "generated_at": results["generated_at"],
        "random_seed": settings.random_seed,
        "config": results["config"],
        "agent_steps": AGENT_STEPS,
        "policy": results["policy"],
        "evaluation": evaluation,
        "wall_clock_seconds": wall_clock,
        "artifacts": {
            "results": "evaluation/results/agent_results.json",
            "summary": "evaluation/results/phase7_summary.json",
        },
        "live_service": {
            "port": 3030,
            "agent_endpoint": "/api/phase7/agent",
            "health_endpoint": "/api/phase4/health",
            "note": "mini-services/retrieval-service (Bun + Python worker + z-ai LLM); the dashboard agent console calls it through the gateway via XTransformPort=3030",
        },
    }
    (SUMMARY_PATH).write_text(json.dumps(summary, indent=2, ensure_ascii=False) + "\n")

    print()
    print("PHASE 7 — UNIFIED AGENT EVALUATION")
    print(f"  agent calls: {n} ok / {len(failures)} failed")
    cons = evaluation["consistency"]
    print(
        f"  policy consistency (TS service vs Python): {cons['agreed_n']}/{cons['total_n']} "
        f"{'ALL AGREE' if cons['all_agree'] else 'MISMATCHES PRESENT'}"
    )
    print(f"  structure correct: {evaluation['structure_ok_n']}/{n}")
    d = evaluation["decisions"]
    print(
        f"  decisions: {d['auto_handle_n']} auto_handle / {d['escalate_n']} escalate "
        f"(auto rate {d['auto_rate']:.4f})"
    )
    q = evaluation["end_to_end_quality"]
    print(
        f"  end-to-end vs ground truth: TP={tp} FP={fp} FN(false-auto)={fn} TN={tn} "
        f"precision={q['precision_escalate']} recall={q['recall_escalate']}"
    )
    c = evaluation["cost"]
    print(
        f"  LLM calls: {c['llm_calls_made']} made / {c['llm_calls_skipped_by_policy']} "
        f"skipped by policy ({c['llm_call_saving_rate']:.1%} saved)"
    )
    lat = evaluation["latency"]
    print(
        f"  latency: auto {lat['mean_total_ms_auto']} ms vs escalate "
        f"{lat['mean_total_ms_escalate']} ms end-to-end"
    )
    print(f"  wall clock: {wall_clock}s")
    print("  artifacts: agent_results.json + phase7_summary.json written")
    return 0 if not failures and cons["all_agree"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
