from __future__ import annotations

import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Sequence, Set


@dataclass
class FeedbackEntry:
    query: str
    doc_id: str
    relevant: bool


class Evaluator:
    """Evaluate ranked retrieval results against ground truth or user feedback."""

    def __init__(self):
        self.feedback: List[FeedbackEntry] = []
        self.ground_truth: Dict[str, List[str]] = {}

    def add_feedback(self, query: str, doc_id: str, relevant: bool):
        self.feedback.append(
            FeedbackEntry(query=self._normalize_query(query), doc_id=str(doc_id), relevant=relevant)
        )

    def load_ground_truth(self, ground_truth: Dict[str, Iterable[str]]):
        self.ground_truth = {
            self._normalize_query(query): [str(doc_id) for doc_id in docs]
            for query, docs in ground_truth.items()
        }

    def load_ground_truth_from_file(self, file_path: Path):
        payload = json.loads(file_path.read_text(encoding="utf-8"))
        if not isinstance(payload, dict):
            raise ValueError("Ground truth JSON must be an object mapping queries to relevant documents.")
        self.load_ground_truth(payload)

    def has_ground_truth(self) -> bool:
        return bool(self.ground_truth)

    def available_queries(self) -> List[str]:
        queries = set(self.ground_truth.keys())
        queries.update(entry.query for entry in self.feedback)
        return sorted(queries)

    def relevant_documents_for_query(self, query: str) -> Set[str]:
        normalized_query = self._normalize_query(query)
        if normalized_query in self.ground_truth and self.ground_truth[normalized_query]:
            return set(self.ground_truth[normalized_query])

        return {
            entry.doc_id
            for entry in self.feedback
            if entry.query == normalized_query and entry.relevant
        }

    def evaluation_source_for_query(self, query: str) -> str:
        normalized_query = self._normalize_query(query)
        if normalized_query in self.ground_truth and self.ground_truth[normalized_query]:
            return "ground_truth"
        if any(entry.query == normalized_query for entry in self.feedback):
            return "feedback"
        return "none"

    def evaluate_ranked_results(
        self,
        query: str,
        retrieved_doc_ids: Sequence[str],
        k: int = 5,
    ) -> Dict[str, float]:
        relevant_docs = self.relevant_documents_for_query(query)
        return self._evaluate_ranked_lists(
            query=query,
            retrieved_doc_ids=retrieved_doc_ids,
            relevant_docs=relevant_docs,
            k=k,
        )

    def evaluate_model_results(
        self,
        query: str,
        model_name: str,
        retrieved_doc_ids: Sequence[str],
        k: int = 5,
    ) -> Dict[str, float]:
        report = self.evaluate_ranked_results(query=query, retrieved_doc_ids=retrieved_doc_ids, k=k)
        report["model"] = model_name
        return report

    def metrics(self, model_name: str = "vsm", k: int = 5, query_to_ranked_doc_ids: Dict[str, Sequence[str]] | None = None) -> Dict[str, float]:
        if not query_to_ranked_doc_ids:
            return {
                **self._empty_report(),
                "feedback_count": len(self.feedback),
                "ground_truth_queries": len(self.ground_truth),
                "source": "ground_truth" if self.has_ground_truth() else "feedback",
                "model": model_name,
                "k": k,
            }

        reports = [
            self.evaluate_model_results(query=query, model_name=model_name, retrieved_doc_ids=ranked_doc_ids, k=k)
            for query, ranked_doc_ids in query_to_ranked_doc_ids.items()
            if self.relevant_documents_for_query(query)
        ]
        aggregated = self.aggregate_reports(reports)
        aggregated.update(
            {
                "feedback_count": len(self.feedback),
                "ground_truth_queries": len(self.ground_truth),
                "source": "ground_truth" if self.has_ground_truth() else "feedback",
                "model": model_name,
                "k": k,
            }
        )
        return aggregated

    def aggregate_reports(self, reports: Sequence[Dict[str, float]]) -> Dict[str, float]:
        if not reports:
            return self._empty_report()

        metric_keys = ["precision_at_k", "recall_at_k", "f1", "map", "dcg", "ndcg", "tp", "fp", "fn"]
        totals = {key: 0.0 for key in metric_keys}
        for report in reports:
            for key in metric_keys:
                totals[key] += float(report.get(key, 0.0))

        count = float(len(reports))
        averaged = {key: round(value / count, 4) for key, value in totals.items()}
        averaged["queries_evaluated"] = len(reports)
        return averaged

    def evaluate_model_over_queries(
        self,
        model_name: str,
        query_to_ranked_doc_ids: Dict[str, Sequence[str]],
        k: int = 5,
    ) -> Dict[str, float]:
        reports = []
        for query, ranked_doc_ids in query_to_ranked_doc_ids.items():
            if self.relevant_documents_for_query(query):
                reports.append(
                    self.evaluate_model_results(
                        query=query,
                        model_name=model_name,
                        retrieved_doc_ids=ranked_doc_ids,
                        k=k,
                    )
                )
        return self.aggregate_reports(reports)

    def determine_best_model(
        self,
        vsm_summary: Dict[str, float],
        ebm_summary: Dict[str, float],
        vsm_avg_score: float = 0.0,
        ebm_avg_score: float = 0.0,
        vsm_relevant_retrieved: int = 0,
        ebm_relevant_retrieved: int = 0,
    ) -> Dict[str, str]:
        vsm_metrics = self._comparison_metrics(vsm_summary)
        ebm_metrics = self._comparison_metrics(ebm_summary)
        metric_labels = {0: "MAP", 1: "nDCG", 2: "F1", 3: "Precision@K"}

        if vsm_metrics == (0.0, 0.0, 0.0, 0.0) and ebm_metrics == (0.0, 0.0, 0.0, 0.0):
            print("[COMPARE PATH] winner=Tie by=no_relevance_data")
            return {
                "best_model": "Tie",
                "reason": "Aucune donnée pertinente disponible pour cette requête. Veuillez marquer des documents comme pertinents.",
            }

        comparison_order = (
            ("map", 0),
            ("ndcg", 1),
            ("f1", 2),
            ("precision_at_k", 3),
        )
        for metric_name, metric_index in comparison_order:
            if vsm_metrics[metric_index] > ebm_metrics[metric_index]:
                print(f"[COMPARE PATH] winner=vsm by={metric_name}")
                return {
                    "best_model": "vsm",
                    "reason": f"Score {metric_labels[metric_index]} plus élevé",
                }
            if ebm_metrics[metric_index] > vsm_metrics[metric_index]:
                print(f"[COMPARE PATH] winner=ebm by={metric_name}")
                return {
                    "best_model": "ebm",
                    "reason": f"Score {metric_labels[metric_index]} plus élevé",
                }

        if vsm_avg_score > ebm_avg_score:
            print("[COMPARE PATH] winner=vsm by=average_relevance_score")
            return {
                "best_model": "vsm",
                "reason": "Métriques égales, score moyen de pertinence plus élevé",
            }
        if ebm_avg_score > vsm_avg_score:
            print("[COMPARE PATH] winner=ebm by=average_relevance_score")
            return {
                "best_model": "ebm",
                "reason": "Métriques égales, score moyen de pertinence plus élevé",
            }

        if vsm_relevant_retrieved > ebm_relevant_retrieved:
            print("[COMPARE PATH] winner=vsm by=retrieved_relevant_docs")
            return {
                "best_model": "vsm",
                "reason": "Métriques égales, plus grand nombre de documents pertinents retrouvés",
            }
        if ebm_relevant_retrieved > vsm_relevant_retrieved:
            print("[COMPARE PATH] winner=ebm by=retrieved_relevant_docs")
            return {
                "best_model": "ebm",
                "reason": "Métriques égales, plus grand nombre de documents pertinents retrouvés",
            }

        print("[COMPARE PATH] winner=Tie by=full_tie")
        return {
            "best_model": "Tie",
            "reason": "Les deux modèles sont strictement équivalents selon tous les critères d’évaluation.",
        }

    def _evaluate_ranked_lists(
        self,
        query: str,
        retrieved_doc_ids: Sequence[str],
        relevant_docs: Set[str],
        k: int,
    ) -> Dict[str, float]:
        normalized_query = self._normalize_query(query)
        requested_k = max(k, 0)
        top_k = list(retrieved_doc_ids[:requested_k])
        relevant_at_k = [doc_id for doc_id in top_k if doc_id in relevant_docs]

        # Precision@k: how many of the top-k retrieved documents are relevant.
        precision_at_k = len(relevant_at_k) / requested_k if requested_k > 0 else 0.0

        # Recall@k: how many relevant documents were recovered in the top-k.
        recall_at_k = len(relevant_at_k) / len(relevant_docs) if relevant_docs else 0.0

        # F1-score: harmonic mean of precision@k and recall@k.
        f1 = (
            2 * precision_at_k * recall_at_k / (precision_at_k + recall_at_k)
            if (precision_at_k + recall_at_k) > 0
            else 0.0
        )

        # TP/FP/FN: classic classification counts computed at rank k.
        retrieved_set = set(top_k)
        tp = len(retrieved_set & relevant_docs)
        fp = len(retrieved_set - relevant_docs)
        fn = len(relevant_docs - retrieved_set)

        # MAP: mean of precision values at each rank where a relevant document appears.
        average_precision = self._average_precision(top_k, relevant_docs, requested_k)

        # DCG: discounted cumulative gain rewards relevant documents earlier in the ranking.
        dcg = self._dcg(top_k, relevant_docs)

        # nDCG: DCG normalized by the best possible ranking for this query.
        ndcg = self._ndcg(top_k, relevant_docs, requested_k)

        # Temporary evaluation trace to validate alignment across all metrics.
        print(
            "[EVAL DEBUG]",
            {
                "query": normalized_query,
                "k": requested_k,
                "retrieved_docs": top_k,
                "relevant_docs": sorted(relevant_docs),
                "tp": tp,
                "fp": fp,
                "fn": fn,
                "precision_at_k": round(precision_at_k, 4),
                "recall_at_k": round(recall_at_k, 4),
                "f1": round(f1, 4),
                "ap_at_k": round(average_precision, 4),
                "ndcg_at_k": round(ndcg, 4),
            },
        )

        return {
            "query": normalized_query,
            "k": requested_k,
            "source": self.evaluation_source_for_query(normalized_query),
            "relevant_documents": len(relevant_docs),
            "retrieved_documents": len(top_k),
            "tp": tp,
            "fp": fp,
            "fn": fn,
            "precision_at_k": round(precision_at_k, 4),
            "recall_at_k": round(recall_at_k, 4),
            "f1": round(f1, 4),
            "map": round(average_precision, 4),
            "dcg": round(dcg, 4),
            "ndcg": round(ndcg, 4),
        }

    def _average_precision(self, ranked_doc_ids: Sequence[str], relevant_docs: Set[str], k: int) -> float:
        if not relevant_docs:
            return 0.0

        cutoff = max(k, 0)
        truncated = list(ranked_doc_ids[:cutoff])
        hits = 0
        precision_sum = 0.0
        for rank, doc_id in enumerate(truncated, start=1):
            if doc_id in relevant_docs:
                hits += 1
                precision_sum += hits / rank

        normalizer = min(len(relevant_docs), cutoff)
        return precision_sum / normalizer if normalizer > 0 else 0.0

    def _dcg(self, ranked_doc_ids: Sequence[str], relevant_docs: Set[str]) -> float:
        score = 0.0
        for rank, doc_id in enumerate(ranked_doc_ids, start=1):
            relevance = 1.0 if doc_id in relevant_docs else 0.0
            if rank == 1:
                score += relevance
            else:
                score += relevance / math.log2(rank + 1)
        return score

    def _ndcg(self, ranked_doc_ids: Sequence[str], relevant_docs: Set[str], k: int) -> float:
        cutoff = max(k, 0)
        truncated = list(ranked_doc_ids[:cutoff])
        actual_dcg = self._dcg(truncated, relevant_docs)
        ideal_ranking = list(relevant_docs)[: len(truncated)]
        ideal_dcg = self._dcg(ideal_ranking, relevant_docs)
        return actual_dcg / ideal_dcg if ideal_dcg > 0 else 0.0

    def _comparison_metrics(self, report: Dict[str, float]) -> tuple[float, float, float, float]:
        return (
            float(report.get("map", 0.0)),
            float(report.get("ndcg", 0.0)),
            float(report.get("f1", 0.0)),
            float(report.get("precision_at_k", 0.0)),
        )

    def _normalize_query(self, query: str) -> str:
        return " ".join(query.strip().lower().split())

    def _empty_report(self) -> Dict[str, float]:
        return {
            "precision_at_k": 0.0,
            "recall_at_k": 0.0,
            "f1": 0.0,
            "map": 0.0,
            "dcg": 0.0,
            "ndcg": 0.0,
            "tp": 0.0,
            "fp": 0.0,
            "fn": 0.0,
            "queries_evaluated": 0,
        }
