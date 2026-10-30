/**
 * Traffic attribution as the browser reports it. On each page load, if the page was reached from
 * outside the site (external referrer, UTM parameters or a `ch` link label), that arrival is
 * stored as the latest touch, and as the first touch if none is stored yet.
 *
 * Storage follows consent: the current tab (sessionStorage) always; the first touch is also kept
 * for 30 days in localStorage only after analytics consent. Nothing here identifies a person and
 * nothing is read from the device beyond the current URL and referrer.
 */
import { readConsent } from "./consent";

export interface Touch {
  referrer?: string;
  landing_path?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  ch?: string;
  at?: string;
}

const FIRST = "bbcare_ft";
const LATEST = "bbcare_lt";
const FIRST_TTL_MS = 30 * 86_400_000;

function read(storage: Storage, key: string): Touch | null {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const t = JSON.parse(raw) as Touch;
    if (key === FIRST && t.at && Date.now() - Date.parse(t.at) > FIRST_TTL_MS) { storage.removeItem(key); return null; }
    return t;
  } catch { return null; }
}
function write(storage: Storage, key: string, t: Touch) {
  try { storage.setItem(key, JSON.stringify(t)); } catch {}
}

/** Record the current arrival if it came from outside the site. Call once per page load. */
export function captureTouch(): void {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(location.search);
  const external = document.referrer && !document.referrer.startsWith(location.origin) ? document.referrer : undefined;
  const utm_source = params.get("utm_source") ?? undefined;
  const utm_medium = params.get("utm_medium") ?? undefined;
  const utm_campaign = params.get("utm_campaign") ?? undefined;
  const ch = params.get("ch") ?? undefined;
  const arrived = !!(external || utm_source || utm_medium || utm_campaign || ch);
  const existingFirst = read(sessionStorage, FIRST) ?? (readConsent() === "analytics" ? read(localStorage, FIRST) : null);
  if (!arrived && existingFirst) return;
  // No prior touch and no external signal: record the landing page only, so the landing path is
  // known while the channel stays "unknown" (the server never infers one from an empty referrer).
  const touch: Touch = {
    ...(external ? { referrer: external.slice(0, 500) } : {}),
    landing_path: location.pathname.slice(0, 300),
    ...(utm_source ? { utm_source: utm_source.slice(0, 100) } : {}),
    ...(utm_medium ? { utm_medium: utm_medium.slice(0, 100) } : {}),
    ...(utm_campaign ? { utm_campaign: utm_campaign.slice(0, 100) } : {}),
    ...(ch ? { ch: ch.slice(0, 40) } : {}),
    at: new Date().toISOString(),
  };
  if (arrived || !read(sessionStorage, LATEST)) write(sessionStorage, LATEST, touch);
  if (!existingFirst) {
    write(sessionStorage, FIRST, touch);
    if (readConsent() === "analytics") write(localStorage, FIRST, touch);
  }
}

/** What the client sends with a support session or case: first and latest touch, or nothing. */
export function attributionPayload(): { first?: Touch; latest?: Touch } | undefined {
  if (typeof window === "undefined") return undefined;
  const first = read(sessionStorage, FIRST) ?? (readConsent() === "analytics" ? read(localStorage, FIRST) : null);
  const latest = read(sessionStorage, LATEST);
  if (!first && !latest) return undefined;
  return { ...(first ? { first } : {}), ...(latest ? { latest } : {}) };
}
