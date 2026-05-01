from __future__ import annotations

import re
import shutil
from datetime import datetime
from pathlib import Path
from typing import List, Literal

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from indexer import Indexer
from models.boolean_model import BooleanModel
from models.extended_boolean import ExtendedBooleanModel
from models.fuzzy_model import FuzzyBooleanModel
from models.probabilistic import ProbabilisticBIRModel
from models.vsm_model import VectorSpaceModel

BASE_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = BASE_DIR / "uploads"
SAMPLE_DIR = BASE_DIR / "sample_corpus"
DATA_DIR = BASE_DIR / "data"

app = FastAPI(title="Moteur de Recherche RI", version="2.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:3001", "http://127.0.0.1:3001"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

indexer = Indexer(DATA_DIR / "index.json")
boolean_model = BooleanModel(indexer)
vsm_model = VectorSpaceModel(indexer)
extended_boolean_model = ExtendedBooleanModel(indexer)
fuzzy_model = FuzzyBooleanModel(indexer)
probabilistic_model = ProbabilisticBIRModel(indexer)


class SearchRequest(BaseModel):
    query: str
    model: Literal["boolean", "vsm", "extended_boolean", "zadeh", "fuzzy", "probabilistic", "bir", "lukasiewicz", "fuzzy_lukasiewicz"] = "vsm"
    measure: Literal["cosine", "product", "inner_product", "euclidean", "euclidean_distance", "dice", "jaccard", "overlap", "overlap_coefficient"] = "cosine"
    operator: Literal["and", "or", "not"] = "or"
    p: float = 2.0
    top_k: int = 10


class IndexResponse(BaseModel):
    indexed: int
    document_ids: List[str]
    total_documents: int


@app.on_event("startup")
def startup() -> None:
    UPLOAD_DIR.mkdir(exist_ok=True)
    DATA_DIR.mkdir(exist_ok=True)
    loaded = indexer.load()
    if not loaded or indexer.document_count == 0:
        indexer.index_paths(SAMPLE_DIR.glob("*.txt"), clear=True)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "documents": indexer.document_count}


@app.post("/index", response_model=IndexResponse)
async def index_documents(files: List[UploadFile] = File(...), clear: bool = False) -> dict:
    paths = []
    for file in files:
        safe_name = Path(file.filename or "document.txt").name
        if Path(safe_name).suffix.lower() not in {".txt", ".pdf"}:
            raise HTTPException(status_code=400, detail="Only .txt and .pdf files are supported by /index")
        target = UPLOAD_DIR / safe_name
        with target.open("wb") as handle:
            shutil.copyfileobj(file.file, handle)
        paths.append(target)
    doc_ids = indexer.index_paths(paths, clear=clear)
    return {"indexed": len(doc_ids), "document_ids": doc_ids, "total_documents": indexer.document_count}


@app.post("/documents/upload")
async def upload_document(file: UploadFile = File(...)) -> dict:
    response = await index_documents([file], clear=False)
    return {
        "success": True,
        "doc_id": response["document_ids"][0] if response["document_ids"] else None,
        "filename": Path(file.filename or "document.txt").name,
        "message": "Document ajoute et indexe avec succes",
        "document_count": response["total_documents"],
    }


@app.post("/search")
def search(payload: SearchRequest) -> List[dict]:
    query = _normalize_query_for_structured_models(payload.query, payload.model, payload.operator)
    model = payload.model
    if model == "boolean":
        results = boolean_model.search(query)
    elif model == "vsm":
        results = vsm_model.search(payload.query, measure=payload.measure)
    elif model == "extended_boolean":
        results = extended_boolean_model.search(query, p=payload.p)
    elif model in {"zadeh", "fuzzy", "lukasiewicz", "fuzzy_lukasiewicz"}:
        results = fuzzy_model.search(query, lukasiewicz_or=(model in {"lukasiewicz", "fuzzy_lukasiewicz"}))
    elif model in {"probabilistic", "bir"}:
        results = probabilistic_model.search(payload.query)
    else:
        raise HTTPException(status_code=400, detail="Unknown model")
    return [_format_result(result, payload.query, model) for result in results[: payload.top_k]]


@app.get("/documents")
def list_documents() -> List[dict]:
    return [
        {
            "doc_id": doc_id,
            "title": doc["title"],
            "metadata": doc["metadata"],
            "token_count": len(doc["tokens"]),
            "indexed": True,
            "size": _document_size(doc),
            "upload_date": _document_upload_date(doc),
            "preview_snippet": _document_preview(doc),
        }
        for doc_id, doc in indexer.documents.items()
    ]


