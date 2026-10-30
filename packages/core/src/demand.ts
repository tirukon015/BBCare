/**
 * Customer demand intelligence: which support resources customers ask for and are missing.
 *
 * This module holds the pure rules: how a traffic source is classified (never inferred beyond
 * what the browser and link actually carried), which resource type a question asks for, and the
 * key that groups equivalent requests. Storage and dashboards live in @bbcare/db and the web app.
 */
import { z } from "zod";
import { normalizeForSearch } from "./text";

export const SUPPORT_CHANNELS = ["website", "shopee", "qr_code", "direct_link", "other", "unknown"] as const;
export type SupportChannel = (typeof SUPPORT_CHANNELS)[number];

export const RESOURCE_TYPES = ["text_guide", "video", "diagram", "image", "document"] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];

export const DEMAND_STATUSES = ["missing", "requested", "in_progress", "uploaded", "under_review", "approved"] as const;
export type DemandStatus = (typeof DEMAND_STATUSES)[number];

/** One arrival at the site as the browser reported it. Every field optional: absent means not available. */
export const touchSchema = z.strictObject({
  referrer: z.string().max(500).optional(),
  landing_path: z.string().max(300).startsWith("/").optional(),
  utm_source: z.string().max(100).optional(),
  utm_medium: z.string().max(100).optional(),
  utm_campaign: z.string().max(100).optional(),
  /** Channel label carried by the link itself (`?ch=shopee`), the only explicit channel signal. */
  ch: z.string().max(40).optional(),
  at: z.iso.datetime({ offset: true }).optional(),
});
export type Touch = z.infer<typeof touchSchema>;

export const attributionInputSchema = z.strictObject({
  first: touchSchema.optional(),
  latest: touchSchema.optional(),
});
export type AttributionInput = z.infer<typeof attributionInputSchema>;

/** Link labels BBTech may put on its own links. Anything else is recorded as "other" with the label kept. */
const LINK_CHANNELS: Record<string, SupportChannel> = { shopee: "shopee", qr: "qr_code", qr_code: "qr_code", direct: "direct_link", direct_link: "direct_link", website: "website" };
const SHOPEE_HOSTS = /(^|\.)shopee\.(com\.my|sg|com|co\.id|ph|vn|co\.th|tw|com\.br|com\.mx|com\.co|cl)$/i;

export interface ChannelResult {
  channel: SupportChannel;
  /** Free label for "other" channels, from the link parameter, letters, digits, dash and underscore only. */
  detail: string | null;
  /** What the classification rests on. "none" means nothing reliable was available. */
  evidence: "link_param" | "utm" | "referrer" | "none";
}

function hostOf(url: string | undefined): string | null {
  if (!url) return null;
  try { return new URL(url).hostname.toLowerCase(); } catch { return null; }
}

/**
 * Classify the support channel from what a touch actually carried. Order: an explicit link label,
 * then UTM source or medium, then the referrer host. A missing referrer is "unknown", not "direct":
 * browsers strip referrers for many reasons, so absence is not evidence.
 */
export function classifyChannel(touch: Touch | undefined, ownHosts: string[] = []): ChannelResult {
  if (!touch) return { channel: "unknown", detail: null, evidence: "none" };
  const ch = touch.ch?.trim().toLowerCase();
  if (ch) {
    const known = LINK_CHANNELS[ch];
    if (known) return { channel: known, detail: null, evidence: "link_param" };
    const label = ch.replace(/[^a-z0-9_-]/g, "").slice(0, 40);
    if (label) return { channel: "other", detail: label, evidence: "link_param" };
  }
  const source = touch.utm_source?.toLowerCase() ?? "";
  const medium = touch.utm_medium?.toLowerCase() ?? "";
  if (/shopee/.test(source)) return { channel: "shopee", detail: null, evidence: "utm" };
  if (medium === "qr" || medium === "qr_code" || medium === "qrcode") return { channel: "qr_code", detail: null, evidence: "utm" };
  const host = hostOf(touch.referrer);
  if (host) {
    if (SHOPEE_HOSTS.test(host)) return { channel: "shopee", detail: null, evidence: "referrer" };
    if (ownHosts.some((h) => h && host === h.toLowerCase())) return { channel: "website", detail: null, evidence: "referrer" };
    return { channel: "other", detail: host.slice(0, 40), evidence: "referrer" };
  }
  return { channel: "unknown", detail: null, evidence: "none" };
}

/** Referrer reduced to its host; full URLs are never stored. */
export function referrerHost(referrer: string | undefined): string | null {
  return hostOf(referrer);
}

