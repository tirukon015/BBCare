/**
 * Router-first support catalogue: the seven authoritative router models, the two supported
 * categories (Mesh Connection Mode and Access Point Mode) and the troubleshooting scenarios
 * within them.
 *
 * This module holds structure only: names, codes, scenario titles, safe intake questions and
 * matching keywords. It never holds model-specific technical instructions. Those live in the
 * database as troubleshooting flows and reach customers only after staff verify them against a
 * full source (see knowledge.flows verification columns).
 */
import { normalizeForSearch } from "./text";

export type Locale2 = "en" | "ms";
export type SupportMode = "mesh" | "ap";
export const SUPPORT_MODES: readonly SupportMode[] = ["mesh", "ap"] as const;

export interface RouterModelDef {
  ecr: string;
  /** Exact catalogue name supplied by BBTech. Never normalize or rename. */
  name: string;
  brand: string;
  brandSlug: string;
  modelNumber: string;
  slug: string;
  aliases: string[];
  identityStatus: "confirmed" | "needs_confirmation";
  identityNote: string | null;
}

export const ROUTER_MODELS: readonly RouterModelDef[] = [
  { ecr: "AX20", name: "TP-Link Archer AX20", brand: "TP-Link", brandSlug: "tp-link", modelNumber: "Archer AX20", slug: "tp-link-archer-ax20", aliases: ["AX20", "Archer AX20"], identityStatus: "confirmed", identityNote: "Mesh and AP support differ by hardware version (for example V1, V2, V3). Check the label." },
  { ecr: "EX5", name: "TP-Link EX510", brand: "TP-Link", brandSlug: "tp-link", modelNumber: "EX510", slug: "tp-link-ex510", aliases: ["EX510"], identityStatus: "confirmed", identityNote: null },
  { ecr: "EX2", name: "TP-Link EX230V", brand: "TP-Link", brandSlug: "tp-link", modelNumber: "EX230V", slug: "tp-link-ex230v", aliases: ["EX230V", "EX230"], identityStatus: "confirmed", identityNote: null },
  { ecr: "EX8", name: "TP-Link EX820V", brand: "TP-Link", brandSlug: "tp-link", modelNumber: "EX820V", slug: "tp-link-ex820v", aliases: ["EX820V", "EX820"], identityStatus: "confirmed", identityNote: null },
  { ecr: "EB4", name: "TP-Link EB431V", brand: "TP-Link", brandSlug: "tp-link", modelNumber: "EB431V", slug: "tp-link-eb431v", aliases: ["EB431V", "EB431"], identityStatus: "confirmed", identityNote: null },
  { ecr: "KAO", name: "Kaon AR2140", brand: "Kaon", brandSlug: "kaon", modelNumber: "AR2140", slug: "kaon-ar2140", aliases: ["AR2140", "Kaon AR2140"], identityStatus: "confirmed", identityNote: null },
  { ecr: "HUA", name: "Huawei LG-8245-X6", brand: "Huawei", brandSlug: "huawei", modelNumber: "LG-8245-X6", slug: "huawei-lg-8245-x6", aliases: ["LG-8245-X6", "LG8245X6"], identityStatus: "needs_confirmation", identityNote: "Huawei documentation lists a model named OptiXstar LG8245X6-10. BBTech to confirm it is the same unit." },
] as const;

export const ROUTER_ECR_CODES = ROUTER_MODELS.map((m) => m.ecr);
export const routerModelByEcr = (ecr: string) => ROUTER_MODELS.find((m) => m.ecr === ecr) ?? null;
export const routerModelBySlug = (slug: string) => ROUTER_MODELS.find((m) => m.slug === slug) ?? null;

export const MODE_LABELS: Record<SupportMode, { en: string; ms: string; summaryEn: string; summaryMs: string }> = {
  mesh: {
    en: "Mesh Connection Mode", ms: "Mod Sambungan Mesh",
    summaryEn: "Connecting two or more units into one Wi-Fi mesh network.",
    summaryMs: "Menyambung dua atau lebih unit menjadi satu rangkaian Wi-Fi mesh.",
  },
  ap: {
    en: "Access Point (AP) Mode", ms: "Mod Titik Akses (AP)",
    summaryEn: "Using the unit as a Wi-Fi access point behind another router.",
    summaryMs: "Menggunakan unit sebagai titik akses Wi-Fi di belakang penghala lain.",
  },
};

