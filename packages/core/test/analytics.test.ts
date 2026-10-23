import { describe, expect, it } from "vitest";
import { referrerDomain, sanitizePath, validateClientEvent } from "../src/analytics";

const base = {
  event_id: "6f1c1f9e-6c35-4b8e-9a7c-2c0a3c1d1a11",
  occurred_at: "2026-10-23T10:00:00.000Z",
  session_id: "abcdefghijklmnop1234",
  page_path: "/en/routers",
  locale: "en",
};

describe("analytics validation", () => {
  it("accepts a valid event", () => {
    expect(validateClientEvent({ ...base, name: "page_view", props: { landing: true } })).not.toBeNull();
  });
  it("rejects unknown props and unknown envelope fields", () => {
    expect(validateClientEvent({ ...base, name: "page_view", props: { keystrokes: "abc" } })).toBeNull();
    expect(validateClientEvent({ ...base, name: "page_view", props: {}, ip: "1.2.3.4" })).toBeNull();
  });
  it("rejects server-only events from clients", () => {
    expect(validateClientEvent({ ...base, name: "shopee_outbound_click", props: { recommendation_id: base.event_id, listing_id: base.event_id } })).toBeNull();
  });
  it("rejects malformed session ids", () => {
    expect(validateClientEvent({ ...base, session_id: "short", name: "page_view", props: {} })).toBeNull();
  });
  it("sanitizes paths and referrers", () => {
    expect(sanitizePath("/en/search?q=my+email@x.com#top")).toBe("/en/search");
    expect(referrerDomain("https://www.google.com/search?q=x")).toBe("www.google.com");
    expect(referrerDomain("not a url")).toBeNull();
  });
});
