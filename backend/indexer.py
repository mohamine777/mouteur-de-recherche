from __future__ import annotations

import math
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from typing import Dict, Iterable, List, Tuple
from uuid import uuid4

from PyPDF2 import PdfReader

from utils.index_store import JsonIndexStore
from utils.preprocessing import TextPreprocessor


class Indexer:
    """Shared indexing pipeline used by every retrieval model."""

    PREPROCESSOR_VERSION = "ri-preprocess-v5"

    def __init__(self, store_path: Path | None = None) -> None:
        self.preprocessor = TextPreprocessor()
        self.store = JsonIndexStore(store_path or Path("data/index.json"))
        self.documents: Dict[str, Dict] = {}
        self.inverted_index: Dict[str, Dict[str, int]] = defaultdict(dict)
        self.doc_term_freqs: Dict[str, Dict[str, int]] = {}
        self.tfidf_matrix: Dict[str, Dict[str, float]] = {}

    @property
    def document_count(self) -> int:
        return len(self.documents)

    @property
    def vocabulary(self) -> List[str]:
        return sorted(self.inverted_index.keys())

    def index_paths(self, paths: Iterable[Path], clear: bool = False) -> List[str]:
        if clear:
            self.clear()
        doc_ids = []
        for path in paths:
            if path.suffix.lower() not in {".txt", ".pdf"}:
                continue
            text = self.extract_text(path)
            if not text.strip():
                continue
            doc_ids.append(self.add_document(text=text, metadata={
                "title": path.stem.replace("_", " ").title(),
                "path": str(path),
                "filename": path.name,
                "date": datetime.fromtimestamp(path.stat().st_mtime).isoformat(timespec="seconds"),
                "extension": path.suffix.lower(),
            }))
        self.recompute()
        self.save()
        return doc_ids

    def add_document(self, text: str, metadata: Dict[str, str], doc_id: str | None = None) -> str:
        new_doc_id = doc_id or str(uuid4())
        tokens = self.preprocessor.preprocess(text)
        term_freqs = self.preprocessor.term_frequency(tokens)
        self.documents[new_doc_id] = {
            "doc_id": new_doc_id,
            "title": metadata.get("title") or metadata.get("filename") or new_doc_id,
            "text": text,
            "metadata": metadata,
            "tokens": tokens,
        }
        self.doc_term_freqs[new_doc_id] = term_freqs
        for term, tf in term_freqs.items():
            self.inverted_index[term][new_doc_id] = tf
        return new_doc_id

    def clear(self) -> None:
        self.documents = {}
        self.inverted_index = defaultdict(dict)
        self.doc_term_freqs = {}
        self.tfidf_matrix = {}

    def remove_document(self, doc_id: str) -> bool:
        if doc_id not in self.documents:
            return False
        for term in list(self.doc_term_freqs.get(doc_id, {}).keys()):
            self.inverted_index.get(term, {}).pop(doc_id, None)
            if not self.inverted_index.get(term):
                self.inverted_index.pop(term, None)
        self.documents.pop(doc_id, None)
        self.doc_term_freqs.pop(doc_id, None)
        self.tfidf_matrix.pop(doc_id, None)
        self.recompute()
        self.save()
        return True

    def recompute(self) -> None:
        self.tfidf_matrix = {
            doc_id: self.tfidf_vector(self.doc_term_freqs.get(doc_id, {}))
            for doc_id in self.documents
        }

    def tfidf_vector(self, tf: Dict[str, int] | Dict[str, float], normalized_tf: bool = True) -> Dict[str, float]:
        max_tf = max(tf.values(), default=1)
        vector: Dict[str, float] = {}
        for term, count in tf.items():
            tf_value = float(count) / max_tf if normalized_tf and max_tf else float(count)
            # IDF = log(N / df_j), where N is corpus size and df_j is document frequency.
            idf = self.idf(term)
            if idf > 0:
                # w_ij = tf_ij * idf_j
                vector[term] = tf_value * idf
        return vector

    def idf(self, term: str) -> float:
        df = len(self.inverted_index.get(term, {}))
        if self.document_count == 0 or df == 0:
            return 0.0
        return math.log(self.document_count / df)

    def postings(self, term: str) -> Dict[str, int]:
        return self.inverted_index.get(term, {})

    def all_doc_ids(self) -> set[str]:
        return set(self.documents.keys())

    def top_terms(self, limit: int = 12) -> List[Dict[str, float]]:
        totals = Counter()
        for freqs in self.doc_term_freqs.values():
            totals.update(freqs)
        return [
            {"term": term, "tf": int(tf), "df": len(self.inverted_index.get(term, {})), "idf": round(self.idf(term), 6)}
            for term, tf in totals.most_common(limit)
        ]

    def save(self) -> None:
        self.store.save({
            "preprocessor_version": self.PREPROCESSOR_VERSION,
            "documents": self.documents,
            "inverted_index": {term: postings for term, postings in self.inverted_index.items()},
            "doc_term_freqs": self.doc_term_freqs,
            "tfidf_matrix": self.tfidf_matrix,
        })

    def load(self) -> bool:
        payload = self.store.load()
        if not payload:
            return False
        if payload.get("preprocessor_version") != self.PREPROCESSOR_VERSION:
            return False
        self.documents = payload.get("documents", {})
        self.inverted_index = defaultdict(dict, payload.get("inverted_index", {}))
        self.doc_term_freqs = payload.get("doc_term_freqs", {})
        self.tfidf_matrix = payload.get("tfidf_matrix", {})
        return True

    @staticmethod
    def extract_text(path: Path) -> str:
        if path.suffix.lower() == ".pdf":
            reader = PdfReader(str(path))
            return "\n".join(page.extract_text() or "" for page in reader.pages)
        return path.read_text(encoding="utf-8", errors="ignore")

    @staticmethod
    def vector_norm(vector: Dict[str, float]) -> float:
        return math.sqrt(sum(weight * weight for weight in vector.values()))

    @staticmethod
    def dot(left: Dict[str, float], right: Dict[str, float]) -> float:
        return sum(left.get(term, 0.0) * right.get(term, 0.0) for term in set(left) | set(right))
