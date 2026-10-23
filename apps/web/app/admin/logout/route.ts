import { currentStaff, logout } from "@/modules/identity/service";
import { audit } from "@/modules/audit/service";
import { isSameOrigin } from "@/lib/request";

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return new Response("Forbidden", { status: 403 });
  const user = await currentStaff();
  await logout();
  if (user) await audit({ actorId: user.id, action: "auth.logout" });
  return new Response(null, { status: 303, headers: { location: "/admin/login" } });
}
