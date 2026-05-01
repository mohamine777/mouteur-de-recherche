from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict


class JsonIndexStore:
    """Persist the shared IR index as plain JSON for academic transparency."""

    def __init__(self, path: Path) -> None:
        self.path = path

    def save(self, payload: Dict[str, Any]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    def load(self) -> Dict[str, Any] | None:
        if not self.path.exists():
            return None
        return json.loads(self.path.read_text(encoding="utf-8"))