export interface Choice { key: string; en: string; ms: string }
export interface IntakeQuestion { key: string; en: string; ms: string; options: Choice[] }

const NOT_SURE: Choice = { key: "not_sure", en: "Not sure", ms: "Tidak pasti" };
const YES: Choice = { key: "yes", en: "Yes", ms: "Ya" };
const NO: Choice = { key: "no", en: "No", ms: "Tidak" };

/**
 * Safe diagnostic questions. None asks for a password, code or other secret, and none assumes
 * what an indicator light means on a particular model.
 */
export const INTAKE_QUESTIONS: Record<string, IntakeQuestion> = {
  unit_role: { key: "unit_role", en: "Which unit has the problem?", ms: "Unit mana yang bermasalah?", options: [
    { key: "main", en: "The main router", ms: "Penghala utama" }, { key: "second", en: "The second unit", ms: "Unit kedua" }, NOT_SURE] },
  link_type: { key: "link_type", en: "How are the two units connected?", ms: "Bagaimana dua unit itu disambungkan?", options: [
    { key: "wifi", en: "Wi-Fi only", ms: "Wi-Fi sahaja" }, { key: "cable", en: "Ethernet cable", ms: "Kabel Ethernet" }, NOT_SURE] },
  main_internet: { key: "main_internet", en: "Do devices connected to the main router have internet?", ms: "Adakah peranti yang bersambung ke penghala utama ada internet?", options: [YES, NO, NOT_SURE] },
  light_state: { key: "light_state", en: "What does the internet light on the affected unit look like?", ms: "Bagaimana keadaan lampu internet pada unit yang bermasalah?", options: [
    { key: "steady", en: "On and steady", ms: "Menyala tetap" }, { key: "blinking", en: "Blinking", ms: "Berkelip" },
    { key: "red", en: "Red or orange", ms: "Merah atau oren" }, { key: "off", en: "Off", ms: "Padam" }, NOT_SURE] },
  restarted: { key: "restarted", en: "Have you restarted the affected unit?", ms: "Sudahkah anda mulakan semula unit yang bermasalah?", options: [YES, NO] },
  reset_done: { key: "reset_done", en: "Has any unit been factory reset?", ms: "Adakah mana-mana unit telah ditetapkan semula ke tetapan kilang?", options: [
    { key: "none", en: "No", ms: "Tidak" }, { key: "second", en: "Yes, the second unit", ms: "Ya, unit kedua" }, { key: "main", en: "Yes, the main router", ms: "Ya, penghala utama" }, NOT_SURE] },
  started: { key: "started", en: "When did the problem start?", ms: "Bilakah masalah bermula?", options: [
    { key: "setup", en: "During first setup", ms: "Semasa persediaan pertama" }, { key: "after_change", en: "After a change (moved, power cut, settings)", ms: "Selepas perubahan (dialih, gangguan elektrik, tetapan)" },
    { key: "suddenly", en: "Suddenly, with no change", ms: "Tiba-tiba, tanpa perubahan" }] },
  distance: { key: "distance", en: "How far apart are the units?", ms: "Berapa jauh jarak antara unit?", options: [
    { key: "same_room", en: "Same room", ms: "Bilik yang sama" }, { key: "near", en: "One or two rooms apart", ms: "Satu atau dua bilik" }, { key: "far", en: "Further, or another floor", ms: "Lebih jauh, atau tingkat lain" }] },
  scope: { key: "scope", en: "Is it one device or all devices?", ms: "Satu peranti atau semua peranti?", options: [
    { key: "one", en: "One device", ms: "Satu peranti" }, { key: "all", en: "All devices", ms: "Semua peranti" }, NOT_SURE] },
  ap_cabled: { key: "ap_cabled", en: "Is the unit connected to the main router with a cable?", ms: "Adakah unit disambung ke penghala utama dengan kabel?", options: [YES, NO, NOT_SURE] },
  ap_mode_set: { key: "ap_mode_set", en: "Has the unit already been switched to Access Point mode?", ms: "Adakah unit sudah ditukar ke mod Titik Akses?", options: [YES, NO, NOT_SURE] },
  page_result: { key: "page_result", en: "What happens when you open the unit's settings page?", ms: "Apa yang berlaku apabila anda membuka halaman tetapan unit?", options: [
    { key: "no_load", en: "The page does not load", ms: "Halaman tidak dimuatkan" }, { key: "cannot_sign_in", en: "It loads but I cannot sign in", ms: "Ia dimuatkan tetapi saya tidak boleh log masuk" }, NOT_SURE] },
  tried: { key: "tried", en: "What have you tried so far?", ms: "Apa yang telah anda cuba setakat ini?", options: [
    { key: "restart", en: "Restart only", ms: "Mulakan semula sahaja" }, { key: "repair", en: "Pairing again", ms: "Pasangkan semula" },
    { key: "reset_second", en: "Reset of the second unit", ms: "Tetapan semula unit kedua" }, { key: "reset_main", en: "Reset of the main router", ms: "Tetapan semula penghala utama" }] },
};

