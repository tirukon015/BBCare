import "server-only";
import { GEO_SUPPRESSION_THRESHOLD, MY_REGIONS } from "@bbcare/core";
import { db } from "@/lib/db";

export type Range = 7 | 30 | 90;
export const parseRange = (v: unknown): Range => (v === "30" ? 30 : v === "90" ? 90 : 7);

interface Row { label: string; value: number; dim2?: string }

export async function dashboardData(days: Range) {
  const sql = db();
  const since = sql`current_date - ${days - 1}::int`;
  const sum = (metric: string, limit = 10) => sql<{ dim1: string; value: number }[]>`
    SELECT dim1, sum(value)::int AS value FROM analytics.agg_daily WHERE metric = ${metric} AND day >= ${since} GROUP BY dim1 ORDER BY value DESC LIMIT ${limit}`;
  const total = async (metric: string) => (await sql<{ v: number }[]>`SELECT COALESCE(sum(value), 0)::int AS v FROM analytics.agg_daily WHERE metric = ${metric} AND day >= ${since}`)[0]?.v ?? 0;

  const [daily, devices, landing, referrers, searches, failed, articles, models, regions, vitals, errors, exits, clicks, funnel, recImp, recClick, browsers] = await Promise.all([
    sql<{ day: string; value: number }[]>`
      SELECT d::date::text AS day, COALESCE((SELECT sum(value) FROM analytics.agg_daily a WHERE a.metric = 'sessions' AND a.day = d::date), 0)::int AS value
      FROM generate_series(${since}, current_date, interval '1 day') d ORDER BY d`,
    sum("sessions"), sum("landing_pages"), sum("referrers"), sum("searches", 15), sum("searches_no_results", 15),
    sql<{ dim1: string; value: number; title: string | null }[]>`
      SELECT a.dim1, sum(a.value)::int AS value, (SELECT r.title FROM knowledge.revisions r WHERE r.article_id::text = a.dim1 AND r.status = 'published' ORDER BY (r.locale = 'en') DESC LIMIT 1) AS title
      FROM analytics.agg_daily a WHERE a.metric = 'article_views' AND a.day >= ${since} GROUP BY a.dim1 ORDER BY value DESC LIMIT 10`,
    sql<{ dim1: string; value: number; name: string | null }[]>`
      SELECT a.dim1, sum(a.value)::int AS value, (SELECT m.display_name FROM catalog.product_models m WHERE m.id::text = a.dim1) AS name
      FROM analytics.agg_daily a WHERE a.metric = 'model_interest' AND a.day >= ${since} GROUP BY a.dim1 ORDER BY value DESC LIMIT 10`,
    sum("regions", 20),
    sql<{ dim1: string; value: number }[]>`
      SELECT dim1, percentile_disc(0.5) WITHIN GROUP (ORDER BY value)::int AS value FROM analytics.agg_daily WHERE metric = 'web_vital_p75' AND day >= ${since} GROUP BY dim1`,
    sql<{ dim1: string; dim2: string; value: number }[]>`
      SELECT dim1, dim2, sum(value)::int AS value FROM analytics.agg_daily WHERE metric = 'errors' AND day >= ${since} GROUP BY dim1, dim2 ORDER BY value DESC LIMIT 10`,
    sql<{ dim1: string; value: number; shallow: number }[]>`
      SELECT dim1, sum(value)::int AS value, sum(value) FILTER (WHERE dim2 IN ('0', '25'))::int AS shallow FROM analytics.agg_daily WHERE metric = 'exits' AND day >= ${since} GROUP BY dim1 ORDER BY value DESC LIMIT 10`,
    sum("ui_clicks", 15),
    sql<{ dim1: string; value: number }[]>`SELECT dim1, sum(value)::int AS value FROM analytics.agg_daily WHERE metric = 'funnel' AND day >= ${since} GROUP BY dim1 ORDER BY dim1`,
    sql<{ dim1: string; value: number; name: string | null }[]>`
      SELECT a.dim1, sum(a.value)::int AS value, (SELECT p.name_en FROM commerce.products p WHERE p.id::text = a.dim1) AS name
      FROM analytics.agg_daily a WHERE a.metric = 'rec_impressions' AND a.day >= ${since} GROUP BY a.dim1 ORDER BY value DESC LIMIT 10`,
    sql<{ dim1: string; value: number }[]>`SELECT dim1, sum(value)::int AS value FROM analytics.agg_daily WHERE metric = 'rec_clicks' AND day >= ${since} GROUP BY dim1`,
    sum("browsers", 8),
  ]);
  const [sessions = 0, consented = 0, newVisitors = 0, pageViews = 0, started = 0, resolved = 0, escalated = 0] = await Promise.all(
    ["sessions", "visitors_consented", "visitors_new", "page_views", "support_started", "support_resolved", "support_escalated"].map(total),
  );
  const feedback = await sql<{ up: number; down: number }[]>`
    SELECT count(*) FILTER (WHERE rating = 1)::int AS up, count(*) FILTER (WHERE rating = -1)::int AS down FROM support.feedback WHERE created_at >= ${since}`;
  const clicksByProduct = new Map(recClick.map((r) => [r.dim1, r.value]));
  return {
    days, daily,
    totals: { sessions, consented, newVisitors, returning: Math.max(0, consented - newVisitors), pageViews, started, resolved, escalated, feedbackUp: feedback[0]?.up ?? 0, feedbackDown: feedback[0]?.down ?? 0 },
    devices: devices.map((r) => ({ label: r.dim1 || "unknown", value: r.value })) as Row[],
    landing: landing.map((r) => ({ label: r.dim1, value: r.value })) as Row[],
    referrers: referrers.map((r) => ({ label: r.dim1, value: r.value })) as Row[],
    searches: searches.map((r) => ({ label: r.dim1, value: r.value })) as Row[],
    failed: failed.map((r) => ({ label: r.dim1, value: r.value })) as Row[],
    articles: articles.map((r) => ({ label: r.title ?? r.dim1.slice(0, 8), value: r.value })) as Row[],
    models: models.map((r) => ({ label: r.name ?? "unknown", value: r.value })) as Row[],
    regions: regions
      .map((r) => ({ label: MY_REGIONS[r.dim1] ?? "Unknown state", value: r.value }))
      .map((r) => (r.value < GEO_SUPPRESSION_THRESHOLD ? { ...r, suppressed: true } : { ...r, suppressed: false })),
    vitals: vitals.map((r) => ({ label: r.dim1, value: r.value })) as Row[],
    errors: errors.map((r) => ({ label: `${r.dim1} · ${r.dim2}`, value: r.value })) as Row[],
    exits: exits.map((r) => ({ label: r.dim1 || "unknown", value: r.value, shallow: r.shallow })),
    clicks: clicks.map((r) => ({ label: r.dim1, value: r.value })) as Row[],
    funnel: funnel.map((r) => ({ label: r.dim1.slice(2).replace("_", " "), value: r.value })) as Row[],
    products: recImp.map((r) => ({ label: r.name ?? "product", impressions: r.value, clicks: clicksByProduct.get(r.dim1) ?? 0 })),
    browsers: browsers.map((r) => ({ label: r.dim1, value: r.value })) as Row[],
  };
}

export async function exportRows(days: Range) {
  return db()<{ day: string; metric: string; dim1: string; dim2: string; value: number }[]>`
    SELECT day::text, metric, dim1, dim2, value::int FROM analytics.agg_daily
    WHERE day >= current_date - ${days - 1}::int AND metric NOT IN ('regions') ORDER BY day, metric, dim1 LIMIT 50000`;
}
