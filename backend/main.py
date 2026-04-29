import json
import traceback
from pathlib import Path
from typing import Dict, List
from uuid import uuid4

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from core.config import UPLOAD_DIR
from core.state import state
from parsers.document_parser import DocumentParser
from utils.snippets import SnippetGenerator

app = FastAPI(title="IR System API", version="1.0.0")
parser = DocumentParser()
snippets = SnippetGenerator()
EVAL_K = 5

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class SearchRequest(BaseModel):
    query: str
    top_k: int = 10
    model: str = "vsm"
    measure: str = "cosine"
    tf_mode: str = "normalized"
    p: float = 2.0
    operator: str = "or"


class CompareRequest(BaseModel):
    query: str
    top_k: int = 10
    model_a: str = "vsm"
    measure_a: str = "cosine"
    tf_mode_a: str = "normalized"
    p_a: float = 2.0
    operator_a: str = "or"
    model_b: str = "boolean_exact"
    measure_b: str = "cosine"
    tf_mode_b: str = "normalized"
    p_b: float = 2.0
    operator_b: str = "or"


class FeedbackRequest(BaseModel):
    query: str
    doc_id: str
    relevant: bool


def _extract_doc_ids(results: List[dict]) -> List[str]:
    deduplicated: List[str] = []
    seen = set()
    for result in results:
        doc_id = result["doc_id"]
        if doc_id in seen:
            continue
        seen.add(doc_id)
        deduplicated.append(doc_id)
    return deduplicated


def _search_model(model: str, query: str, top_k: int) -> List[dict]:
    model_normalized = model.strip().lower().replace("-", "_").replace(" ", "_")
    if model_normalized == "vsm":
        query_tokens = state.index.preprocessor.preprocess(query)
        return state.vsm.search(query_tokens=query_tokens, top_k=top_k, measure="cosine")
    if model_normalized in {"boolean", "boolean_exact", "exact_boolean"}:
        return state.boolean_exact.search(query, top_k=top_k)
    if model_normalized == "extended_boolean":
        return state.boolean.search(query, top_k=top_k, p=2.0)
    if model_normalized in {"fuzzy_zadeh", "fuzzy_lukasiewicz"}:
        return state.fuzzy.search(query, variant=model_normalized, top_k=top_k)
    raise HTTPException(status_code=400, detail="Unknown model")


def _query_has_boolean_syntax(query: str) -> bool:
    normalized = query.upper()
    return "AND" in normalized or "OR" in normalized or "NOT" in normalized or "(" in query or ")" in query


def _compose_operator_query(query: str, operator: str) -> str:
    if _query_has_boolean_syntax(query):
        return query

    tokens = state.index.preprocessor.preprocess(query)
    if not tokens:
        return query

    operator_normalized = operator.strip().lower()
    if operator_normalized == "and":
        return " AND ".join(tokens)
    if operator_normalized == "not":
        return "NOT (" + " OR ".join(tokens) + ")"
    return " OR ".join(tokens)


def _search_variant(
    model: str,
    measure: str,
    query: str,
    top_k: int,
    tf_mode: str = "normalized",
    p: float = 2.0,
    operator: str = "or",
) -> List[dict]:
    query_tokens = state.index.preprocessor.preprocess(query)
    model_normalized = model.strip().lower().replace("-", "_").replace(" ", "_")
    measure_normalized = measure.strip().lower().replace("-", "_").replace(" ", "_")
    effective_query = _compose_operator_query(query, operator)

    if model_normalized == "vsm":
        return state.vsm.search(query_tokens=query_tokens, top_k=top_k, measure=measure_normalized, tf_mode=tf_mode)
    if model_normalized in {"boolean", "boolean_exact", "exact_boolean"}:
        return state.boolean_exact.search(effective_query, top_k=top_k)
    if model_normalized == "extended_boolean":
        return state.boolean.search(effective_query, top_k=top_k, p=p)
    if model_normalized in {"fuzzy_zadeh", "fuzzy_lukasiewicz"}:
        return state.fuzzy.search(effective_query, variant=model_normalized, top_k=top_k)
    raise HTTPException(status_code=400, detail="Unknown model")


