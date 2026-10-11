"""Phase 4 — FAISS retrieval index over the AppleSupport evidence corpus.

The retrieval layer of the assignment: given a customer message, find the
most similar historical customer↔support pairs so later phases (grounded
generation, escalation) can lean on real evidence.

Design decisions (measured, not guessed):

* **Corpus** — every Phase 1 evidence pair (`conversation_pairs.csv`,
  106,137 rows) **minus every pair belonging to the 200 golden
  conversations** from ``evaluation/golden_conversation_ids.json`` (a
  conversation yields ~1.31 pairs on average, so ~266 pairs are removed).
  The isolation manifest exists exactly for this: golden-set openers must
  never retrieve their own conversations, which would inflate Recall@K
  and leak evaluation evidence into later training.
* **Embeddings** — the same frozen ``all-MiniLM-L6-v2`` encoder as Phase 3
  (single configuration point ``EMBEDDING_MODEL``), embedded over the
  *customer message* side of each pair (the side a future query will look
  like), L2-normalised, cached on disk keyed by (model id, texts hash).
* **Index** — ``faiss.IndexFlatIP``: exact inner-product search on unit
  vectors == exact cosine similarity. At ~105.9k x 384 this is ~160 MB of
  float32 and brute-force search is sub-millisecond per query on CPU, so
  an approximate index (IVF/HNSW) would add tuning knobs and recall loss
  for zero measurable latency win. Exactness also keeps Recall@K
  reproducible: no clustering seed, no nprobe setting to document.
* **Id mapping** — FAISS positions are 0..n-1 row order of the corpus
  frame; the saved sidecar stores the corpus row ids (pair ids) so search
  results map back to conversation/pair rows deterministically.

This module never trains anything; it wraps build / save / load / search
so both the evaluation script and the live retrieval service share one
implementation.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path

import numpy as np

from src.config import get_settings

logger = logging.getLogger(__name__)


class RetrievalIndexError(RuntimeError):
    """Raised when the FAISS index cannot be built, saved, or loaded."""


def l2_normalize(vectors: np.ndarray) -> np.ndarray:
    """Row-wise L2 normalisation (float32, safe for zero rows)."""
    vectors = np.asarray(vectors, dtype=np.float32)
    norms = np.linalg.norm(vectors, axis=1, keepdims=True)
    return (vectors / np.maximum(norms, 1e-12)).astype(np.float32)


class RetrievalIndex:
    """Exact cosine-similarity FAISS index over corpus embeddings.

    ``vector_ids`` are application-level ids (e.g. pair ids) in FAISS row
    order; ``search`` returns them together with cosine scores so callers
    never touch positional indices.
    """

    def __init__(self, vector_ids: list[str], embedding_model: str):
        self.vector_ids: list[str] = list(vector_ids)
        self.embedding_model: str = embedding_model
        self._index = None  # lazily imported faiss.IndexFlatIP
        self._dim: int | None = None

    # ------------------------------------------------------------------ #
    # build / persist                                                     #
    # ------------------------------------------------------------------ #
    def build(self, vectors: np.ndarray) -> "RetrievalIndex":
        """Normalise ``vectors`` and add them to a fresh IndexFlatIP."""
        import faiss  # imported lazily: faiss is a Phase 4+ dependency

        unit = l2_normalize(vectors)
        if unit.shape[0] != len(self.vector_ids):
            raise RetrievalIndexError(
                f"vector/id count mismatch: {unit.shape[0]} vectors vs "
                f"{len(self.vector_ids)} ids"
            )
        self._dim = int(unit.shape[1])
        self._index = faiss.IndexFlatIP(self._dim)
        self._index.add(unit)
        logger.info(
            "FAISS IndexFlatIP built: %d vectors x %d-d (exact cosine)",
            self._index.ntotal, self._dim,
        )
        return self

    def save(self, path: Path) -> None:
        """Write the faiss index + a JSON sidecar with id mapping."""
        import faiss

        if self._index is None:
            raise RetrievalIndexError("index not built")
        path.parent.mkdir(parents=True, exist_ok=True)
        faiss.write_index(self._index, str(path))
        sidecar = path.with_suffix(".json")
        sidecar.write_text(
            json.dumps(
                {
                    "kind": "faiss_index_flat_ip",
                    "embedding_model": self.embedding_model,
                    "dim": self._dim,
                    "ntotal": int(self._index.ntotal),
                    "metric": "cosine (inner product on L2-normalised float32)",
                    "vector_ids": self.vector_ids,
                    "regenerate": "python scripts/build_retrieval_index.py",
                }
            ),
            encoding="utf-8",
        )
        logger.info("Saved %s (+ sidecar)", path)

    @classmethod
    def load(cls, path: Path) -> "RetrievalIndex":
        """Load a saved index together with its id-mapping sidecar."""
        import faiss

        sidecar = path.with_suffix(".json")
        if not path.exists() or not sidecar.exists():
            raise RetrievalIndexError(
                f"Retrieval index artifacts missing: {path}"
            )
        meta = json.loads(sidecar.read_text(encoding="utf-8"))
        index = faiss.read_index(str(path))
        instance = cls(meta["vector_ids"], meta["embedding_model"])
        instance._index = index
        instance._dim = int(meta["dim"])
        if index.ntotal != len(instance.vector_ids):
            raise RetrievalIndexError(
                "index/sidecar mismatch: %d vectors vs %d ids"
                % (index.ntotal, len(instance.vector_ids))
            )
        return instance

    # ------------------------------------------------------------------ #
    # query                                                               #
    # ------------------------------------------------------------------ #
    def search(
        self, query_vectors: np.ndarray, k: int
    ) -> list[list[dict]]:
        """Exact top-``k`` cosine neighbours per query vector.

        Returns one list per query: ``{"id", "score", "rank"}`` dicts,
        sorted by descending cosine similarity.
        """
        if self._index is None:
            raise RetrievalIndexError("index not built/loaded")
        unit = l2_normalize(query_vectors)
        k = min(k, self._index.ntotal)
        scores, positions = self._index.search(unit, k)
        out: list[list[dict]] = []
        for row_scores, row_pos in zip(scores, positions):
            hits: list[dict] = []
            for rank, (pos, score) in enumerate(zip(row_pos, row_scores), start=1):
                if pos < 0:  # faiss pads with -1 when k > ntotal
                    continue
                hits.append(
                    {
                        "rank": rank,
                        "id": self.vector_ids[int(pos)],
                        "score": round(float(score), 4),
                    }
                )
            out.append(hits)
        return out

    @property
    def ntotal(self) -> int:
        return int(self._index.ntotal) if self._index is not None else 0


def load_golden_excluded_ids(manifest_path: Path) -> set[str]:
    """Read the golden-set isolation manifest (conversation ids to exclude)."""
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    ids = {str(cid) for cid in manifest["conversation_ids"]}
    if not ids:
        raise RetrievalIndexError(
            f"Isolation manifest lists no conversation ids: {manifest_path}"
        )
    return ids
