"use client";

import { useState } from "react";

import { uploadDocuments } from "@/lib/api";

export default function UploadPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const submit = async (clear = false) => {
    if (files.length === 0) return;
    setBusy(true);
    setStatus("");
    try {
      const response = await uploadDocuments(files, clear);
      setStatus(`${response.indexed} document(s) indexes. Corpus total: ${response.total_documents}.`);
      setFiles([]);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#d4af37]">Indexation</p>
        <h1 className="mt-1 text-3xl font-black text-[#f9fafb]">Upload de documents</h1>
      </div>
      <label
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          setFiles(Array.from(event.dataTransfer.files));
        }}
        className="flex min-h-64 cursor-pointer flex-col items-center justify-center rounded-xl border border-[rgba(212,175,55,0.18)] bg-[#111827] p-8 text-center shadow-[0_20px_60px_rgba(0,0,0,0.28)] transition hover:-translate-y-1 hover:shadow-[0_24px_70px_rgba(0,0,0,0.34)]"
      >
        <input
          type="file"
          multiple
          accept=".txt,.pdf"
          className="sr-only"
          onChange={(event) => setFiles(Array.from(event.target.files || []))}
        />
        <UploadIcon />
        <p className="mt-4 text-lg font-bold text-[#f9fafb]">Deposez des fichiers .txt ou .pdf</p>
        <p className="mt-2 text-sm text-[#cbd5e1]">{files.length ? files.map((file) => file.name).join(", ") : "Cliquez pour parcourir"}</p>
      </label>
      <div className="flex flex-wrap gap-3">
        <button disabled={busy || !files.length} onClick={() => submit(false)} className="rounded-xl border border-[#d4af37] bg-[#d4af37] px-4 py-2 text-sm font-bold text-[#0b1220] shadow-[0_0_18px_rgba(212,175,55,0.26)] transition hover:bg-[#f4d03f] hover:shadow-[0_0_26px_rgba(244,208,63,0.35)] disabled:opacity-50">
          Ajouter a l'index
        </button>
        <button disabled={busy || !files.length} onClick={() => submit(true)} className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold text-[#cbd5e1] transition hover:border-[#d4af37] hover:text-[#f9fafb] disabled:opacity-50">
          Remplacer le corpus
        </button>
      </div>
      {status && <p className="rounded-xl border border-[rgba(212,175,55,0.2)] bg-[#111827] p-4 text-sm font-semibold text-[#cbd5e1]">{status}</p>}
    </div>
  );
}

function UploadIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-10 w-10 fill-none stroke-[#d4af37] stroke-2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0 4 4m-4-4-4 4" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 16.5V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-2.5" />
    </svg>
  );
}
