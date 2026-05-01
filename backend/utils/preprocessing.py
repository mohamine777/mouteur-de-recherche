from __future__ import annotations

import re
from collections import Counter
from typing import Dict, List

try:
    from nltk.stem.snowball import SnowballStemmer
except Exception:  # pragma: no cover - project still runs when NLTK is absent.
    SnowballStemmer = None


class TextPreprocessor:
    """Tokenization, lowercasing, stopword removal and French/English stemming."""

    TOKEN_PATTERN = re.compile(r"[A-Za-zÀ-ÿ0-9']+")

    STOPWORDS = {
        "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "has", "have", "in", "is",
        "it", "its", "of", "on", "or", "not", "that", "the", "this", "to", "was", "were", "with",
        "un", "une", "des", "de", "du", "la", "le", "les", "et", "ou", "mais", "dans", "sur",
        "pour", "par", "avec", "sans", "est", "sont", "ce", "ces", "cette", "au", "aux", "en",
    }

    def __init__(self) -> None:
        # Keep stemming deterministic even when one environment has NLTK and another does not.
        self.english_stemmer = None
        self.french_stemmer = None

    def preprocess(self, text: str, language: str = "auto") -> List[str]:
        raw_tokens = [token.strip("'").lower() for token in self.TOKEN_PATTERN.findall(text)]
        filtered = [token for token in raw_tokens if token and token not in self.STOPWORDS and len(token) > 1]
        return [self.stem(token, language) for token in filtered]

    def stem(self, token: str, language: str = "auto") -> str:
        if self.french_stemmer and self.english_stemmer:
            if language == "fr" or any(ch in token for ch in "àâçéèêëîïôùûüÿ"):
                return self.french_stemmer.stem(token)
            return self.english_stemmer.stem(token)
        return self._fallback_stem(token)

    @staticmethod
    def term_frequency(tokens: List[str]) -> Dict[str, int]:
        return dict(Counter(tokens))

    @staticmethod
    def _fallback_stem(token: str) -> str:
        suffixes = (
            "ements", "ement", "ations", "ation", "atrices", "ateurs", "ateur", "ités", "ique",
            "iques", "ing", "edly", "edly", "ment", "ed", "es", "s",
            "al",
        )
        for suffix in suffixes:
            if token.endswith(suffix) and len(token) > len(suffix) + 3:
                return token[: -len(suffix)]
        return token
