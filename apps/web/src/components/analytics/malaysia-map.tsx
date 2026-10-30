"use client";

import { useEffect, useMemo, useState } from "react";
import { geoMercator, geoPath } from "d3-geo";
import type { Feature, FeatureCollection, Geometry } from "geojson";

/**
 * Interactive choropleth of Malaysia for the admin analytics section. Boundaries come from the
 * public-domain Natural Earth dataset served from this site (no tile provider, no API key); the
 * numbers come from the aggregated analytics API. Click a state to see its activity.
 */
interface StateRow { code: string; name: string; sessions: number; previous: number; visitors: number; newSessions: number; pageViews: number; router: number; mesh: number; problem: number; ai: number; escalated: number; cases: number; media: number; video: number; completed: number; suppressed: boolean }
interface Summary { states: StateRow[]; totalSessions: number; malaysiaSessions: number; malaysiaStateUnknown: number; unknownSessions: number; hasData: boolean; geo: { configured: boolean; ranges: number }; period: { from: string; to: string } }
interface Row { label: string; value: number; suppressed?: boolean }
interface Detail {
  code: string; name: string; sessions: { value: number; previous: number; change: number | null }; visitors: number; newSessions: number; returningSessions: number; pageViews: number;
  router: number; mesh: number; problem: number; ai: number; escalated: number; cases: number; media: number; video: number; completed: number; completionRate: number | null; escalationRate: number | null; suppressed: boolean;
  topModels: Row[]; topScenarios: Row[]; topSources: Row[]; cities: Row[];
}
type StateFeature = Feature<Geometry, { code: string; name: string; type: string; lat: number; lon: number }>;

const W = 760; const H = 360;
const BANDS = ["#e0f2fe", "#bae6fd", "#7dd3fc", "#38bdf8", "#1365b8"]; // light to dark sky, validated against the white surface

function band(value: number, max: number): number {
  if (value <= 0) return -1;
  const share = value / Math.max(1, max);
  return share >= 0.8 ? 4 : share >= 0.5 ? 3 : share >= 0.25 ? 2 : share >= 0.08 ? 1 : 0;
}

