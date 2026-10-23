"use client";

import { useEffect, useState } from "react";
import { readConsent, saveConsent, type ConsentChoice } from "@/lib/client/consent";

export function ConsentSettings({ labels }: { labels: { accept: string; reject: string; saved: string } }) {
  const [choice, setChoice] = useState<ConsentChoice | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => setChoice(readConsent()), []);
  const set = async (analytics: boolean) => {
    await saveConsent(analytics);
    setChoice(analytics ? "analytics" : "essential");
    setSaved(true);
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button type="button" aria-pressed={choice === "essential"} onClick={() => set(false)} className={`min-h-11 rounded-lg border px-4 text-sm font-semibold ${choice === "essential" ? "border-olive bg-olive-soft" : "border-line bg-white"}`}>{labels.reject}</button>
        <button type="button" aria-pressed={choice === "analytics"} onClick={() => set(true)} className={`min-h-11 rounded-lg border px-4 text-sm font-semibold ${choice === "analytics" ? "border-olive bg-olive-soft" : "border-line bg-white"}`}>{labels.accept}</button>
      </div>
      {saved ? <p role="status" className="text-sm text-ok">{labels.saved}</p> : null}
    </div>
  );
}
