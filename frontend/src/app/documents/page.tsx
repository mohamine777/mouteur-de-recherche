"use client";

import { useEffect, useState } from "react";
import { deleteDocument, fetchDocuments } from "@/lib/api";

type DocumentItem = {
  doc_id: string;
  filename: string;
};

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadDocuments = async () => {
    try {
      setError(null);
      const docs = await fetchDocuments();
      setDocuments(docs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load documents");
    }
  };

  useEffect(() => {
    loadDocuments();
  }, []);

  const onDelete = async (docId: string) => {
    try {
      setError(null);
      await deleteDocument(docId);
      await loadDocuments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete document");
    }
  };

  return (
    <section className="rounded-2xl border border-sand bg-white p-4 shadow-sm">
      <h2 className="mb-4 text-lg font-bold text-black">Indexed Documents</h2>
      {error && <p className="mb-3 rounded-xl border border-sand bg-sand p-3 text-sm text-black">{error}</p>}
      <div className="space-y-2">
        {documents.length === 0 ? (
          <p className="text-sm text-black/70">No documents indexed.</p>
        ) : (
          documents.map((doc) => (
            <div key={doc.doc_id} className="flex items-center justify-between rounded-lg border border-sand p-3">
              <p className="font-medium">{doc.filename}</p>
              <button
                onClick={() => onDelete(doc.doc_id)}
                className="rounded-lg bg-black px-3 py-1 text-sm text-white transition hover:bg-gold hover:text-black"
              >
                Delete
              </button>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
