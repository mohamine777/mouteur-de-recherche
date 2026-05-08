"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import jsPDF from "jspdf";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { evaluateModels, fetchDocuments, type DocumentRecord, type EvaluationModel, type EvaluationResponse } from "@/lib/api";

const MODELS: EvaluationModel[] = ["boolean", "extended_boolean", "vsm", "bir", "zadeh", "lukasiewicz"];
const MODEL_LABELS: Record<string, string> = {
  boolean: "Boolean",
  extended_boolean: "Extended Boolean",
  vsm: "VSM",
  bir: "BIR",
  probabilistic: "BIR",
  fuzzy: "Zadeh",
  zadeh: "Zadeh",
  lukasiewicz: "Lukasiewicz",
  fuzzy_lukasiewicz: "Lukasiewicz",
};
const METRICS = [
  { key: "average_precision", label: "Precision" },
  { key: "average_recall", label: "Recall" },
  { key: "average_f1", label: "F1" },
  { key: "map", label: "MAP" },
  { key: "precision_at_10", label: "P@10" },
] as const;
const COLORS = ["#38bdf8", "#f59e0b", "#34d399", "#f472b6", "#a78bfa", "#f87171"];
const BEST_COLOR = "#facc15";

type TabKey = "metrics" | "charts" | "ranking" | "analysis";
type Judgment = { id: number; query: string; docIds: string[] };

