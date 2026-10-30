"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { readConsent, subscribeConsent } from "@/lib/client/consent";
import type { Dictionary } from "@/i18n";
import { track } from "@/lib/client/analytics";
import { SupportChat } from "../support-chat";
import { ChatIcon, useAssistant } from "./router-context";

interface Props {
  locale: "en" | "ms";
  t: Dictionary;
  aiEnabled: boolean;
  mock: boolean;
  contacts: { whatsapp?: string; email?: string };
}

/**
 * Global floating assistant: a fixed launcher at the bottom right of every customer page and a panel
 * that opens in place. It renders the same SupportChat component, API and safety rules as the full
 * support page; only the entry point differs. Router context comes from the page being viewed.
 */
export function FloatingAssistant({ locale, t, aiEnabled, mock, contacts }: Props) {
  const { open, setOpen, journey } = useAssistant();
  const [minimised, setMinimised] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const c = t.chat;
  // While the privacy banner is on screen the launcher stays out of its way: it must never cover the consent buttons.
  const consent = useSyncExternalStore(subscribeConsent, readConsent, () => "server" as const);
  const bannerShown = consent === null;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    // Focus the panel heading when it opens so keyboard and screen-reader users land inside it.
    panelRef.current?.querySelector<HTMLElement>("h2")?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  function launch() {
    setMinimised(false);
    setOpen(true);
    track("assistant_opened", { entry: "launcher", has_model: !!journey.model });
  }

  const contextLine = journey.model
    ? `${journey.model.name} · ${t.router.ecr} ${journey.model.ecr} · ${c.scope}${journey.scenario ? ` · ${journey.scenario.title}` : ""}`
    : null;

  return (
    <>
      {!open && !bannerShown ? (
        <button type="button" onClick={launch} aria-label={c.open} data-testid="assistant-launcher"
          className="fixed bottom-4 right-4 z-40 inline-flex min-h-14 items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-white shadow-[var(--shadow-panel)] hover:bg-primary-dark focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary-dark sm:bottom-6 sm:right-6">
          <ChatIcon className="h-6 w-6" />
          <span className="hidden sm:inline">{c.title}</span>
        </button>
      ) : null}

      {open ? (
        <div ref={panelRef} role="dialog" aria-modal="false" aria-labelledby="assistant-title" data-testid="assistant-panel" data-minimised={minimised ? "1" : "0"}
          className={`fixed inset-x-0 bottom-0 z-50 flex flex-col overflow-hidden rounded-t-2xl border border-line bg-white shadow-[var(--shadow-panel)] sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-[26rem] sm:rounded-2xl ${minimised ? "max-h-16" : "max-h-[88dvh] sm:max-h-[min(44rem,calc(100dvh-3rem))]"}`}>
          <div className="flex items-center gap-3 border-b border-line bg-primary px-4 py-3 text-white">
            <ChatIcon className="h-5 w-5 shrink-0" />
            <div className="min-w-0 flex-1">
              <h2 id="assistant-title" tabIndex={-1} className="truncate text-sm font-semibold outline-none">{c.title}</h2>
              {!minimised ? <p className="truncate text-xs text-white/85">{contextLine ?? c.scope}</p> : null}
            </div>
            <button type="button" onClick={() => setMinimised((m) => !m)} aria-label={c.minimise} aria-pressed={minimised} data-testid="assistant-minimise"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/15">
              <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d={minimised ? "M6 15l6-6 6 6" : "M5 12h14"} /></svg>
            </button>
            <button type="button" onClick={() => setOpen(false)} aria-label={c.close} data-testid="assistant-close"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/15">
              <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>
          {!minimised ? (
            <div className="flex-1 overflow-y-auto p-4" data-testid="assistant-body">
              <p className="mb-3 rounded-lg border border-line bg-sand px-3 py-2 text-xs text-ink-soft" role="note" data-testid="assistant-disclosure">
                {c.disclosure}{!aiEnabled ? ` ${c.searchOnly}` : ""}
              </p>
              {journey.model ? (
                <p className="mb-3 text-xs text-ink-soft" data-testid="assistant-context">
                  <span className="text-muted">{c.context}: </span>
                  <strong>{journey.model.name}</strong> · <span className="font-mono">{t.router.ecr} {journey.model.ecr}</span> · {c.scope}
                  {journey.scenario ? <> · {journey.scenario.title}</> : null}
                  {journey.step ? <> · <span className="font-mono">{journey.step}</span></> : null}
                </p>
              ) : (
                <p className="mb-3 rounded-lg border border-primary-soft bg-primary-soft px-3 py-2 text-sm text-primary-dark" data-testid="assistant-no-router">
                  {c.noRouter}{" "}
                  <Link href={`/${locale}/routers`} className="font-semibold underline" onClick={() => setOpen(false)}>{c.chooseRouter}</Link>
                </p>
              )}
              <SupportChat
                key={journey.model?.slug ?? "none"}
                locale={locale} t={t} aiEnabled={aiEnabled} mock={mock} contacts={contacts}
                initialModel={journey.model ? { slug: journey.model.slug, name: journey.model.name } : null}
                journey={journey.mode ? { mode: journey.mode, scenario: journey.scenario?.key ?? null, step: journey.step } : null}
                startEscalated={false} compact
              />
              <p className="mt-3 text-right text-xs">
                <Link href={`/${locale}/support${journey.model ? `?model=${journey.model.slug}` : ""}`} className="text-primary underline" onClick={() => setOpen(false)}>{c.fullPage}</Link>
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
