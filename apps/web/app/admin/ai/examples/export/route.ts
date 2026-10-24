import { currentStaff } from "@/modules/identity/service";
import { exportApprovedJsonl } from "@/modules/ai/training";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await currentStaff();
  if (!user || !user.mfaVerified || !user.permissions.has("ai.configure")) return new Response("Forbidden", { status: 403 });
  const body = await exportApprovedJsonl(user);
  return new Response(body, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "content-disposition": `attachment; filename="bbcare-approved-examples-${new Date().toISOString().slice(0, 10)}.jsonl"`,
      "cache-control": "no-store",
    },
  });
}