export default function EvaluationPage() {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [judgments, setJudgments] = useState<Judgment[]>([{ id: 1, query: "information retrieval", docIds: [] }]);
  const [topK, setTopK] = useState(10);
  const [activeTab, setActiveTab] = useState<TabKey>("metrics");
  const [result, setResult] = useState<EvaluationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const chartRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void fetchDocuments()
      .then((docs: DocumentRecord[]) => {
        setDocuments(docs);
        setJudgments([{ id: 1, query: "information retrieval", docIds: docs.slice(0, 1).map((document) => document.doc_id) }]);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Documents loading failed"));
  }, []);

  const chartRows = useMemo(() => {
    if (!result) return [];
    return MODELS.map((model, index) => ({
      model,
      label: MODEL_LABELS[model],
      color: COLORS[index],
      precision: result.summary[model]?.average_precision ?? 0,
      recall: result.summary[model]?.average_recall ?? 0,
      f1: result.summary[model]?.average_f1 ?? 0,
      map: result.summary[model]?.map ?? 0,
      p10: result.summary[model]?.precision_at_10 ?? 0,
      score: result.summary[model]?.weighted_score ?? 0,
    }));
  }, [result]);

  const bestCards = useMemo(() => {
    if (!result) return [];
    return [
      bestFor(result, "average_precision", "Best Precision model"),
      bestFor(result, "average_recall", "Best Recall model"),
      bestFor(result, "average_f1", "Best F1 model"),
      bestFor(result, "map", "Best MAP model"),
      bestFor(result, "weighted_score", "Best Overall model"),
    ];
  }, [result]);

  const runEvaluation = async () => {
    const groundTruth = Object.fromEntries(
      judgments
        .map((item) => [item.query.trim(), item.docIds] as const)
        .filter(([query, docIds]) => query && docIds.length > 0),
    );
    if (Object.keys(groundTruth).length === 0) {
      setError("At least one query with relevant documents is required");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await evaluateModels({
        ground_truth: groundTruth,
        models: MODELS,
        top_k: topK,
      });
      setResult(response);
      setActiveTab("metrics");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Evaluation failed");
    } finally {
      setLoading(false);
    }
  };

  const updateJudgment = (id: number, patch: Partial<Judgment>) => {
    setJudgments((items) => items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const exportPng = async () => {
    const svg = chartRef.current?.querySelector("svg");
    if (!svg) return;
    const image = await svgToPng(svg);
    downloadDataUrl(image, "evaluation-chart.png");
  };

  const exportPdf = () => {
    if (!result) return;
    const pdf = new jsPDF();
    const best = result.ranking[0];
    pdf.setFontSize(16);
    pdf.text("Information Retrieval Evaluation Report", 14, 18);
    pdf.setFontSize(11);
    pdf.text(`Queries: ${result.per_query.length} | Top K: ${result.top_k}`, 14, 30);
    pdf.text(`Best model: ${MODEL_LABELS[best.model]} | Overall score: ${formatMetric(best.weighted_score)}`, 14, 38);
    let y = 52;
    result.ranking.forEach((row, index) => {
      pdf.text(
        `${index + 1}. ${MODEL_LABELS[row.model]}  F1 ${formatMetric(row.average_f1)}  MAP ${formatMetric(row.map)}  Recall ${formatMetric(row.average_recall)}  Precision ${formatMetric(row.average_precision)}`,
        14,
        y,
      );
      y += 8;
    });
    y += 4;
    pdf.text("Observations", 14, y);
    y += 8;
    result.query_analysis.slice(0, 8).forEach((item) => {
      pdf.text(`${item.query}: ${item.difficulty} difficulty, ${item.matched_documents} matched docs, recommended ${MODEL_LABELS[item.recommended_model]}`, 14, y);
      y += 8;
    });
    pdf.save("evaluation-report.pdf");
  };

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-white/10 bg-[#111827] p-6 shadow-2xl shadow-black/20">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#d4af37]">IR Analytics Platform</p>
            <h1 className="mt-2 text-3xl font-black text-[#f9fafb]">Evaluation Dashboard</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#cbd5e1]">
              Compare Boolean, Extended Boolean, VSM, BIR, Zadeh, and Lukasiewicz retrieval against shared relevance judgments.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <label className="w-28">
              <span className="mb-2 block text-sm font-semibold text-[#cbd5e1]">Top K</span>
              <input
                type="number"
                min={1}
                max={100}
                value={topK}
                onChange={(event) => setTopK(Math.max(1, Number(event.target.value) || 1))}
                className="h-11 w-full rounded-lg border border-white/10 bg-[#0b1220] px-3 text-sm font-medium text-[#f9fafb] outline-none ring-[#d4af37]/20 transition focus:border-[#d4af37] focus:ring-4"
              />
            </label>
            <button
              type="button"
              onClick={runEvaluation}
              disabled={loading}
              className="mt-7 h-11 rounded-lg bg-[#d4af37] px-5 text-sm font-black text-[#0b1220] shadow-[0_12px_30px_rgba(212,175,55,0.22)] transition hover:bg-[#f0d26a] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Running..." : "Run Evaluation"}
            </button>
            <button
              type="button"
              onClick={exportPdf}
              disabled={!result}
              className="mt-7 h-11 rounded-lg border border-white/10 bg-white/5 px-5 text-sm font-black text-[#f9fafb] transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Export Evaluation Report
            </button>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          {judgments.map((item, index) => (
            <div key={item.id} className="grid gap-4 rounded-lg border border-white/10 bg-[#0b1220] p-4 lg:grid-cols-[1fr_1.4fr_auto] lg:items-end">
              <label>
                <span className="mb-2 block text-sm font-semibold text-[#cbd5e1]">Query {index + 1}</span>
                <input
                  value={item.query}
                  onChange={(event) => updateJudgment(item.id, { query: event.target.value })}
                  className="h-11 w-full rounded-lg border border-white/10 bg-[#111827] px-4 text-sm font-medium text-[#f9fafb] outline-none ring-[#d4af37]/20 transition focus:border-[#d4af37] focus:ring-4"
                />
              </label>
              <label>
                <span className="mb-2 block text-sm font-semibold text-[#cbd5e1]">Relevant Documents</span>
                <select
                  multiple
                  value={item.docIds}
                  onChange={(event) => updateJudgment(item.id, { docIds: Array.from(event.target.selectedOptions, (option) => option.value) })}
                  className="min-h-28 w-full rounded-lg border border-white/10 bg-[#111827] px-3 py-3 text-sm font-medium text-[#f9fafb] outline-none ring-[#d4af37]/20 transition focus:border-[#d4af37] focus:ring-4"
                >
                  {documents.map((document) => (
                    <option key={document.doc_id} value={document.doc_id}>
                      {document.title || document.doc_id} - {document.doc_id}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => setJudgments((items) => items.filter((entry) => entry.id !== item.id))}
                disabled={judgments.length === 1}
                className="h-11 rounded-lg border border-white/10 bg-white/5 px-4 text-sm font-bold text-[#cbd5e1] transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setJudgments((items) => [...items, { id: Date.now(), query: "", docIds: [] }])}
            className="rounded-lg border border-dashed border-white/20 px-4 py-2 text-sm font-bold text-[#cbd5e1] transition hover:bg-white/5"
          >
            Add Query
          </button>
        </div>

        {error ? <p className="mt-4 rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-200">{error}</p> : null}
      </section>

      <section className="grid gap-4 md:grid-cols-5">
        {bestCards.length ? bestCards.map((card) => <BestCard key={card.label} {...card} />) : <EmptyCards />}
      </section>

      <div className="flex flex-wrap gap-2 rounded-lg border border-white/10 bg-[#111827] p-2">
        {(["metrics", "charts", "ranking", "analysis"] as TabKey[]).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`rounded-lg px-4 py-2 text-sm font-black capitalize transition ${activeTab === tab ? "bg-[#d4af37] text-[#0b1220]" : "text-[#cbd5e1] hover:bg-white/5"}`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === "metrics" ? <MetricsTab result={result} /> : null}
      {activeTab === "charts" ? <ChartsTab rows={chartRows} chartRef={chartRef} onExportPng={exportPng} /> : null}
      {activeTab === "ranking" ? <RankingTab result={result} /> : null}
      {activeTab === "analysis" ? <AnalysisTab result={result} /> : null}
    </div>
  );
}

function MetricsTab({ result }: { result: EvaluationResponse | null }) {
  return (
    <section className="rounded-lg border border-white/10 bg-[#111827] p-6 shadow-2xl shadow-black/20">
      <h2 className="text-xl font-black text-[#f9fafb]">Per Query Metrics</h2>
      <div className="mt-4 overflow-auto rounded-lg border border-white/10">
        <table className="w-full min-w-[980px] border-collapse text-left text-sm">
          <thead className="bg-white/5 text-[#cbd5e1]">
            <tr>
              <th className="px-4 py-3">Query</th>
              <th className="px-4 py-3">Model</th>
              <th className="px-4 py-3">Precision</th>
              <th className="px-4 py-3">Recall</th>
              <th className="px-4 py-3">F1</th>
              <th className="px-4 py-3">P@1</th>
              <th className="px-4 py-3">P@5</th>
              <th className="px-4 py-3">P@10</th>
              <th className="px-4 py-3">AP</th>
              <th className="px-4 py-3">MRR</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {!result ? (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-[#94a3b8]">No evaluation results</td>
              </tr>
            ) : (
              result.per_query.flatMap((queryRow) =>
                MODELS.map((model) => {
                  const metrics = queryRow[model];
                  return (
                    <tr key={`${queryRow.query}-${model}`} className="text-[#f9fafb]">
                      <td className="px-4 py-3 text-[#cbd5e1]">{queryRow.query}</td>
                      <td className="px-4 py-3 font-black">{MODEL_LABELS[model]}</td>
                      <td className="px-4 py-3">{formatMetric(metrics?.precision)}</td>
                      <td className="px-4 py-3">{formatMetric(metrics?.recall)}</td>
                      <td className="px-4 py-3">{formatMetric(metrics?.f1)}</td>
                      <td className="px-4 py-3">{formatMetric(metrics?.precision_at_1)}</td>
                      <td className="px-4 py-3">{formatMetric(metrics?.precision_at_5)}</td>
                      <td className="px-4 py-3">{formatMetric(metrics?.precision_at_10)}</td>
                      <td className="px-4 py-3">{formatMetric(metrics?.average_precision)}</td>
                      <td className="px-4 py-3">{formatMetric(metrics?.reciprocal_rank)}</td>
                    </tr>
                  );
                }),
              )
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ChartsTab({ rows, chartRef, onExportPng }: { rows: any[]; chartRef: RefObject<HTMLDivElement>; onExportPng: () => void }) {
  return (
    <section className="space-y-4">
      <div className="flex justify-end">
        <button type="button" onClick={onExportPng} disabled={!rows.length} className="rounded-lg border border-white/10 bg-[#111827] px-4 py-2 text-sm font-black text-[#f9fafb] transition hover:bg-white/10 disabled:opacity-50">
          Export PNG
        </button>
      </div>
      <div ref={chartRef} className="grid gap-4 xl:grid-cols-2">
        <MetricBar title="Precision comparison" data={rows} dataKey="precision" />
        <MetricBar title="Recall comparison" data={rows} dataKey="recall" />
        <MetricBar title="F1 comparison" data={rows} dataKey="f1" />
        <MetricBar title="MAP comparison" data={rows} dataKey="map" />
        <MetricBar title="P@10 comparison" data={rows} dataKey="p10" />
        <RadarPanel data={rows} />
      </div>
      <TrendPanel />
    </section>
  );
}

function MetricBar({ title, data, dataKey }: { title: string; data: any[]; dataKey: string }) {
  const best = Math.max(...data.map((row) => row[dataKey] ?? 0), 0);
  return (
    <div className="h-80 rounded-lg border border-white/10 bg-[#111827] p-5">
      <h3 className="text-sm font-black text-[#f9fafb]">{title}</h3>
      <ResponsiveContainer width="100%" height="88%">
        <BarChart data={data}>
          <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: "#cbd5e1", fontSize: 11 }} interval={0} />
          <YAxis tick={{ fill: "#cbd5e1", fontSize: 12 }} domain={[0, 1]} />
          <Tooltip contentStyle={{ background: "#0b1220", border: "1px solid rgba(255,255,255,0.12)", color: "#f9fafb" }} />
          <Bar dataKey={dataKey} radius={[6, 6, 0, 0]}>
            {data.map((row) => <Cell key={row.model} fill={row[dataKey] === best && best > 0 ? BEST_COLOR : row.color} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function RadarPanel({ data }: { data: any[] }) {
  const radarData = METRICS.map((metric) => ({
    metric: metric.label,
    ...Object.fromEntries(data.map((row) => [MODEL_LABELS[row.model], row[metric.key === "precision_at_10" ? "p10" : metric.key.replace("average_", "")] ?? row[metric.key] ?? 0])),
  }));
  return (
    <div className="h-80 rounded-lg border border-white/10 bg-[#111827] p-5">
      <h3 className="text-sm font-black text-[#f9fafb]">Radar chart</h3>
      <ResponsiveContainer width="100%" height="88%">
        <RadarChart data={radarData}>
          <PolarGrid stroke="rgba(255,255,255,0.16)" />
          <PolarAngleAxis dataKey="metric" tick={{ fill: "#cbd5e1", fontSize: 12 }} />
          <PolarRadiusAxis angle={30} domain={[0, 1]} tick={{ fill: "#94a3b8", fontSize: 10 }} />
          {data.map((row) => (
            <Radar key={row.model} name={MODEL_LABELS[row.model]} dataKey={MODEL_LABELS[row.model]} stroke={row.color} fill={row.color} fillOpacity={0.12} />
          ))}
          <Legend />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

function TrendPanel() {
  return (
    <div className="rounded-lg border border-white/10 bg-[#111827] p-5">
      <h3 className="text-sm font-black text-[#f9fafb]">Trend lines over queries</h3>
      <p className="mt-2 text-sm text-[#94a3b8]">Trend lines appear in the Analysis tab after running evaluation with multiple queries.</p>
    </div>
  );
}

function RankingTab({ result }: { result: EvaluationResponse | null }) {
  return (
    <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
      <div className="rounded-lg border border-white/10 bg-[#111827] p-6">
        <h2 className="text-xl font-black text-[#f9fafb]">Model Leaderboard</h2>
        <p className="mt-2 text-sm text-[#94a3b8]">Weighted score = 40% F1 + 30% MAP + 20% Recall + 10% Precision.</p>
        <div className="mt-5 space-y-3">
          {result?.ranking.map((row, index) => (
            <div key={row.model} className="flex items-center justify-between rounded-lg border border-white/10 bg-[#0b1220] p-4">
              <div>
                <p className="text-sm font-black text-[#d4af37]">#{index + 1}</p>
                <p className="text-lg font-black text-[#f9fafb]">{MODEL_LABELS[row.model]}</p>
              </div>
              <p className="text-2xl font-black text-[#f9fafb]">{formatMetric(row.weighted_score)}</p>
            </div>
          )) ?? <p className="text-sm text-[#94a3b8]">Run an evaluation to generate the leaderboard.</p>}
        </div>
      </div>
      <Heatmap result={result} />
    </section>
  );
}

function Heatmap({ result }: { result: EvaluationResponse | null }) {
  return (
    <div className="rounded-lg border border-white/10 bg-[#111827] p-6">
      <h2 className="text-xl font-black text-[#f9fafb]">Metric Heatmap</h2>
      <div className="mt-5 overflow-auto">
        <table className="w-full min-w-[680px] border-separate border-spacing-1 text-sm">
          <thead className="text-[#cbd5e1]">
            <tr>
              <th className="px-3 py-2 text-left">Model</th>
              {METRICS.map((metric) => <th key={metric.key} className="px-3 py-2 text-left">{metric.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {MODELS.map((model) => (
              <tr key={model}>
                <td className="rounded bg-white/5 px-3 py-2 font-black text-[#f9fafb]">{MODEL_LABELS[model]}</td>
                {METRICS.map((metric) => {
                  const value = result?.summary[model]?.[metric.key] ?? 0;
                  return <td key={metric.key} className="rounded px-3 py-2 font-black text-[#0b1220]" style={{ backgroundColor: heatColor(value) }}>{formatMetric(value)}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AnalysisTab({ result }: { result: EvaluationResponse | null }) {
  const trendData = result?.per_query.map((row, index) => ({
    query: `Q${index + 1}`,
    ...Object.fromEntries(MODELS.map((model) => [MODEL_LABELS[model], row[model]?.f1 ?? 0])),
  })) ?? [];
  return (
    <section className="space-y-4">
      <div className="rounded-lg border border-white/10 bg-[#111827] p-6">
        <h2 className="text-xl font-black text-[#f9fafb]">Query Analysis</h2>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {result?.query_analysis.map((item) => (
            <div key={item.query} className="rounded-lg border border-white/10 bg-[#0b1220] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-black text-[#f9fafb]">{item.query}</p>
                  <p className="mt-1 text-sm text-[#94a3b8]">{item.terms.join(", ") || "No normalized terms"}</p>
                </div>
                <span className="rounded-lg bg-[#d4af37] px-3 py-1 text-xs font-black uppercase text-[#0b1220]">{item.difficulty}</span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <AnalysisStat label="Terms" value={String(item.term_count)} />
                <AnalysisStat label="Matched docs" value={String(item.matched_documents)} />
                <AnalysisStat label="Sparsity" value={formatMetric(item.sparsity)} />
                <AnalysisStat label="Recommended" value={MODEL_LABELS[item.recommended_model]} />
              </div>
            </div>
          )) ?? <p className="text-sm text-[#94a3b8]">Run an evaluation to inspect query difficulty.</p>}
        </div>
      </div>
      <div className="h-80 rounded-lg border border-white/10 bg-[#111827] p-5">
        <h3 className="text-sm font-black text-[#f9fafb]">F1 trend lines over queries</h3>
        <ResponsiveContainer width="100%" height="88%">
          <LineChart data={trendData}>
            <CartesianGrid stroke="rgba(255,255,255,0.08)" />
            <XAxis dataKey="query" tick={{ fill: "#cbd5e1", fontSize: 12 }} />
            <YAxis tick={{ fill: "#cbd5e1", fontSize: 12 }} domain={[0, 1]} />
            <Tooltip contentStyle={{ background: "#0b1220", border: "1px solid rgba(255,255,255,0.12)", color: "#f9fafb" }} />
            {MODELS.map((model, index) => <Line key={model} type="monotone" dataKey={MODEL_LABELS[model]} stroke={COLORS[index]} strokeWidth={2} dot />)}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <ConfusionMatrices result={result} />
    </section>
  );
}

function ConfusionMatrices({ result }: { result: EvaluationResponse | null }) {
  const firstQuery = result?.per_query[0];
  return (
    <div className="rounded-lg border border-white/10 bg-[#111827] p-6">
      <h2 className="text-xl font-black text-[#f9fafb]">Confusion Matrix Per Model</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {firstQuery ? MODELS.map((model) => {
          const metrics = firstQuery[model];
          return (
            <div key={model} className="rounded-lg border border-white/10 bg-[#0b1220] p-4">
              <p className="font-black text-[#f9fafb]">{MODEL_LABELS[model]}</p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-center text-sm font-black">
                <div className="rounded bg-emerald-400/20 p-3 text-emerald-100">TP<br />{metrics?.tp ?? 0}</div>
                <div className="rounded bg-red-400/20 p-3 text-red-100">FP<br />{metrics?.fp ?? 0}</div>
                <div className="rounded bg-amber-400/20 p-3 text-amber-100">FN<br />{metrics?.fn ?? 0}</div>
                <div className="rounded bg-sky-400/20 p-3 text-sky-100">TN<br />{metrics?.tn ?? 0}</div>
              </div>
            </div>
          );
        }) : <p className="text-sm text-[#94a3b8]">Run an evaluation to generate confusion matrices.</p>}
      </div>
    </div>
  );
}

function BestCard({ label, model, value }: { label: string; model: string; value: number }) {
  return (
    <div className="rounded-lg border border-white/10 bg-[#111827] p-4 shadow-2xl shadow-black/20">
      <p className="text-xs font-black uppercase tracking-[0.12em] text-[#d4af37]">{label}</p>
      <p className="mt-3 text-lg font-black text-[#f9fafb]">{MODEL_LABELS[model]}</p>
      <p className="mt-1 text-sm font-semibold text-[#94a3b8]">{formatMetric(value)}</p>
    </div>
  );
}

function EmptyCards() {
  return <div className="rounded-lg border border-white/10 bg-[#111827] p-5 text-sm text-[#94a3b8] md:col-span-5">Run an evaluation to populate best-model cards.</div>;
}

function AnalysisStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-[#111827] p-3">
      <p className="text-xs font-semibold text-[#94a3b8]">{label}</p>
      <p className="mt-1 font-black text-[#f9fafb]">{value}</p>
    </div>
  );
}

function bestFor(result: EvaluationResponse, field: keyof EvaluationResponse["ranking"][number], label: string) {
  const row = [...result.ranking].sort((a, b) => Number(b[field] ?? 0) - Number(a[field] ?? 0))[0];
  return { label, model: row.model, value: Number(row[field] ?? 0) };
}

function formatMetric(value: number | undefined) {
  return typeof value === "number" ? value.toFixed(3) : "-";
}

function heatColor(value: number) {
  const clamped = Math.max(0, Math.min(1, value));
  const lightness = 24 + clamped * 48;
  return `hsl(158 70% ${lightness}%)`;
}

async function svgToPng(svg: SVGSVGElement) {
  const data = new XMLSerializer().serializeToString(svg);
  const blob = new Blob([data], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const image = new Image();
  image.src = url;
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = reject;
  });
  const canvas = document.createElement("canvas");
  canvas.width = svg.clientWidth * 2;
  canvas.height = svg.clientHeight * 2;
  const context = canvas.getContext("2d");
  context?.drawImage(image, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(url);
  return canvas.toDataURL("image/png");
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  link.click();
}
