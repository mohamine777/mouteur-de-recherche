from __future__ import annotations

import math
from typing import Dict, List


class VectorSpaceModel:
    """Salton SMART-style TF-IDF vectors with selectable similarity measures."""

    def __init__(self, indexer) -> None:
        self.indexer = indexer

    def search(self, query: str, measure: str = "cosine") -> List[Dict]:
        tokens = self.indexer.preprocessor.preprocess(query)
        query_tf = self.indexer.preprocessor.term_frequency(tokens)
        query_vec = self.indexer.tfidf_vector(query_tf)
        query_norm = self.indexer.vector_norm(query_vec)
        measure_name = self._normalize_measure(measure)
        if query_norm == 0:
            return []

        results = []
        for doc_id, doc_vec in self.indexer.tfidf_matrix.items():
            score = self._score(doc_vec, query_vec, measure_name)
            if score > 0:
                results.append(self._result(doc_id, score))
        return sorted(results, key=lambda item: item["score"], reverse=True)

    def _score(self, doc_vec: Dict[str, float], query_vec: Dict[str, float], measure: str) -> float:
        dot_product = self.indexer.dot(doc_vec, query_vec)
        doc_norm = self.indexer.vector_norm(doc_vec)
        query_norm = self.indexer.vector_norm(query_vec)
        doc_norm_sq = doc_norm * doc_norm
        query_norm_sq = query_norm * query_norm

        if measure == "product":
            # RSV = d . q = sum(w_ij * w_iq)
            return dot_product
        if measure == "euclidean":
            terms = set(doc_vec) | set(query_vec)
            # distance(d, q) = sqrt(sum((w_ij - w_iq)^2)); similarity = 1 / (1 + distance)
            distance = math.sqrt(sum((doc_vec.get(term, 0.0) - query_vec.get(term, 0.0)) ** 2 for term in terms))
            return 1.0 / (1.0 + distance)
        if measure == "dice":
            # RSV = 2(d . q) / (||d||^2 + ||q||^2)
            denominator = doc_norm_sq + query_norm_sq
            return (2.0 * dot_product) / denominator if denominator else 0.0
        if measure == "jaccard":
            # RSV = (d . q) / (||d||^2 + ||q||^2 - d . q)
            denominator = doc_norm_sq + query_norm_sq - dot_product
            return dot_product / denominator if denominator else 0.0
        if measure == "overlap":
            # RSV = (d . q) / min(||d||^2, ||q||^2)
            denominator = min(doc_norm_sq, query_norm_sq)
            return dot_product / denominator if denominator else 0.0

        # RSV(d, q) = cos(theta) = dot(d, q) / (||d|| * ||q||)
        return dot_product / (doc_norm * query_norm) if doc_norm and query_norm else 0.0

    @staticmethod
    def _normalize_measure(measure: str) -> str:
        normalized = measure.strip().lower().replace("-", "_").replace(" ", "_")
        aliases = {
            "inner_product": "product",
            "scalar_product": "product",
            "produit_scalaire": "product",
            "cosin": "cosine",
            "cosinus": "cosine",
            "euclidean_distance": "euclidean",
            "overlap_coefficient": "overlap",
        }
        return aliases.get(normalized, normalized)

    def _result(self, doc_id: str, score: float) -> Dict:
        doc = self.indexer.documents[doc_id]
        return {"doc_id": doc_id, "title": doc["title"], "score": round(score, 6), "text": doc["text"], "metadata": doc["metadata"]}
