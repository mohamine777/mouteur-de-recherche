from __future__ import annotations

import math
import re
from dataclasses import dataclass
from typing import Dict, List, Sequence, Set

from indexing.inverted_index import InvertedIndex


@dataclass(frozen=True)
class TermNode:
    term: str


@dataclass(frozen=True)
class AndNode:
    left: object
    right: object


@dataclass(frozen=True)
class OrNode:
    left: object
    right: object


@dataclass(frozen=True)
class NotNode:
    child: object


class BooleanQueryParser:
    TOKEN_PATTERN = re.compile(r"\(|\)|\bAND\b|\bOR\b|\bNOT\b|[A-Za-z0-9]+", re.IGNORECASE)

    def __init__(self, index: InvertedIndex):
        self.index = index
        self.tokens: List[str] = []
        self.position = 0

    def parse(self, query: str):
        self.tokens = self._tokenize(query)
        self.position = 0
        if not self.tokens:
            return None
        node = self._parse_or()
        if self.position != len(self.tokens):
            raise ValueError("Invalid boolean query syntax")
        return node

    def _tokenize(self, query: str) -> List[str]:
        tokens: List[str] = []
        for token in self.TOKEN_PATTERN.findall(query):
            upper = token.upper()
            if upper in {"AND", "OR", "NOT", "(", ")"}:
                tokens.append(upper)
            else:
                tokens.append(token.lower())
        return tokens

    def _parse_or(self):
        node = self._parse_and()
        while self._match("OR"):
            right = self._parse_and()
            node = OrNode(node, right)
        return node

    def _parse_and(self):
        node = self._parse_not()
        while self._match("AND"):
            right = self._parse_not()
            node = AndNode(node, right)
        return node

    def _parse_not(self):
        if self._match("NOT"):
            return NotNode(self._parse_not())
        return self._parse_primary()

    def _parse_primary(self):
        if self._match("("):
            node = self._parse_or()
            if not self._match(")"):
                raise ValueError("Unbalanced parentheses in boolean query")
            return node

        token = self._consume_term()
        if token is None:
            raise ValueError("Expected term in boolean query")
        return TermNode(token)

    def _consume_term(self):
        if self.position >= len(self.tokens):
            return None
        token = self.tokens[self.position]
        if token in {"AND", "OR", "NOT", "(", ")"}:
            return None
        self.position += 1
        normalized = self.index.preprocessor.preprocess(token)
        return normalized[0] if normalized else token

    def _match(self, value: str) -> bool:
        if self.position < len(self.tokens) and self.tokens[self.position] == value:
            self.position += 1
            return True
        return False


class ExactBooleanModel:
    """Exact Boolean retrieval with binary relevance and boolean expression parsing."""

    def __init__(self, index: InvertedIndex):
        self.index = index
        self.parser = BooleanQueryParser(index)

    def search(self, query: str, top_k: int = 10) -> List[Dict]:
        if not query.strip() or self.index.document_count == 0:
            return []

        ast = self.parser.parse(query)
        if ast is None:
            return []

        matched_docs = self._evaluate(ast)
        print(
            "BOOLEAN EXACT DEBUG:",
            {
                "query": query,
                "matched_docs": sorted(matched_docs),
            },
        )

        results = [
            {
                "doc_id": doc_id,
                "score": 1,
                "metadata": self.index.documents[doc_id]["metadata"],
                "text": self.index.documents[doc_id]["text"],
            }
            for doc_id in sorted(matched_docs)
        ]
        return results[:top_k]

    def _evaluate(self, node) -> Set[str]:
        if isinstance(node, TermNode):
            postings = self.index.get_postings(node.term)
            print("BOOLEAN EXACT TERM:", {"term": node.term, "matched": sorted(postings.keys())})
            return set(postings.keys())
        if isinstance(node, NotNode):
            child = self._evaluate(node.child)
            return set(self.index.documents.keys()) - child
        if isinstance(node, AndNode):
            left = self._evaluate(node.left)
            right = self._evaluate(node.right)
            return left & right
        if isinstance(node, OrNode):
            left = self._evaluate(node.left)
            right = self._evaluate(node.right)
            return left | right
        raise ValueError("Unsupported boolean AST node")


