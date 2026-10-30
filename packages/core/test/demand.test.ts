import { describe, expect, it } from "vitest";
import { attributionInputSchema, classifyChannel, demandGroupKey, describeRequirement, inferResourceType, normalizeHardwareRevision } from "../src/demand";

describe("support channel classification", () => {
  const own = ["support.bbtech.com.my"];
  it("uses an explicit link label first", () => {
    expect(classifyChannel({ ch: "shopee", referrer: "https://www.google.com/" }, own)).toEqual({ channel: "shopee", detail: null, evidence: "link_param" });
    expect(classifyChannel({ ch: "qr" }, own).channel).toBe("qr_code");
    expect(classifyChannel({ ch: "direct" }, own).channel).toBe("direct_link");
    expect(classifyChannel({ ch: "WhatsApp Broadcast!" }, own)).toEqual({ channel: "other", detail: "whatsappbroadcast", evidence: "link_param" });
  });
  it("reads UTM source and medium", () => {
    expect(classifyChannel({ utm_source: "Shopee", utm_medium: "listing" }, own)).toMatchObject({ channel: "shopee", evidence: "utm" });
    expect(classifyChannel({ utm_source: "poster", utm_medium: "qr" }, own)).toMatchObject({ channel: "qr_code", evidence: "utm" });
  });
  it("reads the referrer host but keeps only the host", () => {
    expect(classifyChannel({ referrer: "https://shopee.com.my/bbtech.shop?x=secret" }, own)).toMatchObject({ channel: "shopee", evidence: "referrer" });
    expect(classifyChannel({ referrer: "https://support.bbtech.com.my/en/routers" }, own)).toMatchObject({ channel: "website", evidence: "referrer" });
    expect(classifyChannel({ referrer: "https://www.facebook.com/some/page" }, own)).toEqual({ channel: "other", detail: "www.facebook.com", evidence: "referrer" });
  });
  it("never infers a channel from missing data", () => {
    expect(classifyChannel(undefined)).toEqual({ channel: "unknown", detail: null, evidence: "none" });
    expect(classifyChannel({}, own)).toEqual({ channel: "unknown", detail: null, evidence: "none" });
    expect(classifyChannel({ landing_path: "/en" }, own).channel).toBe("unknown");
    expect(classifyChannel({ referrer: "not a url" }, own).channel).toBe("unknown");
  });
  it("rejects attribution payloads with unexpected fields", () => {
    expect(attributionInputSchema.safeParse({ first: { referrer: "https://a.example/" }, latest: {} }).success).toBe(true);
    expect(attributionInputSchema.safeParse({ first: { ip: "1.2.3.4" } }).success).toBe(false);
    expect(attributionInputSchema.safeParse({ first: { landing_path: "http://evil" } }).success).toBe(false);
  });
});

describe("resource type inference", () => {
  it.each([
    ["can you show me a video how to pair", "video"],
    ["ada video tak tunjuk cara pair mesh", "video"],
    ["which port do I plug the cable into, any diagram?", "diagram"],
    ["port mana nak cucuk", "diagram"],
    ["what colour should the light be, got picture?", "image"],
    ["gambar lampu router macam mana", "image"],
    ["where is the pdf manual for AR2140", "document"],
    ["mesh tak boleh pair", "text_guide"],
    ["how to set AP mode", "text_guide"],
  ] as const)("%s -> %s", (q, expected) => {
    expect(inferResourceType(q)).toBe(expected);
  });
});

describe("demand grouping", () => {
  it("normalises hardware revisions", () => {
    expect(normalizeHardwareRevision(" v3.0 ")).toBe("V3");
    expect(normalizeHardwareRevision("3")).toBe("V3");
    expect(normalizeHardwareRevision("Version 1.2")).toBe("V1.2");
    expect(normalizeHardwareRevision(null)).toBe("");
  });
  it("groups equivalent requests and separates different ones", () => {
    const base = { modelId: "m1", hardwareRevision: "v3", supportMode: "mesh" as const, scenarioKey: "mesh_pairing", resourceType: "video" as const, locale: "ms" as const };
    expect(demandGroupKey(base)).toBe(demandGroupKey({ ...base, hardwareRevision: "V3.0" }));
    expect(demandGroupKey(base)).not.toBe(demandGroupKey({ ...base, locale: "en" }));
    expect(demandGroupKey(base)).not.toBe(demandGroupKey({ ...base, resourceType: "diagram" }));
    expect(demandGroupKey(base)).not.toBe(demandGroupKey({ ...base, hardwareRevision: null }));
  });
  it("describes the requirement for staff", () => {
    expect(describeRequirement({ modelName: "Kaon AR2140", scenarioTitle: "Mesh pairing does not work", resourceType: "video", locale: "ms", hardwareRevision: null }))
      .toBe("Video in Malay: Kaon AR2140, Mesh pairing does not work");
  });
});
