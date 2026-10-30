import { z } from "zod";

/**
 * First-party analytics event taxonomy. Clients send the envelope plus event-specific
 * properties; the server adds device, approximate region, and consent state.
 * Unknown properties are rejected (strict objects) to prevent accidental data capture.
 */

const id = z.string().min(1).max(64);
const shortText = z.string().max(200);
const uuid = z.uuid();

export const EVENT_PROPS = {
  page_view: z.strictObject({ landing: z.boolean().optional() }),
  session_started: z.strictObject({ entry_page_type: shortText.optional() }),
  product_view: z.strictObject({
    product_id: uuid.optional(),
    model_id: uuid.optional(),
    source: z.enum(["search", "recommendation", "browse", "direct"]).optional(),
  }),
  model_search: z.strictObject({
    query: shortText,
    result_count: z.number().int().min(0).max(10_000),
    category: z.enum(["router", "laptop", "all"]).optional(),
    resolved_model_id: uuid.optional(),
  }),
  search_no_results: z.strictObject({ query: shortText, category: z.enum(["router", "laptop", "all"]).optional() }),
  article_view: z.strictObject({ article_id: uuid, revision_id: uuid.optional(), from: shortText.optional() }),
  support_started: z.strictObject({ support_session: id, category: z.enum(["router", "laptop"]).optional() }),
  support_message_submitted: z.strictObject({
    support_session: id,
    length_bucket: z.enum(["xs", "s", "m", "l"]),
    outcome: z.enum(["answered", "clarify", "abstain", "escalate"]).optional(),
  }),
  support_resolved: z.strictObject({ support_session: id, turns: z.number().int().min(0).max(500).optional() }),
  support_escalated: z.strictObject({ support_session: id, reason: shortText.optional() }),
  article_feedback: z.strictObject({ article_id: uuid, rating: z.union([z.literal(-1), z.literal(1)]) }),
  resource_open: z.strictObject({ resource_id: uuid, kind: z.enum(["video", "diagram", "image", "document"]) }),
  resource_feedback: z.strictObject({ resource_id: uuid, rating: z.union([z.literal(-1), z.literal(1)]) }),
  /** Video playback milestones; the player reports the furthest quarter reached. */
  video_progress: z.strictObject({ resource_id: uuid, pct: z.union([z.literal(25), z.literal(50), z.literal(75), z.literal(100)]) }),
  /** Router journey: which model, mode and problem a visitor chose (ids only). */
  router_model_selected: z.strictObject({ model_id: uuid, ecr: z.string().regex(/^[A-Z0-9]{2,6}$/) }),
  router_mode_selected: z.strictObject({ model_id: uuid, mode: z.enum(["mesh", "ap"]) }),
  router_scenario_selected: z.strictObject({ model_id: uuid, mode: z.enum(["mesh", "ap"]), scenario: z.string().regex(/^[a-z0-9_]{3,40}$/), verified: z.boolean() }),
  /** Step-by-step flow progress: step key and what the visitor did there. */
  flow_step: z.strictObject({ flow_id: uuid, step_key: z.string().regex(/^[a-z0-9_-]{1,40}$/), action: z.enum(["next", "back", "resolved", "escalate", "restart"]) }),
  escalation_submitted: z.strictObject({ origin: z.enum(["chat", "router", "form"]), scenario: z.string().regex(/^[a-z0-9_]{3,40}$/).optional() }),
  case_followup: z.strictObject({ action: z.enum(["lookup", "message"]) }),
  /**
   * Coarse click position for interface heatmaps: a 10 percent grid cell of the viewport and the
   * kind of element, never the element text, coordinates or any input value.
   */
  click_area: z.strictObject({
    x_pct: z.number().int().min(0).max(90).multipleOf(10),
    y_pct: z.number().int().min(0).max(90).multipleOf(10),
    target: z.enum(["link", "button", "input", "other"]),
    viewport: z.enum(["phone", "tablet", "desktop"]),
  }),
  recommendation_shown: z.strictObject({
    recommendation_id: uuid,
    product_id: uuid,
    context: z.enum(["chat", "article", "product", "search"]),
    position: z.number().int().min(0).max(50).optional(),
  }),
  shopee_outbound_click: z.strictObject({ recommendation_id: uuid, listing_id: uuid }),
  navigation_exit: z.strictObject({
    max_scroll_pct: z.union([z.literal(0), z.literal(25), z.literal(50), z.literal(75), z.literal(100)]),
    time_on_page_s: z.number().int().min(0).max(86_400).optional(),
  }),
  ui_click: z.strictObject({ element_key: z.string().regex(/^[a-z0-9_.-]{1,64}$/) }),
  performance_error: z.strictObject({
    kind: z.enum(["web_vital", "js_error", "api_error"]),
    name: z.string().max(64),
    value: z.number().min(0).max(1e7).optional(),
    route: z.string().max(200).optional(),
  }),
} as const;

