"use client";

import type { SearchModel } from "@/lib/api";

const MODELS: Array<{ value: SearchModel; label: string }> = [
  { value: "boolean", label: "Boolean" },
  { value: "vsm", label: "Vector Space Model" },
  { value: "extended_boolean", label: "Extended Boolean p-norm" },
  { value: "fuzzy", label: "Fuzzy" },
  { value: "lukasiewicz", label: "Lukasiewicz" },
  { value: "probabilistic", label: "BIR" },
];

export default function ModelSelector({
  model,
  onChange,
}: {
  model: SearchModel;
  onChange: (model: SearchModel) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-slate-200">Model</span>
      <select
        value={model}
        onChange={(event) => onChange(event.target.value as SearchModel)}
        className="h-12 w-full rounded-xl border border-white/10 bg-[#111827] px-3 text-sm font-medium text-[#f9fafb] outline-none ring-[#d4af37]/20 transition hover:border-[#d4af37] focus:border-[#d4af37] focus:ring-4"
      >
        {MODELS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
