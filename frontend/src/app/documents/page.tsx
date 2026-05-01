"use client";

import { useEffect, useMemo, useState } from "react";

import { deleteDocument, fetchDocuments, fetchDocument, reindexDocument, type DocumentRecord } from "@/lib/api";

type SortKey = "name" | "date" | "size" | "status";

type DocumentDetails = {
  text?: string;
  metadata?: Record<string, string>;
};

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [activeDocument, setActiveDocument] = useState<DocumentRecord | null>(null);
  const [details, setDetails] = useState<DocumentDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  const loadDocuments = async () => {
    try {
      setLoading(true);
      setError(null);
      const docs = (await fetchDocuments()) as DocumentRecord[];
      setDocuments(docs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load documents");
    } finally {
      setLoading(false);
    }
  };

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    window.setTimeout(() => setToast(null), 2500);
  };

  useEffect(() => {
    loadDocuments();
  }, []);

  const filteredDocuments = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const list = documents.filter((document) => {
      if (!normalized) return true;
      const haystack = [
        document.title,
        document.metadata?.filename,
        document.metadata?.extension,
        document.upload_date,
        document.preview_snippet,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalized);
    });

    return [...list].sort((left, right) => {
      if (sortKey === "name") return left.title.localeCompare(right.title);
      if (sortKey === "size") return (right.size || 0) - (left.size || 0);
      if (sortKey === "status") return Number(right.indexed) - Number(left.indexed) || left.title.localeCompare(right.title);
      return String(right.upload_date || "").localeCompare(String(left.upload_date || ""));
    });
  }, [documents, query, sortKey]);

  const openDocument = async (document: DocumentRecord) => {
    try {
      setActionBusy(document.doc_id);
      setError(null);
      setActiveDocument(document);
      const fullDocument = await fetchDocument(document.doc_id);
      setDetails(fullDocument);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load document details");
    } finally {
      setActionBusy(null);
    }
  };

  const onDelete = async (docId: string) => {
    const confirmed = window.confirm("Are you sure you want to delete this document?");
    if (!confirmed) return;

    try {
      setActionBusy(docId);
      setError(null);
      await deleteDocument(docId);
      setDocuments((current) => current.filter((document) => document.doc_id !== docId));
      if (activeDocument?.doc_id === docId) {
        setActiveDocument(null);
        setDetails(null);
      }
      showToast("success", "Document deleted successfully.");
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Failed to delete document");
      setError(err instanceof Error ? err.message : "Failed to delete document");
    } finally {
      setActionBusy(null);
    }
  };

  const onReindex = async (docId: string) => {
    try {
      setActionBusy(docId);
      setError(null);
      await reindexDocument(docId);
      await loadDocuments();
      if (activeDocument?.doc_id === docId) {
        setActiveDocument(null);
        setDetails(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to re-index document");
    } finally {
      setActionBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      {toast && (
        <div
          className={
            toast.type === "success"
              ? "rounded-xl border border-[#d4af37]/20 bg-[#111827] px-4 py-3 text-sm font-semibold text-[#f9fafb] shadow-[0_16px_42px_rgba(0,0,0,0.24)]"
              : "rounded-xl border border-red-400/20 bg-red-950/30 px-4 py-3 text-sm font-semibold text-red-200 shadow-[0_16px_42px_rgba(0,0,0,0.24)]"
          }
        >
          {toast.message}
        </div>
      )}
      <section className="rounded-2xl bg-[linear-gradient(135deg,rgba(11,18,32,0.96),rgba(17,24,39,0.9))] px-6 py-7 shadow-[0_24px_70px_rgba(0,0,0,0.3)] md:px-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.22em] text-[#d4af37]">Corpus</p>
            <h1 className="mt-2 text-3xl font-black text-[#f9fafb]">Documents</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#cbd5e1]">
              Browse the indexed corpus, preview content, and manage documents without leaving the UI.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Documents" value={filteredDocuments.length} />
            <Stat label="Indexed" value={filteredDocuments.filter((document) => document.indexed).length} />
            <Stat label="Total size" value={filteredDocuments.reduce((sum, document) => sum + (document.size || 0), 0)} suffix=" bytes" />
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-[rgba(212,175,55,0.18)] bg-[#111827] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.28)]">
        <div className="grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-center">
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-[#cbd5e1]">Search filter</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filename, extension, snippet..."
              className="h-12 w-full rounded-xl border border-white/10 bg-[#0b1220] px-4 text-sm text-[#f9fafb] outline-none placeholder:text-slate-500 focus:border-[#d4af37] focus:ring-4 focus:ring-[#d4af37]/15"
            />
          </label>
          <label className="block min-w-48">
            <span className="mb-2 block text-sm font-semibold text-[#cbd5e1]">Sort by</span>
            <select
              value={sortKey}
              onChange={(event) => setSortKey(event.target.value as SortKey)}
              className="h-12 w-full rounded-xl border border-white/10 bg-[#0b1220] px-4 text-sm text-[#f9fafb] outline-none focus:border-[#d4af37] focus:ring-4 focus:ring-[#d4af37]/15"
            >
              <option value="date">Upload date</option>
              <option value="name">Filename</option>
              <option value="size">Size</option>
              <option value="status">Indexed status</option>
            </select>
          </label>
          <div className="flex items-end justify-end">
            <button
              type="button"
              onClick={loadDocuments}
              className="h-12 rounded-xl border border-[#d4af37] bg-[#d4af37] px-4 text-sm font-semibold text-[#0b1220] shadow-[0_0_18px_rgba(212,175,55,0.25)] transition hover:bg-[#f4d03f] hover:shadow-[0_0_26px_rgba(244,208,63,0.35)]"
            >
              Refresh
            </button>
          </div>
        </div>

        {error && <p className="mt-4 rounded-xl border border-red-400/20 bg-red-950/30 p-3 text-sm text-red-200">{error}</p>}
        {loading ? (
          <p className="mt-4 text-sm text-[#cbd5e1]">Loading documents...</p>
        ) : (
          <div className="mt-5 overflow-hidden rounded-xl border border-white/8">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-white/8 text-left text-sm">
                <thead className="bg-[#0b1220] text-[#cbd5e1]">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Filename</th>
                    <th className="px-4 py-3 font-semibold">Extension</th>
                    <th className="px-4 py-3 font-semibold">Size</th>
                    <th className="px-4 py-3 font-semibold">Upload date</th>
                    <th className="px-4 py-3 font-semibold">Preview snippet</th>
                    <th className="px-4 py-3 font-semibold">Indexed</th>
                    <th className="px-4 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/8 bg-[#111827] text-[#f9fafb]">
                  {filteredDocuments.length === 0 ? (
                    <tr>
                      <td className="px-4 py-6 text-[#cbd5e1]" colSpan={7}>
                        No documents match the current filter.
                      </td>
                    </tr>
                  ) : (
                    filteredDocuments.map((document) => (
                      <tr key={document.doc_id} className="transition hover:bg-white/5">
                        <td className="px-4 py-4">
                          <div className="font-semibold text-[#f9fafb]">{document.metadata?.filename || document.title}</div>
                          <div className="text-xs text-[#cbd5e1]">{document.doc_id}</div>
                        </td>
                        <td className="px-4 py-4 text-[#cbd5e1]">{document.metadata?.extension || "-"}</td>
                        <td className="px-4 py-4 text-[#cbd5e1]">{formatBytes(document.size)}</td>
                        <td className="px-4 py-4 text-[#cbd5e1]">{formatDate(document.upload_date)}</td>
                        <td className="px-4 py-4 text-[#cbd5e1]">
                          <p className="max-w-xl truncate">{document.preview_snippet || "No preview available."}</p>
                        </td>
                        <td className="px-4 py-4">
                          <span className="rounded-full border border-[#d4af37]/25 bg-[#0b1220] px-3 py-1 text-xs font-semibold text-[#f9fafb]">
                            {document.indexed ? "Indexed" : "Pending"}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => openDocument(document)}
                              disabled={actionBusy === document.doc_id}
                              className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-[#cbd5e1] transition hover:border-[#d4af37] hover:text-white disabled:opacity-50"
                            >
                              View
                            </button>
                            <button
                              type="button"
                              onClick={() => onReindex(document.doc_id)}
                              disabled={actionBusy === document.doc_id}
                              className="rounded-full border border-[#d4af37] bg-[#d4af37] px-3 py-1 text-xs font-semibold text-[#0b1220] shadow-[0_0_16px_rgba(212,175,55,0.2)] transition hover:bg-[#f4d03f] disabled:opacity-50"
                            >
                              Re-index
                            </button>
                            <button
                              type="button"
                              onClick={() => onDelete(document.doc_id)}
                              disabled={actionBusy === document.doc_id}
                              className="rounded-xl border border-red-400/20 bg-red-950/40 px-3 py-1 text-xs font-semibold text-white transition hover:bg-red-900 disabled:opacity-50"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {activeDocument && (
        <section className="rounded-xl border border-[rgba(212,175,55,0.18)] bg-[#111827] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.28)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#d4af37]">View</p>
              <h2 className="mt-1 text-2xl font-black text-[#f9fafb]">{activeDocument.metadata?.filename || activeDocument.title}</h2>
              <p className="mt-2 text-sm text-[#cbd5e1]">{details?.metadata?.path || activeDocument.metadata?.path || activeDocument.doc_id}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setActiveDocument(null);
                setDetails(null);
              }}
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-[#cbd5e1] transition hover:border-[#d4af37] hover:text-white"
            >
              Close
            </button>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <Info label="Filename" value={activeDocument.metadata?.filename || "-"} />
            <Info label="Extension" value={activeDocument.metadata?.extension || "-"} />
            <Info label="Size" value={formatBytes(activeDocument.size)} />
            <Info label="Upload date" value={formatDate(activeDocument.upload_date)} />
          </div>
          <div className="mt-5 rounded-xl border border-white/8 bg-[#0b1220] p-4">
            <p className="text-sm font-semibold text-[#cbd5e1]">Preview snippet</p>
            <p className="mt-2 text-sm leading-6 text-[#f9fafb]">{details?.text ? details.text.slice(0, 700) : activeDocument.preview_snippet || "No preview available."}</p>
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value, suffix = "" }: { label: string; value: number; suffix?: string }) {
  return (
    <div className="rounded-xl border border-[rgba(212,175,55,0.18)] bg-[#111827] px-4 py-3 shadow-[0_16px_42px_rgba(0,0,0,0.24)]">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#cbd5e1]">{label}</p>
      <p className="mt-2 text-2xl font-black text-[#f9fafb]">
        {value}
        {suffix}
      </p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/8 bg-[#0b1220] p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#cbd5e1]">{label}</p>
      <p className="mt-2 text-sm font-medium text-[#f9fafb]">{value}</p>
    </div>
  );
}

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[index]}`;
}

function formatDate(value: string) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}