export type EventName = keyof typeof EVENT_PROPS;
export const EVENT_NAMES = Object.keys(EVENT_PROPS) as EventName[];

/** Events created only by the server (never accepted from browsers). */
export const SERVER_ONLY_EVENTS: readonly EventName[] = ["shopee_outbound_click", "recommendation_shown"];

export const clientEventSchema = z.strictObject({
  event_id: uuid,
  name: z.enum(EVENT_NAMES as [EventName, ...EventName[]]),
  occurred_at: z.iso.datetime({ offset: true }),
  session_id: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),
  visitor_id: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/).optional(),
  page_path: z.string().max(300).startsWith("/"),
  page_type: z.string().max(40).optional(),
  referrer: z.string().max(500).optional(),
  utm_source: z.string().max(100).optional(),
  utm_medium: z.string().max(100).optional(),
  utm_campaign: z.string().max(100).optional(),
  utm_content: z.string().max(100).optional(),
  utm_term: z.string().max(100).optional(),
  /** Explicit channel label carried by the link (`?ch=shopee`). */
  ch: z.string().max(40).optional(),
  locale: z.enum(["en", "ms"]),
  props: z.record(z.string(), z.unknown()).default({}),
});

export type ClientEvent = z.infer<typeof clientEventSchema>;

export const eventBatchSchema = z.strictObject({ events: z.array(z.unknown()).min(1).max(25) });

export type ValidatedEvent = Omit<ClientEvent, "props"> & { props: Record<string, unknown> };

/** Validate envelope and event-specific properties. Returns null when invalid. */
export function validateClientEvent(raw: unknown): ValidatedEvent | null {
  const env = clientEventSchema.safeParse(raw);
  if (!env.success) return null;
  if (SERVER_ONLY_EVENTS.includes(env.data.name)) return null;
  const props = EVENT_PROPS[env.data.name].safeParse(env.data.props);
  if (!props.success) return null;
  return { ...env.data, props: props.data as Record<string, unknown> };
}

/** Strip query strings except allowlisted keys; never keep fragments. */
export function sanitizePath(path: string): string {
  const [base] = path.split("#");
  const [pathname] = (base ?? "/").split("?");
  return (pathname ?? "/").slice(0, 300) || "/";
}

export function referrerDomain(referrer: string | undefined): string | null {
  if (!referrer) return null;
  try {
    return new URL(referrer).hostname.slice(0, 100);
  } catch {
    return null;
  }
}

/** Malaysian states and federal territories (ISO 3166-2:MY codes). */
export const MY_REGIONS: Record<string, string> = {
  "MY-01": "Johor",
  "MY-02": "Kedah",
  "MY-03": "Kelantan",
  "MY-04": "Melaka",
  "MY-05": "Negeri Sembilan",
  "MY-06": "Pahang",
  "MY-07": "Pulau Pinang",
  "MY-08": "Perak",
  "MY-09": "Perlis",
  "MY-10": "Selangor",
  "MY-11": "Terengganu",
  "MY-12": "Sabah",
  "MY-13": "Sarawak",
  "MY-14": "W.P. Kuala Lumpur",
  "MY-15": "W.P. Labuan",
  "MY-16": "W.P. Putrajaya",
};

/** Minimum count before a geographic cell is shown in dashboards. */
export const GEO_SUPPRESSION_THRESHOLD = 10;
