"use client";

import { useState } from "react";
import { track } from "@/lib/client/analytics";

export function ArticleFeedback({ articleId, labels }: { articleId: string; labels: { helpful: string; yes: string; no: string; thanks: string } }) {
  const [sent, setSent] = useState(false);
  const send = async (rating: 1 | -1) => {
    setSent(true);
    track("article_feedback", { article_id: articleId, rating });
    await fetch("/api/public/feedback", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ articleId, rating }) }).catch(() => {});
  };
  if (sent) return <p role="status" className="text-sm text-ok">{labels.thanks}</p>;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-sm font-medium">{labels.helpful}</span>
      <button type="button" onClick={() => send(1)} className="min-h-11 rounded-lg border border-line bg-white px-4 text-sm hover:bg-sand" data-testid="feedback-yes">{labels.yes}</button>
      <button type="button" onClick={() => send(-1)} className="min-h-11 rounded-lg border border-line bg-white px-4 text-sm hover:bg-sand" data-testid="feedback-no">{labels.no}</button>
    </div>
  );
}
