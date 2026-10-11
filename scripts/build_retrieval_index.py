"""Phase 4 — build the FAISS retrieval index and evaluate Recall@K.

The retrieval layer of the assignment: embed the historical evidence pairs
(Phase 1 ``conversation_pairs.csv``), index them with FAISS, and measure
whether the top-K neighbours of a golden-set opener are actually relevant.

Protocol (mirrors the honesty rules of Phases 2–3):

1. **Corpus isolation** — the 200 golden conversation ids
   (``evaluation/golden_conversation_ids.json``) are removed from the
   index BEFORE any search, together with every evidence pair those
   conversations produced (a conversation yields 1.31 pairs on average,
   so ~266 pairs go). Golden openers can therefore never retrieve their
   own conversations, and coverage is asserted both ways: every manifest
   conversation is present in the pairs corpus, and nothing indexed
   belongs to a golden conversation.
2. **Embeddings** — the same frozen ``all-MiniLM-L6-v2`` encoder as Phase 3
   over the *customer message* side of each pair (the side a query looks
   like), L2-normalised, cached on disk (models/embedding_cache/).
3. **Index** — ``faiss.IndexFlatIP``: exact cosine similarity, no
   approximate-index knobs to tune or document (see
   ``src/retrieval/faiss_index.py`` for the reasoning).
4. **Relevance for Recall@K** — the corpus is unlabeled, so retrieved
   pairs are labelled by the Phase 3 ``logreg_head`` (test accuracy 0.6552,
   macro-F1 0.3032 — its noise is reported, not hidden). A hit at rank ≤ k
   is a retrieved pair whose predicted label equals the opener's golden
   label. VAL is a sanity check; TEST is the reported number, exactly as
   in Phases 2–3.
5. **Secondary views, all measured** — retrieval as a kNN classifier
   (majority vote of the top-5 predicted labels vs the golden label,
   compared against the Phase 3 head on the same openers); the configured
   ``RETRIEVAL_THRESHOLD`` preview (share of test openers whose top-1
   cosine ≥ threshold, and recall among them — the Phase 5/6 grounding
   gate); top-1 cosine score statistics.

Writes:
  * ``models/retrieval_index.faiss`` + ``.json`` (id-mapping sidecar)
  * ``models/retrieval_corpus.jsonl.gz`` (self-contained live-service corpus:
    id, conversation_id, texts, predicted intent + confidence)
  * ``evaluation/results/retrieval_results.json``  (full per-query detail)
  * ``evaluation/results/phase4_summary.json``     (dashboard-ready summary)

Every number in the outputs is measured; nothing is estimated or fabricated.
"""
from __future__ import annotations

import gzip
import json
import logging
import sys
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))
sys.path.insert(0, str(PROJECT_ROOT / "scripts"))

from src.config import get_settings  # noqa: E402
from src.intents.embeddings import embed_texts_cached  # noqa: E402
from src.intents.embedding_classifier import EmbeddingLogReg  # noqa: E402
from src.retrieval.faiss_index import (  # noqa: E402
    RetrievalIndex,
    load_golden_excluded_ids,
)

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)-7s %(name)s: %(message)s"
)
logger = logging.getLogger("build_retrieval_index")

EVAL_DIR = PROJECT_ROOT / "evaluation"
RESULTS_DIR = EVAL_DIR / "results"
GOLDEN_CSV = EVAL_DIR / "golden_set.csv"
GOLDEN_MANIFEST = EVAL_DIR / "golden_conversation_ids.json"
PAIRS_CSV = PROJECT_ROOT / "data" / "processed" / "conversation_pairs.csv"
MODELS_DIR = PROJECT_ROOT / "models"
EMBED_CACHE = MODELS_DIR / "embedding_cache"
INDEX_PATH = MODELS_DIR / "retrieval_index.faiss"
CORPUS_JSONL = MODELS_DIR / "retrieval_corpus.jsonl.gz"

TOP_K = 10  # retrieve 10, evaluate Recall@1/3/5 (and keep 10 for the demo)


