from __future__ import annotations

import math
from typing import Dict, List


class ProbabilisticBIRModel:
    """Robertson-Jones Binary Independence Retrieval with unsupervised estimates."""

    def __init__(self, indexer) -> None:
        self.indexer = indexer

    def search(self, query: str) -> List[Dict]:
        query_terms = set(self.indexer.preprocessor.preprocess(query))
        if not query_terms:
            return []
        results = []
        for doc_id, freqs in self.indexer.doc_term_freqs.items():
            doc_terms = set(freqs.keys())
            score = 0.0
            for term in query_terms & doc_terms:
                score += self._term_weight(term)
            if score > 0:
                results.append(self._result(doc_id, score))
        return sorted(results, key=lambda item: item["score"], reverse=True)

    def _term_weight(self, term: str) -> float:
        n = self.indexer.document_count
        df = len(self.indexer.postings(term))
        if n == 0:
            return 0.0
        # With no relevance feedback, estimate p_i high for query terms and q_i from corpus frequency.
        p_i = 0.5
        q_i = (df + 0.5) / (n + 1.0)
        q_i = min(max(q_i, 1e-6), 1.0 - 1e-6)
        # RSV(d, q) = sum log[p_i(1-q_i) / (q_i(1-p_i))]
        return max(0.0, math.log((p_i * (1.0 - q_i)) / (q_i * (1.0 - p_i))))

    def _result(self, doc_id: str, score: float) -> Dict:
        doc = self.indexer.documents[doc_id]
        return {"doc_id": doc_id, "title": doc["title"], "score": round(score, 6), "text": doc["text"], "metadata": doc["metadata"]}
