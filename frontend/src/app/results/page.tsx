import { Suspense } from "react";

import ResultsClient from "./ResultsClient";

export default function ResultsPage() {
  return (
    <Suspense fallback={<p className="rounded-lg bg-blue-50 p-4 text-sm font-semibold text-blue-700">Chargement...</p>}>
      <ResultsClient />
    </Suspense>
  );
}
