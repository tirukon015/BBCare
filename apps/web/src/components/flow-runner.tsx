"use client";

import Link from "next/link";
import { useState } from "react";
import type { Flow } from "@/modules/knowledge/service";

interface Labels { back: string; restart: string; resolvedHint: string; escalate: string; contact: string; readMore: string }

export function FlowRunner({ flow, locale, labels }: { flow: Flow; locale: "en" | "ms"; labels: Labels }) {
  const start = flow.steps.find((s) => s.isStart) ?? flow.steps[0];
  const [history, setHistory] = useState<string[]>(start ? [start.key] : []);
  const [outcome, setOutcome] = useState<null | "resolved" | "resolved_hint" | "escalate">(null);
  const current = flow.steps.find((s) => s.key === history.at(-1));
  if (!current) return null;
  const choose = (next?: string | null, out?: "resolved" | "resolved_hint" | "escalate" | null) => {
    if (out) setOutcome(out);
    else if (next) setHistory((h) => [...h, next]);
  };
  const reset = () => { setHistory(start ? [start.key] : []); setOutcome(null); };
  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-white p-5" aria-live="polite">
      {outcome ? (
        <div className="space-y-4">
          <p className="text-lg">{outcome === "escalate" ? labels.escalate : labels.resolvedHint}</p>
          <div className="flex flex-wrap gap-2">
            {outcome === "escalate" ? (
              <Link href={`/${locale}/support?escalate=1`} className="inline-flex min-h-11 items-center rounded-lg bg-olive px-4 text-sm font-semibold text-white hover:bg-olive-dark" data-track="flow.escalate">{labels.contact}</Link>
            ) : null}
            <button type="button" onClick={reset} className="min-h-11 rounded-lg border border-line px-4 text-sm hover:bg-sand">{labels.restart}</button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-lg font-medium">{locale === "ms" ? current.promptMs : current.promptEn}</p>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {current.options.map((o) => (
              <button key={o.key} type="button" onClick={() => choose(o.next, o.outcome)} className="min-h-11 rounded-lg border border-line bg-white px-4 text-left text-sm font-medium hover:border-olive hover:bg-olive-soft" data-track="flow.option">
                {locale === "ms" ? o.label_ms : o.label_en}
              </button>
            ))}
          </div>
          {current.articleSlug ? <Link href={`/${locale}/articles/${current.articleSlug}`} className="text-sm text-olive underline">{labels.readMore}</Link> : null}
          {history.length > 1 ? (
            <button type="button" onClick={() => setHistory((h) => h.slice(0, -1))} className="min-h-11 text-sm text-ink-soft underline">{labels.back}</button>
          ) : null}
        </div>
      )}
    </div>
  );
}
