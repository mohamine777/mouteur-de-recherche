from __future__ import annotations

import re
import shutil
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Literal

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from analytics import QueryAnalyzer
from evaluation import IREvaluator
from indexer import Indexer
from models.boolean_model import BooleanModel
from models.extended_boolean import ExtendedBooleanModel
from models.fuzzy_model import FuzzyBooleanModel
from models.probabilistic import ProbabilisticBIRModel
from models.vsm_model import VectorSpaceModel
from parsers.document_parser import DocumentParser

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
SUPPORTED_UPLOAD_EXTENSIONS = DocumentParser.SUPPORTED
last_feedback_metrics = {"feedback_count": 0, "precision": 0, "recall": 0, "f1": 0}


class SearchRequest(BaseModel):
    query: str
    model: Literal["boolean", "vsm", "extended_boolean", "zadeh", "fuzzy", "probabilistic", "bir", "lukasiewicz", "fuzzy_lukasiewicz"] = "vsm"
    measure: Literal["cosine", "product", "inner_product", "euclidean", "euclidean_distance", "dice", "jaccard", "overlap", "overlap_coefficient"] = "cosine"
    operator: Literal["and", "or", "not"] = "or"
    p: float = 2.0
    top_k: int = 10


class FeedbackSearchRequest(BaseModel):
    query: str
    relevant_doc_ids: List[str] = []
    non_relevant_doc_ids: List[str] = []
    top_k: int = 10


class EvaluationRequest(BaseModel):
    ground_truth: Dict[str, List[str]]
    models: List[Literal["boolean", "extended_boolean", "vsm", "bir", "probabilistic", "zadeh", "fuzzy", "lukasiewicz", "fuzzy_lukasiewicz"]] = Field(
        default_factory=lambda: ["boolean", "extended_boolean", "vsm", "bir", "zadeh", "lukasiewicz"]
    )
    top_k: int = 10
    measure: Literal["cosine", "product", "inner_product", "euclidean", "euclidean_distance", "dice", "jaccard", "overlap", "overlap_coefficient"] = "cosine"
    operator: Literal["and", "or", "not"] = "or"
    p: float = 2.0


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
        if Path(safe_name).suffix.lower() not in SUPPORTED_UPLOAD_EXTENSIONS:
            supported = ", ".join(sorted(SUPPORTED_UPLOAD_EXTENSIONS))
            raise HTTPException(status_code=400, detail=f"Supported files: {supported}")
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


@app.post("/search/feedback")
def search_with_feedback(payload: FeedbackSearchRequest) -> List[dict]:
    global last_feedback_metrics
    results = probabilistic_model.search(
        payload.query,
        relevant_doc_ids=payload.relevant_doc_ids,
        non_relevant_doc_ids=payload.non_relevant_doc_ids,
    )
    formatted_results = [_format_result(result, payload.query, "probabilistic") for result in results[: payload.top_k]]
    last_feedback_metrics = _calculate_ir_metrics(
        [result["doc_id"] for result in formatted_results],
        payload.relevant_doc_ids,
        payload.non_relevant_doc_ids,
    )
    return formatted_results


@app.post("/evaluation")
def evaluate_models(payload: EvaluationRequest) -> dict:
    model_runners = {
        "boolean": lambda query: boolean_model.search(_normalize_query_for_structured_models(query, "boolean", payload.operator)),
        "extended_boolean": lambda query: extended_boolean_model.search(
            _normalize_query_for_structured_models(query, "extended_boolean", payload.operator),
            p=payload.p,
        ),
        "vsm": lambda query: vsm_model.search(query, measure=payload.measure),
        "bir": probabilistic_model.search,
        "zadeh": lambda query: fuzzy_model.search(_normalize_query_for_structured_models(query, "zadeh", payload.operator), lukasiewicz_or=False),
        "lukasiewicz": lambda query: fuzzy_model.search(
            _normalize_query_for_structured_models(query, "lukasiewicz", payload.operator),
            lukasiewicz_or=True,
        ),
    }
    evaluator = IREvaluator(
        model_runners,
        known_doc_ids=set(indexer.documents.keys()),
    )
    try:
        result = evaluator.evaluate_batch(payload.ground_truth, models=payload.models, top_k=payload.top_k)
        analyzer = QueryAnalyzer(indexer)
        analyses = []
        for query_row in result["per_query"]:
            per_model_metrics = {
                model: query_row[model]
                for model in result["models"]
                if model in query_row
            }
            analyses.append(analyzer.analyze(query_row["query"], per_model_metrics))
        result["query_analysis"] = analyses
        return result
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


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


