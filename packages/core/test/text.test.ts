import { describe, expect, it } from "vitest";
import {
  detectLanguage,
  extractModelCandidates,
  normalizeForSearch,
  normalizeModelNumber,
  normalizeText,
  synonymTerms,
} from "../src/text";

describe("text normalization", () => {
  it("normalizes accents, case and punctuation", () => {
    expect(normalizeText("  Café   WiFi!!  ")).toBe("cafe wifi");
  });
  it("canonicalizes model numbers", () => {
    expect(normalizeModelNumber("rt-ax86u pro")).toBe("RTAX86UPRO");
    expect(normalizeModelNumber("RT AX86U-Pro")).toBe("RTAX86UPRO");
  });
  it("expands colloquial Malay", () => {
    expect(normalizeForSearch("router sy x boleh connect wifi")).toBe("router saya tidak boleh connect wifi");
    expect(normalizeForSearch("lappy panas sgt")).toBe("laptop overheat sgt");
    expect(normalizeForSearch("xleh cas")).toBe("tidak boleh charge");
  });
  it("adds bilingual synonyms", () => {
    const terms = synonymTerms(normalizeForSearch("wifi lembab"));
    expect(terms).toContain("slow");
    expect(terms).toContain("wireless");
  });
  it("detects Malay and English", () => {
    expect(detectLanguage("router saya tidak boleh sambung internet")).toBe("ms");
    expect(detectLanguage("sy xleh connect wifi")).toBe("ms");
    expect(detectLanguage("my router keeps dropping the connection")).toBe("en");
  });
  it("extracts model candidates", () => {
    expect(extractModelCandidates("My RT-AX86U keeps rebooting")).toContain("RTAX86U");
    expect(extractModelCandidates("archer c6 wifi")).toContain("ARCHERC6");
  });
});

import { buildTsQuery } from "../src/text";
describe("buildTsQuery", () => {
  it("builds OR prefix queries with synonyms and no stop words", () => {
    const q = buildTsQuery("sy xleh cas bateri")!;
    expect(q).toContain("charge:*");
    expect(q).toContain("battery:*");
    expect(q).not.toContain("saya");
    expect(q.split(" | ").length).toBeGreaterThan(3);
  });
  it("returns null for stop words only", () => {
    expect(buildTsQuery("how do I")).toBeNull();
  });
  it("strips tsquery syntax characters", () => {
    expect(buildTsQuery("wifi & ! ( ) :* <->")).toBe("wifi:* | wireless:* | tanpa:* | wayar:*");
  });
});
