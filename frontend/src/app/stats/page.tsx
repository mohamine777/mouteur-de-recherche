"use client";

import { useEffect, useState } from "react";

import { fetchStats, type CorpusStats } from "@/lib/api";

export default function StatsPage() {
  const [stats, setStats] = useState<CorpusStats | null>(null);

  useEffect(() => {
    void fetchStats().then(setStats).catch(() => setStats(null));
  }, []);

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
