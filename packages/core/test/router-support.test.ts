import { describe, expect, it } from "vitest";
import {
  INTAKE_QUESTIONS, ROUTER_MODELS, SCENARIOS, describeIntake, detectSupportMode, isCustomerVisibleFlow, matchScenarios,
  redactSecrets, routerModelByEcr, sanitizeIntake, scenariosForMode,
} from "../src/router-support";

describe("router catalogue", () => {
  it("has exactly the seven authoritative models with their ECR codes and exact names", () => {
    expect(ROUTER_MODELS.map((m) => [m.ecr, m.name])).toEqual([
      ["AX20", "TP-Link Archer AX20"],
      ["EX5", "TP-Link EX510"],
      ["EX2", "TP-Link EX230V"],
      ["EX8", "TP-Link EX820V"],
      ["EB4", "TP-Link EB431V"],
      ["KAO", "Kaon AR2140"],
      ["HUA", "Huawei LG-8245-X6"],
    ]);
  });
  it("has unique codes and slugs and no fictional sample brands", () => {
    expect(new Set(ROUTER_MODELS.map((m) => m.ecr)).size).toBe(7);
    expect(new Set(ROUTER_MODELS.map((m) => m.slug)).size).toBe(7);
    expect(ROUTER_MODELS.some((m) => /nimbus|kestrel|sample/i.test(`${m.name} ${m.brand}`))).toBe(false);
  });
  it("records the Huawei identity question instead of renaming the model", () => {
    const hua = routerModelByEcr("HUA")!;
    expect(hua.name).toBe("Huawei LG-8245-X6");
    expect(hua.identityStatus).toBe("needs_confirmation");
  });
});

describe("scenarios", () => {
  it("covers only Mesh and AP and lists the 11 decision trees", () => {
    expect(SCENARIOS).toHaveLength(11);
    expect(scenariosForMode("mesh").map((s) => s.key)).toEqual([
      "mesh_pairing", "mesh_no_internet", "mesh_node_offline", "mesh_unstable", "mesh_wired_backhaul", "mesh_roaming", "recovery_failed",
    ]);
    expect(scenariosForMode("ap").map((s) => s.key)).toEqual(["ap_enable", "ap_no_internet", "ap_ip_conflict", "ap_admin_access", "recovery_failed"]);
  });
  it("only references defined intake questions", () => {
    for (const s of SCENARIOS) for (const q of s.intake) expect(INTAKE_QUESTIONS[q], `${s.key}/${q}`).toBeDefined();
  });
  it("never asks for secrets in intake questions", () => {
    const text = Object.values(INTAKE_QUESTIONS).flatMap((q) => [q.en, q.ms, ...q.options.flatMap((o) => [o.en, o.ms])]).join(" ");
    expect(text).not.toMatch(/password|kata laluan|otp|one-time|kod pengesahan|serial/i);
  });
  it("has English and Malay text for every scenario and question", () => {
    for (const s of SCENARIOS) expect(s.en && s.ms && s.summaryEn && s.summaryMs).toBeTruthy();
    for (const q of Object.values(INTAKE_QUESTIONS)) {
      expect(q.ms).not.toBe(q.en);
      for (const o of q.options) expect(o.ms).toBeTruthy();
    }
  });
});

describe("matching customer words", () => {
  const top = (text: string, mode: "mesh" | "ap") => matchScenarios(text, mode)[0]?.key;
  it.each([
    ["mesh cannot pair, WPS pressed already", "mesh", "mesh_pairing"],
    ["mesh tak boleh pair", "mesh", "mesh_pairing"],
    ["ex230v cant find agent in aginet app", "mesh", "mesh_pairing"],
    ["mesh dah connect tapi takde internet", "mesh", "mesh_no_internet"],
    ["satellite wifi got signal but cannot browse", "mesh", "mesh_no_internet"],
    ["unit mesh asyik offline", "mesh", "mesh_node_offline"],
    ["satelit hilang dari app", "mesh", "mesh_node_offline"],
    ["signal mesh lemah dalam bilik", "mesh", "mesh_unstable"],
    ["boleh sambung mesh guna kabel lan?", "mesh", "mesh_wired_backhaul"],
    ["ethernet backhaul not working", "mesh", "mesh_wired_backhaul"],
    ["video call cut when moving room", "mesh", "mesh_roaming"],
    ["how to set my router as access point", "ap", "ap_enable"],
    ["lepas tukar AP mode takde internet", "ap", "ap_no_internet"],
    ["ip conflict after add ap", "ap", "ap_ip_conflict"],
    ["should I off DHCP on second router?", "ap", "ap_ip_conflict"],
    ["tplinkwifi.net not loading", "ap", "ap_admin_access"],
    ["dah reset pun masih tak boleh", "mesh", "recovery_failed"],
  ] as const)("%s -> %s", (text, mode, expected) => {
    expect(top(text, mode)).toBe(expected);
  });
  it("returns nothing for unrelated text", () => {
    expect(matchScenarios("printer paper jam", "mesh")).toEqual([]);
  });
  it("detects the mode from free text", () => {
    expect(detectSupportMode("easymesh satelit tak jumpa")).toBe("mesh");
    expect(detectSupportMode("tukar mode AP")).toBe("ap");
    expect(detectSupportMode("router problem")).toBeNull();
  });
});

describe("intake and secrets", () => {
  it("keeps only known questions and options", () => {
    expect(sanitizeIntake("mesh_pairing", { unit_role: "second", link_type: "fibre", injected: "x", distance: "near" })).toEqual({ unit_role: "second", distance: "near" });
    expect(sanitizeIntake("unknown", { unit_role: "second" })).toEqual({});
    expect(describeIntake({ unit_role: "second" })).toEqual([{ question: "Which unit has the problem?", answer: "The second unit" }]);
  });
  it("redacts passwords and one-time codes", () => {
    expect(redactSecrets("my wifi password is Hunter22 please help").text).toBe("my wifi password [removed] please help");
    expect(redactSecrets("kata laluan: abc123").text).toBe("kata laluan [removed]");
    expect(redactSecrets("OTP 482913 received").text).toBe("OTP [removed] received");
    expect(redactSecrets("mesh light is red").redacted).toBe(false);
  });
  it("shows a flow to customers only when published and verified by staff", () => {
    const base = { status: "published", verificationStatus: "verified", verifiedAt: new Date(), verifiedBy: "u1" };
    expect(isCustomerVisibleFlow(base)).toBe(true);
    expect(isCustomerVisibleFlow({ ...base, verificationStatus: "official_excerpt" })).toBe(false);
    expect(isCustomerVisibleFlow({ ...base, status: "draft" })).toBe(false);
    expect(isCustomerVisibleFlow({ ...base, verifiedBy: null })).toBe(false);
  });
});
