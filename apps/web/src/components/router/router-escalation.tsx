"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import type { Dictionary } from "@/i18n";
import { inputStyles } from "../ui";

export interface IntakeView { key: string; label: string; options: { key: string; label: string }[] }

interface Props {
  locale: "en" | "ms";
  t: Dictionary;
  modelEcr: string;
  mode: "mesh" | "ap";
  scenario: string;
  subject: string;
  questions: IntakeView[];
  flowId: string | null;
  flowOutcome: "not_verified" | "steps_failed";
  contacts: { whatsapp?: string; email?: string };
}

/** Structured intake (fixed choices only) followed by the contact form. Creates a case linked to model, mode and scenario. */
export function RouterEscalation({ locale, t, modelEcr, mode, scenario, subject, questions, flowId, flowOutcome, contacts }: Props) {
  const e = t.escalation;
  const r = t.router;
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [channel, setChannel] = useState<"email" | "whatsapp" | "phone">("whatsapp");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ reference: string; followUpCode: string; redacted: boolean } | null>(null);

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
          locale,
          name: String(form.get("name") ?? ""),
          channel,
          contact: String(form.get("contact") ?? ""),
          subject,
          description: String(form.get("description") ?? "") || undefined,
          consent: form.get("consent") === "on",
          router: { model: modelEcr, mode, scenario, answers, flowId, outcome: flowOutcome },
        }),
      });
      if (res.status === 429) throw new Error(t.support.rateLimited);
      if (!res.ok) throw new Error(t.support.error);
      setResult((await res.json()) as { reference: string; followUpCode: string; redacted: boolean });
    } catch (err) {
      setError(err instanceof Error ? err.message : t.support.error);
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <div className="space-y-2 rounded-[var(--radius-card)] border border-olive-soft bg-olive-soft p-5 text-olive-dark" role="status" data-testid="escalation-success">
        <p className="font-semibold">{e.success} <span className="font-mono" data-testid="case-reference">{result.reference}</span></p>
        <p>{r.caseCode}: <span className="font-mono font-semibold" data-testid="case-code">{result.followUpCode}</span></p>
        <p className="text-sm">{r.caseCodeNote}</p>
        {result.redacted ? <p className="text-sm">{r.secretRemoved}</p> : null}
        <p className="text-sm"><Link href={`/${locale}/support/case`} className="underline">{r.checkCase}</Link></p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5 rounded-[var(--radius-card)] border border-line bg-white p-5" aria-labelledby="router-esc-title">
      <div>
        <h2 id="router-esc-title" className="text-lg font-semibold">{flowOutcome === "steps_failed" ? r.escalateTitle : r.questionsTitle}</h2>
        <p className="text-sm text-ink-soft">{flowOutcome === "steps_failed" ? r.escalateBody : r.questionsIntro}</p>
      </div>
      <p className="rounded-lg border border-warn-soft bg-warn-soft px-3 py-2 text-sm text-warn" role="note" data-testid="no-secrets">{r.noSecrets}</p>
      {questions.map((q) => (
        <fieldset key={q.key} className="flex flex-col gap-2" data-testid={`intake-${q.key}`}>
          <legend className="text-sm font-medium">{q.label}</legend>
          <div className="flex flex-wrap gap-2">
            {q.options.map((o) => (
              <label key={o.key} className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm ${answers[q.key] === o.key ? "border-olive bg-olive-soft" : "border-line"}`}>
                <input type="radio" name={`q-${q.key}`} value={o.key} checked={answers[q.key] === o.key} onChange={() => setAnswers((a) => ({ ...a, [q.key]: o.key }))} />
                {o.label}
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="resc-name" className="text-sm font-medium">{e.name}</label>
        <input id="resc-name" name="name" required maxLength={120} autoComplete="name" className={inputStyles} />
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
        <label htmlFor="resc-contact" className="text-sm font-medium">{channel === "email" ? e.email : e.phone}</label>
        <input id="resc-contact" name="contact" required maxLength={200} type={channel === "email" ? "email" : "tel"} autoComplete={channel === "email" ? "email" : "tel"} inputMode={channel === "email" ? "email" : "tel"} className={inputStyles} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="resc-desc" className="text-sm font-medium">{e.description}</label>
        <textarea id="resc-desc" name="description" maxLength={2000} rows={3} className={inputStyles} aria-describedby="resc-desc-hint" />
        <p id="resc-desc-hint" className="text-xs text-muted">{r.noSecrets}</p>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="consent" required className="mt-1 h-5 w-5" />
        <span>{e.consent} <Link href={`/${locale}/privacy`} className="text-olive underline">{t.nav.privacy}</Link></span>
      </label>
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
      <button type="submit" disabled={busy} className="min-h-11 rounded-lg bg-olive px-5 text-sm font-semibold text-white hover:bg-olive-dark disabled:opacity-60" data-testid="escalation-submit">{e.submit}</button>
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
