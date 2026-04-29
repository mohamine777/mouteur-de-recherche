"use client";

import { useEffect, useState } from "react";

import MetricsCard from "@/components/MetricsCard";
import ResultsPanel from "@/components/ResultsPanel";
import SearchBar from "@/components/SearchBar";
import {
  compareDocuments,
  fetchMetrics,
  type LogicalOperator,
  searchDocuments,
  type SearchMeasure,
  type SearchModel,
  type SearchResult,
  uploadDocument,
} from "@/lib/api";

const keywords = [
  "profession",
  "score",
  "nan",
  "madrid",
  "amina",
  "name",
  "fast",
  "ballon",
  "run",
  "product",
  "cat",
  "cristiano",
  "saw",
  "youssef",
  "attac",
];

const MODEL_OPTIONS: Array<{ value: SearchModel; label: string }> = [
  { value: "boolean_exact", label: "Boolean Exact" },
  { value: "extended_boolean", label: "Extended Boolean" },
  { value: "fuzzy_zadeh", label: "Fuzzy Zadeh" },
  { value: "fuzzy_lukasiewicz", label: "Fuzzy Lukasiewicz" },
  { value: "vsm", label: "Vector Space Model" },
];

const OPERATOR_OPTIONS: Array<{ value: LogicalOperator; label: string }> = [
  { value: "and", label: "AND (Conjunction)" },
  { value: "or", label: "OR (Disjunction)" },
  { value: "not", label: "NOT (Negation)" },
];

const VSM_MEASURE_OPTIONS: Array<{ value: SearchMeasure; label: string }> = [
  { value: "cosine", label: "Cosine Similarity" },
  { value: "inner_product", label: "Inner Product" },
  { value: "euclidean_distance", label: "Euclidean Distance" },
  { value: "dice", label: "Dice" },
  { value: "jaccard", label: "Jaccard" },
  { value: "overlap_coefficient", label: "Overlap Coefficient" },
];

const DEFAULT_MEASURE: SearchMeasure = "cosine";
const DEFAULT_P = 2;

function getModelLabel(model: SearchModel): string {
  if (model === "boolean_exact") return "Boolean Exact";
  if (model === "extended_boolean") return "Extended Boolean";
  if (model === "fuzzy_zadeh") return "Fuzzy Zadeh";
  if (model === "fuzzy_lukasiewicz") return "Fuzzy Lukasiewicz";
  return "Vector Space Model";
}

function formatSelection(model: SearchModel, measure: SearchMeasure, p: number, operator: LogicalOperator): string {
  if (model === "boolean_exact") return `${getModelLabel(model)} / ${operator.toUpperCase()}`;
  if (model === "extended_boolean") return `${getModelLabel(model)} / ${operator.toUpperCase()} / p=${p}`;
  if (model === "fuzzy_zadeh" || model === "fuzzy_lukasiewicz") return `${getModelLabel(model)} / ${operator.toUpperCase()}`;
  const measureLabel = VSM_MEASURE_OPTIONS.find((option) => option.value === measure)?.label || measure;
  return `${getModelLabel(model)} / ${measureLabel}`;
}

