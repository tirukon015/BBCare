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
    expect(detectLanguage("AX3000 wifi slow")).toBe("en");
    expect(detectLanguage("laptop panas sgt")).toBe("ms");
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
    expect(buildTsQuery("how to set up router")).toContain("(set <-> up)");
    expect(buildTsQuery("how to set up router")!.split(" | ")).not.toContain("up:*");
  });
  it("returns null for stop words only", () => {
    expect(buildTsQuery("how do I")).toBeNull();
  });
  it("strips tsquery syntax characters", () => {
    expect(buildTsQuery("wifi & ! ( ) :* <->")).toBe("wifi:* | wireless:* | (tanpa <-> wayar)");
  });
});

import { detectCategory } from "../src/text";
describe("detectCategory", () => {
  it("detects a single explicit category", () => {
    expect(detectCategory("my laptop xleh cas")).toBe("laptop");
    expect(detectCategory("wifi lembab")).toBe("router");
    expect(detectCategory("laptop cannot connect to wifi")).toBeNull();
    expect(detectCategory("it is broken")).toBeNull();
  });
});

import { queryTermGroups, termCoverage } from "../src/text";
describe("term coverage", () => {
  it("measures how many query concepts a text covers, counting synonyms", () => {
    const groups = queryTermGroups("wifi lembab ax3000");
    expect(groups.length).toBe(3);
    expect(termCoverage(groups, "nb-ax3000 slow wireless in some rooms")).toBe(1);
    expect(termCoverage(queryTermGroups("install windows fridge"), "install firmware for your model")).toBeCloseTo(1 / 3);
    expect(termCoverage([], "x")).toBe(0);
  });
});
