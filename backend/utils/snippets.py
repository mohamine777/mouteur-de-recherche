import html
from typing import List


class SnippetGenerator:
    """Generate short highlighted snippets from raw text."""

    def create(self, text: str, query_tokens: List[str], max_len: int = 220) -> str:
        if not text:
            return ""

        lowered = text.lower()
        pos = min((lowered.find(t) for t in query_tokens if t and lowered.find(t) != -1), default=0)
        start = max(pos - 60, 0)
        end = min(start + max_len, len(text))
        snippet = html.escape(text[start:end])

        for token in sorted(set(query_tokens), key=len, reverse=True):
            if token:
                snippet = snippet.replace(token, f"<mark>{token}</mark>")
                snippet = snippet.replace(token.capitalize(), f"<mark>{token.capitalize()}</mark>")
        return snippet