export default function HomePage() {
  const [query, setQuery] = useState("");
  const [searchModel, setSearchModel] = useState<SearchModel>("boolean_exact");
  const [searchMeasure, setSearchMeasure] = useState<SearchMeasure>(DEFAULT_MEASURE);
  const [searchP, setSearchP] = useState<number>(DEFAULT_P);
  const [searchOperator, setSearchOperator] = useState<LogicalOperator>("or");
  const [compareMode, setCompareMode] = useState(false);
  const [modelA, setModelA] = useState<SearchModel>("boolean_exact");
  const [measureA, setMeasureA] = useState<SearchMeasure>(DEFAULT_MEASURE);
  const [pA, setPA] = useState<number>(DEFAULT_P);
  const [operatorA, setOperatorA] = useState<LogicalOperator>("or");
  const [modelB, setModelB] = useState<SearchModel>("extended_boolean");
  const [measureB, setMeasureB] = useState<SearchMeasure>(DEFAULT_MEASURE);
  const [pB, setPB] = useState<number>(DEFAULT_P);
  const [operatorB, setOperatorB] = useState<LogicalOperator>("or");
  const [primaryResults, setPrimaryResults] = useState<SearchResult[]>([]);
  const [secondaryResults, setSecondaryResults] = useState<SearchResult[]>([]);
  const [feedbackCount, setFeedbackCount] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    void refreshMetrics();
  }, []);

  const refreshMetrics = async () => {
    try {
      const metrics = await fetchMetrics();
      setFeedbackCount(metrics.feedback_count ?? 0);
    } catch {
      setFeedbackCount(0);
    }
  };

  const updateSearchModel = (model: SearchModel) => {
    setSearchModel(model);
    setSearchMeasure(DEFAULT_MEASURE);
    setSearchP(DEFAULT_P);
    setSearchOperator("or");
  };

  const updateModelA = (model: SearchModel) => {
    setModelA(model);
    setMeasureA(DEFAULT_MEASURE);
    setPA(DEFAULT_P);
    setOperatorA("or");
  };

  const updateModelB = (model: SearchModel) => {
    setModelB(model);
    setMeasureB(DEFAULT_MEASURE);
    setPB(DEFAULT_P);
    setOperatorB("or");
  };

  const runSearch = async () => {
    if (!query.trim()) return;

    setError(null);
    setSuccess(null);
    setSearching(true);
    const submittedQuery = query.trim();

    try {
      if (compareMode) {
        const comparison = await compareDocuments({
          query: submittedQuery,
          model_a: modelA,
          measure_a: measureA,
          tf_mode_a: "normalized",
          p_a: pA,
          operator_a: operatorA,
          model_b: modelB,
          measure_b: measureB,
          tf_mode_b: "normalized",
          p_b: pB,
          operator_b: operatorB,
          top_k: 10,
        });
        setPrimaryResults(comparison.model_a.results);
        setSecondaryResults(comparison.model_b.results);
      } else {
        const results = await searchDocuments({
          query: submittedQuery,
          model: searchModel,
          measure: searchMeasure,
          tf_mode: "normalized",
          p: searchP,
          operator: searchOperator,
          top_k: 10,
        });
        setPrimaryResults(results);
        setSecondaryResults([]);
      }

      await refreshMetrics();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  };

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    setUploading(true);
    setError(null);
    setSuccess(null);
    try {
      let lastCount = 0;
      let lastFilename = "";
      for (const file of files) {
        const response = await uploadDocument(file);
        lastCount = response?.document_count ?? lastCount;
        lastFilename = response?.filename || file.name;
        console.log("UPLOAD DEBUG:", { filename: lastFilename, index_success: true, document_count: lastCount });
      }

      if (files.length === 1) {
        setSuccess(`Nouveau document ajouté et indexé avec succès : ${lastFilename || files[0].name} (total docs: ${lastCount || "?"})`);
      } else {
        setSuccess(`${files.length} nouveaux documents ajoutés et indexés avec succès (total docs: ${lastCount || "?"}).`);
      }

      if (query.trim()) {
        await runSearch();
      }
    } catch (err) {
      console.error("UPLOAD DEBUG:", { index_success: false, error: err });
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const activeModelLabel = compareMode
    ? formatSelection(modelA, measureA, pA, operatorA)
    : formatSelection(searchModel, searchMeasure, searchP, searchOperator);
  const secondaryModelLabel = formatSelection(modelB, measureB, pB, operatorB);

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-[2rem] border border-black/10 bg-white/80 p-6 shadow-[0_18px_60px_rgba(17,17,17,0.08)] md:p-8">
        <div className="mb-7 flex flex-col gap-4 md:mb-8 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-black/50">Information retrieval workspace</p>
            <h2 className="mt-2 text-2xl font-bold text-black md:text-3xl">Upload, select a model, query, and search</h2>
          </div>
        </div>

        <div className="space-y-6 md:space-y-7">
          <label className="flex min-h-[210px] cursor-pointer flex-col items-center justify-center rounded-[1.75rem] border-2 border-dashed border-gold bg-white px-6 py-8 text-center transition hover:bg-[#fffdf8]">
            <input type="file" multiple onChange={onFileChange} className="sr-only" />
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gold/15 text-gold">
              <CloudUploadIcon />
            </div>
            <p className="text-lg font-bold text-black">Glissez-déposez vos fichiers ici</p>
            <p className="mt-2 text-sm text-black/55">ou cliquez pour parcourir (PDF, DOCX, XLSX, TXT)</p>
            <div className="mt-6 self-start text-left">
              <span className="sr-only">Choisir un fichier</span>
              <span className="pointer-events-none block text-sm text-black/65">Choisir un fichier</span>
              <span className="pointer-events-none block text-sm text-black/40">Aucun fichier choisi</span>
            </div>
          </label>

          {uploading && <p className="text-sm font-medium text-gold">Uploading and indexing...</p>}
          {success && <p className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{success}</p>}

          <div className="rounded-[1.5rem] border border-black/10 bg-[#fffdf8] p-4 md:p-5">
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-black/45">Search mode</p>
                <h3 className="mt-1 text-lg font-bold text-black">Select the model before searching</h3>
              </div>
              <label className="inline-flex items-center gap-2 text-sm font-medium text-black/70">
                <input
                  type="checkbox"
                  checked={compareMode}
                  onChange={(event) => setCompareMode(event.target.checked)}
                  className="h-4 w-4 rounded border-black/20 text-black focus:ring-black"
                />
                Compare mode
              </label>
            </div>

            {compareMode ? (
              <div className="grid gap-4 lg:grid-cols-2">
                <ModelSelector
                  title="Model A"
                  model={modelA}
                  measure={measureA}
                  p={pA}
                  operator={operatorA}
                  onModelChange={updateModelA}
                  onMeasureChange={setMeasureA}
                  onPChange={setPA}
                  onOperatorChange={setOperatorA}
                />
                <ModelSelector
                  title="Model B"
                  model={modelB}
                  measure={measureB}
                  p={pB}
                  operator={operatorB}
                  onModelChange={updateModelB}
                  onMeasureChange={setMeasureB}
                  onPChange={setPB}
                  onOperatorChange={setOperatorB}
                />
              </div>
            ) : (
              <ModelSelector
                title="Selected model"
                model={searchModel}
                measure={searchMeasure}
                p={searchP}
                operator={searchOperator}
                onModelChange={updateSearchModel}
                onMeasureChange={setSearchMeasure}
                onPChange={setSearchP}
                onOperatorChange={setSearchOperator}
              />
            )}
          </div>

          <SearchBar query={query} setQuery={setQuery} onSearch={runSearch} submitLabel={compareMode ? "Compare" : "Search"} />

          {searching && <p className="text-sm font-medium text-black/55">Searching...</p>}

          {error && <p className="rounded-2xl border border-black/10 bg-[#fff8e8] px-4 py-3 text-sm text-black">{error}</p>}
        </div>
      </section>

      <MetricsCard
        feedback_count={feedbackCount}
        currentMode={activeModelLabel}
        compareMode={compareMode}
        compareAgainst={compareMode ? secondaryModelLabel : undefined}
      />

      <section className={`grid gap-6 ${compareMode ? "md:grid-cols-2" : ""}`}>
        <ResultsPanel title={compareMode ? `Model A · ${activeModelLabel}` : activeModelLabel} query={query} results={primaryResults} />
        {compareMode && <ResultsPanel title={`Model B · ${secondaryModelLabel}`} query={query} results={secondaryResults} />}
      </section>

      <section className="flex flex-wrap gap-3 pb-2">
        {keywords.map((keyword) => (
          <span
            key={keyword}
            className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-black/80 shadow-[0_1px_0_rgba(17,17,17,0.02)]"
          >
            {keyword}
          </span>
        ))}
      </section>
    </div>
  );
}

