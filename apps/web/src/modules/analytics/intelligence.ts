import "server-only";
import { GEO_SUPPRESSION_THRESHOLD, MY_REGIONS, SCENARIOS, sourceGroup, type SourceGroup, type SupportChannel } from "@bbcare/core";
import { rollupDay } from "@bbcare/db";
import { db } from "@/lib/db";
import { geoStatus } from "@/lib/geo";

/**
 * Customer Analytics and Intelligence: reads the daily aggregates (analytics.agg_daily) for a
 * period and the period before it. Aggregates hold counts only; nothing here can identify a
 * person. Today's and yesterday's aggregates are recomputed on view when stale, so the section
 * is current even where the worker is not running.
 */

export type RangeKey = "today" | "yesterday" | "7" | "30" | "90" | "custom";
export interface Period { key: RangeKey; from: string; to: string; days: number; prevFrom: string; prevTo: string }

const iso = (d: Date) => d.toISOString().slice(0, 10);
const shift = (day: string, n: number) => iso(new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000));

export function parsePeriod(sp: { range?: string; from?: string; to?: string }): Period {
  const today = iso(new Date());
  const valid = (v?: string) => /^\d{4}-\d{2}-\d{2}$/.test(v ?? "") && Date.parse(`${v}T00:00:00Z`) <= Date.parse(`${today}T00:00:00Z`);
  let key: RangeKey = "7"; let from = shift(today, -6); let to = today;
  if (sp.range === "today") { key = "today"; from = today; }
  else if (sp.range === "yesterday") { key = "yesterday"; from = shift(today, -1); to = from; }
  else if (sp.range === "30") { key = "30"; from = shift(today, -29); }
  else if (sp.range === "90") { key = "90"; from = shift(today, -89); }
  else if (sp.range === "custom" && valid(sp.from) && valid(sp.to) && sp.from! <= sp.to!) { key = "custom"; from = sp.from!; to = sp.to!; }
  const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
  return { key, from, to, days, prevFrom: shift(from, -days), prevTo: shift(from, -1) };
}

