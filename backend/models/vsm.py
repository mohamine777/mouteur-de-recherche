from __future__ import annotations

import math
from typing import Dict, List, Tuple

from indexing.inverted_index import InvertedIndex


class VectorSpaceModel:
    """Exact TF-IDF vector space retrieval with selectable similarity measures."""

    def __init__(self, index: InvertedIndex):
        self.index = index
        self.vector_cache: Dict[Tuple[str, str], Dict[str, float]] = {}

    def search(self, query_tokens: List[str], top_k: int = 10, measure: str = "cosine", tf_mode: str = "normalized") -> List[Dict]:
        if not query_tokens or self.index.document_count == 0:
            return []

        measure_normalized = self._normalize_measure(measure)
        tf_mode_normalized = self._normalize_tf_mode(tf_mode)
        query_vec = self._tfidf_vector(self._term_frequency(query_tokens, tf_mode_normalized), tf_mode_normalized)
        if not query_vec:
            return []

        query_norm_sq = self._sum_of_squares(query_vec)
        if query_norm_sq == 0.0:
            return []

        print(
            "VSM DEBUG QUERY:",
            {
                "measure": measure_normalized,
                "tf_mode": tf_mode_normalized,
                "query_tokens": query_tokens,
                "query_vector": {term: round(weight, 6) for term, weight in query_vec.items()},
            },
        )

        results = []
        for doc_id in self.index.documents:
            doc_vec = self._get_doc_vector(doc_id, tf_mode_normalized)
            score = self._score_vectors(query_vec, doc_vec, measure_normalized)
            print(
                "VSM DEBUG DOC:",
                {
                    "doc_id": doc_id,
                    "doc_vector": {term: round(weight, 6) for term, weight in doc_vec.items()},
                    "score": round(score, 6),
                },
            )
            results.append(
                {
                    "doc_id": doc_id,
                    "score": round(score, 6),
                    "metadata": self.index.documents[doc_id]["metadata"],
                    "text": self.index.documents[doc_id]["text"],
                }
            )

        results.sort(key=lambda item: item["score"], reverse=True)
        return results[:top_k]

    def invalidate_cache(self):
        self.vector_cache.clear()

    def _get_doc_vector(self, doc_id: str, tf_mode: str) -> Dict[str, float]:
        cache_key = (doc_id, tf_mode)
        if cache_key in self.vector_cache:
            return self.vector_cache[cache_key]

        tokens = self.index.documents[doc_id]["tokens"]
        tf = self._term_frequency(tokens, tf_mode)
        vector = self._tfidf_vector(tf, tf_mode)
        self.vector_cache[cache_key] = vector
        return vector

    def _tfidf_vector(self, tf: Dict[str, float], tf_mode: str) -> Dict[str, float]:
        vector: Dict[str, float] = {}
        for term, frequency in tf.items():
            idf = self._idf(term)
            if idf <= 0.0:
                continue
            vector[term] = frequency * idf
        print(
            "VSM DEBUG WEIGHTS:",
            {
                "tf_mode": tf_mode,
                "weights": {term: round(weight, 6) for term, weight in vector.items()},
            },
        )
        return vector

    def _idf(self, term: str) -> float:
        total_docs = self.index.document_count
        if total_docs <= 0:
            return 0.0
        df = len(self.index.get_postings(term))
        if df <= 0:
            return 0.0
        return math.log(total_docs / df)

    @staticmethod
    def _term_frequency(tokens: List[str], tf_mode: str) -> Dict[str, float]:
        counts: Dict[str, float] = {}
        for token in tokens:
            counts[token] = counts.get(token, 0.0) + 1.0

        if tf_mode == "raw":
            return counts

        max_frequency = max(counts.values(), default=0.0)
        if max_frequency <= 0.0:
            return counts
        return {term: count / max_frequency for term, count in counts.items()}

    @staticmethod
    def _dot(vec_a: Dict[str, float], vec_b: Dict[str, float]) -> float:
        terms = set(vec_a.keys()) | set(vec_b.keys())
        return sum(vec_a.get(term, 0.0) * vec_b.get(term, 0.0) for term in terms)

    @staticmethod
    def _sum_of_squares(vector: Dict[str, float]) -> float:
        return sum(value * value for value in vector.values())

    @staticmethod
    def _normalize_measure(measure: str) -> str:
        return measure.strip().lower().replace("-", "_").replace(" ", "_")

    @staticmethod
    def _normalize_tf_mode(tf_mode: str) -> str:
        return tf_mode.strip().lower().replace("-", "_").replace(" ", "_")

    def _score_vectors(self, query_vec: Dict[str, float], doc_vec: Dict[str, float], measure: str) -> float:
        dot_product = self._dot(query_vec, doc_vec)
        query_sum_squares = self._sum_of_squares(query_vec)
        doc_sum_squares = self._sum_of_squares(doc_vec)

        if measure == "inner_product":
            return dot_product
        if measure == "euclidean_distance":
            terms = set(query_vec.keys()) | set(doc_vec.keys())
            distance = math.sqrt(
                sum((query_vec.get(term, 0.0) - doc_vec.get(term, 0.0)) ** 2 for term in terms)
            )
            return -distance
        if measure == "cosine":
            denominator = math.sqrt(query_sum_squares) * math.sqrt(doc_sum_squares)
            return dot_product / denominator if denominator > 0.0 else 0.0
        if measure == "dice":
            denominator = query_sum_squares + doc_sum_squares
            return (2.0 * dot_product) / denominator if denominator > 0.0 else 0.0
        if measure == "jaccard":
            denominator = query_sum_squares + doc_sum_squares - dot_product
            return dot_product / denominator if denominator > 0.0 else 0.0
        if measure == "overlap_coefficient":
            denominator = min(query_sum_squares, doc_sum_squares)
            return dot_product / denominator if denominator > 0.0 else 0.0

        raise ValueError(f"Unsupported VSM measure: {measure}")
