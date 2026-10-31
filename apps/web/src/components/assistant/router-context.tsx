"use client";

import Image from "next/image";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { SupportMode } from "@bbcare/core";
import { track } from "@/lib/client/analytics";

/**
 * Where the customer is in the router journey, shared between the page and the floating assistant so
 * the customer never has to choose the router twice. Pages set it on mount and clear it on unmount.
 */
export interface RouterJourney {
  model: { slug: string; name: string; ecr: string } | null;
  mode: SupportMode | null;
  scenario: { key: string; title: string } | null;
  verified: boolean | null;
  step: string | null;
}

interface AssistantState {
  journey: RouterJourney;
  setJourney: (j: Partial<RouterJourney>) => void;
  clearJourney: () => void;
  open: boolean;
  setOpen: (v: boolean) => void;
}

const EMPTY: RouterJourney = { model: null, mode: null, scenario: null, verified: null, step: null };
const Ctx = createContext<AssistantState | null>(null);

export function AssistantProvider({ children }: { children: ReactNode }) {
  const [journey, setState] = useState<RouterJourney>(EMPTY);
  const [open, setOpen] = useState(false);
  const value = useMemo<AssistantState>(() => ({
    journey,
    setJourney: (j) => setState((s) => ({ ...s, ...j })),
    clearJourney: () => setState(EMPTY),
    open,
    setOpen,
  }), [journey, open]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAssistant(): AssistantState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAssistant must be used inside AssistantProvider");
  return v;
}

/** Optional variant for components that may render outside the provider (admin previews, tests). */
export function useOptionalAssistant(): AssistantState | null {
  return useContext(Ctx);
}

/** Rendered by router pages: publishes the selected router, mode and problem while the page is shown. */
export function SetRouterContext({ model, mode, scenario, verified }: { model: RouterJourney["model"]; mode: SupportMode; scenario?: RouterJourney["scenario"]; verified?: boolean }) {
  const a = useOptionalAssistant();
  const key = JSON.stringify({ model, mode, scenario: scenario ?? null, verified: verified ?? null });
  useEffect(() => {
    if (!a) return;
    const parsed = JSON.parse(key) as { model: RouterJourney["model"]; mode: SupportMode; scenario: RouterJourney["scenario"]; verified: boolean | null };
    a.setJourney({ ...parsed, step: null });
    return () => a.clearJourney();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the serialised key captures every input
  }, [key]);
  return null;
}

/** Called by the step-by-step guide so the assistant knows which step the customer is on. */
export function useReportFlowStep(stepKey: string | null) {
  const a = useOptionalAssistant();
  useEffect(() => {
    a?.setJourney({ step: stepKey });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the step key matters
  }, [stepKey]);
}

export function OpenAssistantButton({ label, className, withIcon = true, testId = "open-assistant" }: { label: string; className?: string; withIcon?: boolean; testId?: string }) {
  const a = useOptionalAssistant();
  return (
    <button type="button" onClick={() => { track("assistant_opened", { entry: "inline", has_model: !!a?.journey.model }); a?.setOpen(true); }} data-testid={testId}
      className={className ?? "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark"}>
      {withIcon ? <Image src="/brand/bbcare-logo-icon.png" alt="" width={22} height={22} className="h-[22px] w-[22px] object-contain" /> : null}
      {label}
    </button>
  );
}

export function ChatIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a8 8 0 0 1-8 8H8l-5 3 1.3-4.2A8 8 0 1 1 21 12z" />
      <path d="M8 11h8M8 14h5" />
    </svg>
  );
}
