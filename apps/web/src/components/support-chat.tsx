"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Dictionary } from "@/i18n";
import type { AssistantPayload } from "@/modules/support/service";
import { track } from "@/lib/client/analytics";
import { EscalationForm } from "./escalation-form";

type Msg =
  | { id: string; role: "customer"; text: string }
  | { id: string; role: "assistant"; payload: AssistantPayload; feedback?: 1 | -1 };

interface Props {
  locale: "en" | "ms";
  t: Dictionary;
  aiEnabled: boolean;
  mock: boolean;
  initialModel: { slug: string; name: string } | null;
  startEscalated: boolean;
  contacts: { whatsapp?: string; email?: string };
}

function lengthBucket(n: number): "xs" | "s" | "m" | "l" {
  return n < 20 ? "xs" : n < 80 ? "s" : n < 250 ? "m" : "l";
}

export function SupportChat({ locale, t, aiEnabled, mock, initialModel, startEscalated, contacts }: Props) {
  const s = t.support;
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState(initialModel);
  const [escalating, setEscalating] = useState(startEscalated);
  const [resolved, setResolved] = useState(false);
  const logRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    logRef.current?.lastElementChild?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [messages]);

  async function ensureSession(): Promise<string> {
    if (sessionId) return sessionId;
    const res = await fetch("/api/public/support/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ locale, model: model?.slug ?? null }),
    });
    if (!res.ok) throw new Error(res.status === 429 ? "rate" : "error");
    const { sessionId: id } = (await res.json()) as { sessionId: string };
    setSessionId(id);
    track("support_started", { support_session: id });
    return id;
  }

  async function send(messageText: string, modelSlug?: string) {
    const clean = messageText.trim();
    if (!clean || busy) return;
    setBusy(true);
    setError(null);
    const localId = crypto.randomUUID();
    setMessages((m) => [...m, { id: localId, role: "customer", text: clean }]);
    try {
      const id = await ensureSession();
      const res = await fetch(`/api/public/support/sessions/${id}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: clean, model: modelSlug ?? null }),
      });
      if (res.status === 429) throw new Error("rate");
      if (!res.ok) throw new Error("error");
      const data = (await res.json()) as { id: string; outcome: string; payload: AssistantPayload };
      if (data.payload.resolvedModel) setModel(data.payload.resolvedModel);
      setMessages((m) => [...m, { id: data.id, role: "assistant", payload: data.payload }]);
      track("support_message_submitted", {
        support_session: id,
        length_bucket: lengthBucket(clean.length),
        outcome: data.outcome === "clarify" ? "clarify" : data.outcome === "abstain" ? "abstain" : "answered",
      });
    } catch (e) {
      setError(e instanceof Error && e.message === "rate" ? s.rateLimited : s.error);
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const value = text;
    setText("");
    void send(value);
  }

  function chooseModel(slug: string, name: string) {
    setModel({ slug, name });
    const lastQuestion = [...messages].reverse().find((m) => m.role === "customer");
    if (lastQuestion && lastQuestion.role === "customer") void send(lastQuestion.text, slug);
  }

  async function feedback(messageId: string, rating: 1 | -1) {
    if (!sessionId) return;
    setMessages((m) => m.map((x) => (x.id === messageId && x.role === "assistant" ? { ...x, feedback: rating } : x)));
    await fetch(`/api/public/support/sessions/${sessionId}/feedback`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messageId, rating, reason: rating === 1 ? "helpful" : null }),
    }).catch(() => {});
  }

  async function markResolved() {
    if (!sessionId) return;
    setResolved(true);
    track("support_resolved", { support_session: sessionId, turns: messages.filter((m) => m.role === "customer").length });
    await fetch(`/api/public/support/sessions/${sessionId}/resolve`, { method: "POST" }).catch(() => {});
  }

  function reset() {
    setSessionId(null);
    setMessages([]);
    setModel(initialModel);
    setResolved(false);
    setEscalating(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-line bg-sand px-4 py-3 text-sm text-ink-soft" role="note">
        {aiEnabled ? s.disclosureAi : s.disclosureSearch}
        {mock && aiEnabled ? <p className="mt-1 font-medium text-warn">{s.mockNotice}</p> : null}
      </div>

      {model ? (
        <p className="text-sm">
          <span className="text-muted">{s.model}: </span>
          <span className="font-semibold">{model.name}</span>{" "}
          <button type="button" className="ml-2 min-h-11 text-sm text-olive underline" onClick={() => setModel(null)}>
            {s.notListed}
          </button>
        </p>
      ) : null}

      <ol ref={logRef} aria-live="polite" aria-label={s.title} className="flex flex-col gap-3">
        {messages.length === 0 ? <li className="text-sm text-muted">{s.started}</li> : null}
        {messages.map((m) =>
          m.role === "customer" ? (
            <li key={m.id} className="self-end max-w-[85%] rounded-2xl rounded-br-sm bg-ink px-4 py-2 text-white">
              <span className="sr-only">{s.you}: </span>
              {m.text}
            </li>
          ) : (
            <li key={m.id} className="max-w-full rounded-2xl rounded-bl-sm border border-line bg-white px-4 py-3 sm:max-w-[90%]" lang={m.payload.language}>
              <span className="sr-only">{s.assistant}: </span>
              <AssistantMessage payload={m.payload} t={t} locale={locale} onChoose={chooseModel} />
              <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-2 text-sm">
                {m.feedback ? (
                  <span className="text-ok" role="status">{t.article.thanks}</span>
                ) : (
                  <>
                    <button type="button" className="min-h-11 rounded-md px-3 hover:bg-sand" onClick={() => feedback(m.id, 1)} data-testid="msg-helpful">{s.helpful}</button>
                    <button type="button" className="min-h-11 rounded-md px-3 hover:bg-sand" onClick={() => feedback(m.id, -1)} data-testid="msg-not-helpful">{s.notHelpful}</button>
                  </>
                )}
              </div>
            </li>
          ),
        )}
        {busy ? <li className="text-sm text-muted" role="status">{s.sending}</li> : null}
      </ol>

      {error ? <p role="alert" className="rounded-lg border border-danger-soft bg-danger-soft px-4 py-2 text-sm text-danger">{error}</p> : null}

      {resolved ? (
        <p role="status" className="rounded-lg border border-olive-soft bg-olive-soft px-4 py-3 text-sm text-olive-dark">{t.article.thanks}</p>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-2 sm:flex-row">
          <label htmlFor="support-input" className="sr-only">{s.placeholder}</label>
          <textarea
            id="support-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSubmit(e);
              }
            }}
            rows={2}
            maxLength={1000}
            placeholder={s.placeholder}
            className="min-h-11 w-full resize-y rounded-lg border border-line bg-white px-3 py-2 text-base"
          />
          <button type="submit" disabled={busy || !text.trim()} className="min-h-11 shrink-0 rounded-lg bg-olive px-5 text-sm font-semibold text-white hover:bg-olive-dark disabled:opacity-60" data-testid="support-send">
            {busy ? s.sending : s.send}
          </button>
        </form>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => { setEscalating(true); if (sessionId) track("support_escalated", { support_session: sessionId }); }} className="min-h-11 rounded-lg border border-line bg-white px-4 text-sm font-semibold hover:bg-sand" data-testid="escalate-open">
          {s.escalate}
        </button>
        {sessionId && !resolved ? (
          <button type="button" onClick={markResolved} className="min-h-11 rounded-lg border border-line bg-white px-4 text-sm hover:bg-sand">{s.resolved}</button>
        ) : null}
        {messages.length > 0 ? <button type="button" onClick={reset} className="min-h-11 rounded-lg px-4 text-sm text-ink-soft hover:bg-sand">{s.newChat}</button> : null}
      </div>

      {escalating ? (
        <EscalationForm locale={locale} t={t} sessionId={sessionId} contacts={contacts} onClose={() => setEscalating(false)} defaultSubject={[...messages].reverse().find((m) => m.role === "customer")?.role === "customer" ? ([...messages].reverse().find((m) => m.role === "customer") as { text: string }).text.slice(0, 200) : ""} />
      ) : null}
    </div>
  );
}

function AssistantMessage({ payload, t, locale, onChoose }: { payload: AssistantPayload; t: Dictionary; locale: "en" | "ms"; onChoose: (slug: string, name: string) => void }) {
  const s = t.support;
  return (
    <div className="space-y-3 text-sm">
      {payload.kind === "answer" ? <p className="text-xs font-medium uppercase tracking-wide text-olive">{s.aiLabel}{payload.mock ? " (mock)" : ""}</p> : null}
      {payload.aiUnavailable ? <p className="text-warn">{s.unavailable}</p> : null}

      {payload.kind === "clarify" ? (
        <div>
          <p className="font-medium">{s.clarify}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {payload.candidates?.map((c) => (
              <button key={c.slug} type="button" onClick={() => onChoose(c.slug, c.name)} className="min-h-11 rounded-full border border-line px-4 text-left hover:border-olive hover:bg-olive-soft" data-testid="clarify-option">
                <span className="font-medium">{c.name}</span> <span className="text-muted">{c.modelNumber}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {payload.kind === "answer" && payload.sections ? (
        <>
          {payload.sections.warnings.length > 0 ? (
            <div className="rounded-md border border-danger-soft bg-danger-soft px-3 py-2 text-danger" role="note">
              <p className="font-semibold">{s.warnings}</p>
              <ul className="list-disc pl-5">{payload.sections.warnings.map((w, i) => <li key={i}>{w === "__SAFETY_DEFAULT__" ? s.defaultSafety : w}</li>)}</ul>
            </div>
          ) : null}
          {payload.sections.confirmed.length > 0 ? (
            <div><p className="font-semibold">{s.confirmed}</p><ul className="list-disc pl-5">{payload.sections.confirmed.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
          ) : null}
          {payload.sections.steps.length > 0 ? (
            <div><p className="font-semibold">{s.steps}</p><ol className="list-decimal pl-5">{payload.sections.steps.map((x, i) => <li key={i}>{x}</li>)}</ol></div>
          ) : null}
          {payload.sections.possibleCauses.length > 0 ? (
            <div><p className="font-semibold">{s.possibleCauses}</p><ul className="list-disc pl-5">{payload.sections.possibleCauses.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
          ) : null}
          {payload.citations && payload.citations.length > 0 ? (
            <div>
              <p className="font-semibold">{s.sources}</p>
              <ul className="list-disc pl-5">{payload.citations.map((c) => <li key={c.slug}><Link className="text-olive underline" href={`/${locale}/articles/${c.slug}`}>{c.title}</Link></li>)}</ul>
            </div>
          ) : null}
        </>
      ) : null}

      {payload.kind === "no_answer" ? <p>{s.noAnswer}</p> : null}
      {payload.routerSuggestion ? (
        <p data-testid="router-suggestion">
          <Link className="font-medium text-olive underline" href={`/${locale}/routers/${payload.routerSuggestion.modelSlug}/${payload.routerSuggestion.mode}/${payload.routerSuggestion.scenario}`}>
            {locale === "ms" ? payload.routerSuggestion.titleMs : payload.routerSuggestion.titleEn}
          </Link>
        </p>
      ) : null}

      {payload.kind !== "answer" && payload.articles && payload.articles.length > 0 ? (
        <div>
          <p className="font-semibold">{s.relatedGuides}</p>
          <ul className="mt-1 space-y-2">
            {payload.articles.map((a) => (
              <li key={a.slug} className="rounded-md border border-line p-3">
                <Link href={`/${locale}/articles/${a.slug}`} className="font-medium text-olive underline" data-track="chat.article">{a.title}</Link>
                {a.models.length ? <span className="ml-2 text-xs text-muted">({a.models.join(", ")})</span> : null}
                <p className="mt-1 text-ink-soft" lang={a.locale}>{a.snippet}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {payload.products && payload.products.length > 0 ? (
        <div>
          <p className="font-semibold">{s.products}</p>
          <ul className="mt-1 space-y-2">
            {payload.products.map((p) => (
              <li key={p.recommendationId} className="flex flex-col gap-2 rounded-md border border-line p-3 sm:flex-row sm:items-center sm:justify-between">
                <span>{p.name}</span>
                <a href={p.href} target="_blank" rel="noopener nofollow" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-olive px-3 font-semibold text-olive hover:bg-olive-soft" data-track="chat.recommendation">
                  {p.channel === "shopee" ? t.products.view : t.products.viewStore}
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-muted">{s.productNote}</p>
        </div>
      ) : null}
    </div>
  );
}
