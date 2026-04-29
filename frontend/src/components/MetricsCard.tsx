import { useEffect } from "react";

type Props = {
  feedback_count: number;
  currentMode: string;
  compareMode: boolean;
  compareAgainst?: string;
};

export default function MetricsCard({ feedback_count, currentMode, compareMode, compareAgainst }: Props) {
  const modeLabel = compareMode ? `Compare: ${currentMode}${compareAgainst ? ` vs ${compareAgainst}` : ""}` : `Selected model: ${currentMode}`;

  useEffect(() => {
    console.log("[FRONTEND DEBUG] metrics summary:", modeLabel);
  }, [modeLabel]);

  return (
    <section className="rounded-[2rem] border border-black/10 bg-white/85 p-6 shadow-[0_18px_50px_rgba(17,17,17,0.06)] md:p-7">
      <div className="mb-5">
        <h2 className="text-xl font-bold text-black">Search Configuration</h2>
        <p className="mt-1 text-sm text-black/55">Upload first, then select the model and search style you want to use.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Metric label="Active Mode" value={modeLabel} />
        <Metric label="User Judgments" value={String(feedback_count)} />
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex-1 rounded-2xl border border-gold/20 bg-white px-4 py-4 shadow-[0_1px_0_rgba(212,175,55,0.12)]">
      <p className="text-sm font-medium text-black/55">{label}</p>
      <p className="mt-1 text-xl font-bold text-black">{value}</p>
    </div>
  );
}