type ModelSelectorProps = {
  title: string;
  model: SearchModel;
  measure: SearchMeasure;
  p: number;
  operator: LogicalOperator;
  onModelChange: (model: SearchModel) => void;
  onMeasureChange: (measure: SearchMeasure) => void;
  onPChange: (p: number) => void;
  onOperatorChange: (operator: LogicalOperator) => void;
};

function ModelSelector({ title, model, measure, p, operator, onModelChange, onMeasureChange, onPChange, onOperatorChange }: ModelSelectorProps) {
  return (
    <div className="rounded-2xl border border-black/10 bg-white p-4">
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-black/45">{title}</p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <SelectField label="Model" value={model} options={MODEL_OPTIONS} onChange={(value) => onModelChange(value as SearchModel)} />
        {model === "vsm" ? (
          <SelectField label="Measure" value={measure} options={VSM_MEASURE_OPTIONS} onChange={(value) => onMeasureChange(value as SearchMeasure)} />
        ) : (
          <SelectField label="Logical Operator" value={operator} options={OPERATOR_OPTIONS} onChange={(value) => onOperatorChange(value as LogicalOperator)} />
        )}
        {model === "extended_boolean" ? <NumberField label="p" value={p} onChange={onPChange} /> : null}
      </div>
    </div>
  );
}

type SelectFieldProps = {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
};

function SelectField({ label, value, options, onChange }: SelectFieldProps) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-black/65">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-black/10 bg-[#fffdf8] px-4 py-3 text-sm text-black outline-none transition focus:border-gold"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-black/65">{label}</span>
      <input
        type="number"
        min="1"
        step="1"
        value={value}
        onChange={(event) => onChange(Number(event.target.value) || DEFAULT_P)}
        className="w-full rounded-2xl border border-black/10 bg-[#fffdf8] px-4 py-3 text-sm text-black outline-none transition focus:border-gold"
      />
    </label>
  );
}

function CloudUploadIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-7 w-7 fill-none stroke-current stroke-[1.8]">
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 18a4 4 0 0 1-.67-7.94A5.5 5.5 0 0 1 17.9 8.4 3.75 3.75 0 1 1 18 18H7Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 12v8m0-8 3 3m-3-3-3 3" />
    </svg>
  );
}
