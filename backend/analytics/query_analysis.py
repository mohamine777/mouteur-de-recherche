from __future__ import annotations

from typing import Dict, List


class QueryAnalyzer:
    """Small analytics layer built on indexed corpus statistics."""

    def __init__(self, indexer) -> None:
        self.indexer = indexer

    def analyze(self, query: str, model_metrics: Dict[str, dict] | None = None) -> dict:
        terms = self.indexer.preprocessor.preprocess(query)
        matched_doc_ids = set()
        for term in terms:
            matched_doc_ids.update(self.indexer.inverted_index.get(term, {}).keys())

        total_documents = max(self.indexer.document_count, 1)
        match_ratio = len(matched_doc_ids) / total_documents
        missing_ratio = self._missing_ratio(terms)
        sparsity = 1 - match_ratio
        difficulty_score = min(1.0, (0.45 * missing_ratio) + (0.35 * sparsity) + (0.2 * min(len(terms), 8) / 8))
        difficulty = self._difficulty_label(difficulty_score)

        return {
            "query": query,
            "terms": terms,
            "term_count": len(terms),
            "matched_documents": len(matched_doc_ids),
            "matched_doc_ids": sorted(matched_doc_ids),
            "sparsity": round(sparsity, 6),
            "difficulty_score": round(difficulty_score, 6),
            "difficulty": difficulty,
            "recommended_model": self._recommended_model(difficulty, model_metrics),
        }

    def _missing_ratio(self, terms: List[str]) -> float:
        if not terms:
            return 1.0
        missing = sum(1 for term in terms if term not in self.indexer.vocabulary)
        return missing / len(terms)

    @staticmethod
    def _difficulty_label(score: float) -> str:
        if score < 0.35:
            return "easy"
        if score < 0.68:
            return "medium"
        return "hard"

    @staticmethod
    def _recommended_model(difficulty: str, model_metrics: Dict[str, dict] | None) -> str:
        if model_metrics:
            best = max(
                model_metrics.items(),
                key=lambda item: (
                    item[1].get("f1", 0),
                    item[1].get("average_precision", 0),
                    item[1].get("recall", 0),
                ),
            )
            return best[0]
        if difficulty == "hard":
            return "bir"
        if difficulty == "medium":
            return "vsm"
        return "boolean"
