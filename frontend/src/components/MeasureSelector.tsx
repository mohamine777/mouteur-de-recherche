"use client";

import type { VsmMeasure } from "@/lib/api";

const MEASURES: Array<{ value: VsmMeasure; label: string }> = [
  { value: "cosine", label: "Cosine / Cosinus" },
  { value: "product", label: "Inner Product / Produit scalaire" },
  { value: "euclidean", label: "Euclidean similarity" },
  { value: "dice", label: "Dice" },
  { value: "jaccard", label: "Jaccard" },
  { value: "overlap", label: "Overlap coefficient" },
];

export default function MeasureSelector({
  measure,
  onChange,
}: {
  measure: VsmMeasure;
  onChange: (measure: VsmMeasure) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-slate-200">Similarity measure</span>
      <select
        value={measure}
        onChange={(event) => onChange(event.target.value as VsmMeasure)}
        className="h-12 w-full rounded-xl border border-white/10 bg-[#111827] px-3 text-sm font-medium text-[#f9fafb] outline-none ring-[#d4af37]/20 transition hover:border-[#d4af37] focus:border-[#d4af37] focus:ring-4"
      >
        {MEASURES.map((option) => (
          <option key={option.value} value={option.value}>
          {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
