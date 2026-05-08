from __future__ import annotations

from typing import Callable, Dict, List, Optional, Set


SearchRunner = Callable[[str], List[dict]]


class IREvaluator:
    """Evaluation layer for comparing retrieval models against relevance judgments."""

    def __init__(self, model_runners: Dict[str, SearchRunner], known_doc_ids: Optional[Set[str]] = None) -> None:
        self.model_runners = {self._normalize_model_name(name): runner for name, runner in model_runners.items()}
        self.known_doc_ids = known_doc_ids

    def evaluate(self, query: str, relevant_doc_ids: List[str], model: str = "vsm", top_k: int = 10) -> dict:
        model_name = self._normalize_model_name(model)
        if model_name not in self.model_runners:
            raise ValueError(f"Unknown evaluation model: {model}")

        relevant = self._validated_relevant_docs(relevant_doc_ids)
        results = self.model_runners[model_name](query)[:top_k]
        retrieved_doc_ids = [result["doc_id"] for result in results]
        metrics = self._metrics(retrieved_doc_ids, relevant)
        return {
            "query": query,
            "model": model_name,
            "top_k": top_k,
            "retrieved_doc_ids": retrieved_doc_ids,
            **metrics,
        }

    def evaluate_batch(
        self,
        ground_truth: Dict[str, List[str]],
        models: Optional[List[str]] = None,
        top_k: int = 10,
    ) -> dict:
        model_names = [self._normalize_model_name(model) for model in (models or list(self.model_runners.keys()))]
        for model_name in model_names:
            if model_name not in self.model_runners:
                raise ValueError(f"Unknown evaluation model: {model_name}")

        per_query = []
        totals = {
            model_name: {
                "precision": 0.0,
                "recall": 0.0,
                "f1": 0.0,
                "precision_at_1": 0.0,
                "precision_at_5": 0.0,
                "precision_at_10": 0.0,
                "average_precision": 0.0,
                "reciprocal_rank": 0.0,
            }
            for model_name in model_names
        }

        for query, relevant_doc_ids in ground_truth.items():
            relevant = self._validated_relevant_docs(relevant_doc_ids)
            row = {"query": query, "relevant_doc_ids": sorted(relevant)}
            for model_name in model_names:
                result = self.evaluate(query, relevant_doc_ids, model=model_name, top_k=top_k)
                row[model_name] = {
                    "precision": result["precision"],
                    "recall": result["recall"],
                    "f1": result["f1"],
                    "precision_at_1": result["precision_at_1"],
                    "precision_at_5": result["precision_at_5"],
                    "precision_at_10": result["precision_at_10"],
                    "average_precision": result["average_precision"],
                    "reciprocal_rank": result["reciprocal_rank"],
                    "tp": result["tp"],
                    "fp": result["fp"],
                    "fn": result["fn"],
                    "tn": result["tn"],
                    "retrieved_doc_ids": result["retrieved_doc_ids"],
                }
                for metric in totals[model_name]:
                    totals[model_name][metric] += result[metric]
            per_query.append(row)

        query_count = len(per_query)
        summary = {}
        for model_name, total in totals.items():
            average_precision = self._average(total["precision"], query_count)
            average_recall = self._average(total["recall"], query_count)
            average_f1 = self._average(total["f1"], query_count)
            mean_average_precision = self._average(total["average_precision"], query_count)
            mean_reciprocal_rank = self._average(total["reciprocal_rank"], query_count)
            weighted_score = (
                0.4 * average_f1
                + 0.3 * mean_average_precision
                + 0.2 * average_recall
                + 0.1 * average_precision
            )
            summary[model_name] = {
                "average_precision": average_precision,
                "average_recall": average_recall,
                "average_f1": average_f1,
                "precision_at_1": self._average(total["precision_at_1"], query_count),
                "precision_at_5": self._average(total["precision_at_5"], query_count),
                "precision_at_10": self._average(total["precision_at_10"], query_count),
                "map": mean_average_precision,
                "mrr": mean_reciprocal_rank,
                "weighted_score": round(weighted_score, 6),
            }

        ranking = sorted(
            ({"model": model_name, **metrics} for model_name, metrics in summary.items()),
            key=lambda item: item["weighted_score"],
            reverse=True,
        )

        return {"top_k": top_k, "models": model_names, "per_query": per_query, "summary": summary, "ranking": ranking}

    def _validated_relevant_docs(self, relevant_doc_ids: List[str]) -> Set[str]:
        relevant = set(relevant_doc_ids)
        if self.known_doc_ids is None:
            return relevant
        unknown_doc_ids = sorted(relevant - self.known_doc_ids)
        if unknown_doc_ids:
            raise ValueError(f"Unknown relevant document IDs: {', '.join(unknown_doc_ids)}")
        return relevant

    def _metrics(self, retrieved_doc_ids: List[str], relevant: Set[str]) -> dict:
        retrieved = set(retrieved_doc_ids)
        tp = len(retrieved & relevant)
        fp = len(retrieved - relevant)
        fn = len(relevant - retrieved)
        tn = max(len(self.known_doc_ids or set()) - tp - fp - fn, 0) if self.known_doc_ids is not None else 0
        precision = tp / (tp + fp) if tp + fp else 0
        recall = tp / (tp + fn) if tp + fn else 0
        f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0
        return {
            "precision": round(precision, 6),
            "recall": round(recall, 6),
            "f1": round(f1, 6),
            "precision_at_1": self._precision_at(retrieved_doc_ids, relevant, 1),
            "precision_at_5": self._precision_at(retrieved_doc_ids, relevant, 5),
            "precision_at_10": self._precision_at(retrieved_doc_ids, relevant, 10),
            "average_precision": self._average_precision(retrieved_doc_ids, relevant),
            "reciprocal_rank": self._reciprocal_rank(retrieved_doc_ids, relevant),
            "tp": tp,
            "fp": fp,
            "fn": fn,
            "tn": tn,
        }

    @staticmethod
    def _normalize_model_name(model: str) -> str:
        normalized = model.strip().lower()
        if normalized == "probabilistic":
            return "bir"
        if normalized == "fuzzy":
            return "zadeh"
        if normalized == "fuzzy_lukasiewicz":
            return "lukasiewicz"
        return normalized

    @staticmethod
    def _average(total: float, count: int) -> float:
        return round(total / count, 6) if count else 0

    @staticmethod
    def _precision_at(retrieved_doc_ids: List[str], relevant: Set[str], cutoff: int) -> float:
        if cutoff <= 0:
            return 0
        top_docs = retrieved_doc_ids[:cutoff]
        hits = sum(1 for doc_id in top_docs if doc_id in relevant)
        return round(hits / cutoff, 6)

    @staticmethod
    def _average_precision(retrieved_doc_ids: List[str], relevant: Set[str]) -> float:
        if not relevant:
            return 0
        hits = 0
        precision_sum = 0.0
        for rank, doc_id in enumerate(retrieved_doc_ids, start=1):
            if doc_id in relevant:
                hits += 1
                precision_sum += hits / rank
        return round(precision_sum / len(relevant), 6)

    @staticmethod
    def _reciprocal_rank(retrieved_doc_ids: List[str], relevant: Set[str]) -> float:
        for rank, doc_id in enumerate(retrieved_doc_ids, start=1):
            if doc_id in relevant:
                return round(1 / rank, 6)
        return 0