def _with_snippets(results: List[dict], query: str) -> List[dict]:
    query_tokens = state.index.preprocessor.preprocess(query)
    formatted_results = []
    for result in results:
        item = dict(result)
        item["snippet"] = snippets.create(item["text"], query_tokens)
        item.pop("text", None)
        formatted_results.append(item)
    return formatted_results


def _evaluation_queries(query: str | None = None) -> List[str]:
    if query:
        return [query]
    return state.evaluator.available_queries()


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "documents": state.index.document_count}


@app.post("/documents/upload")
async def upload_document(file: UploadFile = File(...)) -> dict:
    safe_filename = Path(file.filename or "upload.txt").name
    file_path = UPLOAD_DIR / safe_filename
    print(f"UPLOAD DEBUG: filename={safe_filename}")

    try:
        content = await file.read()
        file_path.write_bytes(content)
        text, metadata = parser.parse(file_path)

        doc_id = str(uuid4())
        state.index.add_document(doc_id=doc_id, text=text, metadata=metadata)
        state.vsm.invalidate_cache()

        print(
            "UPLOAD DEBUG:",
            {
                "filename": safe_filename,
                "index_success": True,
                "document_count": state.index.document_count,
            },
        )

        return {
            "success": True,
            "doc_id": doc_id,
            "filename": safe_filename,
            "message": "Document ajouté et indexé avec succès",
            "document_count": state.index.document_count,
        }
    except ValueError as exc:
        traceback.print_exc()
        file_path.unlink(missing_ok=True)
        print(
            "UPLOAD DEBUG:",
            {
                "filename": safe_filename,
                "index_success": False,
                "error": str(exc),
            },
        )
        return JSONResponse(
            status_code=400,
            content={"success": False, "error": str(exc), "filename": safe_filename},
        )
    except Exception as exc:
        traceback.print_exc()
        file_path.unlink(missing_ok=True)
        print(
            "UPLOAD DEBUG:",
            {
                "filename": safe_filename,
                "index_success": False,
                "error": str(exc),
            },
        )
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": f"Upload/index failed for {safe_filename}", "filename": safe_filename},
        )


