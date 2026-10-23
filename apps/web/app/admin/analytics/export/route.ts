import { currentStaff } from "@/modules/identity/service";
import { exportRows, parseRange } from "@/modules/analytics/dashboard";
import { audit } from "@/modules/audit/service";

export const dynamic = "force-dynamic";

const esc = (v: unknown) => {
  const s = String(v ?? "");
  // Neutralise spreadsheet formula injection and quote fields.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

export async function GET(req: Request) {
  const user = await currentStaff();
  if (!user || !user.mfaVerified || !user.permissions.has("analytics.export")) return new Response("Forbidden", { status: 403 });
  const range = parseRange(new URL(req.url).searchParams.get("range"));
  const rows = await exportRows(range);
  await audit({ actorId: user.id, action: "analytics.export", summary: { range, rows: rows.length } });
  const csv = ["day,metric,dim1,dim2,value", ...rows.map((r) => [r.day, r.metric, r.dim1, r.dim2, r.value].map(esc).join(","))].join("\n");
  return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="bbcare-analytics-${range}d.csv"`, "cache-control": "no-store" } });
}
