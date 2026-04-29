"use client";

type Props = {
  query: string;
  setQuery: (value: string) => void;
  onSearch: () => void;
  submitLabel?: string;
};

export default function SearchBar({ query, setQuery, onSearch, submitLabel = "Search" }: Props) {
  return (
    <button type="button" onClick={onSearch} className="block w-full text-left">
      <div className="flex min-h-[76px] items-center gap-3 rounded-full border border-black/10 bg-white px-4 py-3 shadow-[0_12px_30px_rgba(17,17,17,0.06)] transition hover:shadow-[0_16px_36px_rgba(17,17,17,0.08)]">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#fff8e4] text-gold">
          <MagnifierIcon />
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Que recherchez-vous aujourd'hui ?"
          className="min-w-0 flex-1 bg-transparent text-base text-black outline-none placeholder:text-black/35"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onSearch();
            }
          }}
        />
        <div className="flex items-center rounded-full bg-black px-4 py-2.5 text-white shadow-sm transition hover:bg-gold hover:text-black">
          <PenIcon />
          <span className="ml-2 text-sm font-semibold">{submitLabel}</span>
        </div>
      </div>
    </button>
  );
}

function MagnifierIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-[2]">
      <circle cx="11" cy="11" r="6.5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="m16 16 4.5 4.5" />
    </svg>
  );
}

function PenIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-[2]">
      <path strokeLinecap="round" strokeLinejoin="round" d="m4 20 4.5-1 11-11a2.12 2.12 0 1 0-3-3l-11 11L4 20Z" />
    </svg>
  );
}
