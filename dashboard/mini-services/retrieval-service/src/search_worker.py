"""Phase 4 live retrieval worker (Python side of mini-services/retrieval-service).

Speaks newline-delimited JSON over stdin/stdout with the Bun HTTP wrapper:

  -> {"id": 1, "op": "warmup"}                      # load model+index+corpus
  -> {"id": 2, "op": "search", "query": "...", "k": 5}
  <- {"id": 1, "ok": true, "event": "ready", "corpus_size": ..., "model": ...}
  <- {"id": 2, "ok": true, "results": [...], "query_intent": {...}, ...}
  <- {"event": "loading", "stage": "encoder"}       # unsolicited progress
  <- {"id": n, "ok": false, "error": "..."}         # per-request errors

The heavy artifacts are loaded lazily ON THE FIRST REQUEST and stay resident:
all-MiniLM-L6-v2 encoder, the FAISS IndexFlatIP (exact cosine) built by
``scripts/build_retrieval_index.py``, the self-contained corpus
``models/retrieval_corpus.jsonl.gz`` and the Phase 3 logreg head (used to show
the predicted intent of the incoming query and of each retrieved pair).
"""
from __future__ import annotations

import json
import sys
import time

PROJECT_ROOT = "/home/z/my-project/hiver-support-agent"
sys.path.insert(0, PROJECT_ROOT)

WORKER_STATE = {"loaded": False}

_ENCODER = None
_INDEX = None
_HEAD = None
_CORPUS: dict[str, dict] = {}


def _emit(payload: dict) -> None:
    print(json.dumps(payload, ensure_ascii=False), flush=True)


def _load_all() -> None:
    """Load every artifact once; emits progress events while loading."""
    global _ENCODER, _INDEX, _HEAD

    import torch

    torch.set_num_threads(2)  # the box has 2 cores; avoid oversubscription

    _emit({"event": "loading", "stage": "encoder"})
    from src.intents.embeddings import get_encoder

    t0 = time.perf_counter()
    _ENCODER = get_encoder()
    encoder_s = round(time.perf_counter() - t0, 2)

    _emit({"event": "loading", "stage": "faiss_index"})
    from pathlib import Path

    from src.retrieval.faiss_index import RetrievalIndex

    t1 = time.perf_counter()
    _INDEX = RetrievalIndex.load(Path(PROJECT_ROOT) / "models" / "retrieval_index.faiss")
    index_s = round(time.perf_counter() - t1, 2)

    _emit({"event": "loading", "stage": "corpus"})
    import gzip

    t2 = time.perf_counter()
    with gzip.open(
        Path(PROJECT_ROOT) / "models" / "retrieval_corpus.jsonl.gz", "rt",
        encoding="utf-8",
    ) as fh:
        for line in fh:
            row = json.loads(line)
            _CORPUS[row["id"]] = row
    corpus_s = round(time.perf_counter() - t2, 2)

    _emit({"event": "loading", "stage": "intent_head"})
    from src.intents.embedding_classifier import EmbeddingLogReg

    _HEAD = EmbeddingLogReg.load(
        Path(PROJECT_ROOT) / "models" / "embedding_logreg_head.joblib"
    )

    WORKER_STATE["loaded"] = True
    _emit(
        {
            "event": "ready",
            "corpus_size": _INDEX.ntotal,
            "model": _INDEX.embedding_model,
            "index": "faiss.IndexFlatIP (exact cosine)",
            "load_seconds": {
                "encoder": encoder_s,
                "faiss_index": index_s,
                "corpus": corpus_s,
            },
        }
    )


def _ensure_loaded() -> None:
    if not WORKER_STATE["loaded"]:
        _load_all()


def _search(query: str, k: int) -> dict:
    import numpy as np

    _ensure_loaded()
    from src.intents.embeddings import embed_texts

    t0 = time.perf_counter()
    query_vec = np.asarray(embed_texts([query], batch_size=1), dtype=np.float32)
    embed_ms = round((time.perf_counter() - t0) * 1000, 1)

    t1 = time.perf_counter()
    hits = _INDEX.search(query_vec, k)[0]
    search_ms = round((time.perf_counter() - t1) * 1000, 1)

    intent = _HEAD.predict_confidence(query_vec)[0]

    results = []
    for hit in hits:
        row = _CORPUS.get(hit["id"], {})
        results.append(
            {
                "rank": hit["rank"],
                "score": hit["score"],
                "pair_id": hit["id"],
                "conversation_id": row.get("conversation_id"),
                "turn": row.get("turn"),
                "customer_message": row.get("customer_message", ""),
                "support_response": row.get("support_response", ""),
                "predicted_intent": row.get("predicted_intent"),
                "predicted_confidence": row.get("predicted_confidence"),
            }
        )
    return {
        "results": results,
        "query_intent": intent,
        "timings": {"embed_ms": embed_ms, "faiss_search_ms": search_ms},
    }


def main() -> None:
    _emit({"event": "boot", "stage": "worker-started"})
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            request = json.loads(line)
        except json.JSONDecodeError:
            _emit({"event": "error", "error": "malformed json line"})
            continue
        rid = request.get("id")
        op = request.get("op")
        try:
            if op == "warmup":
                _ensure_loaded()
                _emit(
                    {
                        "id": rid,
                        "ok": True,
                        "event": "ready",
                        "corpus_size": _INDEX.ntotal,
                        "model": _INDEX.embedding_model,
                    }
                )
            elif op == "search":
                query = request.get("query", "")
                if not isinstance(query, str) or not query.strip():
                    raise ValueError("query must be a non-empty string")
                k = request.get("k", 5)
                if not isinstance(k, int) or not 1 <= k <= 10:
                    k = 5
                payload = _search(query.strip(), k)
                _emit({"id": rid, "ok": True, "query": query.strip(), "k": k, **payload})
            elif op == "ping":
                _emit(
                    {
                        "id": rid,
                        "ok": True,
                        "pong": True,
                        "loaded": WORKER_STATE["loaded"],
                    }
                )
            else:
                raise ValueError(f"unknown op: {op!r}")
        except Exception as exc:  # per-request isolation
            _emit({"id": rid, "ok": False, "error": f"{type(exc).__name__}: {exc}"})


if __name__ == "__main__":
    main()
