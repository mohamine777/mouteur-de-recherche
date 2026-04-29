import re
from collections import Counter
from typing import Dict, List


class TextPreprocessor:
    """Simple text preprocessing pipeline for IR tasks."""

    STOPWORDS = {
        "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "has",
        "he", "in", "is", "it", "its", "of", "on", "that", "the", "to", "was",
        "were", "will", "with", "this", "these", "those", "or", "not",
    }

    TOKEN_PATTERN = re.compile(r"[a-z0-9]+")

    def preprocess(self, text: str) -> List[str]:
        lowered = text.lower()
        tokens = self.TOKEN_PATTERN.findall(lowered)
        filtered = [token for token in tokens if token not in self.STOPWORDS]
        stemmed = [self._stem(token) for token in filtered]
        return stemmed

    def term_frequency(self, tokens: List[str]) -> Dict[str, int]:
        return dict(Counter(tokens))

    def _stem(self, token: str) -> str:
        for suffix in ("ing", "edly", "edly", "ed", "ly", "es", "s"):
            if token.endswith(suffix) and len(token) > len(suffix) + 2:
                return token[: -len(suffix)]
        return token
