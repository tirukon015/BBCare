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
      SELECT ${day}::date, metric, dim1, COALESCE(dim2, ''), value FROM (
        SELECT 'sessions' AS metric, COALESCE(device_category, '') AS dim1, '' AS dim2, count(DISTINCT session_id) AS value FROM e GROUP BY 2
        UNION ALL SELECT 'visitors_consented', '', '', count(DISTINCT visitor_id) FROM e WHERE visitor_id IS NOT NULL
        UNION ALL SELECT 'visitors_new', '', '', count(DISTINCT e.visitor_id) FROM e WHERE e.visitor_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM analytics.events p WHERE p.visitor_id = e.visitor_id AND p.received_at < ${day}::date)
        UNION ALL SELECT 'page_views', COALESCE(page_type, ''), COALESCE(locale, ''), count(*) FROM e WHERE name = 'page_view' GROUP BY 2, 3
        UNION ALL SELECT 'landing_pages', COALESCE(page_path, ''), '', count(*) FROM e WHERE name = 'page_view' AND (props->>'landing')::boolean IS TRUE GROUP BY 2
        UNION ALL SELECT 'referrers', COALESCE(referrer_domain, '(no referrer)'), COALESCE(utm_source, ''), count(*) FROM e WHERE name = 'session_started' GROUP BY 2, 3
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
        -- Traffic sources: the channel classified at ingest plus the referrer host, per session start.
        UNION ALL SELECT 'sources', COALESCE(channel, 'unknown'), COALESCE(referrer_domain, ''), count(DISTINCT session_id) FROM e WHERE name = 'session_started' GROUP BY 2, 3
        UNION ALL SELECT 'link_labels', link_label, '', count(DISTINCT session_id) FROM e WHERE name = 'session_started' AND link_label IS NOT NULL GROUP BY 2
        UNION ALL SELECT 'campaigns', utm_campaign, COALESCE(utm_source, '') || '/' || COALESCE(utm_medium, ''), count(DISTINCT session_id) FROM e WHERE name = 'session_started' AND utm_campaign IS NOT NULL GROUP BY 2, 3
        UNION ALL SELECT 'campaign_content', utm_campaign, COALESCE(utm_content, ''), count(DISTINCT session_id) FROM e WHERE name = 'session_started' AND utm_campaign IS NOT NULL AND utm_content IS NOT NULL GROUP BY 2, 3
        -- Router journey.
        UNION ALL SELECT 'router_models', props->>'model_id', COALESCE(locale, ''), count(*) FROM e WHERE name = 'router_model_selected' GROUP BY 2, 3
        UNION ALL SELECT 'router_modes', props->>'model_id', props->>'mode', count(*) FROM e WHERE name = 'router_mode_selected' GROUP BY 2, 3
        UNION ALL SELECT 'router_scenarios', (props->>'mode') || ':' || (props->>'scenario'), props->>'model_id', count(*) FROM e WHERE name = 'router_scenario_selected' GROUP BY 2, 3
        UNION ALL SELECT 'router_scenarios_unverified', (props->>'mode') || ':' || (props->>'scenario'), props->>'model_id', count(*) FROM e WHERE name = 'router_scenario_selected' AND (props->>'verified')::boolean IS FALSE GROUP BY 2, 3
        UNION ALL SELECT 'flow_steps', (props->>'flow_id') || ':' || (props->>'step_key'), props->>'action', count(*) FROM e WHERE name = 'flow_step' GROUP BY 2, 3
        UNION ALL SELECT 'escalations', props->>'origin', COALESCE(props->>'scenario', ''), count(*) FROM e WHERE name = 'escalation_submitted' GROUP BY 2, 3
        UNION ALL SELECT 'case_followups', props->>'action', '', count(*) FROM e WHERE name = 'case_followup' GROUP BY 2
        -- Media.
        UNION ALL SELECT 'resource_opens', props->>'resource_id', props->>'kind', count(*) FROM e WHERE name = 'resource_open' GROUP BY 2, 3
        UNION ALL SELECT 'video_progress', props->>'resource_id', props->>'pct', count(*) FROM e WHERE name = 'video_progress' GROUP BY 2, 3
        UNION ALL SELECT 'resource_feedback', props->>'resource_id', props->>'rating', count(*) FROM e WHERE name = 'resource_feedback' GROUP BY 2, 3
        -- Interface heatmap: clicks per 10 percent grid cell, per page type and viewport.
        UNION ALL SELECT 'click_grid', COALESCE(page_type, '') || '|' || (props->>'viewport'), (props->>'x_pct') || ',' || (props->>'y_pct'), count(*) FROM e WHERE name = 'click_area' GROUP BY 2, 3
      ) t WHERE dim1 IS NOT NULL`;
    // Navigation paths: consecutive page views within a session (page types only).
    await tx`
      WITH v AS (
        SELECT session_id, COALESCE(page_type, '') AS pt, lag(COALESCE(page_type, '')) OVER (PARTITION BY session_id ORDER BY occurred_at) AS prev
        FROM analytics.events WHERE received_at >= ${day}::date AND received_at < ${day}::date + 1 AND name = 'page_view')
      INSERT INTO analytics.agg_daily (day, metric, dim1, dim2, value)
      SELECT ${day}::date, 'nav_paths', prev, pt, count(*) FROM v WHERE prev IS NOT NULL AND prev <> pt GROUP BY prev, pt
      ON CONFLICT (day, metric, dim1, dim2) DO UPDATE SET value = EXCLUDED.value`;
    // Where support journeys end: the last page type of sessions that chose a router problem or
    // started the assistant but neither resolved nor escalated on the day.
    await tx`
      WITH s AS (
        SELECT session_id,
          bool_or(name = 'router_scenario_selected') AS scenario, bool_or(name = 'support_started') AS support,
          bool_or(name IN ('support_resolved', 'escalation_submitted', 'support_escalated')) AS ended,
          bool_or(name = 'flow_step' AND props->>'action' = 'resolved') AS flow_resolved,
          (array_agg(COALESCE(page_type, '') ORDER BY occurred_at DESC) FILTER (WHERE name = 'page_view'))[1] AS last_page
        FROM analytics.events WHERE received_at >= ${day}::date AND received_at < ${day}::date + 1 GROUP BY session_id)
      INSERT INTO analytics.agg_daily (day, metric, dim1, dim2, value)
      SELECT ${day}::date, 'journey_exit', COALESCE(last_page, ''), stage, n FROM (
        SELECT last_page, 'left_after_problem' AS stage, count(*) AS n FROM s WHERE scenario AND NOT ended AND NOT flow_resolved GROUP BY last_page
        UNION ALL SELECT last_page, 'left_after_assistant', count(*) FROM s WHERE support AND NOT scenario AND NOT ended GROUP BY last_page) x
      WHERE n > 0
      ON CONFLICT (day, metric, dim1, dim2) DO UPDATE SET value = EXCLUDED.value`;
    // Sessions per channel that went on to a router selection, a support request or an escalation.
    await tx`
      WITH c AS (SELECT DISTINCT ON (session_id) session_id, COALESCE(channel, 'unknown') AS channel, utm_campaign FROM analytics.events
                 WHERE received_at >= ${day}::date AND received_at < ${day}::date + 1 AND name = 'session_started' ORDER BY session_id, occurred_at),
           a AS (SELECT session_id, bool_or(name = 'router_model_selected') AS router, bool_or(name IN ('support_started', 'router_scenario_selected')) AS support,
                        bool_or(name IN ('escalation_submitted', 'support_escalated')) AS escalated, bool_or(name = 'resource_open') AS media
                 FROM analytics.events WHERE received_at >= ${day}::date AND received_at < ${day}::date + 1 GROUP BY session_id)
      INSERT INTO analytics.agg_daily (day, metric, dim1, dim2, value)
      SELECT ${day}::date, m.metric, m.dim1, '', m.n FROM (
        SELECT 'channel_router' AS metric, c.channel AS dim1, count(*) FILTER (WHERE a.router) AS n FROM c JOIN a USING (session_id) GROUP BY c.channel
        UNION ALL SELECT 'channel_support', c.channel, count(*) FILTER (WHERE a.support) FROM c JOIN a USING (session_id) GROUP BY c.channel
        UNION ALL SELECT 'channel_escalated', c.channel, count(*) FILTER (WHERE a.escalated) FROM c JOIN a USING (session_id) GROUP BY c.channel
        UNION ALL SELECT 'channel_media', c.channel, count(*) FILTER (WHERE a.media) FROM c JOIN a USING (session_id) GROUP BY c.channel
        UNION ALL SELECT 'campaign_support', c.utm_campaign, count(*) FILTER (WHERE a.support) FROM c JOIN a USING (session_id) WHERE c.utm_campaign IS NOT NULL GROUP BY c.utm_campaign
        UNION ALL SELECT 'campaign_escalated', c.utm_campaign, count(*) FILTER (WHERE a.escalated) FROM c JOIN a USING (session_id) WHERE c.utm_campaign IS NOT NULL GROUP BY c.utm_campaign
      ) m WHERE m.n > 0
      ON CONFLICT (day, metric, dim1, dim2) DO UPDATE SET value = EXCLUDED.value`;
    // Geography: one state (or country) per session, taken from the first event of the session on the
    // day, then what that session did. Counts only; no coordinates, no addresses.
    await tx`
      WITH g AS (SELECT DISTINCT ON (session_id) session_id, COALESCE(country, '') AS country, COALESCE(region, '') AS region, COALESCE(city, '') AS city, visitor_id, COALESCE(channel, 'unknown') AS channel
                 FROM analytics.events WHERE received_at >= ${day}::date AND received_at < ${day}::date + 1 ORDER BY session_id, occurred_at),
           a AS (SELECT session_id,
                   count(*) FILTER (WHERE name = 'page_view') AS page_views,
                   bool_or(name = 'session_started' AND NOT EXISTS (SELECT 1 FROM analytics.events p WHERE p.session_id = e.session_id AND p.received_at < ${day}::date)) AS new_session,
                   bool_or(name = 'router_model_selected') AS router,
                   bool_or(name = 'router_mode_selected' AND props->>'mode' = 'mesh') AS mesh,
                   bool_or(name = 'router_scenario_selected') AS problem,
                   bool_or(name = 'support_started') AS ai_chat,
                   bool_or(name = 'escalation_submitted') AS escalated,
                   bool_or(name = 'resource_open') AS media,
                   bool_or(name = 'resource_open' AND props->>'kind' = 'video') AS video,
                   bool_or(name = 'flow_step' AND props->>'action' = 'resolved') AS completed
                 FROM analytics.events e WHERE received_at >= ${day}::date AND received_at < ${day}::date + 1 GROUP BY session_id)
      INSERT INTO analytics.agg_daily (day, metric, dim1, dim2, value)
      SELECT ${day}::date, m.metric, m.dim1, m.dim2, m.n FROM (
        SELECT 'geo_sessions' AS metric, g.country AS dim1, g.region AS dim2, count(*) AS n FROM g GROUP BY 1, 2, 3
        UNION ALL SELECT 'geo_visitors', g.country, g.region, count(DISTINCT g.visitor_id) FROM g WHERE g.visitor_id IS NOT NULL GROUP BY 2, 3
        UNION ALL SELECT 'geo_new_sessions', g.country, g.region, count(*) FROM g JOIN a USING (session_id) WHERE a.new_session GROUP BY 2, 3
        UNION ALL SELECT 'geo_page_views', g.country, g.region, sum(a.page_views) FROM g JOIN a USING (session_id) GROUP BY 2, 3
        UNION ALL SELECT 'geo_router', g.region, '', count(*) FROM g JOIN a USING (session_id) WHERE g.country = 'MY' AND a.router GROUP BY 2
        UNION ALL SELECT 'geo_mesh', g.region, '', count(*) FROM g JOIN a USING (session_id) WHERE g.country = 'MY' AND a.mesh GROUP BY 2
        UNION ALL SELECT 'geo_problem', g.region, '', count(*) FROM g JOIN a USING (session_id) WHERE g.country = 'MY' AND a.problem GROUP BY 2
        UNION ALL SELECT 'geo_ai', g.region, '', count(*) FROM g JOIN a USING (session_id) WHERE g.country = 'MY' AND a.ai_chat GROUP BY 2
        UNION ALL SELECT 'geo_escalated', g.region, '', count(*) FROM g JOIN a USING (session_id) WHERE g.country = 'MY' AND a.escalated GROUP BY 2
        UNION ALL SELECT 'geo_media', g.region, '', count(*) FROM g JOIN a USING (session_id) WHERE g.country = 'MY' AND a.media GROUP BY 2
        UNION ALL SELECT 'geo_video', g.region, '', count(*) FROM g JOIN a USING (session_id) WHERE g.country = 'MY' AND a.video GROUP BY 2
        UNION ALL SELECT 'geo_completed', g.region, '', count(*) FROM g JOIN a USING (session_id) WHERE g.country = 'MY' AND a.completed GROUP BY 2
        UNION ALL SELECT 'geo_city', g.region, g.city, count(*) FROM g WHERE g.country = 'MY' AND g.region <> '' AND g.city <> '' GROUP BY 2, 3
        UNION ALL SELECT 'geo_source', g.region, g.channel, count(*) FROM g WHERE g.country = 'MY' GROUP BY 2, 3
        UNION ALL SELECT 'geo_model', g.region, x.model_id, count(DISTINCT x.session_id) FROM g JOIN (
            SELECT session_id, props->>'model_id' AS model_id FROM analytics.events WHERE received_at >= ${day}::date AND received_at < ${day}::date + 1 AND name = 'router_model_selected') x USING (session_id)
          WHERE g.country = 'MY' AND x.model_id IS NOT NULL GROUP BY 2, 3
        UNION ALL SELECT 'geo_scenario', g.region, (x.props->>'mode') || ':' || (x.props->>'scenario'), count(DISTINCT x.session_id) FROM g JOIN (
            SELECT session_id, props FROM analytics.events WHERE received_at >= ${day}::date AND received_at < ${day}::date + 1 AND name = 'router_scenario_selected') x USING (session_id)
          WHERE g.country = 'MY' GROUP BY 2, 3
      ) m WHERE m.n > 0
      ON CONFLICT (day, metric, dim1, dim2) DO UPDATE SET value = EXCLUDED.value`;
    // Support cases per state, from the cases table joined to the session's geography when known.
    await tx`
      INSERT INTO analytics.agg_daily (day, metric, dim1, dim2, value)
      SELECT ${day}::date, 'geo_cases', COALESCE(g.region, ''), '', count(*) FROM support.cases c
      LEFT JOIN LATERAL (SELECT region FROM analytics.events ev WHERE ev.country = 'MY' AND ev.name = 'escalation_submitted'
                           AND ev.received_at >= c.created_at - interval '10 minutes' AND ev.received_at <= c.created_at + interval '10 minutes' LIMIT 1) g ON true
      WHERE c.created_at >= ${day}::date AND c.created_at < ${day}::date + 1 GROUP BY COALESCE(g.region, '')
      ON CONFLICT (day, metric, dim1, dim2) DO UPDATE SET value = EXCLUDED.value`;
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
