import "server-only";
import { readFileSync } from "node:fs";
import { malaysiaRegionCode } from "@bbcare/core";

/**
 * Offline IP-to-geography lookup. The address is resolved in memory and discarded; only the
 * country, the Malaysian state code (ISO 3166-2:MY) and, where the dataset has it, the city name
 * are returned. Nothing is sent to a third party.
 *
 * BBCARE_GEOIP_CSV points at either:
 * - the compact BBCare file produced by infra/scripts/geoip-convert.mjs: `start,end,country,region_code,city`
 *   (region and city only for Malaysian ranges; adjacent ranges with the same value merged), or
 * - a DB-IP Lite CSV as downloaded (country lite: `start,end,country`; city lite:
 *   `start,end,continent,country,stateprov,city,lat,lon`). The city file is large; the converter is
 *   recommended for production.
 * IPv4 and IPv6 ranges are both supported.
 */
export interface GeoResult { country: string | null; region: string | null; city: string | null }
const UNKNOWN: GeoResult = { country: null, region: null, city: null };

interface Table4 { starts: Uint32Array; ends: Uint32Array; values: Uint32Array }
interface Row6 { start: bigint; end: bigint; value: number }
interface Db { v4: Table4; v6: Row6[]; values: GeoResult[]; rows: number }

let cached: Db | null = null;

export function ipv4ToInt(ip: string): number | null {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((x) => !Number.isInteger(x) || x < 0 || x > 255)) return null;
  return ((p[0]! << 24) >>> 0) + (p[1]! << 16) + (p[2]! << 8) + p[3]!;
}

export function ipv6ToBigInt(ip: string): bigint | null {
  if (!ip.includes(":")) return null;
  let s = ip.trim();
  if (s.startsWith("::ffff:") && s.includes(".")) { const v4 = ipv4ToInt(s.slice(7)); return v4 === null ? null : (0xffffn << 32n) + BigInt(v4); }
  const parts = s.split("::");
  if (parts.length > 2) return null;
  const head = parts[0] ? parts[0].split(":") : [];
  const tail = parts.length === 2 && parts[1] ? parts[1].split(":") : [];
  const fill = parts.length === 2 ? 8 - head.length - tail.length : 0;
  if (fill < 0 || head.length + tail.length + fill !== 8) return null;
  const groups = [...head, ...Array<string>(fill).fill("0"), ...tail];
  let n = 0n;
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/i.test(g)) return null;
    n = (n << 16n) + BigInt(parseInt(g, 16));
  }
  return n;
}

function parseLine(line: string): { start: string; end: string; geo: GeoResult } | null {
  const c = line.split(",").map((x) => x.trim().replace(/^"|"$/g, ""));
  if (c.length < 3 || !c[0] || !c[1]) return null;
  let country: string | null; let regionRaw: string | null = null; let city: string | null = null;
  if (c.length >= 8) { country = c[3] || null; regionRaw = c[4] || null; city = c[5] || null; }         // DB-IP city lite as downloaded
  else { country = c[2] || null; regionRaw = c[3] || null; city = c[4] || null; }                         // compact or country lite
  if (!country || !/^[A-Z]{2}$/.test(country)) return null;
  const region = country === "MY" ? malaysiaRegionCode(regionRaw) : null;
  return { start: c[0], end: c[1], geo: { country, region, city: region && city ? city.slice(0, 80) : null } };
}

function load(): Db {
  if (cached) return cached;
  const empty: Db = { v4: { starts: new Uint32Array(0), ends: new Uint32Array(0), values: new Uint32Array(0) }, v6: [], values: [], rows: 0 };
  const file = process.env.BBCARE_GEOIP_CSV;
  if (!file) return (cached = empty);
  try {
    const values: GeoResult[] = [];
    const index = new Map<string, number>();
    const valueId = (g: GeoResult) => { const k = `${g.country}|${g.region}|${g.city}`; let i = index.get(k); if (i === undefined) { i = values.push(g) - 1; index.set(k, i); } return i; };
    const s4: number[] = []; const e4: number[] = []; const v4: number[] = []; const v6: Row6[] = [];
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const row = parseLine(line);
      if (!row) continue;
      const id = valueId(row.geo);
      const a4 = ipv4ToInt(row.start); const b4 = ipv4ToInt(row.end);
      if (a4 !== null && b4 !== null) { s4.push(a4); e4.push(b4); v4.push(id); continue; }
      const a6 = ipv6ToBigInt(row.start); const b6 = ipv6ToBigInt(row.end);
      if (a6 !== null && b6 !== null) v6.push({ start: a6, end: b6, value: id });
    }
    const order = s4.map((_, i) => i).sort((a, b) => s4[a]! - s4[b]!);
    const table: Table4 = { starts: Uint32Array.from(order, (i) => s4[i]!), ends: Uint32Array.from(order, (i) => e4[i]!), values: Uint32Array.from(order, (i) => v4[i]!) };
    v6.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
    cached = { v4: table, v6, values, rows: s4.length + v6.length };
  } catch {
    cached = empty;
  }
  return cached;
}

/** Whether a geolocation file is configured and loaded with at least one range. */
export function geoStatus(): { configured: boolean; ranges: number } {
  const db = load();
  return { configured: !!process.env.BBCARE_GEOIP_CSV, ranges: db.rows };
}

/** Resets the cache (tests only). */
export function resetGeoCache(): void { cached = null; }

export function lookupGeo(ip: string): GeoResult {
  const db = load();
  if (db.rows === 0) return UNKNOWN;
  const plain = ip.trim().toLowerCase();
  const n4 = ipv4ToInt(plain.startsWith("::ffff:") && plain.includes(".") ? plain.slice(7) : plain);
  if (n4 !== null) {
    const { starts, ends, values } = db.v4;
    let lo = 0; let hi = starts.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (n4 < starts[mid]!) hi = mid - 1; else if (n4 > ends[mid]!) lo = mid + 1; else return db.values[values[mid]!] ?? UNKNOWN;
    }
    return UNKNOWN;
  }
  const n6 = ipv6ToBigInt(ip);
  if (n6 === null) return UNKNOWN;
  let lo = 0; let hi = db.v6.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const r = db.v6[mid]!;
    if (n6 < r.start) hi = mid - 1; else if (n6 > r.end) lo = mid + 1; else return db.values[r.value] ?? UNKNOWN;
  }
  return UNKNOWN;
}

/** Compatibility wrapper: country and state only. */
export function lookupRegion(ip: string): { country: string | null; region: string | null } {
  const g = lookupGeo(ip);
  return { country: g.country, region: g.region };
}
