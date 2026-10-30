"use client";

import { useState, type ReactNode } from "react";
import type { Dictionary } from "@/i18n";
import type { RouterFlow } from "@/modules/router/service";
import { track } from "@/lib/client/analytics";

/**
 * Step-by-step runner for a verified router flow. Shows the expected result after each step,
 * and requires an explicit acknowledgement before any configuration-destructive step.
 */
export function RouterFlowRunner({ flow, t, escalation }: { flow: RouterFlow; t: Dictionary; escalation: ReactNode }) {
  const r = t.router;
  const start = flow.steps.find((s) => s.isStart) ?? flow.steps[0]!;
  const [history, setHistory] = useState<string[]>([start.key]);
  const [outcome, setOutcome] = useState<null | "resolved" | "escalate">(null);
  const [ack, setAck] = useState<Record<string, boolean>>({});
  const current = flow.steps.find((s) => s.key === history.at(-1)) ?? start;

  if (outcome === "escalate") return <>{escalation}</>;
  if (outcome === "resolved") {
    return (
      <div className="space-y-3 rounded-[var(--radius-card)] border border-olive-soft bg-olive-soft p-5 text-olive-dark" role="status" data-testid="flow-resolved">
        <p className="text-lg font-semibold">{r.done}</p>
        <p className="text-sm">{r.doneBody}</p>
        <button type="button" onClick={() => { track("flow_step", { flow_id: flow.id, step_key: start.key, action: "restart" }); setHistory([start.key]); setOutcome(null); }} className="min-h-11 rounded-lg border border-olive px-4 text-sm">{t.flow.restart}</button>
      </div>
    );
  }
  const blocked = current.destructive && !ack[current.key];
  return (
    <div className="space-y-4 rounded-[var(--radius-card)] border border-line bg-white p-5" aria-live="polite" data-testid="router-flow">
      <p className="text-xs uppercase tracking-wide text-muted">{r.stepOf.replace("{n}", String(history.length)).replace("{total}", String(flow.steps.length))}</p>
      {current.warning ? (
        <div role="alert" className={`rounded-lg border px-3 py-2 text-sm ${current.destructive || current.safetyLevel === "danger" ? "border-danger-soft bg-danger-soft text-danger" : "border-warn-soft bg-warn-soft text-warn"}`} data-testid="step-warning">
          <strong>{r.warning}:</strong> {current.warning}
        </div>
      ) : null}
      <p className="text-lg font-medium" data-testid="step-prompt">{current.prompt}</p>
      {current.expected ? (
        <p className="rounded-lg border border-line bg-sand px-3 py-2 text-sm" data-testid="step-expected"><strong>{r.expected}:</strong> {current.expected}</p>
      ) : null}
      {current.destructive ? (
        <label className="flex items-start gap-2 text-sm font-medium">
          <input type="checkbox" className="mt-1 h-5 w-5" checked={!!ack[current.key]} onChange={(e) => setAck((a) => ({ ...a, [current.key]: e.target.checked }))} data-testid="destructive-ack" />
          <span>{r.destructiveConfirm}</span>
        </label>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {current.options.map((o) => (
          <button key={o.key} type="button" disabled={blocked && o.outcome !== "escalate"}
            onClick={() => {
              track("flow_step", { flow_id: flow.id, step_key: current.key, action: o.outcome === "escalate" ? "escalate" : o.outcome ? "resolved" : "next" });
              if (o.outcome === "escalate") setOutcome("escalate"); else if (o.outcome) setOutcome("resolved"); else if (o.next) setHistory((h) => [...h, o.next!]);
            }}
            className="min-h-11 rounded-lg border border-line bg-white px-4 text-left text-sm font-medium hover:border-olive hover:bg-olive-soft disabled:cursor-not-allowed disabled:opacity-50" data-track="router.flow_option">
            {o.label}
          </button>
        ))}
      </div>
      {history.length > 1 ? (
        <button type="button" onClick={() => { track("flow_step", { flow_id: flow.id, step_key: current.key, action: "back" }); setHistory((h) => h.slice(0, -1)); }} className="min-h-11 text-sm text-ink-soft underline">{t.flow.back}</button>
      ) : null}
    </div>
  );
}