@app.post("/load-ground-truth")
async def load_ground_truth(file: UploadFile = File(...)) -> dict:
    content = await file.read()
    try:
        payload = json.loads(content.decode("utf-8"))
        if not isinstance(payload, dict):
            raise ValueError("Ground truth JSON must map queries to relevant document lists.")
        state.evaluator.load_ground_truth(payload)
    except (UnicodeDecodeError, json.JSONDecodeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {
        "message": "Ground truth loaded",
        "ground_truth_queries": len(state.evaluator.ground_truth),
    }


@app.get("/documents")
def list_documents() -> List[dict]:
    return state.index.all_documents()


@app.delete("/documents/{doc_id}")
def delete_document(doc_id: str) -> dict:
    if doc_id not in state.index.documents:
        raise HTTPException(status_code=404, detail="Document not found")

    filename = state.index.documents[doc_id]["metadata"].get("filename")
    if filename:
        (UPLOAD_DIR / filename).unlink(missing_ok=True)

    state.index.remove_document(doc_id)
    state.vsm.invalidate_cache()
    return {"message": "Document removed", "doc_id": doc_id}


@app.post("/search/vsm")
def search_vsm(payload: SearchRequest) -> List[dict]:
    print(f"[SEARCH DEBUG] /search/vsm query={payload.query!r} top_k={payload.top_k}")
    results = _with_snippets(
        state.vsm.search(
            query_tokens=state.index.preprocessor.preprocess(payload.query),
            top_k=payload.top_k,
            measure=payload.measure,
            tf_mode=payload.tf_mode,
        ),
        payload.query,
    )
    print(f"[SEARCH DEBUG] /search/vsm returned_results={len(results)}")
    return results


@app.post("/search/boolean")
def search_boolean(payload: SearchRequest) -> List[dict]:
    print(
        f"[SEARCH DEBUG] /search/boolean query={payload.query!r} operator={payload.operator!r} top_k={payload.top_k}"
    )
    results = _with_snippets(state.boolean_exact.search(payload.query, top_k=payload.top_k), payload.query)
    print(f"[SEARCH DEBUG] /search/boolean returned_results={len(results)}")
    return results


@app.post("/search")
def search(payload: SearchRequest) -> List[dict]:
    print(
        f"[SEARCH DEBUG] /search model={payload.model!r} measure={payload.measure!r} query={payload.query!r} top_k={payload.top_k}"
    )
    results = _search_variant(
        payload.model,
        payload.measure,
        payload.query,
        payload.top_k,
        payload.tf_mode,
        payload.p,
        payload.operator,
    )
    formatted_results = _with_snippets(results, payload.query)
    print(f"[SEARCH DEBUG] /search returned_results={len(formatted_results)}")
    return formatted_results


@app.post("/feedback")
def store_feedback(payload: FeedbackRequest) -> dict:
    state.evaluator.add_feedback(
        query=payload.query,
        doc_id=payload.doc_id,
        relevant=payload.relevant,
    )
    return {"message": "Feedback saved"}


@app.get("/metrics")
def get_metrics() -> dict:
    query_rankings: Dict[str, List[str]] = {
        query: _extract_doc_ids(_search_model("vsm", query, top_k=EVAL_K))
        for query in _evaluation_queries()
    }
    report = state.evaluator.metrics(model_name="vsm", k=EVAL_K, query_to_ranked_doc_ids=query_rankings)
    return {
        "precision": report.get("precision_at_k", 0.0),
        "recall": report.get("recall_at_k", 0.0),
        "f1": report.get("f1", 0.0),
        "feedback_count": report.get("feedback_count", 0),
        "precision_at_k": report.get("precision_at_k", 0.0),
        "recall_at_k": report.get("recall_at_k", 0.0),
        "map": report.get("map", 0.0),
        "dcg": report.get("dcg", 0.0),
        "ndcg": report.get("ndcg", 0.0),
        "source": report.get("source", "feedback"),
        "queries_evaluated": report.get("queries_evaluated", 0),
    }


@app.get("/evaluate")
def evaluate(query: str, model: str = "vsm") -> dict:
    ranked_results = _search_model(model, query, top_k=EVAL_K)
    report = state.evaluator.evaluate_model_results(
        query=query,
        model_name=model,
        retrieved_doc_ids=_extract_doc_ids(ranked_results),
        k=EVAL_K,
    )
    report["retrieved_doc_ids"] = _extract_doc_ids(ranked_results)
    return report


@app.get("/compare-models")
def compare_models(query: str | None = None) -> dict:
    queries = _evaluation_queries(query)

    def strict_best_model(value: str) -> str:
        return value if value in {"vsm", "ebm", "Tie"} else "Tie"

    def compact_metrics(report: Dict[str, float]) -> dict:
        return {
            "precision": float(report.get("precision_at_k", 0.0)),
            "recall": float(report.get("recall_at_k", 0.0)),
            "f1": float(report.get("f1", 0.0)),
            "map": float(report.get("map", 0.0)),
            "ndcg": float(report.get("ndcg", 0.0)),
        }

    if not queries:
        vsm_summary = state.evaluator.metrics(model_name="vsm", k=EVAL_K)
        ebm_summary = state.evaluator.metrics(model_name="boolean", k=EVAL_K)
        decision = state.evaluator.determine_best_model(vsm_summary, ebm_summary)
        best_model = strict_best_model(decision.get("best_model", "Tie"))
        print(f"[COMPARE DEBUG] best_model={best_model} reason={decision.get('reason', '')}")
        return {
            "metrics": {
                "vsm": compact_metrics(vsm_summary),
                "ebm": compact_metrics(ebm_summary),
            },
            "best_model": best_model,
            "reason": decision["reason"],
        }

    vsm_reports = []
    ebm_reports = []
    vsm_scores: List[float] = []
    ebm_scores: List[float] = []
    vsm_relevant_retrieved = 0
    ebm_relevant_retrieved = 0

    for evaluation_query in queries:
        vsm_results = _search_model("vsm", evaluation_query, top_k=EVAL_K)
        ebm_results = _search_model("boolean", evaluation_query, top_k=EVAL_K)
        vsm_docs = _extract_doc_ids(vsm_results)
        ebm_docs = _extract_doc_ids(ebm_results)

        relevant_docs = state.evaluator.relevant_documents_for_query(evaluation_query)
        if relevant_docs:
            vsm_reports.append(state.evaluator.evaluate_model_results(evaluation_query, "vsm", vsm_docs, k=EVAL_K))
            ebm_reports.append(state.evaluator.evaluate_model_results(evaluation_query, "boolean", ebm_docs, k=EVAL_K))

            vsm_scores.extend(float(result.get("score", 0.0)) for result in vsm_results)
            ebm_scores.extend(float(result.get("score", 0.0)) for result in ebm_results)
            vsm_relevant_retrieved += sum(1 for doc_id in vsm_docs if doc_id in relevant_docs)
            ebm_relevant_retrieved += sum(1 for doc_id in ebm_docs if doc_id in relevant_docs)

    vsm_summary = state.evaluator.aggregate_reports(vsm_reports)
    ebm_summary = state.evaluator.aggregate_reports(ebm_reports)
    decision = state.evaluator.determine_best_model(
        vsm_summary=vsm_summary,
        ebm_summary=ebm_summary,
        vsm_avg_score=sum(vsm_scores) / len(vsm_scores) if vsm_scores else 0.0,
        ebm_avg_score=sum(ebm_scores) / len(ebm_scores) if ebm_scores else 0.0,
        vsm_relevant_retrieved=vsm_relevant_retrieved,
        ebm_relevant_retrieved=ebm_relevant_retrieved,
    )
    best_model = strict_best_model(decision.get("best_model", "Tie"))
    print(
        "[METRICS DEBUG]",
        {
            "vsm": compact_metrics(vsm_summary),
            "ebm": compact_metrics(ebm_summary),
            "vsm_avg_score": round(sum(vsm_scores) / len(vsm_scores), 6) if vsm_scores else 0.0,
            "ebm_avg_score": round(sum(ebm_scores) / len(ebm_scores), 6) if ebm_scores else 0.0,
            "vsm_relevant_retrieved": vsm_relevant_retrieved,
            "ebm_relevant_retrieved": ebm_relevant_retrieved,
        },
    )
    print(f"[COMPARE DEBUG] best_model={best_model} reason={decision.get('reason', '')}")

    return {
        "metrics": {
            "vsm": compact_metrics(vsm_summary),
            "ebm": compact_metrics(ebm_summary),
        },
        "best_model": best_model,
        "reason": decision["reason"],
    }


@app.post("/compare")
def compare(payload: CompareRequest) -> dict:
    print(
        f"[COMPARE DEBUG] /compare model_a={payload.model_a!r} measure_a={payload.measure_a!r} model_b={payload.model_b!r} measure_b={payload.measure_b!r} query={payload.query!r}"
    )
    results_a = _with_snippets(
        _search_variant(
            payload.model_a,
            payload.measure_a,
            payload.query,
            payload.top_k,
            payload.tf_mode_a,
            payload.p_a,
            payload.operator_a,
        ),
        payload.query,
    )
    results_b = _with_snippets(
        _search_variant(
            payload.model_b,
            payload.measure_b,
            payload.query,
            payload.top_k,
            payload.tf_mode_b,
            payload.p_b,
            payload.operator_b,
        ),
        payload.query,
    )
    return {
        "model_a": {"model": payload.model_a, "measure": payload.measure_a, "results": results_a},
        "model_b": {"model": payload.model_b, "measure": payload.measure_b, "results": results_b},
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
