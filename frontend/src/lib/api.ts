const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

export type SearchModel =
  | "boolean"
  | "vsm"
  | "extended_boolean"
  | "fuzzy"
  | "zadeh"
  | "lukasiewicz"
  | "probabilistic"
  | "bir";
export type VsmMeasure = "cosine" | "product" | "euclidean" | "dice" | "jaccard" | "overlap";
export type LogicalOperator = "and" | "or" | "not";

export type SearchResult = {
  doc_id: string;
  title: string;
  score: number;
  snippet: string;
  model: SearchModel;
  metadata: Record<string, string>;
};

export type CorpusStats = {
  documents: number;
  terms: number;
  index_size: number;
  top_terms: Array<{ term: string; tf: number; df: number; idf: number }>;
};

export type DocumentRecord = {
  doc_id: string;
  title: string;
  metadata: Record<string, string>;
  token_count: number;
  indexed: boolean;
  size: number;
  upload_date: string;
  preview_snippet: string;
};

async function request(path: string, init?: RequestInit) {
  const response = await fetch(`${API_BASE}${path}`, init);
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.detail || body?.error || `${response.status} ${response.statusText}`);
  }
  return response;
}

export async function searchDocuments(payload: {
  query: string;
  model: SearchModel;
  measure?: VsmMeasure;
  operator?: LogicalOperator;
  p?: number;
  top_k?: number;
}): Promise<SearchResult[]> {
  const response = await request("/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return response.json();
}

export async function uploadDocuments(files: File[], clear = false) {
  const formData = new FormData();
  files.forEach((file) => formData.append("files", file));
  const response = await request(`/index?clear=${clear ? "true" : "false"}`, {
    method: "POST",
    body: formData,
  });
  return response.json();
}

export async function uploadDocument(file: File) {
  return uploadDocuments([file], false);
}

export async function fetchStats(): Promise<CorpusStats> {
  const response = await request("/stats", { cache: "no-store" });
  return response.json();
}

export async function fetchSuggestions(query: string): Promise<string[]> {
  const params = new URLSearchParams({ q: query, limit: "8" });
  const response = await request(`/suggest?${params.toString()}`, { cache: "no-store" });
  return response.json();
}

export async function fetchDocuments() {
  const response = await request("/documents", { cache: "no-store" });
  return response.json();
}

export async function fetchDocument(docId: string) {
  const response = await request(`/documents/${docId}`, { cache: "no-store" });
  return response.json();
}

export async function deleteDocument(docId: string) {
  const response = await request(`/documents/${docId}`, { method: "DELETE" });
  return response.json();
}

export async function reindexDocument(docId: string) {
  const response = await request(`/documents/${docId}/reindex`, { method: "POST" });
  return response.json();
}

export async function submitFeedback(_query: string, _docId: string, _relevant: boolean) {
  return { success: true };
}
