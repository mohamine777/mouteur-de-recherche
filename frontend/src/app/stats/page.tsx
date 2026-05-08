"use client";

import { type ChangeEvent, useEffect, useState } from "react";

import { fetchDocuments, fetchStats, fetchTermTfidfStats, type CorpusStats, type DocumentRecord, type TermTfidfStats } from "@/lib/api";

export default function StatsPage() {
  const [stats, setStats] = useState<CorpusStats | null>(null);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [term, setTerm] = useState("");
  const [termStats, setTermStats] = useState<TermTfidfStats | null>(null);

  useEffect(() => {
    void fetchStats().then(setStats).catch(() => setStats(null));
    void fetchDocuments()
      .then((docs: DocumentRecord[]) => {
        setDocuments(docs);
        setSelectedDocIds(docs[0] ? [docs[0].doc_id] : []);
      })
      .catch(() => setDocuments([]));
  }, []);

  useEffect(() => {
    const trimmedTerm = term.trim();
    if (!trimmedTerm || selectedDocIds.length === 0) {
      setTermStats(null);
      return;
    }
    void fetchTermTfidfStats(trimmedTerm, selectedDocIds)
      .then(setTermStats)
      .catch(() => setTermStats(null));
  }, [term, selectedDocIds]);

  const onDocumentSelection = (event: ChangeEvent<HTMLSelectElement>) => {
    setSelectedDocIds(Array.from(event.target.selectedOptions, (option) => option.value));
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#d4af37]">Corpus</p>
        <h1 className="mt-1 text-3xl font-black text-[#f9fafb]">Statistiques de l'index</h1>
      </div>
      <section className="grid gap-4 md:grid-cols-3">
        <Stat label="Documents" value={stats?.documents ?? 0} />
        <Stat label="Termes uniques" value={stats?.terms ?? 0} />
        <Stat label="Taille postings" value={stats?.index_size ?? 0} />
      </section>
      <section className="rounded-xl border border-[rgba(212,175,55,0.18)] bg-[#111827] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.28)]">
        <h2 className="font-bold text-[#f9fafb]">Top termes</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-[#cbd5e1]">
              <tr>
                <th className="py-2">Terme</th>
                <th className="py-2">TF</th>
                <th className="py-2">DF</th>
                <th className="py-2">IDF</th>
              </tr>
            </thead>
            <tbody>
              {(stats?.top_terms || []).map((term) => (
                <tr key={term.term} className="border-t border-white/8">
                  <td className="py-3 font-semibold text-[#f9fafb]">{term.term}</td>
                  <td>{term.tf}</td>
                  <td>{term.df}</td>
                  <td>{term.idf.toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="rounded-xl border border-[rgba(212,175,55,0.18)] bg-[#111827] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.28)]">
        <div className="grid gap-4 lg:grid-cols-[minmax(220px,320px)_1fr]">
          <div className="space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-[#cbd5e1]">Terme</span>
              <input
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                placeholder="information"
                className="h-12 w-full rounded-xl border border-white/10 bg-[#0b1220] px-4 text-sm text-[#f9fafb] outline-none placeholder:text-slate-500 focus:border-[#d4af37] focus:ring-4 focus:ring-[#d4af37]/15"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-[#cbd5e1]">Documents a comparer</span>
              <select
                multiple
                value={selectedDocIds}
                onChange={onDocumentSelection}
                className="min-h-48 w-full rounded-xl border border-white/10 bg-[#0b1220] px-3 py-2 text-sm text-[#f9fafb] outline-none focus:border-[#d4af37] focus:ring-4 focus:ring-[#d4af37]/15"
              >
                {documents.map((document) => (
                  <option key={document.doc_id} value={document.doc_id}>
                    {document.metadata?.filename || document.title}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-xs text-[#cbd5e1]">Selection multiple: Ctrl/Cmd + clic.</p>
            </label>
          </div>
          <div className="space-y-5 overflow-hidden">
            <div>
              <h2 className="font-bold text-[#f9fafb]">TF-IDF centre sur un terme</h2>
              <p className="mt-1 text-sm text-[#cbd5e1]">TF(document), IDF(corpus) et TF-IDF(document) pour le terme saisi.</p>
            </div>
            {!termStats ? (
              <p className="rounded-xl border border-white/8 bg-[#0b1220] p-4 text-sm text-[#cbd5e1]">Saisissez un terme et selectionnez au moins un document.</p>
            ) : (
              <div className="overflow-hidden rounded-xl border border-white/8">
                <div className="bg-[#0b1220] px-4 py-3">
                  <p className="font-semibold text-[#f9fafb]">Terme: {termStats.term}</p>
                  <p className="mt-1 text-xs text-[#cbd5e1]">IDF(corpus): {termStats.idf.toFixed(4)}</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-[#111827] text-[#cbd5e1]">
                      <tr>
                        <th className="px-4 py-2">Document</th>
                        <th className="px-4 py-2">TF</th>
                        <th className="px-4 py-2">IDF</th>
                        <th className="px-4 py-2">TF-IDF</th>
                      </tr>
                    </thead>
                    <tbody>
                      {termStats.documents.map((row) => {
                        const document = documents.find((item) => item.doc_id === row.doc_id);
                        return (
                          <tr key={row.doc_id} className="border-t border-white/8">
                            <td className="px-4 py-3">
                              <div className="font-semibold text-[#f9fafb]">{document?.metadata?.filename || document?.title || row.doc_id}</div>
                              <div className="text-xs text-[#cbd5e1]">{row.doc_id}</div>
                            </td>
                            <td className="px-4 py-3 text-[#cbd5e1]">{row.tf}</td>
                            <td className="px-4 py-3 text-[#cbd5e1]">{termStats.idf.toFixed(4)}</td>
                            <td className="px-4 py-3 text-[#cbd5e1]">{row.tfidf.toFixed(4)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-[rgba(212,175,55,0.18)] bg-[#111827] p-5 shadow-[0_16px_42px_rgba(0,0,0,0.24)]">
      <p className="text-sm font-semibold text-[#cbd5e1]">{label}</p>
      <p className="mt-2 text-3xl font-black text-[#f9fafb]">{value}</p>
    </div>
  );
}
