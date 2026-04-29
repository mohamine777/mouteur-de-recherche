const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

export type SearchModel = "boolean_exact" | "extended_boolean" | "fuzzy_zadeh" | "fuzzy_lukasiewicz" | "vsm";
export type SearchMeasure = "cosine" | "inner_product" | "euclidean_distance" | "dice" | "jaccard" | "overlap_coefficient";
export type LogicalOperator = "and" | "or" | "not";

export type SearchResult = {
  doc_id: string;
  score: number;
  metadata: Record<string, string>;
  snippet: string;
};

export type CompareModelsResponse = {
  best_model: "vsm" | "ebm" | "Tie";
  reason: string;
  metrics: {
    vsm: {
      precision: number;
      recall: number;
      f1: number;
      map: number;
      ndcg: number;
    };
    ebm: {
      precision: number;
      recall: number;
      f1: number;
      map: number;
      ndcg: number;
    };
  };
};

export type SearchResponsePayload = {
  query: string;
  model: SearchModel;
  measure: SearchMeasure;
  tf_mode?: "normalized" | "raw";
  p?: number;
  operator?: LogicalOperator;
  top_k?: number;
};

export type CompareResponse = {
  model_a: {
    model: SearchModel;
    measure: SearchMeasure;
    results: SearchResult[];
  };
  model_b: {
    model: SearchModel;
    measure: SearchMeasure;
    results: SearchResult[];
  };
};

async function request(path: string, init?: RequestInit) {
  try {
    const res = await fetch(`${API_BASE}${path}`, init);
    if (!res.ok) {
      let detail = `${res.status} ${res.statusText}`;
      try {
        const body = await res.json();
        detail = body?.error || body?.detail || detail;
      } catch {
        // Ignore non-JSON error bodies.
      }
      throw new Error(detail);
    }
    return res;
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes("Failed to fetch") || error.message.includes("NetworkError")) {
        throw new Error(`Cannot reach backend at ${API_BASE}: ${error.message}`);
      }
      throw error;
    }
    throw new Error(`Cannot reach backend at ${API_BASE}`);
  }
}

export async function uploadDocument(file: File) {
  const formData = new FormData();
  formData.append("file", file);

  console.log("UPLOAD DEBUG:", { filename: file.name, request_sent: true });

  const res = await fetch(`${API_BASE}/documents/upload`, {
    method: "POST",
    body: formData,
  });

  const body = await res.json().catch(() => null);
  console.log("UPLOAD DEBUG:", {
    filename: file.name,
    response_status: res.status,
    response_body: body,
  });

  if (!res.ok) {
    const message = body?.error || body?.detail || `${res.status} ${res.statusText}`;
    throw new Error(message);
  }

  return body;
}

export async function searchVSM(query: string, top_k = 10): Promise<SearchResult[]> {
  const res = await request("/search/vsm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, top_k }),
  });

  return res.json();
}

export async function searchBoolean(
  query: string,
  operator: "and" | "or" | "not" = "or",
  top_k = 10,
): Promise<SearchResult[]> {
  const res = await request("/search/boolean", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, operator, top_k }),
  });

  return res.json();
}

export async function searchDocuments(payload: SearchResponsePayload): Promise<SearchResult[]> {
  const res = await request("/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  return res.json();
}

export async function submitFeedback(query: string, doc_id: string, relevant: boolean) {
  await request("/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, doc_id, relevant }),
  });
}

export async function fetchMetrics() {
  const res = await request("/metrics");
  return res.json();
}

export async function fetchDocuments() {
  const res = await request("/documents");
  return res.json();
}

export async function deleteDocument(doc_id: string) {
  await request(`/documents/${doc_id}`, {
    method: "DELETE",
  });
}

export async function compareModels(query: string): Promise<CompareModelsResponse> {
  const params = new URLSearchParams({ query });
  const res = await request(`/compare-models?${params.toString()}`);
  return res.json();
}

export async function compareDocuments(payload: {
  query: string;
  model_a: SearchModel;
  measure_a: SearchMeasure;
  tf_mode_a?: "normalized" | "raw";
  p_a?: number;
  operator_a?: LogicalOperator;
  model_b: SearchModel;
  measure_b: SearchMeasure;
  tf_mode_b?: "normalized" | "raw";
  p_b?: number;
  operator_b?: LogicalOperator;
  top_k?: number;
}): Promise<CompareResponse> {
  const res = await request("/compare", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  return res.json();
}
