from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Dict, List, Set


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
    """Recursive descent parser: leaves are terms, internal nodes are AND/OR/NOT."""

    TOKEN_PATTERN = re.compile(r"\(|\)|\bAND\b|\bOR\b|\bNOT\b|∧|∨|¬|[A-Za-zÀ-ÿ0-9']+", re.IGNORECASE)

    def __init__(self, preprocessor) -> None:
        self.preprocessor = preprocessor
        self.tokens: List[str] = []
        self.position = 0

    def parse(self, query: str):
        self.tokens = self._tokenize(query)
        self.position = 0
        if not self.tokens:
            return None
        node = self._parse_or()
        if self.position != len(self.tokens):
            raise ValueError("Invalid Boolean expression")
        return node

    def _tokenize(self, query: str) -> List[str]:
        tokens = []
        for token in self.TOKEN_PATTERN.findall(query):
            mapped = {"∧": "AND", "∨": "OR", "¬": "NOT"}.get(token, token.upper())
            tokens.append(mapped if mapped in {"AND", "OR", "NOT", "(", ")"} else token)
        return tokens

    def _parse_or(self):
        node = self._parse_and()
        while self._match("OR"):
            node = OrNode(node, self._parse_and())
        return node

    def _parse_and(self):
        node = self._parse_not()
        while self._match("AND"):
            node = AndNode(node, self._parse_not())
        return node

    def _parse_not(self):
        if self._match("NOT"):
            return NotNode(self._parse_not())
        return self._parse_primary()

    def _parse_primary(self):
        if self._match("("):
            node = self._parse_or()
            if not self._match(")"):
                raise ValueError("Unbalanced parentheses")
            return node
        if self.position >= len(self.tokens) or self.tokens[self.position] in {"AND", "OR", "NOT", ")", "("}:
            raise ValueError("Expected a term")
        raw = self.tokens[self.position]
        self.position += 1
        terms = self.preprocessor.preprocess(raw)
        return TermNode(terms[0] if terms else raw.lower())

    def _match(self, token: str) -> bool:
        if self.position < len(self.tokens) and self.tokens[self.position] == token:
            self.position += 1
            return True
        return False


class BooleanModel:
    """Boolean model: RSV(d, q) in {0, 1}; exact set matching, no ranking."""

    def __init__(self, indexer) -> None:
        self.indexer = indexer
        self.parser = BooleanQueryParser(indexer.preprocessor)

    def search(self, query: str) -> List[Dict]:
        ast = self.parser.parse(query)
        if ast is None:
            return []
        matched = self._eval(ast)
        return [self._result(doc_id, 1.0) for doc_id in sorted(matched)]

    def _eval(self, node) -> Set[str]:
        if isinstance(node, TermNode):
            # RSV = 1 iff the document belongs to the term posting set.
            return set(self.indexer.postings(node.term).keys())
        if isinstance(node, NotNode):
            return self.indexer.all_doc_ids() - self._eval(node.child)
        if isinstance(node, AndNode):
            return self._eval(node.left) & self._eval(node.right)
        if isinstance(node, OrNode):
            return self._eval(node.left) | self._eval(node.right)
        raise ValueError("Unsupported Boolean AST node")

    def _result(self, doc_id: str, score: float) -> Dict:
        doc = self.indexer.documents[doc_id]
        return {"doc_id": doc_id, "title": doc["title"], "score": score, "text": doc["text"], "metadata": doc["metadata"]}
