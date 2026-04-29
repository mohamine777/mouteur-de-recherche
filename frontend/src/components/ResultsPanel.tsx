import FeedbackButton from "./FeedbackButton";
import type { SearchResult } from "@/lib/api";

type Props = {
  title: string;
  query: string;
  results: SearchResult[];
};

export default function ResultsPanel({ title, query, results }: Props) {
  return (
    <section className="rounded-[2rem] border border-black/10 bg-white/85 p-6 shadow-[0_18px_50px_rgba(17,17,17,0.06)] md:p-7">
      <h2 className="mb-5 text-xl font-bold text-black">{title}</h2>
      <div className="space-y-4">
        {results.length === 0 ? (
          <p className="text-sm text-black/35">No results yet.</p>
        ) : (
          results.map((result) => (
            <article key={result.doc_id} className="rounded-2xl border border-gold/15 bg-white p-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <h3 className="font-semibold">{result.metadata.filename || result.doc_id}</h3>
                <span className="rounded-full bg-[#fff7df] px-3 py-1 text-xs font-medium text-black">score: {result.score}</span>
              </div>
              <p className="mb-3 text-sm leading-6 text-black/75" dangerouslySetInnerHTML={{ __html: result.snippet }} />
              <FeedbackButton query={query} docId={result.doc_id} />
            </article>
          ))
        )}
      </div>
    </section>
  );
}
