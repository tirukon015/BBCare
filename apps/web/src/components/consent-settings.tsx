"use client";

import { useState, useSyncExternalStore } from "react";
import { readConsent, saveConsent, subscribeConsent } from "@/lib/client/consent";

export function ConsentSettings({ labels }: { labels: { accept: string; reject: string; saved: string } }) {
  const choice = useSyncExternalStore(subscribeConsent, readConsent, () => null);
  const [saved, setSaved] = useState(false);
  const set = async (analytics: boolean) => {
    await saveConsent(analytics);
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
