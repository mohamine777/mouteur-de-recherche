from collections import defaultdict
from typing import Dict, List

from preprocessing.pipeline import TextPreprocessor


class InvertedIndex:
    """Store term posting lists and document metadata in memory."""

    def __init__(self):
        self.preprocessor = TextPreprocessor()
        self.postings = defaultdict(dict)
        self.documents: Dict[str, Dict] = {}
        self.doc_lengths: Dict[str, int] = {}

    def add_document(self, doc_id: str, text: str, metadata: Dict):
        tokens = self.preprocessor.preprocess(text)
        tf = self.preprocessor.term_frequency(tokens)
        self.documents[doc_id] = {
            "text": text,
            "metadata": metadata,
            "tokens": tokens,
        }
        self.doc_lengths[doc_id] = len(tokens)

        for term, freq in tf.items():
            self.postings[term][doc_id] = freq

    def remove_document(self, doc_id: str):
        if doc_id not in self.documents:
            return

        terms = set(self.documents[doc_id]["tokens"])
        for term in terms:
            self.postings[term].pop(doc_id, None)
            if not self.postings[term]:
                self.postings.pop(term, None)

        self.documents.pop(doc_id, None)
        self.doc_lengths.pop(doc_id, None)

    def get_postings(self, term: str) -> Dict[str, int]:
        return self.postings.get(term, {})

    def all_documents(self) -> List[Dict]:
        items = []
        for doc_id, payload in self.documents.items():
            items.append(
                {
                    "doc_id": doc_id,
                    "filename": payload["metadata"].get("filename", doc_id),
                    "metadata": payload["metadata"],
                }
            )
        return items

    @property
    def document_count(self) -> int:
        return len(self.documents)
