"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import LogicalOperatorSelector from "@/components/LogicalOperatorSelector";
import MeasureSelector from "@/components/MeasureSelector";
import ModelSelector from "@/components/ModelSelector";
import PValueSlider from "@/components/PValueSlider";
import SearchBar from "@/components/SearchBar";
import type { LogicalOperator, SearchModel, VsmMeasure } from "@/lib/api";

type Draft = {
  query: string;
  model: SearchModel;
  measure: VsmMeasure;
  operator: LogicalOperator;
  p: number;
};

const DEFAULT_DRAFT: Draft = {
  query: "",
  model: "vsm",
  measure: "cosine",
  operator: "or",
  p: 2,
};

function supportsMeasure(model: SearchModel) {
  return model === "vsm";
}

function supportsOperator(model: SearchModel) {
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
      return "Vector Space Model";
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

export default function HomePage() {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<"search" | "compare">("search");
  const [query, setQuery] = useState("");
  const [model, setModel] = useState<SearchModel>("vsm");
  const [measure, setMeasure] = useState<VsmMeasure>("cosine");
  const [operator, setOperator] = useState<LogicalOperator>("or");
  const [p, setP] = useState(2);
  const [compareLeft, setCompareLeft] = useState<Draft>({ ...DEFAULT_DRAFT, model: "vsm" });
  const [compareRight, setCompareRight] = useState<Draft>({ ...DEFAULT_DRAFT, model: "probabilistic" });

  const openCompareMode = () => {
    const leftDraft = { query, model, measure, operator, p };
    const rightModel: SearchModel = model === "vsm" ? "probabilistic" : "vsm";
    const rightDraft: Draft = {
      query,
      model: rightModel,
      measure: rightModel === "vsm" ? measure : "cosine",
      operator,
      p,
    };
    setCompareLeft(leftDraft);
    setCompareRight(rightDraft);
    setViewMode("compare");
  };

  const updateCompareLeft = (patch: Partial<Draft>) => setCompareLeft((current) => ({ ...current, ...patch }));
  const updateCompareRight = (patch: Partial<Draft>) => setCompareRight((current) => ({ ...current, ...patch }));

  const runSearch = () => {
    if (!query.trim()) return;
    const params = new URLSearchParams({ q: query.trim(), model, measure, operator, p: String(p) });
    router.push(`/results?${params.toString()}`);
  };

  const runCompare = () => {
    if (!compareLeft.query.trim() || !compareRight.query.trim()) return;
    const params = new URLSearchParams({
      mode: "compare",
      queryA: compareLeft.query.trim(),
      modelA: compareLeft.model,
      measureA: compareLeft.measure,
      operatorA: compareLeft.operator,
      pA: String(compareLeft.p),
      queryB: compareRight.query.trim(),
      modelB: compareRight.model,
      measureB: compareRight.measure,
      operatorB: compareRight.operator,
      pB: String(compareRight.p),
    });
    router.push(`/results?${params.toString()}`);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <section className="space-y-5 rounded-2xl bg-[linear-gradient(135deg,rgba(11,18,32,0.96),rgba(17,24,39,0.9))] px-6 py-8 shadow-[0_24px_80px_rgba(0,0,0,0.32)] md:px-8 md:py-10">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <p className="text-sm font-bold uppercase tracking-[0.24em] text-[#d4af37]">Projet academique RI</p>
            <h1 className="max-w-3xl text-4xl font-black tracking-tight text-[#f9fafb] md:text-5xl">Moteur de Recherche</h1>
            <p className="max-w-2xl text-base leading-7 text-[#cbd5e1]">
              Index inverse partage, TF-IDF, modele booleen, p-norm, logique floue et BIR probabiliste implementes manuellement.
            </p>
          </div>
          <div className="inline-flex rounded-full border border-white/10 bg-white/5 p-1 shadow-[0_12px_30px_rgba(0,0,0,0.24)] backdrop-blur-xl">
            <button
              type="button"
              onClick={() => setViewMode("search")}
              className={
                viewMode === "search"
                  ? "rounded-full bg-[#d4af37] px-4 py-2 text-sm font-semibold text-[#0b1220] shadow-[0_0_18px_rgba(212,175,55,0.25)]"
                  : "rounded-full px-4 py-2 text-sm font-semibold text-[#cbd5e1] transition hover:text-white"
              }
            >
              Search Mode
            </button>
            <button
              type="button"
              onClick={openCompareMode}
              className={
                viewMode === "compare"
                  ? "rounded-full bg-[#d4af37] px-4 py-2 text-sm font-semibold text-[#0b1220] shadow-[0_0_18px_rgba(212,175,55,0.25)]"
                  : "rounded-full px-4 py-2 text-sm font-semibold text-[#cbd5e1] transition hover:text-white"
              }
            >
              Compare Mode
            </button>
          </div>
        </div>
      </section>

      {viewMode === "search" ? (
        <>
          <section className="space-y-5 rounded-2xl border border-[rgba(212,175,55,0.18)] bg-[#111827] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.28)]">
            <SearchBar query={query} setQuery={setQuery} onSearch={runSearch} />
            <div className="grid gap-4 md:grid-cols-2">
              <ModelSelector model={model} onChange={setModel} />
              {supportsMeasure(model) && <MeasureSelector measure={measure} onChange={setMeasure} />}
              {supportsOperator(model) && <LogicalOperatorSelector operator={operator} onChange={setOperator} />}
              {supportsPNorm(model) && <PValueSlider value={p} onChange={setP} />}
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-3">
            {[
              ["Boolean", "Arbre d'expression AND / OR / NOT, RSV binaire."],
              ["VSM", "Vecteurs TF-IDF et similarite cosinus."],
              ["Fuzzy + BIR", "Appariement gradue et probabilite de pertinence."],
            ].map(([title, text]) => (
              <div key={title} className="rounded-xl border border-[rgba(212,175,55,0.2)] border-t-4 border-t-[#d4af37] bg-[#111827] p-5 shadow-[0_16px_42px_rgba(0,0,0,0.24)] transition hover:-translate-y-1 hover:shadow-[0_20px_50px_rgba(0,0,0,0.3)]">
                <h2 className="font-bold text-[#f9fafb]">{title}</h2>
                <p className="mt-2 text-sm leading-6 text-[#cbd5e1]">{text}</p>
              </div>
            ))}
          </section>
        </>
      ) : (
        <section className="space-y-6 rounded-2xl border border-[rgba(212,175,55,0.18)] bg-[#111827] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.28)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#d4af37]">Compare Mode</p>
              <h2 className="mt-1 text-2xl font-black text-[#f9fafb]">Split the query across two models</h2>
              <p className="mt-2 text-sm leading-6 text-[#cbd5e1]">Compare Model A and Model B with the same interface and one shared action button.</p>
            </div>
            <button
              type="button"
              onClick={() => setViewMode("search")}
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-[#cbd5e1] transition hover:border-[#d4af37] hover:text-[#f9fafb]"
            >
              Back to Search
            </button>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <CompareDraftCard title="Model A" draft={compareLeft} onChange={updateCompareLeft} />
            <CompareDraftCard title="Model B" draft={compareRight} onChange={updateCompareRight} />
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={runCompare}
              className="rounded-full border border-[#d4af37] bg-[#d4af37] px-6 py-3 text-sm font-semibold text-[#0b1220] shadow-[0_0_22px_rgba(212,175,55,0.25)] transition hover:border-[#f4d03f] hover:bg-[#f4d03f] hover:shadow-[0_0_28px_rgba(244,208,63,0.35)]"
            >
              Compare
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

function CompareDraftCard({
  title,
  draft,
  onChange,
}: {
  title: string;
  draft: Draft;
  onChange: (patch: Partial<Draft>) => void;
}) {
  return (
    <section className="rounded-xl border border-[rgba(212,175,55,0.18)] border-t-4 border-t-[#d4af37] bg-[#111827] p-5 shadow-[0_18px_42px_rgba(0,0,0,0.26)] transition hover:-translate-y-1 hover:shadow-[0_22px_54px_rgba(0,0,0,0.34)]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-[#f9fafb]">{title}</h3>
          <p className="text-sm text-[#cbd5e1]">{getModelLabel(draft.model)}</p>
        </div>
        <span className="rounded-full border border-[#d4af37]/25 bg-[#0b1220] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[#f9fafb]">
          {title}
        </span>
      </div>

      <div className="space-y-4">
        <SearchBar
          query={draft.query}
          setQuery={(value) => onChange({ query: value })}
          onSearch={() => undefined}
          hideSubmitButton
        />
        <div className="grid gap-4">
          <ModelSelector model={draft.model} onChange={(model) => onChange({ model })} />
          {supportsMeasure(draft.model) && (
            <MeasureSelector measure={draft.measure} onChange={(measure) => onChange({ measure })} />
          )}
          {supportsOperator(draft.model) && (
            <LogicalOperatorSelector operator={draft.operator} onChange={(operator) => onChange({ operator })} />
          )}
          {supportsPNorm(draft.model) && <PValueSlider value={draft.p} onChange={(p) => onChange({ p })} />}
        </div>
      </div>
    </section>
  );
}
