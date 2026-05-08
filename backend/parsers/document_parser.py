import csv
import json
import re
from html.parser import HTMLParser
from pathlib import Path
from typing import Dict, Tuple

from docx import Document
from openpyxl import load_workbook
from PyPDF2 import PdfReader


class DocumentParser:
    """Read supported file types and return extracted text + metadata."""

    SUPPORTED = {".pdf", ".docx", ".xlsx", ".csv", ".json", ".html", ".htm", ".md", ".txt"}

    def parse(self, file_path: Path) -> Tuple[str, Dict[str, str]]:
        suffix = file_path.suffix.lower()
        if suffix not in self.SUPPORTED:
            raise ValueError(f"Unsupported file type: {suffix}")

        if suffix == ".pdf":
            text = self._parse_pdf(file_path)
        elif suffix == ".docx":
            text = self._parse_docx(file_path)
        elif suffix == ".xlsx":
            text = self._parse_xlsx(file_path)
        elif suffix == ".csv":
            text = self._parse_csv(file_path)
        elif suffix == ".json":
            text = self._parse_json(file_path)
        elif suffix in {".html", ".htm"}:
            text = self._parse_html(file_path)
        elif suffix == ".md":
            text = self._parse_markdown(file_path)
        else:
            text = file_path.read_text(encoding="utf-8", errors="ignore")

        metadata = {
            "filename": file_path.name,
            "path": str(file_path),
            "extension": suffix,
        }
        return text, metadata

    def _parse_pdf(self, file_path: Path) -> str:
        reader = PdfReader(str(file_path))
        pages = [page.extract_text() or "" for page in reader.pages]
        return "\n".join(pages)

    def _parse_docx(self, file_path: Path) -> str:
        doc = Document(str(file_path))
        return "\n".join(paragraph.text for paragraph in doc.paragraphs)

    def _parse_xlsx(self, file_path: Path) -> str:
        workbook = load_workbook(filename=str(file_path), data_only=True)
        chunks = []
        for sheet_name in workbook.sheetnames:
            sheet = workbook[sheet_name]
            rows = []
            for row in sheet.iter_rows(values_only=True):
                rows.append(" | ".join("" if cell is None else str(cell) for cell in row))
            chunks.append(f"Sheet: {sheet_name}\n" + "\n".join(rows))
        return "\n\n".join(chunks)

    def _parse_csv(self, file_path: Path) -> str:
        with file_path.open(newline="", encoding="utf-8", errors="ignore") as handle:
            reader = csv.reader(handle)
            return "\n".join(" | ".join(cell for cell in row) for row in reader)

    def _parse_json(self, file_path: Path) -> str:
        raw = file_path.read_text(encoding="utf-8", errors="ignore")
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            return raw
        return json.dumps(payload, ensure_ascii=False, indent=2)

    def _parse_html(self, file_path: Path) -> str:
        parser = _TextHTMLParser()
        parser.feed(file_path.read_text(encoding="utf-8", errors="ignore"))
        return parser.text()

    def _parse_markdown(self, file_path: Path) -> str:
        text = file_path.read_text(encoding="utf-8", errors="ignore")
        text = re.sub(r"```.*?```", " ", text, flags=re.DOTALL)
        text = re.sub(r"`([^`]+)`", r"\1", text)
        text = re.sub(r"!\[([^\]]*)\]\([^)]+\)", r"\1", text)
        text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
        text = re.sub(r"^#{1,6}\s*", "", text, flags=re.MULTILINE)
        return re.sub(r"[*_~>`#-]+", " ", text)


class _TextHTMLParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self._chunks = []
        self._skip_depth = 0

    def handle_starttag(self, tag: str, attrs) -> None:
        if tag.lower() in {"script", "style"}:
            self._skip_depth += 1

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() in {"script", "style"} and self._skip_depth:
            self._skip_depth -= 1

    def handle_data(self, data: str) -> None:
        if not self._skip_depth and data.strip():
            self._chunks.append(data.strip())

    def text(self) -> str:
        return "\n".join(self._chunks)
