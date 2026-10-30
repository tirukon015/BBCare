import "server-only";
import { classifyChannel, classifyUserAgent, referrerDomain, sanitizePath, scrubPersonalData, type ValidatedEvent } from "@bbcare/core";
import { db } from "@/lib/db";
import { lookupGeo } from "@/lib/geo";

const TEXT_PROPS = ["query"] as const;

/** Store validated events. Free-text properties are scrubbed of personal data. */
export async function ingestEvents(events: ValidatedEvent[], ctx: { ip: string; userAgent: string; consent: "analytics" | "essential"; ownHosts?: string[] }) {
  const ua = classifyUserAgent(ctx.userAgent);
  if (ua.deviceCategory === "bot" || events.length === 0) return 0;
  // The address is resolved in memory and never stored. State for everyone (aggregate only); city only with analytics consent.
  const geo = lookupGeo(ctx.ip);
  const rows = events.map((e) => {
    const props = { ...e.props };
    for (const k of TEXT_PROPS) if (typeof props[k] === "string") props[k] = scrubPersonalData(props[k] as string).slice(0, 200);
    return {
      id: e.event_id,
      name: e.name,
      occurred_at: e.occurred_at,
      session_id: e.session_id,
      visitor_id: ctx.consent === "analytics" ? (e.visitor_id ?? null) : null,
      consent: ctx.consent,
      page_path: sanitizePath(e.page_path),
      page_type: e.page_type ?? null,
      referrer_domain: referrerDomain(e.referrer),
      utm_source: e.utm_source ?? null,
      utm_medium: e.utm_medium ?? null,
      utm_campaign: e.utm_campaign ?? null,
      utm_content: e.utm_content ?? null,
      utm_term: e.utm_term ?? null,
      link_label: e.ch?.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 40) || null,
      // Same rules as support attribution: link label, then UTM, then referrer host; otherwise unknown.
      channel: classifyChannel({ referrer: e.referrer, utm_source: e.utm_source, utm_medium: e.utm_medium, ch: e.ch }, ctx.ownHosts ?? []).channel,
      locale: e.locale,
      device_category: ua.deviceCategory,
      browser_family: ua.browserFamily,
      os_family: ua.osFamily,
      country: geo.country,
      region: geo.region,
      city: ctx.consent === "analytics" ? geo.city : null,
      props,
    };
  });
  const sql = db();
  await sql`INSERT INTO analytics.events ${sql(rows.map((r) => ({ ...r, props: sql.json(r.props as never) })))} ON CONFLICT DO NOTHING`;
  return rows.length;
}

/** Server-originated events (for example referral clicks) use the same table. */
export async function recordServerEvent(name: string, props: Record<string, unknown>, ctx: { userAgent: string; sessionId?: string | null; pagePath?: string }) {
  const ua = classifyUserAgent(ctx.userAgent);
  if (ua.deviceCategory === "bot") return;
  await db()`
    INSERT INTO analytics.events (id, name, occurred_at, session_id, consent, page_path, device_category, browser_family, os_family, props)
    VALUES (gen_random_uuid(), ${name}, now(), ${ctx.sessionId ?? "server"}, 'essential', ${ctx.pagePath ?? null}, ${ua.deviceCategory}, ${ua.browserFamily}, ${ua.osFamily}, ${db().json(props as never)})`;
}
