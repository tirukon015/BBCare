import { authorizeSession, markResolved } from "@/modules/support/service";
import { readSupportCookie } from "@/modules/support/cookies";
import { isSameOrigin, jsonError } from "@/lib/request";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(req)) return jsonError(403, "forbidden");
  const session = await authorizeSession((await params).id, await readSupportCookie());
  if (!session) return jsonError(404, "session_not_found");
  await markResolved(session);
  return Response.json({ ok: true });
}