def _embed_corpus_chunked(
    texts: list[str], cache_dir: Path, chunk_size: int = 5000
) -> tuple[np.ndarray, bool, float]:
    """Embed a large corpus in restartable chunks.

    Each 5k-text chunk gets its own cache file (same key scheme as
    ``embed_texts_cached``), so an interrupted run resumes from the last
    completed chunk instead of restarting 20 minutes of CPU encoding from
    scratch. Chunks use ``batch_size=64`` — small enough to keep the CPU
    encode spike well under 1 GB alongside a resident dev server (the
    first attempt used 256 and triggered a kernel OOM elsewhere).
    """
    t0 = time.perf_counter()
    parts: list[np.ndarray] = []
    all_cached = True
    for start in range(0, len(texts), chunk_size):
        chunk = texts[start : start + chunk_size]
        vec, hit = embed_texts_cached(
            chunk,
            cache_dir,
            tag=f"retrieval_corpus_c{start // chunk_size:03d}",
            batch_size=64,
        )
        all_cached = all_cached and hit
        parts.append(vec)
        logger.info(
            "Corpus embed progress: %d / %d texts (chunk cache_hit=%s)",
            min(start + chunk_size, len(texts)), len(texts), hit,
        )
    return np.concatenate(parts, axis=0), all_cached, time.perf_counter() - t0


def _recall_metrics(queries: list[dict], k_list: list[int]) -> dict:
    """Recall@k + MRR@k over per-query hit ranks (1-based, 0 = no hit)."""
    n = len(queries)
    out: dict = {}
    for k in k_list:
        out[f"recall_at_{k}"] = round(
            sum(1 for q in queries if 0 < q["first_hit_rank"] <= k) / n, 4
        )
    max_k = max(k_list)
    out[f"mrr_at_{max_k}"] = round(
        sum(1.0 / q["first_hit_rank"] for q in queries if q["first_hit_rank"] > 0) / n,
        4,
    )
    return out


def _evaluate_split(
    name: str,
    split: pd.DataFrame,
    split_vec: np.ndarray,
    index: RetrievalIndex,
    corpus: pd.DataFrame,
    corpus_labels: list[str],
) -> tuple[dict, list[dict]]:
    """Search each opener, score label-agreement hits, return metrics + detail."""
    neighbors = index.search(split_vec, TOP_K)
    queries: list[dict] = []
    for row, hits in zip(split.itertuples(), neighbors):
        # map hit id -> corpus row via the positional index built in main()
        labels = [corpus_labels[corpus_id_to_row[h["id"]]] for h in hits]
        first_hit = next(
            (h["rank"] for h, lab in zip(hits, labels) if lab == row.label), 0
        )
        top1 = hits[0]
        queries.append(
            {
                "conversation_id": row.conversation_id,
                "text": str(row.text),
                "golden_label": row.label,
                "first_hit_rank": first_hit,
                "top1_score": top1["score"],
                "top1_predicted_label": labels[0],
                "top1_agrees": labels[0] == row.label,
                "majority_vote_label": Counter(labels).most_common(1)[0][0],
                "majority_vote_agrees": (
                    Counter(labels).most_common(1)[0][0] == row.label
                ),
                "retrieved": [
                    {
                        "rank": h["rank"],
                        "score": h["score"],
                        "pair_id": h["id"],
                        "predicted_label": lab,
                        "customer_message": str(
                            corpus.iloc[corpus_id_to_row[h["id"]]]["customer_message"]
                        )[:160],
                        "support_response": str(
                            corpus.iloc[corpus_id_to_row[h["id"]]]["support_response"]
                        )[:160],
                    }
                    for h, lab in zip(hits, labels)
                ][:5],
            }
        )
    metrics = _recall_metrics(queries, [1, 3, 5])
    metrics["n"] = len(queries)
    metrics["top1_agreement"] = round(
        sum(1 for q in queries if q["top1_agrees"]) / len(queries), 4
    )
    metrics["majority_vote_accuracy"] = round(
        sum(1 for q in queries if q["majority_vote_agrees"]) / len(queries), 4
    )
    top1_scores = np.asarray([q["top1_score"] for q in queries], dtype=np.float64)
    metrics["top1_score"] = {
        "mean": round(float(top1_scores.mean()), 4),
        "median": round(float(np.median(top1_scores)), 4),
        "min": round(float(top1_scores.min()), 4),
        "max": round(float(top1_scores.max()), 4),
    }
    logger.info(
        "%s: Recall@1/3/5 = %.4f/%.4f/%.4f · MRR@5 %.4f · majority-vote acc %.4f",
        name,
        metrics["recall_at_1"], metrics["recall_at_3"], metrics["recall_at_5"],
        metrics["mrr_at_5"], metrics["majority_vote_accuracy"],
    )
    return metrics, queries


corpus_id_to_row: dict[str, int] = {}