let lastFresh = 0;
/** Recompute today's (and, once a day, yesterday's) aggregates at most every five minutes per process. "Refresh now" forces it. */
export async function ensureFreshAggregates(force = false): Promise<void> {
  if (!force && Date.now() - lastFresh < 5 * 60_000) return;
  lastFresh = Date.now();
  const sql = db();
  const today = iso(new Date());
  await rollupDay(sql, today);
  const [y] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM analytics.agg_daily WHERE day = ${shift(today, -1)}::date`;
  if (!y?.n) await rollupDay(sql, shift(today, -1));
}

export interface Row { label: string; value: number; note?: string; suppressed?: boolean }
export interface Compared { value: number; previous: number; change: number | null }
const compare = (value: number, previous: number): Compared => ({ value, previous, change: previous ? Math.round(((value - previous) / previous) * 100) : null });

async function total(metric: string, from: string, to: string, dim1?: string): Promise<number> {
  const [r] = await db()<{ v: number }[]>`
    SELECT COALESCE(sum(value), 0)::int AS v FROM analytics.agg_daily WHERE metric = ${metric} AND day >= ${from}::date AND day <= ${to}::date
      AND (${dim1 ?? null}::text IS NULL OR dim1 = ${dim1 ?? null})`;
  return r?.v ?? 0;
}
async function compared(metric: string, p: Period, dim1?: string): Promise<Compared> {
  const [v, prev] = await Promise.all([total(metric, p.from, p.to, dim1), total(metric, p.prevFrom, p.prevTo, dim1)]);
  return compare(v, prev);
}
async function byDim(metric: string, p: Period, limit = 12, dim: "dim1" | "dim2" = "dim1"): Promise<{ key: string; value: number }[]> {
  const rows = dim === "dim1"
    ? await db()<{ key: string; value: number }[]>`SELECT dim1 AS key, sum(value)::int AS value FROM analytics.agg_daily WHERE metric = ${metric} AND day >= ${p.from}::date AND day <= ${p.to}::date GROUP BY dim1 ORDER BY value DESC LIMIT ${limit}`
    : await db()<{ key: string; value: number }[]>`SELECT dim2 AS key, sum(value)::int AS value FROM analytics.agg_daily WHERE metric = ${metric} AND day >= ${p.from}::date AND day <= ${p.to}::date GROUP BY dim2 ORDER BY value DESC LIMIT ${limit}`;
  return [...rows];
}
async function byDims(metric: string, p: Period, limit = 200): Promise<{ dim1: string; dim2: string; value: number }[]> {
  return [...(await db()<{ dim1: string; dim2: string; value: number }[]>`
    SELECT dim1, dim2, sum(value)::int AS value FROM analytics.agg_daily WHERE metric = ${metric} AND day >= ${p.from}::date AND day <= ${p.to}::date GROUP BY dim1, dim2 ORDER BY value DESC LIMIT ${limit}`)];
}
async function daily(metric: string, p: Period): Promise<{ day: string; value: number }[]> {
  return [...(await db()<{ day: string; value: number }[]>`
    SELECT d::date::text AS day, COALESCE((SELECT sum(value) FROM analytics.agg_daily a WHERE a.metric = ${metric} AND a.day = d::date), 0)::int AS value
    FROM generate_series(${p.from}::date, ${p.to}::date, interval '1 day') d ORDER BY d`)];
}

const modelNames = async (ids: string[]) => new Map((ids.length ? await db()<{ id: string; name: string; ecr: string | null }[]>`SELECT id::text, display_name AS name, ecr_code AS ecr FROM catalog.product_models WHERE id = ANY (${ids}::uuid[])` : []).map((m) => [m.id, m]));
const scenarioTitle = (k: string) => { const [mode, key] = k.split(":"); const s = SCENARIOS.find((x) => x.key === key); return `${mode === "ap" ? "AP" : "Mesh"}: ${s?.en ?? key}`; };
const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

export async function overview(p: Period) {
  const [sessions, pageViews, visitors, newVisitors, supportStarted, escalations, resolved, routerSelections, resourceOpens, demandRequests, trend] = await Promise.all([
    compared("sessions", p), compared("page_views", p), compared("visitors_consented", p), compared("visitors_new", p),
    compared("support_started", p), compared("escalations", p), compared("support_resolved", p), compared("router_models", p), compared("resource_opens", p),
    demandTotals(p), daily("sessions", p),
  ]);
  const [topSources, topModels, topScenarios, topPages] = await Promise.all([sourcesSummary(p), routerModels(p), routerScenarios(p), byDims("page_views", p, 10)]);
  return { period: p, sessions, pageViews, visitors, newVisitors, supportStarted, escalations, resolved, routerSelections, resourceOpens, demandRequests, trend,
    topSources: topSources.groups.slice(0, 6), topModels: topModels.slice(0, 5), topScenarios: topScenarios.slice(0, 5),
    topPages: topPages.map((r) => ({ label: `${r.dim1 || "home"}${r.dim2 ? ` (${r.dim2})` : ""}`, value: r.value })) };
}

export async function sourcesSummary(p: Period) {
  const raw = await byDims("sources", p, 500);
  const groups = new Map<SourceGroup, { value: number; hosts: Map<string, number> }>();
  for (const r of raw) {
    const g = sourceGroup(r.dim1 as SupportChannel, r.dim2 || null);
    const cur = groups.get(g) ?? { value: 0, hosts: new Map() };
    cur.value += r.value;
    if (r.dim2) cur.hosts.set(r.dim2, (cur.hosts.get(r.dim2) ?? 0) + r.value);
    groups.set(g, cur);
  }
  const [router, support, escalated, media, prevRaw] = await Promise.all([byDim("channel_router", p, 20), byDim("channel_support", p, 20), byDim("channel_escalated", p, 20), byDim("channel_media", p, 20), byDims("sources", { ...p, from: p.prevFrom, to: p.prevTo }, 500)]);
  const prev = new Map<SourceGroup, number>();
  for (const r of prevRaw) { const g = sourceGroup(r.dim1 as SupportChannel, r.dim2 || null); prev.set(g, (prev.get(g) ?? 0) + r.value); }
  const byChannel = (rows: { key: string; value: number }[]) => new Map(rows.map((r) => [r.key, r.value]));
  const m = { router: byChannel(router), support: byChannel(support), escalated: byChannel(escalated), media: byChannel(media) };
  const channelsOfGroup: Record<SourceGroup, SupportChannel[]> = {
    shopee: ["shopee"], qr_code: ["qr_code"], direct_link: ["direct_link"], website: ["website"], unknown: ["unknown"],
    google: ["other"], search: ["other"], social: ["other"], referral: ["other"], labelled: ["other"],
  };
  const list = [...groups.entries()].map(([group, g]) => {
    // Conversion rows exist per channel, not per host group; "other" channel groups share the same figures.
    const channels = channelsOfGroup[group];
    const sum = (map: Map<string, number>) => channels.reduce((n, c) => n + (map.get(c) ?? 0), 0);
    const shared = channels.includes("other") && [...groups.keys()].filter((k) => channelsOfGroup[k].includes("other")).length > 1;
    return { group, sessions: g.value, previous: prev.get(group) ?? 0, hosts: [...g.hosts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([label, value]) => ({ label, value })),
      router: shared ? null : sum(m.router), support: shared ? null : sum(m.support), escalated: shared ? null : sum(m.escalated), media: shared ? null : sum(m.media) };
  }).sort((a, b) => b.sessions - a.sessions);
  const totalSessions = list.reduce((n, g) => n + g.sessions, 0);
  const channels = await byDim("sources", p, 20);
  const channelRows = channels.map((c) => ({ channel: c.key as SupportChannel, sessions: c.value, router: m.router.get(c.key) ?? 0, support: m.support.get(c.key) ?? 0, escalated: m.escalated.get(c.key) ?? 0, media: m.media.get(c.key) ?? 0 }));
  const labels = await byDim("link_labels", p, 20);
  const trendShopee = await dailyWhere("sources", p, "shopee");
  return { groups: list, totalSessions, channels: channelRows, labels, trendShopee };
}

async function dailyWhere(metric: string, p: Period, dim1: string) {
  return [...(await db()<{ day: string; value: number }[]>`
    SELECT d::date::text AS day, COALESCE((SELECT sum(value) FROM analytics.agg_daily a WHERE a.metric = ${metric} AND a.dim1 = ${dim1} AND a.day = d::date), 0)::int AS value
    FROM generate_series(${p.from}::date, ${p.to}::date, interval '1 day') d ORDER BY d`)];
}

export async function campaigns(p: Period) {
  const [rows, support, escalated, content] = await Promise.all([byDims("campaigns", p, 100), byDim("campaign_support", p, 100), byDim("campaign_escalated", p, 100), byDims("campaign_content", p, 200)]);
  const s = new Map(support.map((r) => [r.key, r.value])); const e = new Map(escalated.map((r) => [r.key, r.value]));
  const byCampaign = new Map<string, { sessions: number; sources: string[] }>();
  for (const r of rows) { const c = byCampaign.get(r.dim1) ?? { sessions: 0, sources: [] }; c.sessions += r.value; if (r.dim2 && !c.sources.includes(r.dim2)) c.sources.push(r.dim2); byCampaign.set(r.dim1, c); }
  return {
    campaigns: [...byCampaign.entries()].map(([name, c]) => ({ name, sessions: c.sessions, sources: c.sources, support: s.get(name) ?? 0, escalated: e.get(name) ?? 0 })).sort((a, b) => b.sessions - a.sessions),
    content: content.map((r) => ({ campaign: r.dim1, content: r.dim2, sessions: r.value })),
  };
}

export async function visitors(p: Period) {
  const [sessions, consented, newVisitors, pageViews, devices, browsers, regions, countries, trendSessions, trendVisitors, supportSessions, cases] = await Promise.all([
    compared("sessions", p), compared("visitors_consented", p), compared("visitors_new", p), compared("page_views", p),
    byDim("sessions", p, 6), byDims("browsers", p, 8), byDim("regions", p, 20), byDim("countries", p, 10), daily("sessions", p), daily("visitors_consented", p),
    db()<{ n: number; prev: number }[]>`SELECT (SELECT count(*)::int FROM support.sessions WHERE created_at >= ${p.from}::date AND created_at < ${p.to}::date + 1) AS n,
      (SELECT count(*)::int FROM support.sessions WHERE created_at >= ${p.prevFrom}::date AND created_at < ${p.prevTo}::date + 1) AS prev`,
    db()<{ n: number; prev: number }[]>`SELECT (SELECT count(*)::int FROM support.cases WHERE created_at >= ${p.from}::date AND created_at < ${p.to}::date + 1) AS n,
      (SELECT count(*)::int FROM support.cases WHERE created_at >= ${p.prevFrom}::date AND created_at < ${p.prevTo}::date + 1) AS prev`,
  ]);
  return {
    sessions, consented, newVisitors, pageViews, trendSessions, trendVisitors,
    supportSessions: compare(supportSessions[0]?.n ?? 0, supportSessions[0]?.prev ?? 0), cases: compare(cases[0]?.n ?? 0, cases[0]?.prev ?? 0),
    devices: devices.map((r) => ({ label: r.key || "unknown", value: r.value })),
    browsers: browsers.map((r) => ({ label: `${r.dim1} on ${r.dim2}`, value: r.value })),
    regions: regions.map((r) => ({ label: MY_REGIONS[r.key] ?? "Unknown state", value: r.value, suppressed: r.value < GEO_SUPPRESSION_THRESHOLD })),
    countries: countries.map((r) => ({ label: r.key || "unknown", value: r.value })),
  };
}

export async function behaviour(p: Period) {
  const [pages, clicks, exits, searches, failed, articles, nav] = await Promise.all([byDims("page_views", p, 20), byDims("ui_clicks", p, 30), byDims("exits", p, 100), byDim("searches", p, 15), byDim("searches_no_results", p, 15), byDim("article_views", p, 10), byDims("nav_paths", p, 40)]);
  const exitByPage = new Map<string, { value: number; shallow: number }>();
  for (const r of exits) { const c = exitByPage.get(r.dim1) ?? { value: 0, shallow: 0 }; c.value += r.value; if (r.dim2 === "0" || r.dim2 === "25") c.shallow += r.value; exitByPage.set(r.dim1, c); }
  const titles = new Map((articles.length ? await db()<{ id: string; title: string }[]>`SELECT a.id::text, r.title FROM knowledge.articles a JOIN knowledge.revisions r ON r.article_id = a.id AND r.status = 'published' AND r.locale = 'en' WHERE a.id = ANY (${articles.map((a) => a.key).filter(isUuid)}::uuid[])` : []).map((r) => [r.id, r.title]));
  return {
    pages: pages.map((r) => ({ label: `${r.dim1 || "home"}${r.dim2 ? ` (${r.dim2})` : ""}`, value: r.value })),
    clicks: clicks.map((r) => ({ label: `${r.dim1}${r.dim2 ? ` on ${r.dim2}` : ""}`, value: r.value })),
    exits: [...exitByPage.entries()].map(([label, c]) => ({ label: label || "unknown", value: c.value, note: `· ${c.shallow} before 50% scroll` })).sort((a, b) => b.value - a.value),
    searches: searches.map((r) => ({ label: r.key, value: r.value })), failed: failed.map((r) => ({ label: r.key, value: r.value })),
    articles: articles.map((r) => ({ label: titles.get(r.key) ?? r.key.slice(0, 8), value: r.value })),
    navPaths: nav.map((r) => ({ label: `${r.dim1 || "home"} → ${r.dim2 || "home"}`, value: r.value })),
  };
}

export interface HeatCell { x: number; y: number; value: number }
export async function heatmaps(p: Period) {
  const rows = await byDims("click_grid", p, 5000);
  const grids = new Map<string, { page: string; viewport: string; total: number; cells: HeatCell[] }>();
  for (const r of rows) {
    const [page, viewport] = r.dim1.split("|");
    const [x, y] = r.dim2.split(",").map(Number);
    const g = grids.get(r.dim1) ?? { page: page || "home", viewport: viewport ?? "desktop", total: 0, cells: [] };
    g.total += r.value; g.cells.push({ x: x ?? 0, y: y ?? 0, value: r.value }); grids.set(r.dim1, g);
  }
  const [models, scenarios, exits, nav, resources] = await Promise.all([routerModels(p), routerScenarios(p), byDims("journey_exit", p, 50), byDims("nav_paths", p, 20), mediaTop(p, 10)]);
  return {
    grids: [...grids.values()].sort((a, b) => b.total - a.total).slice(0, 12), models: models.slice(0, 7), scenarios: scenarios.slice(0, 10),
    exits: exits.map((r) => ({ label: `${r.dim2 === "left_after_problem" ? "After choosing a problem" : "After starting the assistant"}, last page: ${r.dim1 || "unknown"}`, value: r.value })),
    navPaths: nav.map((r) => ({ label: `${r.dim1 || "home"} → ${r.dim2 || "home"}`, value: r.value })), resources,
  };
}

export async function routerModels(p: Period): Promise<Row[]> {
  const rows = await byDim("router_models", p, 10);
  const names = await modelNames(rows.map((r) => r.key).filter(isUuid));
  return rows.map((r) => { const m = names.get(r.key); return { label: m ? `${m.name} (${m.ecr ?? "-"})` : "unknown", value: r.value }; });
}
export async function routerScenarios(p: Period): Promise<Row[]> {
  const rows = await byDim("router_scenarios", p, 15);
  return rows.map((r) => ({ label: scenarioTitle(r.key), value: r.value }));
}

export async function routers(p: Period) {
  const [models, modes, scenariosAll, unverified, flows, prevModels] = await Promise.all([byDims("router_models", p, 50), byDims("router_modes", p, 50), byDims("router_scenarios", p, 200), byDims("router_scenarios_unverified", p, 200), byDims("flow_steps", p, 200), byDims("router_models", { ...p, from: p.prevFrom, to: p.prevTo }, 50)]);
  const ids = [...new Set([...models.map((r) => r.dim1), ...modes.map((r) => r.dim1), ...scenariosAll.map((r) => r.dim2)].filter(isUuid))];
  const names = await modelNames(ids);
  const label = (id: string) => { const m = names.get(id); return m ? `${m.name} (${m.ecr ?? "-"})` : "unknown"; };
  const perModel = new Map<string, number>(); for (const r of models) perModel.set(r.dim1, (perModel.get(r.dim1) ?? 0) + r.value);
  const prevPerModel = new Map<string, number>(); for (const r of prevModels) prevPerModel.set(r.dim1, (prevPerModel.get(r.dim1) ?? 0) + r.value);
  const unver = new Map(unverified.map((r) => [`${r.dim1}|${r.dim2}`, r.value]));
  const flowIds = [...new Set(flows.map((r) => r.dim1.split(":")[0]!).filter(isUuid))];
  const flowNames = new Map((flowIds.length ? await db()<{ id: string; title: string }[]>`SELECT id::text, title_en AS title FROM knowledge.flows WHERE id = ANY (${flowIds}::uuid[])` : []).map((f) => [f.id, f.title]));
  type StepRow = { flow: string; step: string; next: number; back: number; resolved: number; escalate: number; restart: number };
  const steps = new Map<string, StepRow>();
  const actions = ["next", "back", "resolved", "escalate", "restart"] as const;
  for (const r of flows) {
    const [fid, step] = r.dim1.split(":");
    const s = steps.get(r.dim1) ?? { flow: flowNames.get(fid!) ?? fid!.slice(0, 8), step: step ?? "", next: 0, back: 0, resolved: 0, escalate: 0, restart: 0 };
    const action = actions.find((a) => a === r.dim2);
    if (action) s[action] += r.value;
    steps.set(r.dim1, s);
  }
  return {
    models: [...perModel.entries()].map(([id, value]) => ({ label: label(id), value, previous: prevPerModel.get(id) ?? 0 })).sort((a, b) => b.value - a.value),
    modes: modes.map((r) => ({ label: `${label(r.dim1)}: ${r.dim2 === "ap" ? "AP" : "Mesh"}`, value: r.value })),
    scenarios: scenariosAll.map((r) => ({ label: `${label(r.dim2)}, ${scenarioTitle(r.dim1)}`, value: r.value, note: unver.get(`${r.dim1}|${r.dim2}`) ? `· ${unver.get(`${r.dim1}|${r.dim2}`)} without a verified guide` : "· verified guide shown" })),
    steps: [...steps.values()].sort((a, b) => (b.next + b.resolved + b.escalate) - (a.next + a.resolved + a.escalate)),
  };
}

export async function supportAnalytics(p: Period) {
  const [started, resolved, escalated, outcomes, escalations, followups, funnel, demand] = await Promise.all([
    compared("support_started", p), compared("support_resolved", p), compared("escalations", p), byDim("support_outcomes", p, 6), byDims("escalations", p, 30), byDim("case_followups", p, 4), byDim("funnel", p, 10), demandTotals(p),
  ]);
  const sql = db();
  const cases = await sql<{ status: string; n: number }[]>`SELECT status, count(*)::int AS n FROM support.cases WHERE created_at >= ${p.from}::date AND created_at < ${p.to}::date + 1 GROUP BY status ORDER BY n DESC`;
  const caseChannels = await sql<{ channel: string; n: number }[]>`
    SELECT COALESCE(a.channel, 'unknown') AS channel, count(*)::int AS n FROM support.cases c LEFT JOIN support.attribution a ON a.case_id = c.id OR (c.session_id IS NOT NULL AND a.session_id = c.session_id)
    WHERE c.created_at >= ${p.from}::date AND c.created_at < ${p.to}::date + 1 GROUP BY 1 ORDER BY n DESC`;
  const caseModels = await sql<{ label: string; n: number }[]>`
    SELECT COALESCE(m.display_name, 'No model') AS label, count(*)::int AS n FROM support.cases c LEFT JOIN catalog.product_models m ON m.id = c.model_id
    WHERE c.created_at >= ${p.from}::date AND c.created_at < ${p.to}::date + 1 GROUP BY 1 ORDER BY n DESC LIMIT 10`;
  return {
    started, resolved, escalated, demand,
    outcomes: outcomes.map((r) => ({ label: r.key || "unknown", value: r.value })),
    escalations: escalations.map((r) => ({ label: `${r.dim1}${r.dim2 ? ` · ${scenarioTitle(`x:${r.dim2}`).replace(/^Mesh: /, "")}` : ""}`, value: r.value })),
    followups: followups.map((r) => ({ label: r.key, value: r.value })),
    funnel: funnel.sort((a, b) => a.key.localeCompare(b.key)).map((r) => ({ label: r.key.slice(2).replace("_", " "), value: r.value })),
    cases: cases.map((r) => ({ label: r.status.replace("_", " "), value: r.n })), caseChannels: caseChannels.map((r) => ({ label: r.channel, value: r.n })), caseModels: caseModels.map((r) => ({ label: r.label, value: r.n })),
  };
}

/** Recent support sessions for investigation: ids, model, status and linked case. No message content here. */
export async function recentSupportSessions(p: Period, limit = 50) {
  return [...(await db()<{ public_id: string; locale: string; status: string; mode: string; model: string | null; created_at: Date; messages: number; case_id: string | null; reference: string | null; channel: string | null }[]>`
    SELECT s.public_id, s.locale, s.status, s.mode, m.display_name AS model, s.created_at,
      (SELECT count(*)::int FROM support.messages x WHERE x.session_id = s.id AND x.role = 'customer') AS messages,
      c.id AS case_id, c.reference, a.channel
    FROM support.sessions s LEFT JOIN catalog.product_models m ON m.id = s.model_id LEFT JOIN support.cases c ON c.session_id = s.id LEFT JOIN support.attribution a ON a.session_id = s.id
    WHERE s.created_at >= ${p.from}::date AND s.created_at < ${p.to}::date + 1 ORDER BY s.created_at DESC LIMIT ${limit}`)];
}

async function demandTotals(p: Period) {
  const [r] = await db()<{ requests: number; prev: number; open: number }[]>`
    SELECT (SELECT count(*)::int FROM support.resource_demand_requests WHERE created_at >= ${p.from}::date AND created_at < ${p.to}::date + 1) AS requests,
           (SELECT count(*)::int FROM support.resource_demand_requests WHERE created_at >= ${p.prevFrom}::date AND created_at < ${p.prevTo}::date + 1) AS prev,
           (SELECT count(*)::int FROM support.resource_demands WHERE status <> 'approved') AS open`;
  return { ...compare(r?.requests ?? 0, r?.prev ?? 0), open: r?.open ?? 0 };
}

async function mediaTop(p: Period, limit: number) {
  const rows = await byDims("resource_opens", p, limit);
  const ids = rows.map((r) => r.dim1).filter(isUuid);
  const titles = new Map((ids.length ? await db()<{ id: string; title: string }[]>`SELECT id::text, title_en AS title FROM knowledge.resources WHERE id = ANY (${ids}::uuid[])` : []).map((r) => [r.id, r.title]));
  return rows.map((r) => ({ label: `${r.dim2}: ${titles.get(r.dim1) ?? r.dim1.slice(0, 8)}`, value: r.value }));
}

export async function media(p: Period) {
  const sql = db();
  const [opens, progress, feedback] = await Promise.all([byDims("resource_opens", p, 100), byDims("video_progress", p, 400), byDims("resource_feedback", p, 200)]);
  const ids = [...new Set([...opens.map((r) => r.dim1), ...progress.map((r) => r.dim1), ...feedback.map((r) => r.dim1)].filter(isUuid))];
  const info = new Map((ids.length ? await sql<{ id: string; title: string; kind: string; model: string | null; locale: string; mode: string | null; scenario: string | null }[]>`
    SELECT r.id::text, r.title_en AS title, r.kind, m.display_name AS model, r.locale, r.support_mode AS mode, r.scenario_key AS scenario
    FROM knowledge.resources r LEFT JOIN catalog.product_models m ON m.id = r.model_id WHERE r.id = ANY (${ids}::uuid[])` : []).map((r) => [r.id, r]));
  const per = new Map<string, { opens: number; p25: number; p50: number; p75: number; p100: number; up: number; down: number }>();
  const get = (id: string) => { const v = per.get(id) ?? { opens: 0, p25: 0, p50: 0, p75: 0, p100: 0, up: 0, down: 0 }; per.set(id, v); return v; };
  for (const r of opens) get(r.dim1).opens += r.value;
  for (const r of progress) { const v = get(r.dim1); const k = `p${r.dim2}` as "p25" | "p50" | "p75" | "p100"; if (k in v) v[k] += r.value; }
  for (const r of feedback) { const v = get(r.dim1); if (r.dim2 === "1") v.up += r.value; else v.down += r.value; }
  const rows = [...per.entries()].map(([id, v]) => { const i = info.get(id); return { id, ...v, title: i?.title ?? id.slice(0, 8), kind: i?.kind ?? "unknown", model: i?.model ?? null, locale: i?.locale ?? "", mode: i?.mode ?? null, scenario: i?.scenario ?? null }; }).sort((a, b) => b.opens - a.opens);
  const byKind = (kind: string) => rows.filter((r) => r.kind === kind);
  const byModel = new Map<string, number>(); const byLocale = new Map<string, number>();
  for (const r of rows) { byModel.set(r.model ?? "No model", (byModel.get(r.model ?? "No model") ?? 0) + r.opens); byLocale.set(r.locale || "both", (byLocale.get(r.locale || "both") ?? 0) + r.opens); }
  // Demand versus availability: open demands by type against approved resources by type.
  const gaps = await sql<{ resource_type: string; open_demands: number; requests: number; approved: number }[]>`
    SELECT t.resource_type, count(DISTINCT d.id) FILTER (WHERE d.status <> 'approved')::int AS open_demands,
      (SELECT count(*)::int FROM support.resource_demand_requests q JOIN support.resource_demands d2 ON d2.id = q.demand_id WHERE d2.resource_type = t.resource_type AND q.created_at >= ${p.from}::date AND q.created_at < ${p.to}::date + 1) AS requests,
      (SELECT count(*)::int FROM knowledge.resources r WHERE r.kind = t.resource_type AND r.status = 'approved') AS approved
    FROM unnest(ARRAY['video','diagram','image','document']) AS t(resource_type) LEFT JOIN support.resource_demands d ON d.resource_type = t.resource_type GROUP BY t.resource_type`;
  // Repeat-request reduction: demands fulfilled in the period and how many new requests arrived after fulfilment.
  const after = await sql<{ requirement: string; fulfilled_at: Date; before: number; after: number }[]>`
    SELECT d.requirement, d.fulfilled_at,
      (SELECT count(*)::int FROM support.resource_demand_requests q WHERE q.demand_id = d.id AND q.created_at < d.fulfilled_at) AS before,
      (SELECT count(*)::int FROM support.resource_demand_requests q WHERE q.demand_id = d.id AND q.created_at >= d.fulfilled_at) AS after
    FROM support.resource_demands d WHERE d.status = 'approved' AND d.fulfilled_at IS NOT NULL ORDER BY d.fulfilled_at DESC LIMIT 20`;
  return {
    videos: byKind("video"), diagrams: byKind("diagram"), images: byKind("image"), documents: byKind("document"), all: rows,
    byModel: [...byModel.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
    byLocale: [...byLocale.entries()].map(([label, value]) => ({ label: label === "both" ? "No specific language" : label === "ms" ? "Malay" : "English", value })),
    gaps: [...gaps], after: [...after],
  };
}

/** Which tracking features exist, whether they are collecting now, and what gates them. Counts are real event counts for the last 24 hours. */
export async function trackingStatus() {
  const sql = db();
  const counts = new Map((await sql<{ name: string; n: number }[]>`SELECT name, count(*)::int AS n FROM analytics.events WHERE received_at > now() - interval '24 hours' GROUP BY name`).map((r) => [r.name, r.n]));
  const [consent] = await sql<{ total: number; analytics: number; last: Date | null }[]>`SELECT count(*)::int AS total, count(*) FILTER (WHERE analytics)::int AS analytics, max(created_at) AS last FROM analytics.consent_records WHERE created_at > now() - interval '30 days'`;
  const [agg] = await sql<{ last_day: string | null; rows: number }[]>`SELECT max(day)::text AS last_day, count(*)::int AS rows FROM analytics.agg_daily`;
  const [attr] = await sql<{ n: number; known: number }[]>`SELECT count(*)::int AS n, count(*) FILTER (WHERE channel <> 'unknown')::int AS known FROM support.attribution WHERE created_at > now() - interval '30 days'`;
  const [lastJob] = await sql<{ queue: string; finished_at: Date | null }[]>`SELECT queue, max(finished_at) AS finished_at FROM ops.jobs WHERE queue IN ('rollup_day', 'retention') AND status = 'done' GROUP BY queue ORDER BY finished_at DESC NULLS LAST LIMIT 1`;
  return { counts, consent: consent ?? { total: 0, analytics: 0, last: null }, agg: agg ?? { last_day: null, rows: 0 }, attribution: attr ?? { n: 0, known: 0 }, lastJob: lastJob ?? null, geoConfigured: geoStatus().ranges > 0 };
}

// ---------------------------------------------------------------------------
// Geography: state-level aggregates for the Malaysia map. Counts only; cells under the suppression
// threshold are reported as suppressed so the map never shows a handful of people in a small area.
// ---------------------------------------------------------------------------

export interface GeoStateRow {
  code: string; name: string; sessions: number; previous: number; visitors: number; newSessions: number; pageViews: number;
  router: number; mesh: number; problem: number; ai: number; escalated: number; cases: number; media: number; video: number; completed: number; suppressed: boolean;
}

async function geoMetricByRegion(metric: string, p: Period): Promise<Map<string, number>> {
  const rows = await db()<{ key: string; value: number }[]>`
    SELECT dim1 AS key, sum(value)::int AS value FROM analytics.agg_daily WHERE metric = ${metric} AND day >= ${p.from}::date AND day <= ${p.to}::date GROUP BY dim1`;
  return new Map(rows.map((r) => [r.key, r.value]));
}

/** National overview: every Malaysian state plus countries and the unknown share. */
export async function geoSummary(p: Period) {
  const sql = db();
  const sessionRows = await sql<{ country: string; region: string; value: number }[]>`
    SELECT dim1 AS country, dim2 AS region, sum(value)::int AS value FROM analytics.agg_daily WHERE metric = 'geo_sessions' AND day >= ${p.from}::date AND day <= ${p.to}::date GROUP BY dim1, dim2`;
  const prevRows = await sql<{ country: string; region: string; value: number }[]>`
    SELECT dim1 AS country, dim2 AS region, sum(value)::int AS value FROM analytics.agg_daily WHERE metric = 'geo_sessions' AND day >= ${p.prevFrom}::date AND day <= ${p.prevTo}::date GROUP BY dim1, dim2`;
  const byRegion = async (metric: string) => geoMetricByRegion(metric, p);
  const [visitors, newSessions, pageViews, router, mesh, problem, ai, escalated, cases, media, video, completed] = await Promise.all([
    sql<{ key: string; value: number }[]>`SELECT dim2 AS key, sum(value)::int AS value FROM analytics.agg_daily WHERE metric = 'geo_visitors' AND dim1 = 'MY' AND day >= ${p.from}::date AND day <= ${p.to}::date GROUP BY dim2`.then((r) => new Map(r.map((x) => [x.key, x.value]))),
    sql<{ key: string; value: number }[]>`SELECT dim2 AS key, sum(value)::int AS value FROM analytics.agg_daily WHERE metric = 'geo_new_sessions' AND dim1 = 'MY' AND day >= ${p.from}::date AND day <= ${p.to}::date GROUP BY dim2`.then((r) => new Map(r.map((x) => [x.key, x.value]))),
    sql<{ key: string; value: number }[]>`SELECT dim2 AS key, sum(value)::int AS value FROM analytics.agg_daily WHERE metric = 'geo_page_views' AND dim1 = 'MY' AND day >= ${p.from}::date AND day <= ${p.to}::date GROUP BY dim2`.then((r) => new Map(r.map((x) => [x.key, x.value]))),
    byRegion("geo_router"), byRegion("geo_mesh"), byRegion("geo_problem"), byRegion("geo_ai"), byRegion("geo_escalated"), byRegion("geo_cases"), byRegion("geo_media"), byRegion("geo_video"), byRegion("geo_completed"),
  ]);
  const my = new Map<string, number>(); const prevMy = new Map<string, number>();
  const countries = new Map<string, number>();
  let unknown = 0; let total = 0;
  for (const r of sessionRows) {
    total += r.value;
    if (r.country === "MY") my.set(r.region, (my.get(r.region) ?? 0) + r.value);
    else if (!r.country) unknown += r.value;
    else countries.set(r.country, (countries.get(r.country) ?? 0) + r.value);
  }
  for (const r of prevRows) if (r.country === "MY") prevMy.set(r.region, (prevMy.get(r.region) ?? 0) + r.value);
  const myUnknownState = my.get("") ?? 0;
  const states: GeoStateRow[] = Object.entries(MY_REGIONS).map(([code, name]) => {
    const sessions = my.get(code) ?? 0;
    return {
      code, name, sessions, previous: prevMy.get(code) ?? 0, visitors: visitors.get(code) ?? 0, newSessions: newSessions.get(code) ?? 0, pageViews: pageViews.get(code) ?? 0,
      router: router.get(code) ?? 0, mesh: mesh.get(code) ?? 0, problem: problem.get(code) ?? 0, ai: ai.get(code) ?? 0, escalated: escalated.get(code) ?? 0, cases: cases.get(code) ?? 0,
      media: media.get(code) ?? 0, video: video.get(code) ?? 0, completed: completed.get(code) ?? 0, suppressed: sessions > 0 && sessions < GEO_SUPPRESSION_THRESHOLD,
    };
  });
  const malaysia = states.reduce((a, s) => a + s.sessions, 0) + myUnknownState;
  return {
    period: p, states, totalSessions: total, malaysiaSessions: malaysia, malaysiaStateUnknown: myUnknownState, unknownSessions: unknown,
    countries: [...countries.entries()].map(([country, sessions]) => ({ country, sessions })).sort((a, b) => b.sessions - a.sessions).slice(0, 15),
    hasData: total > 0,
  };
}

/** Drill-down for one state: what those sessions did, their routers, problems, sources and cities (suppressed under the threshold). */
export async function geoRegion(p: Period, code: string) {
  if (!(code in MY_REGIONS)) return null;
  const sql = db();
  const sum = async (metric: string, from = p.from, to = p.to, dim: "dim1" | "dim2" = "dim1") => {
    const [r] = dim === "dim1"
      ? await sql<{ v: number }[]>`SELECT COALESCE(sum(value), 0)::int AS v FROM analytics.agg_daily WHERE metric = ${metric} AND dim1 = ${code} AND day >= ${from}::date AND day <= ${to}::date`
      : await sql<{ v: number }[]>`SELECT COALESCE(sum(value), 0)::int AS v FROM analytics.agg_daily WHERE metric = ${metric} AND dim1 = 'MY' AND dim2 = ${code} AND day >= ${from}::date AND day <= ${to}::date`;
    return r?.v ?? 0;
  };
  const dims = async (metric: string, limit = 8) => [...(await sql<{ key: string; value: number }[]>`
    SELECT dim2 AS key, sum(value)::int AS value FROM analytics.agg_daily WHERE metric = ${metric} AND dim1 = ${code} AND day >= ${p.from}::date AND day <= ${p.to}::date GROUP BY dim2 ORDER BY value DESC LIMIT ${limit}`)];
  const [sessions, prevSessions, visitors, newSessions, pageViews, router, mesh, problem, ai, escalated, cases, media, video, completed, models, scenarios, sources, cities] = await Promise.all([
    sum("geo_sessions", p.from, p.to, "dim2"), sum("geo_sessions", p.prevFrom, p.prevTo, "dim2"), sum("geo_visitors", p.from, p.to, "dim2"), sum("geo_new_sessions", p.from, p.to, "dim2"), sum("geo_page_views", p.from, p.to, "dim2"),
    sum("geo_router"), sum("geo_mesh"), sum("geo_problem"), sum("geo_ai"), sum("geo_escalated"), sum("geo_cases"), sum("geo_media"), sum("geo_video"), sum("geo_completed"),
    dims("geo_model"), dims("geo_scenario"), dims("geo_source", 12), dims("geo_city", 15),
  ]);
  const names = await modelNames(models.map((m) => m.key).filter(isUuid));
  return {
    code, name: MY_REGIONS[code]!, period: p,
    sessions: compare(sessions, prevSessions), visitors, newSessions, returningSessions: sessions - newSessions, pageViews, router, mesh, problem, ai, escalated, cases, media, video, completed,
    completionRate: problem ? Math.round((completed / problem) * 100) : null, escalationRate: problem ? Math.round((escalated / problem) * 100) : null,
    suppressed: sessions > 0 && sessions < GEO_SUPPRESSION_THRESHOLD,
    topModels: models.map((m) => { const n = names.get(m.key); return { label: n ? `${n.name} (ECR ${n.ecr ?? "-"})` : "unknown", value: m.value }; }),
    topScenarios: scenarios.map((s) => ({ label: scenarioTitle(s.key), value: s.value })),
    topSources: sources.map((s) => ({ label: s.key, value: s.value })),
    cities: cities.map((c) => ({ label: c.key, value: c.value, suppressed: c.value < GEO_SUPPRESSION_THRESHOLD })),
  };
}
