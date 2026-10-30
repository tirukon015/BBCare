import { currentStaff } from "@/modules/identity/service";
import { exportRowsBetween } from "@/modules/analytics/dashboard";
import { parsePeriod } from "@/modules/analytics/intelligence";
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
  const sp = new URL(req.url).searchParams;
  const period = parsePeriod({ range: sp.get("range") ?? undefined, from: sp.get("from") ?? undefined, to: sp.get("to") ?? undefined });
  const rows = await exportRowsBetween(period.from, period.to);
  await audit({ actorId: user.id, action: "analytics.export", summary: { range: period.key, from: period.from, to: period.to, rows: rows.length } });
  const csv = ["day,metric,dim1,dim2,value", ...rows.map((r) => [r.day, r.metric, r.dim1, r.dim2, r.value].map(esc).join(","))].join("\n");
  return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="bbcare-analytics-${period.from}-to-${period.to}.csv"`, "cache-control": "no-store" } });
}