export interface ScenarioDef {
  key: string;
  modes: SupportMode[];
  en: string; ms: string;
  summaryEn: string; summaryMs: string;
  intake: string[];
  keywords: string[];
}

export const SCENARIOS: readonly ScenarioDef[] = [
  { key: "mesh_pairing", modes: ["mesh"], en: "Mesh pairing does not work", ms: "Pairing mesh tidak berjaya",
    summaryEn: "The second unit will not join the mesh.", summaryMs: "Unit kedua tidak dapat menyertai mesh.",
    intake: ["unit_role", "link_type", "distance", "reset_done"],
    keywords: ["pair", "pairing", "wps", "add satellite", "add satelite", "add agent", "add mesh", "mesh device", "~satelit", "~satellite", "~agent", "tidak jumpa", "cannot find", "not detected", "tidak detect", "~buat mesh", "~jadi mesh", "~sambung mesh", "~tambah", "easymesh setup", "easy mesh", "onemesh", "join mesh"] },
  { key: "mesh_no_internet", modes: ["mesh"], en: "Mesh unit connected but no internet", ms: "Unit mesh bersambung tetapi tiada internet",
    summaryEn: "Devices on the second unit cannot reach the internet.", summaryMs: "Peranti pada unit kedua tidak dapat mengakses internet.",
    intake: ["main_internet", "light_state", "link_type", "restarted"],
    keywords: ["no internet", "tiada internet", "cannot browse", "cant browse", "tidak boleh browse", "red light", "lampu merah", "internet light", "lampu internet", "no connection", "limited", "tidak menyala", "not on"] },
  { key: "mesh_node_offline", modes: ["mesh"], en: "Mesh unit offline or missing", ms: "Unit mesh offline atau hilang",
    summaryEn: "The second unit has disappeared or keeps going offline.", summaryMs: "Unit kedua hilang atau sering offline.",
    intake: ["started", "light_state", "link_type", "restarted"],
    keywords: ["offline", "disappear", "hilang", "disconnected", "putus", "not showing", "tidak tunjuk", "network map", "power cut", "blackout", "gone", "missing", "yesterday", "semalam"] },
  { key: "mesh_unstable", modes: ["mesh"], en: "Weak or unstable mesh", ms: "Mesh lemah atau tidak stabil",
    summaryEn: "Coverage is weak or the connection keeps dropping.", summaryMs: "Liputan lemah atau sambungan sering terputus.",
    intake: ["distance", "link_type", "scope", "started"],
    keywords: ["weak", "lemah", "unstable", "tidak stabil", "drop", "where to put", "letak", "placement", "kedudukan", "coverage", "liputan", "lousy", "teruk", "upstairs", "tingkat atas", "kejap ada", "signal"] },
  { key: "mesh_wired_backhaul", modes: ["mesh"], en: "Wired (Ethernet) mesh connection", ms: "Sambungan mesh berwayar (Ethernet)",
    summaryEn: "Connecting mesh units with a cable, or the cable link is not used.", summaryMs: "Menyambung unit mesh dengan kabel, atau sambungan kabel tidak digunakan.",
    intake: ["link_type", "unit_role", "restarted"],
    keywords: ["cable", "kabel", "lan", "ethernet", "backhaul", "wired", "berwayar", "port", "wan", "cucuk", "plug"] },
  { key: "mesh_roaming", modes: ["mesh"], en: "Devices do not switch between units", ms: "Peranti tidak bertukar antara unit",
    summaryEn: "Phones stay on a far unit when moving around.", summaryMs: "Telefon kekal pada unit yang jauh apabila bergerak.",
    intake: ["scope", "distance"],
    keywords: ["roaming", "roam", "switch", "tukar", "stuck", "melekat", "moving", "bergerak", "walk", "jalan", "video call", "handover", "same wifi name", "nama wifi sama", "seamless", "lancar", "nearer", "dekat"] },
  { key: "ap_enable", modes: ["ap"], en: "Set up Access Point mode", ms: "Tetapkan mod Titik Akses",
    summaryEn: "Switching the unit to Access Point mode behind another router.", summaryMs: "Menukar unit ke mod Titik Akses di belakang penghala lain.",
    intake: ["ap_mode_set", "ap_cabled"],
    keywords: ["~access point", "~ap mode", "~mode ap", "operation mode", "behind", "belakang", "unifi", "~set as", "jadi access point", "~change to ap", "~tukar mode", "option not there", "tiada pilihan", "takde pilihan"] },
  { key: "ap_no_internet", modes: ["ap"], en: "No internet in Access Point mode", ms: "Tiada internet dalam mod Titik Akses",
    summaryEn: "Devices connect to the access point but cannot reach the internet.", summaryMs: "Peranti bersambung ke titik akses tetapi tiada internet.",
    intake: ["main_internet", "ap_cabled", "ap_mode_set", "restarted"],
    keywords: ["no internet", "tiada internet", "no ip", "tidak dapat ip", "limited", "cannot surf", "tidak boleh surf", "cant surf", "no connection"] },
  { key: "ap_ip_conflict", modes: ["ap"], en: "IP address or DHCP conflict", ms: "Konflik alamat IP atau DHCP",
    summaryEn: "Two routers hand out addresses, or devices get the wrong address.", summaryMs: "Dua penghala memberi alamat, atau peranti mendapat alamat yang salah.",
    intake: ["ap_mode_set", "ap_cabled", "scope"],
    keywords: ["ip conflict", "conflict", "same ip", "ip sama", "dhcp", "wrong ip", "ip salah", "192.168", "two router", "dua router"] },
  { key: "ap_admin_access", modes: ["ap"], en: "Cannot open the settings page in AP mode", ms: "Tidak boleh buka halaman tetapan dalam mod AP",
    summaryEn: "The unit's settings page cannot be reached after switching to AP mode.", summaryMs: "Halaman tetapan unit tidak dapat dibuka selepas menukar ke mod AP.",
    intake: ["page_result", "ap_cabled"],
    keywords: ["login", "log masuk", "admin page", "settings page", "page router", "tplinkwifi", "cannot open", "tidak boleh buka", "forgot ip", "lupa ip", "not loading", "tidak keluar"] },
  { key: "recovery_failed", modes: ["mesh", "ap"], en: "Still not working after trying everything", ms: "Masih tidak berfungsi selepas mencuba semuanya",
    summaryEn: "Restarts, re-pairing or resets did not help.", summaryMs: "Mulakan semula, pairing semula atau tetapan semula tidak membantu.",
    intake: ["tried", "reset_done", "light_state"],
    keywords: ["reset", "factory reset", "still cannot", "masih", "tried everything", "sudah cuba", "cuba semua", "dead", "mati", "sudah reset", "already reset", "still fail", "masih gagal"] },
] as const;

