import { describe, expect, it } from "vitest";
import { can, permissionsFor } from "../src/rbac";
import { evaluateTransition } from "../src/workflow";
import { chunkMarkdown, markdownToPlain } from "../src/chunk";
import { matchApplicability } from "../src/applicability";
import { isAllowedListingUrl, isObservationFresh, listingEligibility } from "../src/commerce";
import { reciprocalRankFusion } from "../src/ranking";
import { negotiateLocale } from "../src/locale";
import { classifyUserAgent } from "../src/useragent";

describe("rbac", () => {
  it("grants by role and denies unknown roles", () => {
    expect(can(["editor"], "knowledge.write")).toBe(true);
    expect(can(["editor"], "knowledge.publish")).toBe(false);
    expect(can(["analyst"], "support.transcripts.read")).toBe(false);
    expect(permissionsFor(["nonexistent"]).size).toBe(0);
    expect(can(["admin"], "users.manage")).toBe(true);
  });
});

describe("revision workflow", () => {
  const base = { actorId: "a", authorId: "b", actorIsAdmin: false };
  it("allows valid transitions with permission", () => {
    const r = evaluateTransition({ ...base, action: "approve", current: "in_review", actorPermissions: permissionsFor(["reviewer"]) });
    expect(r).toEqual({ ok: true, to: "approved", selfApproved: false });
  });
  it("rejects invalid transitions", () => {
    const r = evaluateTransition({ ...base, action: "publish", current: "draft", actorPermissions: permissionsFor(["admin"]) });
    expect(r).toEqual({ ok: false, reason: "invalid_transition" });
  });
  it("rejects missing permission", () => {
    const r = evaluateTransition({ ...base, action: "publish", current: "approved", actorPermissions: permissionsFor(["editor"]) });
    expect(r).toEqual({ ok: false, reason: "forbidden" });
  });
  it("enforces separation of duties except for admins", () => {
    const perms = permissionsFor(["reviewer"]);
    expect(evaluateTransition({ action: "approve", current: "in_review", actorId: "x", authorId: "x", actorIsAdmin: false, actorPermissions: perms })).toEqual({ ok: false, reason: "separation_of_duties" });
    expect(evaluateTransition({ action: "approve", current: "in_review", actorId: "x", authorId: "x", actorIsAdmin: true, actorPermissions: permissionsFor(["admin"]) })).toEqual({ ok: true, to: "approved", selfApproved: true });
  });
});

describe("chunking", () => {
  it("keeps heading paths and splits long sections", () => {
    const body = "Intro text.\n\n## Step one\n" + "word ".repeat(500) + "\n## Step two\nShort.";
    const chunks = chunkMarkdown(body, "Reset router", { maxWords: 200, overlapWords: 20 });
    expect(chunks[0]!.heading).toBe("Reset router");
    expect(chunks.some((c) => c.heading === "Reset router > Step one")).toBe(true);
    expect(chunks.filter((c) => c.heading.endsWith("Step one")).length).toBeGreaterThan(2);
    expect(chunks.at(-1)!.heading).toBe("Reset router > Step two");
    expect(chunks.map((c) => c.ordinal)).toEqual(chunks.map((_, i) => i));
  });
  it("strips markdown", () => {
    expect(markdownToPlain("## Title\n**Bold** [link](https://x.y) `code`")).toBe("Title Bold link code");
  });
});

describe("applicability", () => {
  const ctx = { categoryId: "c1", modelId: "m1", variantId: null, firmware: "1.0" };
  it("ranks exact over model over category", () => {
    expect(matchApplicability([{ categoryId: "c1", modelId: null, variantId: null, firmwareVersions: null }], ctx)).toBe("category");
    expect(matchApplicability([{ categoryId: null, modelId: "m1", variantId: null, firmwareVersions: null }], ctx)).toBe("model");
    expect(matchApplicability([{ categoryId: null, modelId: "m1", variantId: null, firmwareVersions: ["1.0"] }], ctx)).toBe("exact");
  });
  it("excludes other models and unknown firmware", () => {
    expect(matchApplicability([{ categoryId: null, modelId: "m2", variantId: null, firmwareVersions: null }], ctx)).toBe("none");
    expect(matchApplicability([{ categoryId: null, modelId: "m1", variantId: null, firmwareVersions: ["2.0"] }], ctx)).toBe("none");
    expect(matchApplicability([{ categoryId: null, modelId: "m1", variantId: null, firmwareVersions: null }], { ...ctx, modelId: null })).toBe("none");
  });
});

describe("commerce eligibility", () => {
  const now = new Date("2026-10-23T00:00:00Z");
  const fresh = new Date("2026-10-20T00:00:00Z");
  it("allowlists domains over https only", () => {
    expect(isAllowedListingUrl("https://shopee.com.my/product/1/2")).toBe(true);
    expect(isAllowedListingUrl("https://www.bbtech.shop/p/x")).toBe(true);
    expect(isAllowedListingUrl("http://shopee.com.my/x")).toBe(false);
    expect(isAllowedListingUrl("https://shopee.com.my.evil.example/x")).toBe(false);
    expect(isAllowedListingUrl("https://user:pw@shopee.com.my/x")).toBe(false);
    expect(isAllowedListingUrl("javascript:alert(1)")).toBe(false);
  });
  it("requires active, fresh, compatible listings", () => {
    const listing = { status: "active" as const, url: "https://shopee.com.my/x", lastVerifiedAt: fresh };
    expect(listingEligibility(listing, true, { verificationWindowDays: 14, now })).toEqual({ eligible: true });
    expect(listingEligibility(listing, false, { verificationWindowDays: 14, now })).toEqual({ eligible: false, reason: "compatibility_unverified" });
    expect(listingEligibility({ ...listing, lastVerifiedAt: new Date("2026-09-01") }, true, { verificationWindowDays: 14, now })).toEqual({ eligible: false, reason: "verification_stale" });
    expect(listingEligibility({ ...listing, status: "broken" }, true, { verificationWindowDays: 14, now })).toEqual({ eligible: false, reason: "status_broken" });
  });
  it("checks observation freshness", () => {
    expect(isObservationFresh({ source: "shopee_api", observedAt: new Date(now.getTime() - 3_600_000) }, 24, now)).toBe(true);
    expect(isObservationFresh({ source: "shopee_api", observedAt: new Date(now.getTime() - 48 * 3_600_000) }, 24, now)).toBe(false);
    expect(isObservationFresh(null, 24, now)).toBe(false);
  });
});

describe("misc helpers", () => {
  it("fuses rankings", () => {
    const fused = [...reciprocalRankFusion([["a", "b", "c"], ["b", "a"]]).keys()];
    expect(fused.slice(0, 2).sort()).toEqual(["a", "b"]);
    expect(fused[2]).toBe("c");
  });
  it("negotiates locale", () => {
    expect(negotiateLocale("ms-MY,ms;q=0.9,en;q=0.8")).toBe("ms");
    expect(negotiateLocale("en-GB")).toBe("en");
    expect(negotiateLocale("fr-FR")).toBe("en");
    expect(negotiateLocale(null)).toBe("en");
  });
  it("classifies user agents", () => {
    expect(classifyUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1")).toEqual({ deviceCategory: "mobile", browserFamily: "Safari", osFamily: "iOS" });
    expect(classifyUserAgent("Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 Chrome/120.0 Safari/537.36").deviceCategory).toBe("tablet");
    expect(classifyUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36 Edg/120.0").browserFamily).toBe("Edge");
    expect(classifyUserAgent("Googlebot/2.1").deviceCategory).toBe("bot");
  });
});
