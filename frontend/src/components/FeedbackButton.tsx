"use client";

import { submitFeedback } from "@/lib/api";

type Props = {
  query: string;
  docId: string;
};

export default function FeedbackButton({ query, docId }: Props) {
  const send = async (relevant: boolean) => {
    await submitFeedback(query, docId, relevant);
  };

  return (
    <div className="flex gap-2">
      <button onClick={() => send(true)} className="rounded-full border border-[#d4af37] bg-[#d4af37] px-3 py-1 text-sm font-medium text-[#0b1220] transition hover:bg-[#f4d03f] hover:shadow-[0_0_18px_rgba(212,175,55,0.22)]">
        Relevant
      </button>
      <button onClick={() => send(false)} className="rounded-full border border-white/10 bg-transparent px-3 py-1 text-sm font-medium text-[#cbd5e1] transition hover:border-[#d4af37] hover:text-[#f9fafb]">
        Not Relevant
      </button>
    </div>
  );
}
