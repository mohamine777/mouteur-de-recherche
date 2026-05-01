import FeedbackButton from "./FeedbackButton";
import type { SearchResult } from "@/lib/api";

type Props = {
  title: string;
  query: string;
  results: SearchResult[];
  subtitle?: string;
  highlight?: boolean;
};

export default function ResultsPanel({ title, query, results, subtitle, highlight = false }: Props) {
  return (
    <section
      className={
        highlight
          ? "rounded-xl border border-[rgba(212,175,55,0.35)] border-t-4 border-t-[#d4af37] bg-[#111827] p-6 shadow-[0_18px_48px_rgba(0,0,0,0.3)] md:p-7"
          : "rounded-xl border border-[rgba(212,175,55,0.18)] border-t-4 border-t-[#d4af37]/70 bg-[#111827] p-6 shadow-[0_18px_48px_rgba(0,0,0,0.26)] md:p-7"
      }
    >
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-[#f9fafb]">{title}</h2>
          {subtitle && <p className="mt-1 text-sm text-[#cbd5e1]">{subtitle}</p>}
        </div>
        {highlight && <span className="rounded-full border border-[#d4af37] bg-[#d4af37] px-3 py-1 text-xs font-semibold text-[#0b1220] shadow-[0_0_18px_rgba(212,175,55,0.28)]">Best model</span>}
      </div>
      <div className="space-y-4">
        {results.length === 0 ? (
          <p className="text-sm text-[#cbd5e1]">No results yet.</p>
        ) : (
          results.map((result) => {
            const rawFilename = (result.metadata && (result.metadata as any).filename) as unknown;
            let displayTitle: string;
            if (typeof rawFilename === "string") {
              displayTitle = rawFilename;
            } else if (rawFilename === undefined || rawFilename === null) {
              displayTitle = result.doc_id;
            } else if (Array.isArray(rawFilename)) {
              // If metadata.filename is an array, try to render sensibly:
              // - join strings
              // - if objects with `name` prop, join those
              // - fallback to JSON.stringify
              const arr = rawFilename as any[];
              if (arr.every((v) => typeof v === "string")) {
                displayTitle = arr.join(", ");
              } else if (arr.every((v) => v && typeof v === "object" && ("name" in v || "filename" in v))) {
                displayTitle = arr
                  .map((v) => (v.name ? String(v.name) : v.filename ? String(v.filename) : JSON.stringify(v)))
                  .join(", ");
              } else {
                try {
                  displayTitle = JSON.stringify(rawFilename);
                } catch {
                  displayTitle = String(result.doc_id);
                }
              }
            } else {
              try {
                displayTitle = JSON.stringify(rawFilename);
              } catch {
                displayTitle = String(result.doc_id);
              }
            }

            return (
              <article key={result.doc_id} className="rounded-xl border border-white/8 bg-[#0b1220] p-4 transition hover:-translate-y-1 hover:shadow-[0_18px_40px_rgba(0,0,0,0.3)]">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h3 className="font-semibold text-[#f9fafb]">{displayTitle}</h3>
                  <span className="rounded-full border border-[#d4af37]/25 bg-[#111827] px-3 py-1 text-xs font-medium text-[#f9fafb]">score: {result.score}</span>
                </div>
                <p className="mb-3 text-sm leading-6 text-[#cbd5e1]" dangerouslySetInnerHTML={{ __html: result.snippet }} />
                <FeedbackButton query={query} docId={result.doc_id} />
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
