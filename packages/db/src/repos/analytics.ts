import type { Sql } from "../client";

/**
 * Daily aggregation of first-party events into analytics.agg_daily (day, metric, dim1, dim2, value).
 * Re-running a day replaces its rows, so the job is idempotent. Raw events are deleted after the
 * retention period by a separate job.
 */
export async function rollupDay(sql: Sql, day: string): Promise<number> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error("invalid day");
  return sql.begin(async (tx) => {
    await tx`DELETE FROM analytics.agg_daily WHERE day = ${day}::date`;
    await tx`
      WITH e AS (SELECT * FROM analytics.events WHERE received_at >= ${day}::date AND received_at < ${day}::date + 1)
      INSERT INTO analytics.agg_daily (day, metric, dim1, dim2, value)
      SELECT ${day}::date, metric, dim1, dim2, value FROM (
        SELECT 'sessions' AS metric, COALESCE(device_category, '') AS dim1, '' AS dim2, count(DISTINCT session_id) AS value FROM e GROUP BY 2
        UNION ALL SELECT 'visitors_consented', '', '', count(DISTINCT visitor_id) FROM e WHERE visitor_id IS NOT NULL
        UNION ALL SELECT 'visitors_new', '', '', count(DISTINCT e.visitor_id) FROM e WHERE e.visitor_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM analytics.events p WHERE p.visitor_id = e.visitor_id AND p.received_at < ${day}::date)
        UNION ALL SELECT 'page_views', COALESCE(page_type, ''), COALESCE(locale, ''), count(*) FROM e WHERE name = 'page_view' GROUP BY 2, 3
        UNION ALL SELECT 'landing_pages', COALESCE(page_path, ''), '', count(*) FROM e WHERE name = 'page_view' AND (props->>'landing')::boolean IS TRUE GROUP BY 2
        UNION ALL SELECT 'referrers', COALESCE(referrer_domain, '(direct)'), COALESCE(utm_source, ''), count(*) FROM e WHERE name = 'session_started' GROUP BY 2, 3
        UNION ALL SELECT 'searches', lower(props->>'query'), COALESCE(locale, ''), count(*) FROM e WHERE name = 'model_search' AND props ? 'query' GROUP BY 2, 3
        UNION ALL SELECT 'searches_no_results', lower(props->>'query'), COALESCE(locale, ''), count(*) FROM e WHERE name = 'search_no_results' AND props ? 'query' GROUP BY 2, 3
        UNION ALL SELECT 'model_interest', props->>'resolved_model_id', 'search', count(*) FROM e WHERE name = 'model_search' AND props ? 'resolved_model_id' GROUP BY 2
        UNION ALL SELECT 'model_interest', props->>'model_id', 'view', count(*) FROM e WHERE name = 'product_view' AND props ? 'model_id' GROUP BY 2
        UNION ALL SELECT 'article_views', props->>'article_id', COALESCE(locale, ''), count(*) FROM e WHERE name = 'article_view' GROUP BY 2, 3
        UNION ALL SELECT 'article_feedback', props->>'article_id', props->>'rating', count(*) FROM e WHERE name = 'article_feedback' GROUP BY 2, 3
        UNION ALL SELECT 'support_' || replace(name, 'support_', ''), COALESCE(locale, ''), '', count(*) FROM e WHERE name IN ('support_started', 'support_resolved', 'support_escalated', 'support_message_submitted') GROUP BY name, 2
        UNION ALL SELECT 'support_outcomes', COALESCE(props->>'outcome', ''), '', count(*) FROM e WHERE name = 'support_message_submitted' GROUP BY 2
        UNION ALL SELECT 'regions', COALESCE(region, ''), '', count(DISTINCT session_id) FROM e WHERE country = 'MY' GROUP BY 2
        UNION ALL SELECT 'countries', COALESCE(country, 'unknown'), '', count(DISTINCT session_id) FROM e GROUP BY 2
        UNION ALL SELECT 'browsers', COALESCE(browser_family, ''), COALESCE(os_family, ''), count(DISTINCT session_id) FROM e GROUP BY 2, 3
        UNION ALL SELECT 'web_vital_p75', props->>'name', COALESCE(props->>'route', ''), percentile_disc(0.75) WITHIN GROUP (ORDER BY (props->>'value')::numeric)::bigint
          FROM e WHERE name = 'performance_error' AND props->>'kind' = 'web_vital' GROUP BY 2, 3
        UNION ALL SELECT 'errors', props->>'kind', COALESCE(props->>'route', page_path, ''), count(*) FROM e WHERE name = 'performance_error' AND props->>'kind' <> 'web_vital' GROUP BY 2, 3
        UNION ALL SELECT 'exits', COALESCE(page_type, ''), props->>'max_scroll_pct', count(*) FROM e WHERE name = 'navigation_exit' GROUP BY 2, 3
        UNION ALL SELECT 'ui_clicks', props->>'element_key', COALESCE(page_type, ''), count(*) FROM e WHERE name = 'ui_click' GROUP BY 2, 3
        UNION ALL SELECT 'outbound_clicks', props->>'listing_id', '', count(*) FROM e WHERE name = 'shopee_outbound_click' GROUP BY 2
      ) t WHERE dim1 IS NOT NULL`;
    // Commerce impressions and clicks from the recommendations table (server-side truth).
    await tx`
      INSERT INTO analytics.agg_daily (day, metric, dim1, dim2, value)
      SELECT ${day}::date, 'rec_impressions', product_id::text, context, count(*) FROM commerce.recommendations
      WHERE created_at >= ${day}::date AND created_at < ${day}::date + 1 GROUP BY product_id, context
      UNION ALL
      SELECT ${day}::date, 'rec_clicks', product_id::text, context, count(*) FROM commerce.recommendations
      WHERE clicked_at >= ${day}::date AND clicked_at < ${day}::date + 1 GROUP BY product_id, context
      ON CONFLICT (day, metric, dim1, dim2) DO UPDATE SET value = EXCLUDED.value`;
    // Funnel: sessions reaching each step on the day.
    await tx`
      WITH s AS (
        SELECT session_id, bool_or(name IN ('model_search', 'search_no_results')) AS searched, bool_or(name = 'article_view') AS read,
               bool_or(name = 'support_started') AS support, bool_or(name = 'support_resolved') AS resolved, bool_or(name = 'support_escalated') AS escalated
        FROM analytics.events WHERE received_at >= ${day}::date AND received_at < ${day}::date + 1 GROUP BY session_id)
      INSERT INTO analytics.agg_daily (day, metric, dim1, dim2, value)
      SELECT ${day}::date, 'funnel', step, '', n FROM (
        SELECT 'a_sessions' AS step, count(*) AS n FROM s UNION ALL SELECT 'b_searched', count(*) FILTER (WHERE searched) FROM s
        UNION ALL SELECT 'c_read_article', count(*) FILTER (WHERE read) FROM s UNION ALL SELECT 'd_support', count(*) FILTER (WHERE support) FROM s
        UNION ALL SELECT 'e_resolved', count(*) FILTER (WHERE resolved) FROM s UNION ALL SELECT 'f_escalated', count(*) FILTER (WHERE escalated) FROM s) f`;
    const [c] = await tx<{ n: number }[]>`SELECT count(*)::int AS n FROM analytics.agg_daily WHERE day = ${day}::date`;
    return c?.n ?? 0;
  });
}