class ExtendedBooleanModel:
    """Exact p-norm extended Boolean retrieval."""

    def __init__(self, index: InvertedIndex, p: float = 2.0):
        self.index = index
        self.p = p
        self.parser = BooleanQueryParser(index)

    def search(self, query: str, top_k: int = 10, p: float | None = None) -> List[Dict]:
        if not query.strip() or self.index.document_count == 0:
            return []

        p_value = float(p if p is not None else self.p)
        if p_value <= 0.0:
            raise ValueError("p must be greater than 0")

        ast = self.parser.parse(query)
        if ast is None:
            return []

        results = []
        for doc_id in self.index.documents:
            doc_weights = self._document_weights(doc_id)
            score = self._evaluate(ast, doc_weights, p_value)
            print(
                "EXTENDED BOOLEAN DEBUG:",
                {
                    "doc_id": doc_id,
                    "query": query,
                    "score": round(score, 6),
                },
            )
            if score >= 0.0:
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

    def _document_weights(self, doc_id: str) -> Dict[str, float]:
        tokens = self.index.documents[doc_id]["tokens"]
        tf = self._term_frequency(tokens, normalized=True)
        weights = self._tfidf_weights(tf)
        max_weight = max(weights.values(), default=0.0)
        if max_weight <= 0.0:
            return {term: 0.0 for term in weights}
        normalized_weights = {term: weight / max_weight for term, weight in weights.items()}
        print(
            "EXTENDED BOOLEAN NORMALIZED WEIGHTS:",
            {term: round(weight, 6) for term, weight in normalized_weights.items()},
        )
        return normalized_weights

    def _evaluate(self, node, doc_weights: Dict[str, float], p_value: float) -> float:
        if isinstance(node, TermNode):
            weight = doc_weights.get(node.term, 0.0)
            print("EXTENDED BOOLEAN TERM:", {"term": node.term, "weight": round(weight, 6)})
            return weight
        if isinstance(node, NotNode):
            return 1.0 - self._evaluate(node.child, doc_weights, p_value)
        if isinstance(node, AndNode):
            left = self._evaluate(node.left, doc_weights, p_value)
            right = self._evaluate(node.right, doc_weights, p_value)
            values = [left, right]
            return 1.0 - ((sum((1.0 - value) ** p_value for value in values) / len(values)) ** (1.0 / p_value))
        if isinstance(node, OrNode):
            left = self._evaluate(node.left, doc_weights, p_value)
            right = self._evaluate(node.right, doc_weights, p_value)
            values = [left, right]
            return (sum(value**p_value for value in values) / len(values)) ** (1.0 / p_value)
        raise ValueError("Unsupported boolean AST node")

    def _tfidf_weights(self, tf: Dict[str, float]) -> Dict[str, float]:
        total_docs = self.index.document_count
        weights: Dict[str, float] = {}
        for term, freq in tf.items():
            df = len(self.index.get_postings(term))
            if df <= 0 or total_docs <= 0:
                continue
            idf = math.log(total_docs / df)
            if idf <= 0.0:
                continue
            weights[term] = freq * idf
        print("EXTENDED BOOLEAN WEIGHTS:", {term: round(weight, 6) for term, weight in weights.items()})
        return weights

    @staticmethod
    def _term_frequency(tokens: Sequence[str], normalized: bool = True) -> Dict[str, float]:
        counts: Dict[str, float] = {}
        for token in tokens:
            counts[token] = counts.get(token, 0.0) + 1.0
        if not normalized:
            return counts

        max_frequency = max(counts.values(), default=0.0)
        if max_frequency <= 0.0:
            return counts
        return {term: count / max_frequency for term, count in counts.items()}


class FuzzySetModel:
    """Fuzzy set retrieval with exact Zadeh and Lukasiewicz operators."""

    def __init__(self, index: InvertedIndex):
        self.index = index
        self.parser = BooleanQueryParser(index)

    def search(self, query: str, variant: str, top_k: int = 10) -> List[Dict]:
        if not query.strip() or self.index.document_count == 0:
            return []

        ast = self.parser.parse(query)
        if ast is None:
            return []

        variant_normalized = variant.strip().lower().replace("-", "_").replace(" ", "_")
        if variant_normalized not in {"fuzzy_zadeh", "fuzzy_lukasiewicz"}:
            raise ValueError("Unsupported fuzzy variant")

        results = []
        for doc_id in self.index.documents:
            doc_weights = self._document_weights(doc_id)
            score = self._evaluate(ast, doc_weights, variant_normalized)
            print(
                "FUZZY DEBUG:",
                {
                    "variant": variant_normalized,
                    "doc_id": doc_id,
                    "query": query,
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

    def _document_weights(self, doc_id: str) -> Dict[str, float]:
        tokens = self.index.documents[doc_id]["tokens"]
        counts: Dict[str, float] = {}
        for token in tokens:
            counts[token] = counts.get(token, 0.0) + 1.0

        max_frequency = max(counts.values(), default=0.0)
        if max_frequency <= 0.0:
            return {}

        normalized = {term: count / max_frequency for term, count in counts.items()}
        print("FUZZY WEIGHTS:", {term: round(weight, 6) for term, weight in normalized.items()})
        return normalized

    def _evaluate(self, node, doc_weights: Dict[str, float], variant: str) -> float:
        if isinstance(node, TermNode):
            return doc_weights.get(node.term, 0.0)
        if isinstance(node, NotNode):
            return 1.0 - self._evaluate(node.child, doc_weights, variant)

        left = self._evaluate(node.left, doc_weights, variant)
        right = self._evaluate(node.right, doc_weights, variant)

        if isinstance(node, AndNode):
            if variant == "fuzzy_zadeh":
                return min(left, right)
            return max(0.0, left + right - 1.0)

        if isinstance(node, OrNode):
            if variant == "fuzzy_zadeh":
                return max(left, right)
            return min(1.0, left + right)

        raise ValueError("Unsupported boolean AST node")