export function MalaysiaMap({ query }: { query: string }) {
  // State is keyed by the query (and the selected state) so a period change resets the view without
  // synchronous state updates inside effects.
  const [loaded, setLoaded] = useState<{ query: string; shapes: FeatureCollection<Geometry, StateFeature["properties"]>; summary: Summary } | null>(null);
  const [loadError, setLoadError] = useState<{ query: string; message: string } | null>(null);
  const [sel, setSel] = useState<{ query: string; code: string | null }>({ query, code: null });
  const [detailState, setDetailState] = useState<{ key: string; detail: Detail | null; error: string | null } | null>(null);
  const shapes = loaded?.query === query ? loaded.shapes : null;
  const summary = loaded?.query === query ? loaded.summary : null;
  const selected = sel.query === query ? sel.code : null;
  const detailKey = selected ? `${query}|${selected}` : null;
  const detail = detailKey && detailState?.key === detailKey ? detailState.detail : null;
  const detailBusy = !!detailKey && detailState?.key !== detailKey;
  const error = loadError?.query === query ? loadError.message : detailKey && detailState?.key === detailKey ? detailState.error : null;
  const setSelected = (code: string | null) => setSel({ query, code });

  useEffect(() => {
    let alive = true;
    Promise.all([
      fetch("/geo/malaysia-states.json").then((r) => { if (!r.ok) throw new Error("boundaries"); return r.json() as Promise<FeatureCollection<Geometry, StateFeature["properties"]>>; }),
      fetch(`/api/admin/analytics/geo?${query}`, { cache: "no-store" }).then((r) => { if (!r.ok) throw new Error("data"); return r.json() as Promise<Summary>; }),
    ]).then(([s, d]) => { if (alive) setLoaded({ query, shapes: s, summary: d }); })
      .catch((e: Error) => { if (alive) setLoadError({ query, message: e.message === "boundaries" ? "The map boundaries could not be loaded." : "The geographic data could not be loaded." }); });
    return () => { alive = false; };
  }, [query]);

  useEffect(() => {
    if (!detailKey || !selected) return;
    let alive = true;
    fetch(`/api/admin/analytics/geo?${query}&region=${selected}`, { cache: "no-store" })
      .then((r) => { if (!r.ok) throw new Error("detail"); return r.json() as Promise<Detail>; })
      .then((d) => { if (alive) setDetailState({ key: detailKey, detail: d, error: null }); })
      .catch(() => { if (alive) setDetailState({ key: detailKey, detail: null, error: "The state details could not be loaded." }); });
    return () => { alive = false; };
  }, [detailKey, selected, query]);

  const path = useMemo(() => {
    if (!shapes) return null;
    const projection = geoMercator().fitExtent([[8, 8], [W - 8, H - 8]], shapes);
    return geoPath(projection);
  }, [shapes]);

  const byCode = useMemo(() => new Map((summary?.states ?? []).map((s) => [s.code, s])), [summary]);
  const max = Math.max(0, ...(summary?.states ?? []).map((s) => s.sessions));

  if (error) return <div role="alert" className="rounded-[var(--radius-card)] border border-danger-soft bg-danger-soft p-4 text-sm text-danger" data-testid="geo-error">{error}</div>;
  if (!shapes || !summary || !path) return <div role="status" className="rounded-[var(--radius-card)] border border-line bg-white p-6 text-sm text-muted" data-testid="geo-loading">Loading the map…</div>;

  const legend = [{ label: "No data", colour: "#ffffff", border: true }, ...BANDS.map((c, i) => ({ label: ["Lowest", "Low", "Medium", "High", "Highest"][i]!, colour: c, border: false }))];

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]" data-testid="malaysia-map">
      <figure className="rounded-[var(--radius-card)] border border-line bg-white p-3">
        <figcaption className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="font-semibold">{selected && detail ? `${detail.name}` : "Malaysia: sessions by state"}</span>
          {selected ? <button type="button" onClick={() => setSelected(null)} className="min-h-9 rounded-lg border border-line px-3 text-xs font-medium hover:bg-sand" data-testid="geo-back">Back to Malaysia</button> : null}
        </figcaption>
        {!summary.hasData ? (
          <p className="rounded-lg border border-line bg-sand px-3 py-2 text-sm text-ink-soft" data-testid="geo-empty">No geographic visitor data available yet.</p>
        ) : null}
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="group" aria-label="Map of Malaysia; each state is a button showing its session count">
          {shapes.features.map((f) => {
            const s = byCode.get(f.properties.code);
            const b = band(s?.sessions ?? 0, max);
            const isSel = selected === f.properties.code;
            return (
              <path key={f.properties.code} d={path(f) ?? undefined} role="button" tabIndex={0}
                aria-label={`${f.properties.name}: ${s?.suppressed ? "under 10" : s?.sessions ?? 0} sessions`} aria-pressed={isSel}
                data-testid={`geo-state-${f.properties.code}`} data-band={b}
                fill={b < 0 ? "#ffffff" : BANDS[b]} stroke={isSel ? "#0f172a" : "#64748b"} strokeWidth={isSel ? 2.5 : 0.8}
                className="cursor-pointer outline-none transition-[stroke-width] focus-visible:stroke-[#0f172a] focus-visible:[stroke-width:2.5]"
                onClick={() => setSelected(isSel ? null : f.properties.code)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelected(isSel ? null : f.properties.code); } }}>
                <title>{`${f.properties.name}: ${s?.suppressed ? "under 10" : s?.sessions ?? 0} sessions`}</title>
              </path>
            );
          })}
        </svg>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-ink-soft" aria-label="Legend" data-testid="geo-legend">
          <span className="font-medium">Sessions:</span>
          {legend.map((l) => <span key={l.label} className="inline-flex items-center gap-1"><span className="inline-block h-3 w-4 rounded-sm" style={{ backgroundColor: l.colour, border: l.border ? "1px solid #64748b" : "1px solid transparent" }} />{l.label}</span>)}
          <span className="text-muted">Intensity is relative to the busiest state in the selected period.</span>
        </div>
      </figure>

      <aside className="rounded-[var(--radius-card)] border border-line bg-white p-4 text-sm" data-testid="geo-panel" aria-live="polite">
        {!selected ? (
          <>
            <h3 className="font-semibold">National overview</h3>
            <dl className="mt-2 grid grid-cols-2 gap-2">
              <div><dt className="text-xs uppercase tracking-wide text-muted">Sessions</dt><dd className="text-xl font-semibold">{summary.totalSessions}</dd></div>
              <div><dt className="text-xs uppercase tracking-wide text-muted">In Malaysia</dt><dd className="text-xl font-semibold">{summary.malaysiaSessions}</dd></div>
              <div><dt className="text-xs uppercase tracking-wide text-muted">Unknown location</dt><dd className="text-xl font-semibold">{summary.unknownSessions}</dd></div>
              <div><dt className="text-xs uppercase tracking-wide text-muted">Geo database</dt><dd className="text-xl font-semibold">{summary.geo.configured && summary.geo.ranges > 0 ? "On" : "Off"}</dd></div>
            </dl>
            <p className="mt-3 text-xs text-muted">Select a state on the map, or in the table below, to see what visitors from that state did.</p>
            {summary.hasData ? (
              <ol className="mt-3 space-y-1">
                {summary.states.filter((s) => s.sessions > 0).sort((a, b) => b.sessions - a.sessions).slice(0, 6).map((s) => (
                  <li key={s.code}><button type="button" className="text-primary underline" onClick={() => setSelected(s.code)}>{s.name}</button> <span className="text-muted">{s.suppressed ? "under 10" : s.sessions}</span></li>
                ))}
              </ol>
            ) : null}
          </>
        ) : detailBusy || !detail ? (
          <p role="status" className="text-muted" data-testid="geo-detail-loading">Loading {selected}…</p>
        ) : (
          <div data-testid="geo-detail">
            <h3 className="font-semibold">{detail.name}</h3>
            <p className="text-xs text-muted">{detail.sessions.change === null ? `previous period: ${detail.sessions.previous}` : `${detail.sessions.change >= 0 ? "+" : ""}${detail.sessions.change}% versus ${detail.sessions.previous} previously`}</p>
            {detail.suppressed ? <p className="mt-2 rounded-lg border border-warn-soft bg-warn-soft px-3 py-2 text-xs text-warn">Fewer than 10 sessions: counts are shown as a range to protect privacy.</p> : null}
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
              {([
                ["Sessions", detail.suppressed ? "under 10" : detail.sessions.value], ["Consented visitors", detail.visitors], ["New sessions", detail.newSessions], ["Returning sessions", detail.returningSessions],
                ["Page views", detail.pageViews], ["Router selections", detail.router], ["Mesh support visits", detail.mesh], ["Problems chosen", detail.problem],
                ["AI chat starts", detail.ai], ["Escalations", detail.escalated], ["Support cases", detail.cases], ["Resource opens", detail.media],
                ["Video plays", detail.video], ["Guides completed", detail.completed], ["Completion rate", detail.completionRate === null ? "-" : `${detail.completionRate}%`], ["Escalation rate", detail.escalationRate === null ? "-" : `${detail.escalationRate}%`],
              ] as [string, string | number][]).map(([k, v]) => <div key={k}><dt className="text-xs text-muted">{k}</dt><dd className="font-semibold">{v}</dd></div>)}
            </dl>
            <Mini title="Top router models" rows={detail.topModels} />
            <Mini title="Mesh Connection problems" rows={detail.topScenarios} />
            <Mini title="Traffic sources" rows={detail.topSources} />
            <Mini title="Cities (where reliable, consented visitors only)" rows={detail.cities.map((c) => ({ ...c, label: c.suppressed ? `${c.label} (under 10)` : c.label }))} />
          </div>
        )}
      </aside>
    </div>
  );
}

function Mini({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <div className="mt-3">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h4>
      {rows.length === 0 ? <p className="text-xs text-muted">No data.</p> : (
        <ul className="mt-1 space-y-0.5">{rows.map((r) => <li key={r.label} className="flex justify-between gap-2"><span className="truncate">{r.label}</span><span className="font-medium">{r.suppressed ? "under 10" : r.value}</span></li>)}</ul>
      )}
    </div>
  );
}
