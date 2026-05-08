from __future__ import annotations

import math
from typing import Dict, List, Optional


class ProbabilisticBIRModel:
    """Robertson-Jones Binary Independence Retrieval."""

    def __init__(self, indexer) -> None:
        self.indexer = indexer

    def search(
        self,
        query: str,
        relevant_doc_ids: Optional[List[str]] = None,
        non_relevant_doc_ids: Optional[List[str]] = None,
    ) -> List[Dict]:
        query_terms = set(self.indexer.preprocessor.preprocess(query))
        if not query_terms:
            return []
        relevant_docs = set(relevant_doc_ids or []) & set(self.indexer.documents.keys())
        non_relevant_docs = set(non_relevant_doc_ids or []) & set(self.indexer.documents.keys())
        results = []
        for doc_id, freqs in self.indexer.doc_term_freqs.items():
            if doc_id in non_relevant_docs:
                continue
            doc_terms = set(freqs.keys())
            score = 0.0
            for term in query_terms & doc_terms:
                score += self._term_weight(term, relevant_docs)
            if doc_terms & query_terms:
                results.append(self._result(doc_id, score))
        return sorted(results, key=lambda item: item["score"], reverse=True)

    def _term_weight(self, term: str, relevant_docs: set[str]) -> float:
        total_docs = self.indexer.document_count
        docs_with_term = set(self.indexer.postings(term).keys())
        n = len(docs_with_term)
        if total_docs == 0:
            return 0.0
        if not relevant_docs:
            return math.log((total_docs - n + 0.5) / (n + 0.5))

        R = len(relevant_docs)
        r = len(relevant_docs & docs_with_term)
        relevant_ratio = (r + 0.5) / (R - r + 0.5)
        non_relevant_ratio = (n - r + 0.5) / (total_docs - n - R + r + 0.5)
        return math.log(relevant_ratio / non_relevant_ratio)

    def _result(self, doc_id: str, score: float) -> Dict:
        doc = self.indexer.documents[doc_id]
        return {"doc_id": doc_id, "title": doc["title"], "score": round(score, 6), "text": doc["text"], "metadata": doc["metadata"]}
