"use client";

import type { LogicalOperator } from "@/lib/api";

const OPERATORS: Array<{ value: LogicalOperator; label: string }> = [
  { value: "and", label: "AND / Et" },
  { value: "or", label: "OR / Ou" },
  { value: "not", label: "NOT / Non" },
];

export default function LogicalOperatorSelector({
  operator,
  onChange,
}: {
  operator: LogicalOperator;
  onChange: (operator: LogicalOperator) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-slate-200">Logical operator</span>
      <select
        value={operator}
        onChange={(event) => onChange(event.target.value as LogicalOperator)}
        className="h-12 w-full rounded-xl border border-white/10 bg-[#111827] px-3 text-sm font-medium text-[#f9fafb] outline-none ring-[#d4af37]/20 transition hover:border-[#d4af37] focus:border-[#d4af37] focus:ring-4"
      >
        {OPERATORS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