const RESOURCE_HINTS: { type: ResourceType; patterns: RegExp[] }[] = [
  { type: "video", patterns: [/\bvideo\b/, /\btunjuk(kan)?\b/, /\bshow me\b/, /\bdemo\b/, /\byoutube\b/, /\brakaman\b/, /\bwatch\b/, /\btengok\b/] },
  { type: "diagram", patterns: [/\bdiagram\b/, /\brajah\b/, /\bwhich port\b/, /\bport mana\b/, /\bwiring\b/, /\bcabling\b/, /\bsusun atur\b/, /\blayout\b/, /\bschematic\b/] },
  { type: "image", patterns: [/\b(picture|photo|image|gambar|foto|screenshot|skrin)s?\b/, /\bwhat does it look like\b/, /\bmacam mana rupa\b/, /\blampu\b.*\b(warna|colour|color)\b/, /\b(light|led)s?\b.*\b(colour|color)\b/] },
  { type: "document", patterns: [/\bmanual\b/, /\bpdf\b/, /\bdocument\b/, /\bdokumen\b/, /\bbuku panduan\b/, /\bdatasheet\b/, /\bspec sheet\b/, /\bhandbook\b/] },
];

/**
 * Which kind of resource a question asks for. Rule-based: a customer who says "show me a video"
 * wants a video. Without any such hint the customer wants text guidance. This is an interpretation
 * and is labelled as such wherever it is shown.
 */
export function inferResourceType(question: string): ResourceType {
  const t = ` ${normalizeForSearch(question)} `;
  for (const { type, patterns } of RESOURCE_HINTS) if (patterns.some((p) => p.test(t))) return type;
  return "text_guide";
}

export interface DemandKeyInput {
  modelId: string;
  hardwareRevision: string | null | undefined;
  supportMode: "mesh" | "ap";
  scenarioKey: string;
  resourceType: ResourceType;
  locale: "en" | "ms";
}

/** Normalised hardware revision for grouping: "V3", "v3.0 " and "3" become "V3"; nothing known becomes "". */
export function normalizeHardwareRevision(value: string | null | undefined): string {
  const v = (value ?? "").trim().toUpperCase().replace(/^VER(SION)?\s*/, "V").replace(/\s+/g, "");
  if (!v) return "";
  const m = /^V?(\d+(?:\.\d+)?)$/.exec(v);
  return m ? `V${m[1]!.replace(/\.0$/, "")}` : v.slice(0, 30);
}

/** Equivalent requests share this key: same model, revision, mode, problem, resource type and language. */
export function demandGroupKey(k: DemandKeyInput): string {
  return [k.modelId, normalizeHardwareRevision(k.hardwareRevision), k.supportMode, k.scenarioKey, k.resourceType, k.locale].join("|");
}

/** Human-readable requirement, in English for staff. */
export function describeRequirement(k: { modelName: string; scenarioTitle: string; resourceType: ResourceType; locale: "en" | "ms"; hardwareRevision?: string | null }): string {
  const type = { text_guide: "Step-by-step guide", video: "Video", diagram: "Diagram", image: "Image or photo", document: "Document or manual" }[k.resourceType];
  const rev = normalizeHardwareRevision(k.hardwareRevision);
  return `${type} in ${k.locale === "ms" ? "Malay" : "English"}: ${k.modelName}${rev ? ` (${rev})` : ""}, ${k.scenarioTitle}`;
}

export const SOURCE_GROUPS = ["shopee", "google", "search", "social", "referral", "qr_code", "direct_link", "labelled", "website", "unknown"] as const;
export type SourceGroup = (typeof SOURCE_GROUPS)[number];

const SEARCH_HOSTS = /(^|\.)(bing\.com|yahoo\.com|duckduckgo\.com|yandex\.(com|ru)|baidu\.com|ecosia\.org|search\.brave\.com)$/i;
const GOOGLE_HOSTS = /(^|\.)google\.[a-z.]+$/i;
const SOCIAL_HOSTS = /(^|\.)(facebook\.com|fb\.com|m\.facebook\.com|l\.facebook\.com|instagram\.com|l\.instagram\.com|tiktok\.com|twitter\.com|x\.com|t\.co|youtube\.com|youtu\.be|whatsapp\.com|wa\.me|telegram\.org|t\.me|threads\.net|linkedin\.com|lnkd\.in|xiaohongshu\.com|pinterest\.com)$/i;

/**
 * Reporting group for a traffic source, from the classified channel and the referrer host. Only
 * hosts the browser actually sent are grouped; "unknown" stays unknown.
 */
export function sourceGroup(channel: SupportChannel, referrerHost: string | null | undefined): SourceGroup {
  if (channel === "shopee") return "shopee";
  if (channel === "qr_code") return "qr_code";
  if (channel === "direct_link") return "direct_link";
  if (channel === "website") return "website";
  if (channel === "unknown") return "unknown";
  const host = (referrerHost ?? "").toLowerCase();
  if (!host) return "labelled";
  if (GOOGLE_HOSTS.test(host)) return "google";
  if (SEARCH_HOSTS.test(host)) return "search";
  if (SOCIAL_HOSTS.test(host)) return "social";
  return "referral";
}
