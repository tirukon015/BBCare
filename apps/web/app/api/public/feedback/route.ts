import { z } from "zod";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { clientIpFrom, isSameOrigin, jsonError, readJson } from "@/lib/request";

export const dynamic = "force-dynamic";

const schema = z.strictObject({ articleId: z.uuid().optional(), resourceId: z.uuid().optional(), rating: z.union([z.literal(1), z.literal(-1)]) })
  .refine((v) => !!v.articleId !== !!v.resourceId, { message: "one subject" });

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return jsonError(403, "forbidden");
  if (!(await rateLimit("feedback", clientIpFrom(req.headers)))) return jsonError(429, "rate_limited");
  const parsed = schema.safeParse(await readJson(req).catch(() => null));
  if (!parsed.success) return jsonError(400, "invalid");
  const sql = db();
  const reason = parsed.data.rating === 1 ? "helpful" : null;
  if (parsed.data.resourceId) {
    // Feedback is accepted only for approved resources (the only ones customers can see).
    const [exists] = await sql`SELECT 1 FROM knowledge.resources WHERE id = ${parsed.data.resourceId} AND status = 'approved'`;
    if (!exists) return jsonError(404, "not_found");
    await sql`INSERT INTO support.feedback (resource_id, rating, reason_code) VALUES (${parsed.data.resourceId}, ${parsed.data.rating}, ${reason})`;
    return Response.json({ ok: true });
  }
  const [exists] = await sql`SELECT 1 FROM knowledge.articles WHERE id = ${parsed.data.articleId!}`;
  if (!exists) return jsonError(404, "not_found");
  await sql`INSERT INTO support.feedback (article_id, rating, reason_code) VALUES (${parsed.data.articleId!}, ${parsed.data.rating}, ${reason})`;
  return Response.json({ ok: true });
}
