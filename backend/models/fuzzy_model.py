from __future__ import annotations

from typing import Dict, List

from models.boolean_model import AndNode, BooleanQueryParser, NotNode, OrNode, TermNode


class FuzzyBooleanModel:
    """Fuzzy Boolean retrieval using Zadeh operators and optional Lukasiewicz OR."""

    def __init__(self, indexer) -> None:
        self.indexer = indexer
        self.parser = BooleanQueryParser(indexer.preprocessor)

    def search(self, query: str, lukasiewicz_or: bool = False) -> List[Dict]:
        ast = self.parser.parse(query)
        if ast is None:
            return []
        results = []
        for doc_id in self.indexer.documents:
            memberships = self._memberships(doc_id)
            score = self._eval(ast, memberships, lukasiewicz_or)
            if score > 0:
                results.append(self._result(doc_id, score))
        return sorted(results, key=lambda item: item["score"], reverse=True)

    def _eval(self, node, memberships: Dict[str, float], lukasiewicz_or: bool) -> float:
        if isinstance(node, TermNode):
            return memberships.get(node.term, 0.0)
        if isinstance(node, NotNode):
            # Fuzzy NOT: 1 - a_i
            return 1.0 - self._eval(node.child, memberships, lukasiewicz_or)
        left = self._eval(node.left, memberships, lukasiewicz_or)
        right = self._eval(node.right, memberships, lukasiewicz_or)
        if isinstance(node, AndNode):
            # Fuzzy AND: min(a_i, a_j)
            return min(left, right)
        if isinstance(node, OrNode):
            # Fuzzy OR: max(a_i, a_j); Lukasiewicz OR: min(1, a_i + a_j)
            return min(1.0, left + right) if lukasiewicz_or else max(left, right)
        raise ValueError("Unsupported Fuzzy AST node")

    def _memberships(self, doc_id: str) -> Dict[str, float]:
        freqs = self.indexer.doc_term_freqs.get(doc_id, {})
        max_tf = max(freqs.values(), default=0)
        return {term: tf / max_tf for term, tf in freqs.items()} if max_tf else {}

    def _result(self, doc_id: str, score: float) -> Dict:
        doc = self.indexer.documents[doc_id]
        return {"doc_id": doc_id, "title": doc["title"], "score": round(score, 6), "text": doc["text"], "metadata": doc["metadata"]}
