#!/usr/bin/env python3
"""Phase 5 — grounded response generation evaluation.

For every golden-set TEST opener (the same 29 openers Phases 3 and 4 were
evaluated on), ask the live generation service for an evidence-grounded
draft reply, then measure reply quality with transparent, honest heuristics:

  * success rate            — the service returned a usable reply
  * grounding overlap       — share of the reply's content tokens that appear
                              in the retrieved evidence pairs (lexical proxy)
  * unsupported specifics   — numbers / versions / prices / URLs in the reply
                              that appear nowhere in the evidence (fabrication
                              signal)
  * safety framing          — the reply acknowledges its historical-evidence
                              basis ("based on similar cases we've seen")
  * personal data           — the reply must never solicit or repeat private
                              details in public (assignment §16 rule)
  * escalation consistency  — when the Phase 6 gates fail (intent confidence
                              < INTENT_CONFIDENCE_THRESHOLD or top similarity
                              < RETRIEVAL_THRESHOLD) the reply must avoid
                              confident assertions: it asks a clarifying
                              question or redirects to Direct Messages
  * length / latency        — style match against the historical corpus and
                              end-to-end cost

No LLM-as-judge and no human annotation: every number below is a stated,
reproducible heuristic over recorded artifacts. The scoring itself runs in
the service (single implementation shared by the dashboard demo), and this
script aggregates the per-reply scores it returns.

Usage:
    # the live service must be running (mini-services/retrieval-service):
    #   cd mini-services/retrieval-service && bun run dev     # port 3030
    python scripts/evaluate_generation.py

Outputs:
    evaluation/results/generation_results.json   (full per-example records)
    evaluation/results/phase5_summary.json       (dashboard-ready summary)
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

SERVICE_BASE = "http://localhost:3030"
GENERATE_URL = f"{SERVICE_BASE}/api/phase5/generate"
HEALTH_URL = f"{SERVICE_BASE}/api/phase4/health"
WARMUP_URL = f"{SERVICE_BASE}/api/phase4/warmup"
REQUEST_TIMEOUT_S = 150  # first call may include the ~15 s worker warm-up
RETRIES_PER_EXAMPLE = 2

RESULTS_PATH = PROJECT_ROOT / "evaluation" / "results" / "generation_results.json"
SUMMARY_PATH = PROJECT_ROOT / "evaluation" / "results" / "phase5_summary.json"
GOLDEN_CSV = PROJECT_ROOT / "evaluation" / "golden_set.csv"
EDA_JSON = PROJECT_ROOT / "data" / "processed" / "eda_summary.json"

PIPELINE_STEPS = [
    "Phase 3 logreg head → predicted intent + confidence for the message",
    "Phase 4 FAISS index → top-K most similar historical evidence pairs",
    "Grounded prompt: customer message + intent/confidence + evidence quality + the K historical pairs, under six non-negotiable safety rules",
    "LLM draft (z-ai-web-dev-sdk, backend-only) → one Twitter-length reply",
    "Transparent heuristic scoring: grounding overlap, unsupported specifics, safety framing, escalation consistency",
]

HONEST_CAVEATS = [
    "Token-overlap grounding is a lexical proxy: a reply can be faithful while using fresh wording, or unfaithful while reusing evidence words. No semantic entailment verification was performed.",
    "LLM outputs are nondeterministic; the metrics below describe the recorded run (see generated_at), not a stable property of the pipeline.",
    "No human annotation or preference test was performed — no claim is made that the replies are subjectively 'good', only that the measured grounding and safety proxies hold.",
    "The unsupported-specifics check covers numbers, version-like tokens, prices and URLs; fabricated prose claims would not be caught by it.",
    "Escalation consistency is a preview of the Phase 6 policy; the policy itself is not implemented yet.",
]


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


def _ensure_service() -> dict:
    """Health-check the live service; warm the worker up if it is idle."""
    try:
        health = _get(HEALTH_URL)
    except urllib.error.URLError as exc:
        raise SystemExit(
            f"live service not reachable at {SERVICE_BASE} ({exc}).\n"
            "Start it first:  cd mini-services/retrieval-service && bun run dev"
        ) from exc
    if health.get("worker") != "ready":
        print("worker idle — warming up (model + index + corpus, ~15 s)…", flush=True)
        _post(WARMUP_URL, {}, REQUEST_TIMEOUT_S)
    return _get(HEALTH_URL)


def _generate(message: str, k: int) -> dict:
    last_err: Exception | None = None
    for attempt in range(1, RETRIES_PER_EXAMPLE + 1):
        try:
            return _post(GENERATE_URL, {"message": message, "k": k}, REQUEST_TIMEOUT_S)
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as exc:
            last_err = exc
            # a 503 usually means the Python worker is (re)loading — wait for
            # it instead of burning retries inside the dead window
            _wait_worker_ready(timeout_s=90)
            time.sleep(1.5 * attempt)
    raise RuntimeError(
        f"generation failed after {RETRIES_PER_EXAMPLE} attempts: {last_err}"
    )


def _wait_worker_ready(timeout_s: int) -> None:
    """Poll the service until its worker reports ready (or timeout)."""
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        try:
            if _get(HEALTH_URL).get("worker") == "ready":
                return
        except urllib.error.URLError:
            pass
        time.sleep(3)


def _median(xs: list[float]) -> float:
    return round(statistics.median(xs), 4) if xs else 0.0


def _mean(xs: list[float]) -> float:
    return round(statistics.fmean(xs), 4) if xs else 0.0


def main() -> None:
    settings = get_settings()
    k = settings.top_k

    health = _ensure_service()
    print(
        f"service ready: corpus_size={health.get('corpus_size')} "
        f"model={health.get('model')}",
        flush=True,
    )

    # ---- golden TEST openers (same evaluation set as Phases 3 and 4) ----- #
    with GOLDEN_CSV.open(newline="", encoding="utf-8") as fh:
        rows = [r for r in csv.DictReader(fh) if r["split"] == "test"]
    print(f"golden TEST openers: {len(rows)}", flush=True)

    records: list[dict] = []
    failures: list[dict] = []
    t_start = time.time()
    for i, row in enumerate(rows, 1):
        message = row["text"].strip()
        print(f"[{i:2d}/{len(rows)}] {message[:70]!r}", flush=True)
        try:
            out = _generate(message, k)
        except Exception as exc:  # honest failure recording
            failures.append({"index": i, "message": message, "error": str(exc)})
            print(f"    FAILED: {exc}", flush=True)
            continue
        if not out.get("ok"):
            failures.append(
                {"index": i, "message": message, "error": str(out.get("error"))}
            )
            print(f"    FAILED: {out.get('error')}", flush=True)
            continue
        records.append(
            {
                "index": i,
                "conversation_id": row["conversation_id"],
                "message": message,
                "golden_label": row["label"],
                "predicted_intent": out["query_intent"]["label"],
                "intent_confidence": round(out["query_intent"]["confidence"], 4),
                "runner_up": out["query_intent"].get("runner_up"),
                "runner_up_confidence": round(
                    out["query_intent"].get("runner_up_confidence") or 0.0, 4
                ),
                "gates": {
                    key: value
                    for key, value in out["gates"].items()
                    if key != "thresholds"
                },
                "reply": out["reply"],
                "scores": out["scores"],
                "evidence": [
                    {
                        "rank": ev["rank"],
                        "score": round(ev["score"], 4),
                        "pair_id": ev["pair_id"],
                        "conversation_id": ev.get("conversation_id"),
                        "predicted_intent": ev.get("predicted_intent"),
                        "customer_message": ev["customer_message"][:240],
                        "support_response": ev["support_response"][:240],
                    }
                    for ev in out["evidence"]
                ],
                "timings": out["timings"],
                "llm": out["llm"],
                "prompt": out["prompt"],
            }
        )
        s = out["scores"]
        print(
            f"    ok · grounding={s['grounding_overlap']:.2f} "
            f"unsupported={len(s['unsupported_specifics'])} "
            f"framing={s['framing_compliant']} llm={out['timings']['llm_ms']}ms",
            flush=True,
        )
    wall_s = round(time.time() - t_start, 1)

    if not records:
        raise SystemExit("no successful generations — refusing to write empty results")

    # ---- aggregate (honest, heuristic) ----------------------------------- #
    n_total = len(rows)
    n_ok = len(records)
    overlaps = [r["scores"]["grounding_overlap"] for r in records]
    unsupported_counts = [
        len(r["scores"]["unsupported_specifics"]) for r in records
    ]
    framing = [r["scores"]["framing_compliant"] for r in records]
    clarifying = [r["scores"]["clarifying_question"] for r in records]
    dm = [r["scores"]["dm_redirect"] for r in records]
    solicited = [r["scores"]["personal_data_solicited"] for r in records]
    gated = [r for r in records if not r["gates"]["auto_handle_eligible"]]
    gated_consistent = [
        r for r in gated
        if r["scores"]["clarifying_question"] or r["scores"]["dm_redirect"]
    ]
    lengths_chars = [r["scores"]["length_chars"] for r in records]
    lengths_words = [r["scores"]["length_words"] for r in records]
    llm_ms = [r["timings"]["llm_ms"] for r in records]
    total_ms = [r["timings"]["total_ms"] for r in records]

    # corpus style reference — from the measured EDA artifact, not hardcoded
    eda = json.loads(EDA_JSON.read_text(encoding="utf-8"))
    dataset = eda.get("dataset", {})
    corpus_avg_chars = dataset.get("avg_message_chars")
    corpus_avg_words = dataset.get("avg_message_words")

    llm_models = sorted({r["llm"]["model"] for r in records})
    eval_block = {
        "n_total": n_total,
        "n_success": n_ok,
        "success_rate": round(n_ok / n_total, 4),
        "grounding_overlap": {
            "mean": _mean(overlaps),
            "median": _median(overlaps),
            "min": round(min(overlaps), 4),
            "max": round(max(overlaps), 4),
            "definition": "share of the reply's content tokens (len>=3, stopword-filtered) that appear in the top-K evidence pairs' text",
        },
        "unsupported_specifics": {
            "replies_clean": sum(1 for c in unsupported_counts if c == 0),
            "clean_rate": round(
                sum(1 for c in unsupported_counts if c == 0) / n_ok, 4
            ),
            "total_violations": sum(unsupported_counts),
            "definition": "numbers / version-like tokens / prices / URLs in the reply that appear nowhere in the evidence",
        },
        "framing_compliance_rate": round(sum(framing) / n_ok, 4),
        "clarifying_rate": round(sum(clarifying) / n_ok, 4),
        "dm_redirect_rate": round(sum(dm) / n_ok, 4),
        "personal_data_solicited_count": sum(solicited),
        "escalation_consistency": {
            "gated_n": len(gated),
            "consistent_n": len(gated_consistent),
            "rate": round(len(gated_consistent) / len(gated), 4) if gated else None,
            "definition": "among replies whose Phase 6 gates fail (intent confidence < threshold OR top similarity < threshold): the reply asks a clarifying question or redirects to DMs instead of asserting specific advice",
        },
        "gates": {
            "intent_pass_n": sum(
                1 for r in records if r["gates"]["intent_pass"]
            ),
            "retrieval_pass_n": sum(
                1 for r in records if r["gates"]["retrieval_pass"]
            ),
            "auto_eligible_n": sum(
                1 for r in records if r["gates"]["auto_handle_eligible"]
            ),
            "auto_eligible_rate": round(
                sum(1 for r in records if r["gates"]["auto_handle_eligible"]) / n_ok,
                4,
            ),
        },
        "length": {
            "mean_chars": _mean(lengths_chars),
            "mean_words": _mean(lengths_words),
            "corpus_avg_chars": corpus_avg_chars,
            "corpus_avg_words": corpus_avg_words,
            "within_280_rate": round(
                sum(1 for c in lengths_chars if c <= 280) / n_ok, 4
            ),
        },
        "latency": {
            "mean_llm_ms": _mean(llm_ms),
            "mean_total_ms": _mean(total_ms),
            "max_total_ms": max(total_ms),
        },
        "failures": failures,
    }

    # ---- qualitative examples (deterministic spread over grounding) ----- #
    ordered = sorted(records, key=lambda r: r["scores"]["grounding_overlap"])
    n = len(ordered)
    idx = sorted({0, n // 4, n // 2, (3 * n) // 4, n - 1})
    qualitative = []
    for j in idx:
        r = ordered[j]
        qualitative.append(
            {
                "message": r["message"][:240],
                "golden_label": r["golden_label"],
                "predicted_intent": r["predicted_intent"],
                "intent_confidence": r["intent_confidence"],
                "top1_score": r["gates"]["top1_score"],
                "gates": {
                    k: v for k, v in r["gates"].items() if k != "thresholds"
                },
                "reply": r["reply"],
                "scores": r["scores"],
                "evidence_top3": r["evidence"][:3],
                "grounding_overlap": r["scores"]["grounding_overlap"],
            }
        )

    # safety rules + prompt exemplar — extracted from the service responses
    # (field-exact source of truth, not a Python re-statement)
    exemplar_src = records[0]
    system_prompt = exemplar_src["prompt"]["system"]
    safety_rules = [
        line.strip()
        for line in system_prompt.splitlines()
        if line.strip() and line.strip()[0].isdigit()
    ]

    summary = {
        "phase": 5,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "random_seed": settings.random_seed,
        "config": {
            "top_k": k,
            "intent_confidence_threshold": settings.intent_confidence_threshold,
            "retrieval_threshold": settings.retrieval_threshold,
            "llm": llm_models[0] if len(llm_models) == 1 else llm_models,
            "max_input_chars": 500,
            "max_reply_chars": 280,
        },
        "pipeline": PIPELINE_STEPS,
        "safety_rules": safety_rules,
        "prompt_design": {
            "system_prompt_words": len(system_prompt.split()),
            "user_prompt_template": (
                "customer message · predicted intent (Phase 3 head confidence, "
                "runner-up) · evidence quality (top-1 cosine vs threshold) · the "
                f"top-{k} historical pairs (customer + support text, intent) · "
                "instruction to follow every safety rule"
            ),
            "exemplar": {
                "message": exemplar_src["message"][:240],
                "system_prompt": system_prompt,
                "user_prompt": exemplar_src["prompt"]["user"],
            },
        },
        "evaluation": {"test": eval_block},
        "qualitative_examples": qualitative,
        "honest_caveats": HONEST_CAVEATS,
        "wall_clock_seconds": wall_s,
        "artifacts": {
            "results": "evaluation/results/generation_results.json",
            "summary": "evaluation/results/phase5_summary.json",
        },
        "live_service": {
            "port": 3030,
            "generate_endpoint": "/api/phase5/generate",
            "health_endpoint": "/api/phase4/health",
            "note": (
                "mini-services/retrieval-service (Bun + Python worker + z-ai LLM) "
                "generates evidence-grounded drafts live; the dashboard demo calls "
                "it through the gateway via XTransformPort=3030."
            ),
        },
    }

    RESULTS_PATH.write_text(
        json.dumps(
            {
                "phase": 5,
                "generated_at": summary["generated_at"],
                "service_health": health,
                "records": records,
                "failures": failures,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    SUMMARY_PATH.write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"wrote {RESULTS_PATH}")
    print(f"wrote {SUMMARY_PATH}")
    print(
        "PHASE 5 GENERATION EVALUATION COMPLETE — "
        f"success {n_ok}/{n_total} · grounding mean {eval_block['grounding_overlap']['mean']} · "
        f"clean specifics {eval_block['unsupported_specifics']['replies_clean']}/{n_ok} · "
        f"framing {eval_block['framing_compliance_rate']} · "
        f"escalation consistency {eval_block['escalation_consistency']['rate']}"
    )


if __name__ == "__main__":
    main()
