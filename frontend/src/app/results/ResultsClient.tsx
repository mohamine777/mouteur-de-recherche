"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import LogicalOperatorSelector from "@/components/LogicalOperatorSelector";
import MeasureSelector from "@/components/MeasureSelector";
import ModelSelector from "@/components/ModelSelector";
import PValueSlider from "@/components/PValueSlider";
import ResultCard from "@/components/ResultCard";
import ResultsPanel from "@/components/ResultsPanel";
import SearchBar from "@/components/SearchBar";
import { searchDocuments, type LogicalOperator, type SearchModel, type SearchResult, type VsmMeasure } from "@/lib/api";

type ComparisonMetrics = {
  precision: number;
  recall: number;
  f1: number;
  map: number;
  ndcg: number;
  aggregate: number;
};

type ComparisonState = {
  a: ComparisonMetrics;
  b: ComparisonMetrics;
  winner: "a" | "b" | null;
};

function normalizeModel(value: string | null, fallback: SearchModel): SearchModel {
  switch (value) {
    case "fuzzy":
    case "zadeh":
      return "fuzzy";
    case "bir":
    case "probabilistic":
      return "probabilistic";
    case "boolean":
    case "vsm":
    case "extended_boolean":
    case "lukasiewicz":
      return value;
    default:
      return fallback;
  }
}

function normalizeMeasure(value: string | null, fallback: VsmMeasure): VsmMeasure {
  switch (value) {
    case "cosine":
    case "product":
    case "euclidean":
    case "dice":
    case "jaccard":
    case "overlap":
      return value;
    default:
      return fallback;
  }
}

function normalizeOperator(value: string | null, fallback: LogicalOperator): LogicalOperator {
  return value === "and" || value === "or" || value === "not" ? value : fallback;
}

