import "server-only";
import { readFileSync } from "node:fs";

/**
 * Optional offline IPv4-to-region lookup from a CSV (start_ip,end_ip,country,region_code),
 * for example converted from DB-IP Lite (CC BY 4.0). Only the Malaysian state code (ISO
 * 3166-2:MY) and country are returned; the IP is never stored.
 */
interface Range { start: number; end: number; country: string; region: string | null }
let ranges: Range[] | null = null;

function ipToInt(ip: string): number | null {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((x) => !Number.isInteger(x) || x < 0 || x > 255)) return null;
  return ((p[0]! << 24) >>> 0) + (p[1]! << 16) + (p[2]! << 8) + p[3]!;
}

function load(): Range[] {
  if (ranges) return ranges;
  const file = process.env.BBCARE_GEOIP_CSV;
  ranges = [];
  if (!file) return ranges;
  try {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const [s, e, country, region] = line.split(",");
      const start = s ? ipToInt(s.trim()) : null;
      const end = e ? ipToInt(e.trim()) : null;
      if (start !== null && end !== null && country) ranges.push({ start, end, country: country.trim(), region: region?.trim() || null });
    }
    ranges.sort((a, b) => a.start - b.start);
  } catch {
    ranges = [];
  }
  return ranges;
}

export function lookupRegion(ip: string): { country: string | null; region: string | null } {
  const n = ipToInt(ip);
  const list = load();
  if (n === null || list.length === 0) return { country: null, region: null };
  let lo = 0;
  let hi = list.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const r = list[mid]!;
    if (n < r.start) hi = mid - 1;
    else if (n > r.end) lo = mid + 1;
    else return { country: r.country, region: r.country === "MY" && r.region && /^MY-\d{2}$/.test(r.region) ? r.region : null };
  }
  return { country: null, region: null };
}