export const scenarioByKey = (key: string) => SCENARIOS.find((s) => s.key === key) ?? null;
export const scenariosForMode = (mode: SupportMode) => SCENARIOS.filter((s) => s.modes.includes(mode));

// A leading "~" marks a weak keyword: generic words such as "satellite" or "AP mode" count for less
// than words that describe the symptom.
interface Keyword { phrase: string; weight: number }
const toKeyword = (k: string): Keyword => {
  const weak = k.startsWith("~");
  const phrase = normalizeForSearch(weak ? k.slice(1) : k);
  return { phrase, weight: (phrase.includes(" ") ? 2 : 1) * (weak ? 0.5 : 1) };
};
const NORMALIZED_KEYWORDS = new Map(SCENARIOS.map((s) => [s.key, s.keywords.map(toKeyword)]));
const MODE_HINTS: Record<SupportMode, Keyword[]> = {
  mesh: ["mesh", "easymesh", "easy mesh", "onemesh", "satelit", "satellite", "satelite", "agent", "node", "nod"].map(toKeyword),
  ap: ["access point", "ap mode", "mode ap", "titik akses", "operation mode", "bridge"].map(toKeyword),
};

function phraseHits(text: string, keywords: Keyword[]): number {
  const padded = ` ${text} `;
  return keywords.reduce((n, k) => (k.phrase && padded.includes(` ${k.phrase} `) ? n + k.weight : n), 0);
}