function parseNumber(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function supportsMeasure(model: SearchModel) {
  return model === "vsm";
}

function supportsLogicalOperator(model: SearchModel) {
  return ["boolean", "fuzzy", "lukasiewicz"].includes(model);
}

function supportsPNorm(model: SearchModel) {
  return model === "extended_boolean";
}

function getModelLabel(model: SearchModel) {
  switch (model) {
    case "boolean":
      return "Boolean";
    case "vsm":
      return "VSM";
    case "extended_boolean":
      return "Extended Boolean";
    case "fuzzy":
      return "Fuzzy";
    case "lukasiewicz":
      return "Lukasiewicz";
    case "probabilistic":
      return "BIR";
    default:
      return model;
  }
}

function zeroMetrics(): ComparisonMetrics {
  return { precision: 0, recall: 0, f1: 0, map: 0, ndcg: 0, aggregate: 0 };
}

function evaluateComparison(primary: SearchResult[], secondary: SearchResult[]): ComparisonMetrics {
  if (primary.length === 0 || secondary.length === 0) {
    return zeroMetrics();
  }

  const relevantDocs = new Set(secondary.map((result) => result.doc_id));
  const idealDiscount = secondary.reduce((sum, _result, index) => sum + 1 / Math.log2(index + 2), 0) || 1;

  let weightedRelevant = 0;
  let weightedTotal = 0;
  let hits = 0;
  let averagePrecision = 0;
  let dcg = 0;

  primary.forEach((result, index) => {
    const discount = 1 / Math.log2(index + 2);
    weightedTotal += discount;
    if (relevantDocs.has(result.doc_id)) {
      hits += 1;
      weightedRelevant += discount;
      averagePrecision += hits / (index + 1);
      dcg += discount;
    }
  });

  const precision = weightedRelevant / weightedTotal;
  const recall = weightedRelevant / idealDiscount;
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  const map = relevantDocs.size === 0 ? 0 : averagePrecision / relevantDocs.size;
  const ndcg = dcg / idealDiscount;
  const aggregate = (precision + recall + f1 + map + ndcg) / 5;

  return { precision, recall, f1, map, ndcg, aggregate };
}

export default function ResultsClient() {
  const params = useSearchParams();
  const compareMode = params.get("mode") === "compare";
  const [query, setQuery] = useState(params.get("q") || "");
  const [model, setModel] = useState<SearchModel>(normalizeModel(params.get("model"), "vsm"));
  const [measure, setMeasure] = useState<VsmMeasure>(normalizeMeasure(params.get("measure"), "cosine"));
  const [operator, setOperator] = useState<LogicalOperator>(normalizeOperator(params.get("operator"), "or"));
  const [p, setP] = useState(parseNumber(params.get("p"), 2));
  const [results, setResults] = useState<SearchResult[]>([]);
  const [comparedResults, setComparedResults] = useState<{ a: SearchResult[]; b: SearchResult[] }>({ a: [], b: [] });
  const [comparison, setComparison] = useState<ComparisonState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const compareA = {
    query: params.get("queryA") || "",
    model: normalizeModel(params.get("modelA"), "vsm"),
    measure: normalizeMeasure(params.get("measureA"), "cosine"),
    operator: normalizeOperator(params.get("operatorA"), "or"),
    p: parseNumber(params.get("pA"), 2),
  };
  const compareB = {
    query: params.get("queryB") || "",
    model: normalizeModel(params.get("modelB"), "probabilistic"),
    measure: normalizeMeasure(params.get("measureB"), "cosine"),
    operator: normalizeOperator(params.get("operatorB"), "or"),
    p: parseNumber(params.get("pB"), 2),
  };
  const showVsmOperator = supportsMeasure(model);
  const showLogicalOperator = supportsLogicalOperator(model);
  const showPNormOperator = supportsPNorm(model);

  const runSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      setResults(await searchDocuments({ query, model, measure, operator, p, top_k: 20 }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  };

  const runCompare = async () => {
    if (!compareA.query.trim() || !compareB.query.trim()) {
      setError("Both queries are required in compare mode.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [resultsA, resultsB] = await Promise.all([
        searchDocuments({ query: compareA.query, model: compareA.model, measure: compareA.measure, operator: compareA.operator, p: compareA.p, top_k: 20 }),
        searchDocuments({ query: compareB.query, model: compareB.model, measure: compareB.measure, operator: compareB.operator, p: compareB.p, top_k: 20 }),
      ]);
      const metricsA = evaluateComparison(resultsA, resultsB);
      const metricsB = evaluateComparison(resultsB, resultsA);
      const winner = metricsA.aggregate === metricsB.aggregate ? null : metricsA.aggregate > metricsB.aggregate ? "a" : "b";
      setComparedResults({ a: resultsA, b: resultsB });
      setComparison({ a: metricsA, b: metricsB, winner });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Compare failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void (compareMode ? runCompare() : runSearch());
  }, []);

  if (compareMode) {
    const bestLabel = comparison?.winner === "a" ? `Model A (${getModelLabel(compareA.model)})` : comparison?.winner === "b" ? `Model B (${getModelLabel(compareB.model)})` : "No clear winner";

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4 rounded-2xl bg-[linear-gradient(135deg,rgba(11,18,32,0.96),rgba(17,24,39,0.9))] px-6 py-5 shadow-[0_22px_70px_rgba(0,0,0,0.28)]">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#d4af37]">Compare Mode</p>
            <h1 className="mt-1 text-3xl font-black text-[#f9fafb]">Split screen comparison</h1>
          </div>
          <Link href="/" className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-[#cbd5e1] transition hover:border-[#d4af37] hover:text-white">
            New comparison
          </Link>
        </div>

        {loading && <p className="rounded-xl border border-[rgba(212,175,55,0.2)] bg-[#111827] p-4 text-sm font-semibold text-[#cbd5e1]">Comparing models...</p>}
        {error && <p className="rounded-xl border border-red-400/20 bg-red-950/30 p-4 text-sm text-red-200">{error}</p>}

        {!loading && !error && (
          <>
            <section className="grid gap-4 lg:grid-cols-2">
              <ResultsPanel
                title={`Model A · ${getModelLabel(compareA.model)}`}
                subtitle={compareA.query}
                query={compareA.query}
                results={comparedResults.a}
                highlight={comparison?.winner === "a"}
              />
              <ResultsPanel
                title={`Model B · ${getModelLabel(compareB.model)}`}
                subtitle={compareB.query}
                query={compareB.query}
                results={comparedResults.b}
                highlight={comparison?.winner === "b"}
              />
            </section>

            <section className="rounded-xl border border-[rgba(212,175,55,0.18)] bg-[#111827] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.28)]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#d4af37]">Metrics comparison</p>
                  <h2 className="mt-1 text-2xl font-black text-[#f9fafb]">Precision, recall, F1, MAP, NDCG</h2>
                </div>
                <div className="rounded-full border border-[#d4af37] bg-[#d4af37] px-4 py-2 text-sm font-semibold text-[#0b1220] shadow-[0_0_18px_rgba(212,175,55,0.24)]">
                  Best model: {bestLabel}
                </div>
              </div>

              {comparison && (
                <div className="mt-5 grid gap-4 lg:grid-cols-2">
                  <ComparisonCard
                    title={`Model A · ${getModelLabel(compareA.model)}`}
                    metrics={comparison.a}
                    highlight={comparison.winner === "a"}
                  />
                  <ComparisonCard
                    title={`Model B · ${getModelLabel(compareB.model)}`}
                    metrics={comparison.b}
                    highlight={comparison.winner === "b"}
                  />
                </div>
              )}
            </section>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#d4af37]">Resultats</p>
          <h1 className="mt-1 text-3xl font-black text-[#f9fafb]">Recherche et RSV</h1>
        </div>
        <Link href="/" className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-[#cbd5e1] transition hover:border-[#d4af37] hover:text-white">
          Nouvelle recherche
        </Link>
      </div>

      <section className="grid gap-4 rounded-2xl border border-[rgba(212,175,55,0.18)] bg-[#111827] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.28)] md:grid-cols-2">
        <div className="md:col-span-2">
          <SearchBar query={query} setQuery={setQuery} onSearch={runSearch} />
        </div>
        <ModelSelector model={model} onChange={setModel} />
        {showVsmOperator && <MeasureSelector measure={measure} onChange={setMeasure} />}
        {showLogicalOperator && (
          <LogicalOperatorSelector operator={operator} onChange={setOperator} />
        )}
        {showPNormOperator && <PValueSlider value={p} onChange={setP} />}
      </section>

      {loading && <p className="rounded-xl border border-[rgba(212,175,55,0.2)] bg-[#111827] p-4 text-sm font-semibold text-[#cbd5e1]">Recherche en cours...</p>}
      {error && <p className="rounded-xl border border-red-400/20 bg-red-950/30 p-4 text-sm text-red-200">{error}</p>}
      {!loading && !error && (
        <p className="text-sm text-[#cbd5e1]">
          {results.length} document(s) retournes avec le modele {model}
          {showVsmOperator ? ` / ${measure}` : ""}
          {showLogicalOperator ? ` / ${operator.toUpperCase()}` : ""}
          {showPNormOperator ? ` / p=${p >= 999 ? "infini" : p}` : ""}.
        </p>
      )}

      <section className="space-y-4">
        {results.map((result) => <ResultCard key={result.doc_id} result={result} />)}
      </section>
    </div>
  );
}

function ComparisonCard({
  title,
  metrics,
  highlight,
}: {
  title: string;
  metrics: ComparisonMetrics;
  highlight: boolean;
}) {
  return (
    <section
      className={
        highlight
          ? "rounded-xl border border-[rgba(212,175,55,0.3)] border-t-4 border-t-[#d4af37] bg-[#0b1220] p-5 shadow-[0_18px_48px_rgba(0,0,0,0.28)]"
          : "rounded-xl border border-white/8 border-t-4 border-t-[#d4af37]/70 bg-[#0b1220] p-5 shadow-[0_18px_48px_rgba(0,0,0,0.24)]"
      }
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-lg font-bold text-[#f9fafb]">{title}</h3>
        {highlight && <span className="rounded-full border border-[#d4af37] bg-[#d4af37] px-3 py-1 text-xs font-semibold text-[#0b1220]">Best</span>}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Metric label="precision" value={metrics.precision} />
        <Metric label="recall" value={metrics.recall} />
        <Metric label="f1" value={metrics.f1} />
        <Metric label="MAP" value={metrics.map} />
        <Metric label="NDCG" value={metrics.ndcg} />
        <Metric label="score" value={metrics.aggregate} />
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-white/8 bg-[#111827] px-4 py-4">
      <p className="text-sm font-medium uppercase tracking-[0.12em] text-[#cbd5e1]">{label}</p>
      <p className="mt-2 text-xl font-bold text-[#f9fafb]">{value.toFixed(3)}</p>
    </div>
  );
}
