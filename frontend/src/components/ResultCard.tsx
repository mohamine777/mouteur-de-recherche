"use client";

import type { SearchResult } from "@/lib/api";

export default function ResultCard({ result }: { result: SearchResult }) {
  return (
    <article className="rounded-xl border border-[rgba(212,175,55,0.22)] border-t-4 border-t-[#d4af37] bg-[#111827] p-5 shadow-[0_16px_45px_rgba(0,0,0,0.28)] transition hover:-translate-y-1 hover:shadow-[0_20px_55px_rgba(0,0,0,0.35)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-[#f9fafb]">{result.title}</h2>
          <p className="mt-1 text-xs text-[#cbd5e1]">{result.metadata?.filename || result.doc_id}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded-full border border-[#d4af37]/30 bg-[#0b1220] px-2.5 py-1 text-xs font-bold uppercase text-[#f9fafb]">{result.model}</span>
          <span className="rounded-full bg-[#d4af37] px-2.5 py-1 text-xs font-semibold text-[#0b1220] shadow-[0_0_18px_rgba(212,175,55,0.28)]">RSV {result.score.toFixed(4)}</span>
        </div>
      </div>
      <p
        className="mt-4 text-sm leading-6 text-[#cbd5e1]"
        dangerouslySetInnerHTML={{ __html: result.snippet }}
      />
    </article>
  );
}
