import { z } from "zod";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { clientIpFrom, isSameOrigin, jsonError, readJson } from "@/lib/request";

export const dynamic = "force-dynamic";

const schema = z.strictObject({ articleId: z.uuid(), rating: z.union([z.literal(1), z.literal(-1)]) });

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return jsonError(403, "forbidden");
  if (!(await rateLimit("feedback", clientIpFrom(req.headers)))) return jsonError(429, "rate_limited");
  const parsed = schema.safeParse(await readJson(req).catch(() => null));
  if (!parsed.success) return jsonError(400, "invalid");
  const sql = db();
  const [exists] = await sql`SELECT 1 FROM knowledge.articles WHERE id = ${parsed.data.articleId}`;
  if (!exists) return jsonError(404, "not_found");
  await sql`INSERT INTO support.feedback (article_id, rating, reason_code) VALUES (${parsed.data.articleId}, ${parsed.data.rating}, ${parsed.data.rating === 1 ? "helpful" : null})`;
  return Response.json({ ok: true });
}
