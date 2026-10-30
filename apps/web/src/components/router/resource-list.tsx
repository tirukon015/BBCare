"use client";

import { useState } from "react";
import type { Dictionary } from "@/i18n";
import { track } from "@/lib/client/analytics";

export interface ResourceView { id: string; kind: string; title: string; description: string | null; mimeType: string }

/** Approved library resources for a scenario, with usage tracking and a helpful / not helpful vote. */
export function ResourceList({ items, t }: { items: ResourceView[]; t: Dictionary }) {
  const [voted, setVoted] = useState<Record<string, 1 | -1>>({});
  if (items.length === 0) return null;
  const kinds = t.router.resourceKinds as Record<string, string>;
  async function vote(id: string, rating: 1 | -1) {
    setVoted((v) => ({ ...v, [id]: rating }));
    track("resource_feedback", { resource_id: id, rating });
    await fetch("/api/public/feedback", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ resourceId: id, rating }) }).catch(() => {});
  }
  return (
    <section className="mt-8" aria-labelledby="resources" data-testid="resources">
      <h2 id="resources" className="mb-1 text-lg font-semibold">{t.router.resources}</h2>
      <p className="mb-3 text-sm text-ink-soft">{t.router.resourcesIntro}</p>
      <ul className="space-y-3">
        {items.map((r) => {
          const href = `/media/resources/${r.id}`;
          const kind = r.kind as "video" | "diagram" | "image" | "document";
          return (
            <li key={r.id} className="rounded-[var(--radius-card)] border border-line bg-white p-4" data-testid={`resource-${r.kind}`}>
              <p className="text-xs uppercase tracking-wide text-muted">{kinds[r.kind] ?? r.kind}</p>
              <p className="font-medium">{r.title}</p>
              {r.description ? <p className="mt-1 text-sm text-ink-soft">{r.description}</p> : null}
              <div className="mt-3">
                {r.kind === "video" && r.mimeType.startsWith("video/") ? (
                  <video controls preload="metadata" className="max-h-80 w-full rounded-lg border border-line bg-black" onPlay={() => track("resource_open", { resource_id: r.id, kind })}>
                    <source src={href} type={r.mimeType} />
                  </video>
                ) : r.mimeType.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element -- served from our own approved-media route
                  <a href={href} target="_blank" rel="noopener" onClick={() => track("resource_open", { resource_id: r.id, kind })}><img src={href} alt={r.title} className="max-h-80 rounded-lg border border-line" /></a>
                ) : (
                  <a href={href} className="inline-flex min-h-11 items-center rounded-lg border border-line px-4 text-sm font-medium hover:bg-sand" onClick={() => track("resource_open", { resource_id: r.id, kind })}>{t.router.resourceOpen}</a>
                )}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                <span>{t.router.resourceHelpful}</span>
                <button type="button" disabled={!!voted[r.id]} onClick={() => vote(r.id, 1)} className={`min-h-9 rounded-lg border px-3 ${voted[r.id] === 1 ? "border-olive bg-olive-soft" : "border-line"}`}>{t.article.yes}</button>
                <button type="button" disabled={!!voted[r.id]} onClick={() => vote(r.id, -1)} className={`min-h-9 rounded-lg border px-3 ${voted[r.id] === -1 ? "border-olive bg-olive-soft" : "border-line"}`}>{t.article.no}</button>
                {voted[r.id] ? <span role="status" className="text-ink-soft">{t.article.thanks}</span> : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
