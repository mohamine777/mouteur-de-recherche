"use client";

export default function PValueSlider({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const isInfinity = value >= 999;
  return (
    <label className="block">
      <span className="mb-2 flex items-center justify-between text-sm font-semibold text-slate-700">
        <span>Operateur p-norm</span>
        <span className="rounded bg-blue-50 px-2 py-1 text-blue-700">{isInfinity ? "infini" : value.toFixed(1)}</span>
      </span>
      <input
        type="range"
        min="1"
        max="10"
        step="0.5"
        value={isInfinity ? 10 : value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-blue-600"
      />
      <button
        type="button"
        onClick={() => onChange(999)}
        className="mt-2 rounded-lg border border-blue-100 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-blue-50"
      >
        p = infini
      </button>
    </label>
  );
}
