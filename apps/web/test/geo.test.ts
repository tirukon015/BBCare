import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { geoStatus, ipv6ToBigInt, lookupGeo, resetGeoCache } from "../src/lib/geo";

/**
 * Synthetic ranges only (RFC 5737 TEST-NET blocks and the IPv6 documentation prefix). They are
 * not real customer addresses and never appear in production datasets.
 */
const compact = [
  "192.0.2.0,192.0.2.255,MY,MY-14,Kuala Lumpur",
  "198.51.100.0,198.51.100.127,MY,MY-10,Shah Alam",
  "198.51.100.128,198.51.100.255,MY,Pulau Pinang,George Town",
  "203.0.113.0,203.0.113.255,SG,,",
  "2001:db8::,2001:db8:0:ffff:ffff:ffff:ffff:ffff,MY,MY-01,Johor Bahru",
].join("\n");

const dbipCity = [
  "192.0.2.0,192.0.2.255,AS,MY,Selangor,Petaling Jaya,3.1,101.6",
  "203.0.113.0,203.0.113.255,AS,ID,Jakarta,Jakarta,-6.2,106.8",
].join("\n");

function withFile(content: string) {
  const dir = mkdtempSync(join(tmpdir(), "bbcare-geo-"));
  const file = join(dir, "geo.csv");
  writeFileSync(file, content);
  process.env.BBCARE_GEOIP_CSV = file;
  resetGeoCache();
}

afterEach(() => { delete process.env.BBCARE_GEOIP_CSV; resetGeoCache(); });

describe("offline geolocation", () => {
  it("is unknown when no database is configured, and reports that", () => {
    resetGeoCache();
    expect(lookupGeo("192.0.2.10")).toEqual({ country: null, region: null, city: null });
    expect(geoStatus()).toEqual({ configured: false, ranges: 0 });
  });
  it("resolves state and city for Malaysian ranges and country only elsewhere", () => {
    withFile(compact);
    expect(lookupGeo("192.0.2.10")).toEqual({ country: "MY", region: "MY-14", city: "Kuala Lumpur" });
    expect(lookupGeo("198.51.100.5")).toEqual({ country: "MY", region: "MY-10", city: "Shah Alam" });
    expect(lookupGeo("198.51.100.200")).toEqual({ country: "MY", region: "MY-07", city: "George Town" });
    expect(lookupGeo("203.0.113.9")).toEqual({ country: "SG", region: null, city: null });
    expect(lookupGeo("203.0.114.1")).toEqual({ country: null, region: null, city: null });
    expect(lookupGeo("not an ip")).toEqual({ country: null, region: null, city: null });
    expect(geoStatus().ranges).toBe(5);
  });
  it("resolves IPv6 ranges and the IPv4-mapped form", () => {
    withFile(compact);
    expect(ipv6ToBigInt("2001:db8::1")).toBe(0x20010db8000000000000000000000001n);
    expect(lookupGeo("2001:db8::1")).toEqual({ country: "MY", region: "MY-01", city: "Johor Bahru" });
    expect(lookupGeo("2001:db9::1")).toEqual({ country: null, region: null, city: null });
    expect(lookupGeo("::ffff:192.0.2.10")).toEqual({ country: "MY", region: "MY-14", city: "Kuala Lumpur" });
  });
  it("reads the DB-IP city lite layout directly and maps state names to ISO codes", () => {
    withFile(dbipCity);
    expect(lookupGeo("192.0.2.1")).toEqual({ country: "MY", region: "MY-10", city: "Petaling Jaya" });
    // Outside Malaysia only the country is kept: no city, no coordinates.
    expect(lookupGeo("203.0.113.1")).toEqual({ country: "ID", region: null, city: null });
  });
});
