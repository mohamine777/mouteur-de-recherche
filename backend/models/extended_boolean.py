from __future__ import annotations

import math
from typing import Dict, List

from models.boolean_model import AndNode, BooleanQueryParser, NotNode, OrNode, TermNode


class ExtendedBooleanModel:
    """p-norm model combining Boolean structure with weighted term matching."""

    def __init__(self, indexer) -> None:
        self.indexer = indexer
        self.parser = BooleanQueryParser(indexer.preprocessor)

    def search(self, query: str, p: float = 2.0) -> List[Dict]:
        ast = self.parser.parse(query)
        if ast is None:
            return []
        p_value = math.inf if p == float("inf") or p >= 999 else max(1.0, float(p))
        results = []
        for doc_id in self.indexer.documents:
            weights = self._normalized_doc_weights(doc_id)
            score = self._eval(ast, weights, p_value)
            if score > 0:
                results.append(self._result(doc_id, score))
        return sorted(results, key=lambda item: item["score"], reverse=True)

    def _eval(self, node, weights: Dict[str, float], p: float) -> float:
        if isinstance(node, TermNode):
            return weights.get(node.term, 0.0)
        if isinstance(node, NotNode):
            return 1.0 - self._eval(node.child, weights, p)

        values = [self._eval(node.left, weights, p), self._eval(node.right, weights, p)]
        if isinstance(node, OrNode):
            if math.isinf(p):
                return max(values)
            # OR: RSV = (sum(w_xj^p) / m)^(1/p)
            return (sum(value ** p for value in values) / len(values)) ** (1.0 / p)
        if isinstance(node, AndNode):
            if math.isinf(p):
                return min(values)
            # AND: RSV = 1 - (sum((1 - w_xj)^p) / m)^(1/p)
            return 1.0 - (sum((1.0 - value) ** p for value in values) / len(values)) ** (1.0 / p)
        raise ValueError("Unsupported Extended Boolean AST node")

    def _normalized_doc_weights(self, doc_id: str) -> Dict[str, float]:
        weights = self.indexer.tfidf_matrix.get(doc_id, {})
        max_weight = max(weights.values(), default=0.0)
        return {term: weight / max_weight for term, weight in weights.items()} if max_weight else {}

    def _result(self, doc_id: str, score: float) -> Dict:
        doc = self.indexer.documents[doc_id]
        return {"doc_id": doc_id, "title": doc["title"], "score": round(score, 6), "text": doc["text"], "metadata": doc["metadata"]}