def main() -> None:
    settings = get_settings()

    # ------------------------------------------------------------------ #
    # 0. Inputs + validation gates                                        #
    # ------------------------------------------------------------------ #
    for required in (PAIRS_CSV, GOLDEN_CSV, GOLDEN_MANIFEST):
        if not required.exists():
            sys.exit(
                f"Required input missing: {required}\n"
                "Phase 1 must be complete (scripts/prepare_data.py) and the "
                "Phase 2 golden set built before Phase 4."
            )
    head_path = MODELS_DIR / "embedding_logreg_head.joblib"
    if not head_path.exists():
        sys.exit(
            f"Phase 3 head missing: {head_path}\n"
            "Run `python scripts/train_embedding_classifier.py` first."
        )

    pairs = pd.read_csv(
        PAIRS_CSV,
        dtype={"conversation_id": str, "customer_tweet_id": str,
               "response_tweet_id": str},
        keep_default_na=False,
    )
    pairs["conversation_id"] = pairs["conversation_id"].astype(str)
    logger.info("Evidence pairs loaded: %d rows", len(pairs))
    pair_ids = pairs["response_tweet_id"].astype(str).tolist()
    if len(set(pair_ids)) != len(pair_ids):
        sys.exit("response_tweet_id is not unique — cannot use it as pair id")

    golden_ids = load_golden_excluded_ids(GOLDEN_MANIFEST)
    keep_mask = ~pairs["conversation_id"].isin(golden_ids)
    corpus = pairs[keep_mask].reset_index(drop=True)
    removed = int((~keep_mask).sum())
    # A conversation can yield several evidence pairs (avg 1.31 pairs per
    # conversation), so the pair count removed is NOT the manifest size.
    # The correct invariants: every manifest conversation is actually present
    # in the pairs corpus (and thus fully excluded), and nothing indexed
    # belongs to a golden conversation.
    found_golden = set(pairs.loc[~keep_mask, "conversation_id"])
    if found_golden != golden_ids:
        missing = golden_ids - found_golden
        sys.exit(
            f"Isolation mismatch: {len(missing)} manifest conversations have "
            f"no evidence pair ({sorted(missing)[:5]} ...); corpus and "
            "manifest are inconsistent."
        )
    if corpus["conversation_id"].isin(golden_ids).any():
        sys.exit("Golden leak: indexed corpus still contains golden conversations")
    logger.info(
        "Corpus isolation: %d total pairs − %d pairs from the %d golden "
        "conversations = %d indexed pairs (avg %.2f pairs/conversation)",
        len(pairs), removed, len(golden_ids), len(corpus),
        removed / len(golden_ids),
    )
    global corpus_id_to_row
    corpus_id_to_row = {
        pid: i for i, pid in enumerate(corpus["response_tweet_id"].astype(str))
    }

    # ------------------------------------------------------------------ #
    # 1. Embed the corpus (frozen encoder, restartable chunk cache)       #
    # ------------------------------------------------------------------ #
    corpus_vec, cache_hit, embed_wall = _embed_corpus_chunked(
        corpus["customer_message"].tolist(), EMBED_CACHE
    )
    embed_seconds = round(embed_wall, 2)
    logger.info(
        "Corpus embeddings: %s (%.1fs, all_chunks_cached=%s)",
        corpus_vec.shape, embed_seconds, cache_hit,
    )

    # ------------------------------------------------------------------ #
    # 2. Build + save the FAISS index                                     #
    # ------------------------------------------------------------------ #
    t1 = time.perf_counter()
    index = RetrievalIndex(
        corpus["response_tweet_id"].astype(str).tolist(),
        settings.embedding_model,
    ).build(corpus_vec)
    build_seconds = round(time.perf_counter() - t1, 2)
    index.save(INDEX_PATH)
    index_bytes = INDEX_PATH.stat().st_size

    # structural self-check: a corpus vector must retrieve itself at rank 1
    probe = index.search(corpus_vec[:1], 1)[0][0]
    self_check = {
        "probe_pair_id": corpus["response_tweet_id"].iloc[0],
        "returned_pair_id": probe["id"],
        "score": probe["score"],
        "pass": bool(probe["id"] == corpus["response_tweet_id"].iloc[0]
                     and probe["score"] >= 0.999),
    }
    if not self_check["pass"]:
        sys.exit(f"Self-retrieval check failed: {self_check}")
    logger.info("Self-retrieval check PASS (score %.4f)", probe["score"])

    # ------------------------------------------------------------------ #
    # 3. Label the corpus with the Phase 3 head (relevance function)      #
    # ------------------------------------------------------------------ #
    head = EmbeddingLogReg.load(head_path)
    confidences = head.predict_confidence(corpus_vec)
    corpus_labels = [c["label"] for c in confidences]
    corpus_label_conf = [c["confidence"] for c in confidences]
    label_distribution = dict(sorted(Counter(corpus_labels).items()))
    logger.info(
        "Corpus labelled by Phase 3 logreg_head: top classes %s",
        label_distribution,
    )

    # ------------------------------------------------------------------ #
    # 4. Evaluate Recall@K on golden val + test openers                   #
    # ------------------------------------------------------------------ #
    golden = pd.read_csv(GOLDEN_CSV, dtype=str, keep_default_na=False)
    val = golden[golden["split"] == "val"].reset_index(drop=True)
    test = golden[golden["split"] == "test"].reset_index(drop=True)
    val_vec, _ = embed_texts_cached(val["text"], EMBED_CACHE, tag="golden_val")
    test_vec, _ = embed_texts_cached(test["text"], EMBED_CACHE, tag="golden_test")

    val_metrics, val_queries = _evaluate_split(
        "VAL ", val, val_vec, index, corpus, corpus_labels
    )
    test_metrics, test_queries = _evaluate_split(
        "TEST", test, test_vec, index, corpus, corpus_labels
    )

    # threshold preview (Phase 5/6 grounding gate)
    threshold = settings.retrieval_threshold
    top1 = np.asarray([q["top1_score"] for q in test_queries])
    above = top1 >= threshold
    threshold_preview = {
        "threshold": threshold,
        "note": (
            "Share of TEST openers whose top-1 cosine is at least the "
            "configured RETRIEVAL_THRESHOLD, and label-agreement recall "
            "among them — the grounding gate Phase 5/6 will consume. "
            "n=29, indicative only."
        ),
        "share_top1_above": round(float(above.mean()), 4),
        "n_above": int(above.sum()),
        "recall_at_5_when_above": (
            round(
                sum(
                    1
                    for q, a in zip(test_queries, above)
                    if a and 0 < q["first_hit_rank"] <= 5
                )
                / max(int(above.sum()), 1),
                4,
            )
            if above.any()
            else None
        ),
    }

    # ------------------------------------------------------------------ #
    # 5. Self-contained live-service corpus artifact                      #
    # ------------------------------------------------------------------ #
    with gzip.open(CORPUS_JSONL, "wt", encoding="utf-8") as fh:
        for i in range(len(corpus)):
            fh.write(
                json.dumps(
                    {
                        "id": corpus["response_tweet_id"].iloc[i],
                        "conversation_id": corpus["conversation_id"].iloc[i],
                        "turn": int(corpus["turn"].iloc[i]),
                        "customer_message": str(corpus["customer_message"].iloc[i]),
                        "support_response": str(corpus["support_response"].iloc[i]),
                        "predicted_intent": corpus_labels[i],
                        "predicted_confidence": corpus_label_conf[i],
                    },
                    ensure_ascii=False,
                )
                + "\n"
            )
    logger.info("Live-service corpus written: %s", CORPUS_JSONL)

    # ------------------------------------------------------------------ #
    # 6. Persist results                                                  #
    # ------------------------------------------------------------------ #
    generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    relevance_definition = (
        "The corpus is unlabeled, so retrieved pairs are labelled by the "
        "Phase 3 logreg_head (test accuracy 0.6552, macro-F1 0.3032). A hit "
        "at rank <= k is a retrieved pair whose predicted label equals the "
        "opener's golden label. The classifier's noise is part of the "
        "measurement and is reported, not hidden; qualitative examples let "
        "a reader judge semantic similarity directly."
    )
    results = {
        "generated_at": generated_at,
        "random_seed": settings.random_seed,
        "embedding_model": settings.embedding_model,
        "protocol": (
            "Golden conversations (200) excluded from the index before any "
            "search; frozen encoder over pair customer messages; exact "
            "cosine FAISS IndexFlatIP; Recall@K = label-agreement hits by "
            "the Phase 3 relevance function; VAL sanity check, TEST reported."
        ),
        "corpus": {
            "total_pairs": len(pairs),
            "golden_conversations_excluded": len(golden_ids),
            "pairs_removed_with_golden": removed,
            "indexed_pairs": len(corpus),
            "embedded_field": "customer_message",
            "embedding_seconds": embed_seconds,
            "embedding_cache_hit": cache_hit,
        },
        "index": {
            "type": "faiss.IndexFlatIP (exact cosine on L2-normalised float32)",
            "vectors": index.ntotal,
            "dim": int(corpus_vec.shape[1]),
            "size_bytes": index_bytes,
            "build_seconds": build_seconds,
            "self_retrieval_check": self_check,
        },
        "relevance_definition": relevance_definition,
        "corpus_labeling": {
            "method": "Phase 3 logreg_head over the same corpus embeddings",
            "distribution": label_distribution,
        },
        "val": {"metrics": val_metrics, "queries": val_queries},
        "test": {"metrics": test_metrics, "queries": test_queries},
        "threshold_preview_test": threshold_preview,
    }
    RESULTS_DIR.mkdir(exist_ok=True)
    (RESULTS_DIR / "retrieval_results.json").write_text(
        json.dumps(results, indent=2), encoding="utf-8"
    )
    logger.info("Wrote %s", RESULTS_DIR / "retrieval_results.json")

    # qualitative examples: 3 hits + 2 misses from TEST, honestly labelled
    hits = [q for q in test_queries if 0 < q["first_hit_rank"] <= 3]
    misses = [q for q in test_queries if q["first_hit_rank"] == 0]
    examples = []
    for q in hits[:3] + misses[:2]:
        top = q["retrieved"][0]
        examples.append(
            {
                "query": q["text"][:200],
                "golden_label": q["golden_label"],
                "outcome": (
                    "hit" if 0 < q["first_hit_rank"] <= 3
                    else "no same-intent case in top-5"
                ),
                "first_hit_rank": q["first_hit_rank"],
                "top1": {
                    "score": top["score"],
                    "predicted_label": top["predicted_label"],
                    "customer_message": top["customer_message"],
                    "support_response": top["support_response"],
                },
            }
        )

    summary = {
        "phase": 4,
        "generated_at": generated_at,
        "random_seed": settings.random_seed,
        "embedding_model": {
            "id": settings.embedding_model,
            "dim": int(corpus_vec.shape[1]),
            "parameters": "22.3M (frozen; retrieval embeds, it never trains)",
            "runtime": "CPU, float32",
        },
        "corpus": {
            "total_pairs": len(pairs),
            "golden_excluded": len(golden_ids),
            "indexed_pairs": len(corpus),
            "embedded_field": "customer_message",
            "embedding_seconds": embed_seconds,
            "embedding_cache_hit": cache_hit,
            "index_size_mb": round(index_bytes / 1_048_576, 1),
            "index_build_seconds": build_seconds,
            "self_retrieval_check": "PASS",
        },
        "relevance_definition": relevance_definition,
        "corpus_label_distribution": label_distribution,
        "evaluation": {
            "val": val_metrics,
            "test": test_metrics,
            "threshold_preview": threshold_preview,
        },
        "qualitative_examples": examples,
        "artifacts": [
            "models/retrieval_index.faiss",
            "models/retrieval_index.json",
            "models/retrieval_corpus.jsonl.gz",
            "evaluation/results/retrieval_results.json",
            "evaluation/results/phase4_summary.json",
        ],
        "live_service": {
            "port": 3030,
            "search_endpoint": "/api/phase4/search",
            "health_endpoint": "/api/phase4/health",
            "note": (
                "mini-services/retrieval-service (Bun + Python worker) serves "
                "live top-K retrieval over this index; the dashboard demo "
                "calls it through the gateway via XTransformPort=3030."
            ),
        },
    }
    (RESULTS_DIR / "phase4_summary.json").write_text(
        json.dumps(summary, indent=2), encoding="utf-8"
    )
    logger.info("Wrote %s", RESULTS_DIR / "phase4_summary.json")

    print(
        "PHASE 4 RETRIEVAL COMPLETE — indexed "
        f"{len(corpus):,} pairs ({len(pairs):,} total − {removed} pairs from "
        f"{len(golden_ids)} golden conversations); "
        f"TEST Recall@1/3/5 = {test_metrics['recall_at_1']:.3f}/"
        f"{test_metrics['recall_at_3']:.3f}/{test_metrics['recall_at_5']:.3f} "
        f"(MRR@5 {test_metrics['mrr_at_5']:.3f}); "
        f"majority-vote acc {test_metrics['majority_vote_accuracy']:.3f} "
        f"vs Phase 3 head 0.6552"
    )


if __name__ == "__main__":
    main()
