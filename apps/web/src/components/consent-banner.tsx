"use client";

import { useEffect, useState } from "react";
import type { Dictionary } from "@/i18n";
import { readConsent, saveConsent } from "@/lib/client/consent";

export function ConsentBanner({ t }: { t: Dictionary["consent"] }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    setVisible(readConsent() === null);
  }, []);
  if (!visible) return null;
  const choose = async (analytics: boolean) => {
    await saveConsent(analytics);
    setVisible(false);
  };
  return (
    <div role="region" aria-label={t.title} className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white p-4 shadow-[0_-2px_8px_rgba(0,0,0,0.06)]">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm">
          <p className="font-semibold">{t.title}</p>
          <p className="text-ink-soft">{t.body}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button type="button" onClick={() => choose(false)} className="min-h-11 rounded-lg border border-line bg-white px-4 text-sm font-semibold hover:bg-sand" data-testid="consent-reject">
            {t.reject}
          </button>
          <button type="button" onClick={() => choose(true)} className="min-h-11 rounded-lg bg-olive px-4 text-sm font-semibold text-white hover:bg-olive-dark" data-testid="consent-accept">
            {t.accept}
          </button>
        </div>
      </div>
    </div>
  );
}
