"use client";

import { useEffect, useState } from "react";

import { fetchSuggestions } from "@/lib/api";

type Props = {
  query: string;
  setQuery: (value: string) => void;
  onSearch: () => void;
  submitLabel?: string;
  hideSubmitButton?: boolean;
};

export default function SearchBar({
  query,
  setQuery,
  onSearch,
  submitLabel = "Rechercher",
  hideSubmitButton = false,
}: Props) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    const handle = window.setTimeout(async () => {
      if (!query.trim()) {
        setSuggestions([]);
        return;
      }
      setSuggestions(await fetchSuggestions(query).catch(() => []));
    }, 180);
    return () => window.clearTimeout(handle);
  }, [query]);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSearch();
      }}
      className="relative w-full"
    >
      <div className="flex min-h-14 items-center gap-3 rounded-xl border border-white/15 bg-[rgba(255,255,255,0.9)] px-4 shadow-[0_18px_50px_rgba(15,23,42,0.18)] backdrop-blur-xl ring-[#d4af37]/20 transition focus-within:border-[#d4af37] focus-within:shadow-[0_20px_60px_rgba(212,175,55,0.14)] focus-within:ring-4">
        <SearchIcon />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => window.setTimeout(() => setFocused(false), 120)}
          placeholder="Ex: recherche AND information, fuzzy retrieval, index inverse"
          className="min-w-0 flex-1 bg-transparent text-base text-[#0b1220] outline-none placeholder:text-slate-500"
        />
        {!hideSubmitButton && (
          <button
            type="submit"
            className="rounded-xl border border-[#d4af37] bg-[#d4af37] px-4 py-2 text-sm font-semibold text-[#0b1220] shadow-[0_0_18px_rgba(212,175,55,0.35)] transition hover:border-[#f4d03f] hover:bg-[#f4d03f] hover:shadow-[0_0_26px_rgba(244,208,63,0.45)]"
          >
            {submitLabel}
          </button>
        )}
      </div>
      {focused && suggestions.length > 0 && (
        <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-20 rounded-xl border border-white/10 bg-[#111827]/95 p-2 shadow-[0_20px_50px_rgba(15,23,42,0.28)] backdrop-blur-xl">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onMouseDown={() => setQuery(suggestion)}
              className="block w-full rounded-xl px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-white/10 hover:text-white"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </form>
  );
}

function SearchIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-[#d4af37] stroke-2">
      <circle cx="11" cy="11" r="7" />
      <path strokeLinecap="round" d="m16.5 16.5 4 4" />
    </svg>
  );
}