/** Retention: raw analytics 90 days, security events 30 days, support sessions 180 days, closed-case contacts 90 days. */
export async function applyRetention(sql: Sql, opts = { eventsDays: 90, securityDays: 30, sessionDays: 180, contactDays: 90, retrievalDays: 90, demandQuestionDays: 180 }) {
  const out: Record<string, number> = {};
  out.events = (await sql`DELETE FROM analytics.events WHERE received_at < now() - make_interval(days => ${opts.eventsDays})`).count;
  out.security = (await sql`DELETE FROM analytics.security_events WHERE at < now() - make_interval(days => ${opts.securityDays})`).count;
  out.retrieval = (await sql`DELETE FROM support.retrieval_runs WHERE created_at < now() - make_interval(days => ${opts.retrievalDays})`).count;
  out.contacts = (await sql`
    UPDATE support.cases SET contact_name_enc = NULL, contact_email_enc = NULL, contact_phone_enc = NULL, contact_purged_at = now()
    WHERE contact_purged_at IS NULL AND closed_at < now() - make_interval(days => ${opts.contactDays})`).count;
  out.sessions = (await sql`
    DELETE FROM support.sessions s WHERE s.created_at < now() - make_interval(days => ${opts.sessionDays})
      AND NOT EXISTS (SELECT 1 FROM support.cases c WHERE c.session_id = s.id AND c.status NOT IN ('closed'))`).count;
  // Demand counts are kept for trend analysis; the customer's own words are removed after the support retention period.
  out.demandQuestions = (await sql`
    UPDATE support.resource_demand_requests SET question = '[removed after retention period]'
    WHERE created_at < now() - make_interval(days => ${opts.demandQuestionDays}) AND question <> '[removed after retention period]'`).count;
  out.staffSessions = (await sql`DELETE FROM identity.sessions WHERE expires_at < now()`).count;
  out.rateLimits = (await sql`DELETE FROM ops.rate_limits WHERE updated_at < now() - interval '1 day'`).count;
  await sql`SELECT analytics.ensure_partitions(2)`;
  return out;
}