@app.get("/documents/{doc_id}")
def get_document(doc_id: str) -> dict:
    doc = indexer.documents.get(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc


@app.post("/documents/{doc_id}/reindex")
def reindex_document(doc_id: str) -> dict:
    doc = indexer.documents.get(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    source_path = Path(doc.get("metadata", {}).get("path", ""))
    if not source_path.exists():
        raise HTTPException(status_code=404, detail="Source file not found")

    text = indexer.extract_text(source_path)
    metadata = dict(doc.get("metadata", {}))
    metadata.setdefault("filename", source_path.name)
    metadata.setdefault("extension", source_path.suffix.lower())
    metadata["path"] = str(source_path)
    metadata["date"] = _document_upload_date(doc)

    indexer.remove_document(doc_id)
    indexer.add_document(text=text, metadata=metadata, doc_id=doc_id)
    indexer.recompute()
    indexer.save()
    return {"success": True, "doc_id": doc_id}


@app.delete("/documents/{doc_id}")
def delete_document(doc_id: str) -> dict:
    if not indexer.remove_document(doc_id):
        raise HTTPException(status_code=404, detail="Document not found")
    return {"success": True, "doc_id": doc_id}


@app.get("/stats")
def stats() -> dict:
    postings_count = sum(len(postings) for postings in indexer.inverted_index.values())
    return {
        "documents": indexer.document_count,
        "terms": len(indexer.inverted_index),
        "index_size": postings_count,
        "top_terms": indexer.top_terms(15),
    }


@app.get("/metrics")
def metrics() -> dict:
    corpus_stats = stats()
    return {
        "feedback_count": 0,
        "precision": 0,
        "recall": 0,
        "f1": 0,
        **corpus_stats,
    }


@app.get("/suggest")
def suggest(q: str = "", limit: int = 8) -> List[str]:
    stemmed = indexer.preprocessor.preprocess(q)
    prefix = stemmed[-1] if stemmed else q.lower().strip()
    if not prefix:
        return [item["term"] for item in indexer.top_terms(limit)]
    matches = [term for term in indexer.vocabulary if term.startswith(prefix)]
    return matches[:limit]


def _normalize_query_for_structured_models(query: str, model: str, operator: str = "or") -> str:
    if model == "vsm" or model in {"probabilistic", "bir"}:
        return query
    if _has_boolean_syntax(query):
        return query
    terms = indexer.preprocessor.preprocess(query)
    if not terms:
        return query
    operator_name = operator.strip().lower()
    if operator_name == "and":
        return " AND ".join(terms)
    if operator_name == "not":
        return "NOT (" + " OR ".join(terms) + ")"
    return " OR ".join(terms)


def _has_boolean_syntax(query: str) -> bool:
    return bool(re.search(r"\b(AND|OR|NOT)\b|[()∧∨¬]", query, flags=re.IGNORECASE))


def _format_result(result: dict, original_query: str, model: str) -> dict:
    return {
        "doc_id": result["doc_id"],
        "title": result["title"],
        "score": result["score"],
        "snippet": _snippet(result["text"], original_query),
        "metadata": result["metadata"],
        "model": model,
    }


def _document_path(doc: dict) -> Path | None:
    path_value = doc.get("metadata", {}).get("path")
    if not path_value:
        return None
    return Path(path_value)


def _document_size(doc: dict) -> int:
    path = _document_path(doc)
    if path and path.exists():
        return path.stat().st_size
    return len(doc.get("text", "").encode("utf-8"))


def _document_upload_date(doc: dict) -> str:
    metadata = doc.get("metadata", {})
    if metadata.get("date"):
        return str(metadata["date"])
    path = _document_path(doc)
    if path and path.exists():
        return datetime.fromtimestamp(path.stat().st_mtime).isoformat(timespec="seconds")
    return ""


def _document_preview(doc: dict, width: int = 180) -> str:
    text = (doc.get("text") or "").strip().replace("\n", " ")
    if len(text) <= width:
        return text
    return text[:width].rstrip() + "..."


def _snippet(text: str, query: str, width: int = 220) -> str:
    operators = {"and", "or", "not"}
    tokens = [
        re.escape(token)
        for token in re.findall(r"[A-Za-zÀ-ÿ0-9']+", query)
        if len(token) > 1 and token.lower() not in operators
    ]
    if not tokens:
        return text[:width]
    match = re.search("|".join(tokens), text, flags=re.IGNORECASE)
    start = max(0, (match.start() if match else 0) - 70)
    snippet = text[start : start + width]
    for token in tokens:
        snippet = re.sub(f"({token})", r"<mark>\1</mark>", snippet, flags=re.IGNORECASE)
    return ("..." if start else "") + snippet + ("..." if start + width < len(text) else "")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
