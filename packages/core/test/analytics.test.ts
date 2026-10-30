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

describe("analytics taxonomy additions", () => {
  it("accepts campaign fields and link labels on the envelope", () => {
    const r = validateClientEvent({ ...base, name: "session_started", props: {}, utm_source: "shopee", utm_medium: "listing", utm_campaign: "ar2140-mesh", utm_content: "box-qr-01", utm_term: "mesh", ch: "shopee" });
    expect(r).not.toBeNull();
    expect(r?.utm_content).toBe("box-qr-01");
    expect(r?.ch).toBe("shopee");
  });
  it("accepts journey, heatmap and media events with bounded values", () => {
    const model = "6f1c1f9e-6c35-4b8e-9a7c-2c0a3c1d1a11";
    expect(validateClientEvent({ ...base, name: "router_scenario_selected", props: { model_id: model, mode: "mesh", scenario: "mesh_pairing_fails", verified: false } })).not.toBeNull();
    expect(validateClientEvent({ ...base, name: "flow_step", props: { flow_id: model, step_key: "check-lights", action: "next" } })).not.toBeNull();
    expect(validateClientEvent({ ...base, name: "click_area", props: { x_pct: 40, y_pct: 10, target: "link", viewport: "phone" } })).not.toBeNull();
    expect(validateClientEvent({ ...base, name: "video_progress", props: { resource_id: model, pct: 50 } })).not.toBeNull();
    expect(validateClientEvent({ ...base, name: "escalation_submitted", props: { origin: "router", scenario: "mesh_pairing_fails" } })).not.toBeNull();
  });
  it("rejects precise coordinates, element text and free values in heatmap events", () => {
    expect(validateClientEvent({ ...base, name: "click_area", props: { x_pct: 43, y_pct: 10, target: "link", viewport: "phone" } })).toBeNull();
    expect(validateClientEvent({ ...base, name: "click_area", props: { x_pct: 40, y_pct: 10, target: "link", viewport: "phone", text: "Buy now" } })).toBeNull();
    expect(validateClientEvent({ ...base, name: "video_progress", props: { resource_id: "6f1c1f9e-6c35-4b8e-9a7c-2c0a3c1d1a11", pct: 33 } })).toBeNull();
    expect(validateClientEvent({ ...base, name: "flow_step", props: { flow_id: "6f1c1f9e-6c35-4b8e-9a7c-2c0a3c1d1a11", step_key: "x", action: "typed" } })).toBeNull();
  });
});
