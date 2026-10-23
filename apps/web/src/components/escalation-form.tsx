"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import type { Dictionary } from "@/i18n";
import { inputStyles } from "./ui";

interface Props {
  locale: "en" | "ms";
  t: Dictionary;
  sessionId: string | null;
  contacts: { whatsapp?: string; email?: string };
  onClose?: () => void;
  defaultSubject?: string;
}

export function EscalationForm({ locale, t, sessionId, contacts, onClose, defaultSubject }: Props) {
  const e = t.escalation;
  const [channel, setChannel] = useState<"email" | "whatsapp" | "phone">("whatsapp");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);

  async function submit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const form = new FormData(ev.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/public/cases", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId,
          locale,
          name: String(form.get("name") ?? ""),
          channel,
          contact: String(form.get("contact") ?? ""),
          subject: String(form.get("subject") ?? ""),
          description: String(form.get("description") ?? "") || undefined,
          consent: form.get("consent") === "on",
        }),
      });
      if (res.status === 429) throw new Error(t.support.rateLimited);
      if (!res.ok) throw new Error(t.support.error);
      const data = (await res.json()) as { reference: string };
      setReference(data.reference);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.support.error);
    } finally {
      setBusy(false);
    }
  }

  if (reference) {
    return (
      <div className="rounded-[var(--radius-card)] border border-olive-soft bg-olive-soft p-5" role="status" data-testid="escalation-success">
        <p className="font-semibold text-olive-dark">{e.success} <span className="font-mono">{reference}</span></p>
        <p className="mt-1 text-sm text-olive-dark">{e.successNext}</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-[var(--radius-card)] border border-line bg-white p-5" aria-labelledby="escalation-title">
      <div>
        <h2 id="escalation-title" className="text-lg font-semibold">{e.title}</h2>
        <p className="text-sm text-ink-soft">{e.intro}</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="esc-name" className="text-sm font-medium">{e.name}</label>
        <input id="esc-name" name="name" required maxLength={120} autoComplete="name" className={inputStyles} />
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">{e.channel}</legend>
        <div className="flex flex-wrap gap-2">
          {(["whatsapp", "email", "phone"] as const).map((c) => (
            <label key={c} className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm ${channel === c ? "border-olive bg-olive-soft" : "border-line"}`}>
              <input type="radio" name="channel" value={c} checked={channel === c} onChange={() => setChannel(c)} />
              {e[c]}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="esc-contact" className="text-sm font-medium">{channel === "email" ? e.email : e.phone}</label>
        <input id="esc-contact" name="contact" required maxLength={200} type={channel === "email" ? "email" : "tel"} autoComplete={channel === "email" ? "email" : "tel"} inputMode={channel === "email" ? "email" : "tel"} className={inputStyles} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="esc-subject" className="text-sm font-medium">{e.subject}</label>
        <input id="esc-subject" name="subject" required minLength={3} maxLength={200} defaultValue={defaultSubject} className={inputStyles} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="esc-desc" className="text-sm font-medium">{e.description}</label>
        <textarea id="esc-desc" name="description" maxLength={4000} rows={3} className={inputStyles} />
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="consent" required className="mt-1 h-5 w-5" />
        <span>{e.consent} <Link href={`/${locale}/privacy`} className="text-olive underline">{t.nav.privacy}</Link></span>
      </label>
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className="min-h-11 rounded-lg bg-olive px-5 text-sm font-semibold text-white hover:bg-olive-dark disabled:opacity-60" data-testid="escalation-submit">{e.submit}</button>
        {onClose ? <button type="button" onClick={onClose} className="min-h-11 rounded-lg border border-line px-4 text-sm hover:bg-sand">{e.cancel}</button> : null}
      </div>
      {contacts.whatsapp || contacts.email ? (
        <p className="text-sm text-ink-soft">
          {e.direct}:{" "}
          {contacts.whatsapp ? <a className="text-olive underline" href={`https://wa.me/${contacts.whatsapp}`} target="_blank" rel="noopener">WhatsApp</a> : null}
          {contacts.whatsapp && contacts.email ? " · " : null}
          {contacts.email ? <a className="text-olive underline" href={`mailto:${contacts.email}`}>{contacts.email}</a> : null}
        </p>
      ) : null}
    </form>
  );
}