/** Infer the support mode from free text, or null when it does not say. */
export function detectSupportMode(text: string): SupportMode | null {
  const t = normalizeForSearch(text);
  const mesh = phraseHits(t, MODE_HINTS.mesh);
  const ap = phraseHits(t, MODE_HINTS.ap);
  if (mesh === ap) return null;
  return mesh > ap ? "mesh" : "ap";
}

export interface ScenarioMatch { key: string; score: number }

/**
 * Rank scenarios for a customer's own words within one mode. Uses the same English and
 * colloquial Malay normalization as search, so "tak boleh pair" and "cannot pair" both match.
 */
export function matchScenarios(text: string, mode: SupportMode): ScenarioMatch[] {
  const t = normalizeForSearch(text);
  return scenariosForMode(mode)
    .map((s) => ({ key: s.key, score: phraseHits(t, NORMALIZED_KEYWORDS.get(s.key) ?? []) }))
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score);
}

/** Keep only known question keys and option keys. Free text never enters a case through intake. */
export function sanitizeIntake(scenarioKey: string, answers: unknown): Record<string, string> {
  const scenario = scenarioByKey(scenarioKey);
  if (!scenario || typeof answers !== "object" || answers === null) return {};
  const out: Record<string, string> = {};
  for (const q of scenario.intake) {
    const value = (answers as Record<string, unknown>)[q];
    const question = INTAKE_QUESTIONS[q];
    if (typeof value === "string" && question?.options.some((o) => o.key === value)) out[q] = value;
  }
  return out;
}

/** Human-readable intake lines for staff, in English. */
export function describeIntake(answers: Record<string, string>): { question: string; answer: string }[] {
  return Object.entries(answers).flatMap(([q, a]) => {
    const question = INTAKE_QUESTIONS[q];
    const option = question?.options.find((o) => o.key === a);
    return question && option ? [{ question: question.en, answer: option.en }] : [];
  });
}

export const VERIFICATION_STATUSES = ["verified", "official_excerpt", "official_general", "community", "conflicting", "unverified"] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

/** A model-specific flow reaches customers only when published and verified by a named staff member. */
export function isCustomerVisibleFlow(f: { status: string; verificationStatus: string; verifiedAt: unknown; verifiedBy: unknown }): boolean {
  return f.status === "published" && f.verificationStatus === "verified" && !!f.verifiedAt && !!f.verifiedBy;
}

const SECRET_PATTERNS: RegExp[] = [
  // "password is abc123", "pwd: abc", "kata laluan abc", "katalaluan = abc"
  /\b(pass(?:word)?|passwd|pwd|pw|kata\s?laluan|katalaluan)\b(\s*(?:is|ialah|adalah|=|:|-))?\s*\S+/gi,
  // One-time codes: "otp 123456", "TAC: 1234", "code 123456", "kod 123456"
  /\b(otp|tac|code|kod|verification code|kod pengesahan)\b(\s*(?:is|ialah|=|:|-))?\s*\d{4,8}\b/gi,
];

/** Replace anything that looks like a password or one-time code with a placeholder. */
export function redactSecrets(text: string): { text: string; redacted: boolean } {
  let redacted = false;
  let out = text;
  for (const re of SECRET_PATTERNS) {
    out = out.replace(re, (_m, label: string) => { redacted = true; return `${label} [removed]`; });
  }
  return { text: out, redacted };
}
