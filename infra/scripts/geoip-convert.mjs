#!/usr/bin/env node
/**
 * Convert a DB-IP Lite CSV (country or city edition, CC BY 4.0, https://db-ip.com/db/lite.php) into
 * the compact file BBCare loads: start,end,country,region_code,city. Malaysian ranges keep the
 * ISO 3166-2:MY state code and the city; every other country keeps the country code only, and
 * adjacent ranges with the same value are merged, so the file stays small enough to hold in memory.
 *
 * Usage: node infra/scripts/geoip-convert.mjs dbip-city-lite-2026-10.csv /etc/bbcare/geoip.csv
 * Attribution required by the licence: "IP geolocation by DB-IP (https://db-ip.com)".
 */
import { createReadStream, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";

const STATES = {
  johor: "MY-01", kedah: "MY-02", kelantan: "MY-03", melaka: "MY-04", malacca: "MY-04", "negeri sembilan": "MY-05", pahang: "MY-06",
  "pulau pinang": "MY-07", penang: "MY-07", perak: "MY-08", perlis: "MY-09", selangor: "MY-10", terengganu: "MY-11", sabah: "MY-12", sarawak: "MY-13",
  "kuala lumpur": "MY-14", labuan: "MY-15", putrajaya: "MY-16",
};
const [, , input, output] = process.argv;
if (!input || !output) { console.error("usage: geoip-convert.mjs <dbip-lite.csv> <output.csv>"); process.exit(2); }

const out = [];
let last = null;
let rows = 0;
const rl = createInterface({ input: createReadStream(input) });
for await (const line of rl) {
  const c = line.split(",").map((x) => x.trim().replace(/^"|"$/g, ""));
  if (c.length < 3) continue;
  const start = c[0], end = c[1];
  const country = c.length >= 8 ? c[3] : c[2];
  if (!/^[A-Z]{2}$/.test(country)) continue;
  let region = "", city = "";
  if (country === "MY" && c.length >= 8) {
    const key = c[4].toLowerCase().replace(/^(wilayah persekutuan|w\.p\.|federal territory of|state of|negeri) /, "").trim();
    region = STATES[key] ?? "";
    city = region ? c[5].replace(/,/g, " ").slice(0, 80) : "";
  }
  const value = `${country},${region},${city}`;
  rows++;
  if (last && last.value === value && last.v6 === start.includes(":") && adjacent(last.end, start)) { last.end = end; continue; }
  last = { start, end, value, v6: start.includes(":") };
  out.push(last);
}
writeFileSync(output, out.map((r) => `${r.start},${r.end},${r.value}`).join("\n") + "\n");
console.log(`read ${rows} ranges, wrote ${out.length} merged ranges to ${output}`);

function adjacent(prevEnd, nextStart) {
  if (prevEnd.includes(":") || nextStart.includes(":")) return false; // merge IPv4 only; IPv6 rows are few enough
  const a = prevEnd.split(".").map(Number), b = nextStart.split(".").map(Number);
  const n = (p) => ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3];
  return n(a) + 1 === n(b);
}
