"use client";

import { useState, type FormEvent } from "react";
import type { Dictionary } from "@/i18n";
import { inputStyles } from "../ui";

interface CaseView {
  reference: string; status: string; updatedAt: string; customerNote: string | null; modelName: string | null;
  messages: { at: string; from: "customer" | "team"; text: string }[];
}

export function CaseLookup({ locale, t }: { locale: "en" | "ms"; t: Dictionary }) {
  const r = t.router;
  const [creds, setCreds] = useState<{ reference: string; code: string } | null>(null);
  const [view, setView] = useState<CaseView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fmt = (iso: string) => new Date(iso).toLocaleString(locale === "ms" ? "ms-MY" : "en-MY");

  async function load(reference: string, code: string) {
    const res = await fetch("/api/public/cases/status", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reference, code }) });
    if (res.status === 429) throw new Error(t.support.rateLimited);
    if (!res.ok) throw new Error(r.caseNotFound);
    setView((await res.json()) as CaseView);
    setCreds({ reference, code });
  }

  async function lookup(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    setBusy(true); setError(null);
    try { await load(String(f.get("reference") ?? ""), String(f.get("code") ?? "")); }
    catch (e) { setView(null); setError(e instanceof Error ? e.message : t.support.error); }
    finally { setBusy(false); }
  }

  async function send(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    if (!creds) return;
    const form = ev.currentTarget;
    const text = String(new FormData(form).get("text") ?? "");
    setBusy(true); setError(null); setNotice(null);
    try {
      const res = await fetch("/api/public/cases/messages", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...creds, text }) });
      if (!res.ok) throw new Error(t.support.error);
      const data = (await res.json()) as { redacted: boolean };
      form.reset();
      setNotice(data.redacted ? `${r.messageSent} ${r.secretRemoved}` : r.messageSent);
      await load(creds.reference, creds.code);
    } catch (e) { setError(e instanceof Error ? e.message : t.support.error); }
    finally { setBusy(false); }
  }

  const statusLabel = (s: string) => (r.statuses as Record<string, string>)[s] ?? s;
  return (
    <div className="space-y-5">
      <form onSubmit={lookup} className="grid gap-3 rounded-[var(--radius-card)] border border-line bg-white p-5 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm font-medium">{r.reference}
          <input name="reference" required maxLength={20} placeholder="BBC-2026-000001" autoComplete="off" className={inputStyles} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">{r.caseCode}
          <input name="code" required maxLength={40} autoComplete="off" className={inputStyles} />
        </label>
        <div className="sm:col-span-2"><button type="submit" disabled={busy} className="min-h-11 rounded-lg bg-olive px-5 text-sm font-semibold text-white hover:bg-olive-dark disabled:opacity-60" data-testid="case-lookup">{r.checkCase}</button></div>
      </form>
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
      {view ? (
        <section className="space-y-4 rounded-[var(--radius-card)] border border-line bg-white p-5" aria-live="polite" data-testid="case-view">
          <p className="font-mono text-sm">{view.reference}{view.modelName ? ` · ${view.modelName}` : ""}</p>
          <p><strong>{r.status}:</strong> <span data-testid="case-status">{statusLabel(view.status)}</span></p>
          <p className="text-sm text-muted">{r.lastUpdate}: {fmt(view.updatedAt)}</p>
          {view.customerNote ? <p className="rounded-lg border border-olive-soft bg-olive-soft px-3 py-2 text-sm text-olive-dark"><strong>{r.teamNote}:</strong> {view.customerNote}</p> : null}
          {view.messages.length ? (
            <ol className="space-y-2 text-sm">
              {view.messages.map((m, i) => (
                <li key={i} className={`rounded-lg px-3 py-2 ${m.from === "team" ? "bg-olive-soft" : "bg-sand"}`}>
                  <span className="block text-xs text-ink-soft">{m.from === "team" ? r.teamLabel : t.support.you} · {fmt(m.at)}</span>
                  {m.text}
                </li>
              ))}
            </ol>
          ) : null}
          {view.status !== "closed" ? (
            <form onSubmit={send} className="space-y-2">
              <label htmlFor="case-text" className="text-sm font-medium">{r.addMessage}</label>
              <textarea id="case-text" name="text" required minLength={2} maxLength={2000} rows={3} className={inputStyles} aria-describedby="case-text-hint" />
              <p id="case-text-hint" className="text-xs text-muted">{r.noSecrets}</p>
              <button type="submit" disabled={busy} className="min-h-11 rounded-lg border border-line px-4 text-sm hover:bg-sand" data-testid="case-send">{r.sendMessage}</button>
              {notice ? <p role="status" className="text-sm text-olive-dark">{notice}</p> : null}
            </form>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
