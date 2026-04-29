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
      <button onClick={() => send(true)} className="rounded-lg bg-gold px-3 py-1 text-sm font-medium text-black">
        Relevant
      </button>
      <button onClick={() => send(false)} className="rounded-lg bg-black px-3 py-1 text-sm text-white">
        Not Relevant
      </button>
    </div>
  );
}
