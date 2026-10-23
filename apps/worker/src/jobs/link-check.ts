import type { Sql } from "@bbcare/db";

/**
 * Automated reachability check for active listings: a plain GET of the public listing page,
 * rate-limited, never touching restricted endpoints. It can mark a listing broken (404/410),
 * but it never marks a listing verified; only a person can confirm the product is correct.
 * Results like 403 (bot protection) are recorded as "blocked" and do not change the status.
 */
export async function checkListings(sql: Sql, fetchImpl: typeof fetch = fetch, limit = 20): Promise<string> {
  const rows = await sql<{ id: string; url: string }[]>`
    SELECT l.id, l.url FROM commerce.product_listings l
    WHERE l.status = 'active' AND NOT EXISTS (
      SELECT 1 FROM commerce.listing_verifications v WHERE v.listing_id = l.id AND v.method = 'http_check' AND v.checked_at > now() - interval '24 hours')
    ORDER BY l.last_verified_at NULLS FIRST LIMIT ${limit}`;
  let broken = 0;
  for (const r of rows) {
    let result: "ok" | "broken" | "not_found" | "blocked" | "error" = "error";
    let status: number | null = null;
    try {
      const res = await fetchImpl(r.url, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(15_000), headers: { "user-agent": "BBCare-LinkCheck/1.0 (+support platform; contact owner)" } });
      status = res.status;
      result = res.status === 404 || res.status === 410 ? "not_found" : res.status >= 500 ? "error" : res.status === 403 || res.status === 429 ? "blocked" : "ok";
    } catch {
      result = "error";
    }
    await sql`INSERT INTO commerce.listing_verifications (listing_id, method, result, http_status, note) VALUES (${r.id}, 'http_check', ${result}, ${status}, 'automated reachability check')`;
    if (result === "not_found") {
      broken++;
      await sql`UPDATE commerce.product_listings SET status = 'broken' WHERE id = ${r.id}`;
    }
    await new Promise((res) => setTimeout(res, 2000));
  }
  return `checked ${rows.length}, marked broken ${broken}`;
}