@app.get("/stats/tfidf")
def tfidf_stats(doc_ids: str = "") -> dict:
    requested = [doc_id.strip() for doc_id in doc_ids.split(",") if doc_id.strip()]
    selected_doc_ids = requested or list(indexer.documents.keys())
    documents = []
    for doc_id in selected_doc_ids:
        doc = indexer.documents.get(doc_id)
        if not doc:
            raise HTTPException(status_code=404, detail=f"Document not found: {doc_id}")
        rows = _document_tfidf_rows(doc_id)
        documents.append({
            "doc_id": doc_id,
            "title": doc["title"],
            "metadata": doc["metadata"],
            "terms": rows,
        })
    return {"documents": documents}


@app.get("/stats/term-tfidf")
def term_tfidf_stats(term: str, doc_ids: str = "") -> dict:
    normalized_terms = indexer.preprocessor.preprocess(term)
    normalized_term = normalized_terms[0] if normalized_terms else term.lower().strip()
    requested = [doc_id.strip() for doc_id in doc_ids.split(",") if doc_id.strip()]
    selected_doc_ids = requested or list(indexer.documents.keys())
    idf = indexer.idf(normalized_term)
    documents = []
    for doc_id in selected_doc_ids:
        if doc_id not in indexer.documents:
            raise HTTPException(status_code=404, detail=f"Document not found: {doc_id}")
        tf = int(indexer.doc_term_freqs.get(doc_id, {}).get(normalized_term, 0))
        tfidf = float(tf) * idf
        print(f"[TERM TFIDF DEBUG] term={normalized_term} doc={doc_id} tf={tf} idf={idf:.6f} tfidf={tfidf:.6f}")
        documents.append({
            "doc_id": doc_id,
            "tf": tf,
            "tfidf": round(tfidf, 6),
        })
    return {"term": normalized_term, "idf": round(idf, 6), "documents": documents}


@app.get("/metrics")
def metrics() -> dict:
    corpus_stats = stats()
    return {
        **last_feedback_metrics,
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


def _document_tfidf_rows(doc_id: str) -> List[dict]:
    freqs = indexer.doc_term_freqs.get(doc_id, {})
    rows = []
    for term, tf in sorted(freqs.items(), key=lambda item: (-item[1], item[0])):
        idf = indexer.idf(term)
        tfidf = float(tf) * idf
        print(f"[TFIDF DEBUG] doc={doc_id} term={term} tf={tf} idf={idf:.6f} tfidf={tfidf:.6f}")
        rows.append({
            "term": term,
            "tf": int(tf),
            "idf": round(idf, 6),
            "tfidf": round(tfidf, 6),
        })
    return rows


def _calculate_ir_metrics(retrieved_doc_ids: List[str], relevant_doc_ids: List[str], non_relevant_doc_ids: List[str]) -> dict:
    retrieved = set(retrieved_doc_ids)
    relevant = set(relevant_doc_ids)
    tp = len(retrieved & relevant)
    fp = len(retrieved - relevant)
    fn = len(relevant - retrieved)
    precision = tp / (tp + fp) if tp + fp else 0
    recall = tp / (tp + fn) if tp + fn else 0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0
    return {
        "feedback_count": len(relevant_doc_ids) + len(non_relevant_doc_ids),
        "precision": round(precision, 6),
        "recall": round(recall, 6),
        "f1": round(f1, 6),
    }


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
