/**
 * First-party analytics client. Sends only schema-defined events (packages/core analytics.ts).
 * The analytics session id lives in sessionStorage (cleared when the tab closes). A visitor id
 * is stored only after analytics consent. Input values and keystrokes are never captured.
 */
import { readConsent } from "./consent";

type Props = Record<string, unknown>;

interface Pending {
  event_id: string;
  name: string;
  occurred_at: string;
  session_id: string;
  visitor_id?: string;
  page_path: string;
  page_type?: string;
  referrer?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  locale: "en" | "ms";
  props: Props;
}

const queue: Pending[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

function randomId(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function store(kind: "session" | "local", key: string, create: () => string): string | undefined {
  try {
    const s = kind === "session" ? sessionStorage : localStorage;
    const existing = s.getItem(key);
    if (existing) return existing;
    const value = create();
    s.setItem(key, value);
    return value;
  } catch {
    return undefined;
  }
}

let fallbackSession: string | null = null;
export function sessionId(): { id: string; isNew: boolean } {
  let isNew = false;
  const id =
    store("session", "bbcare_sid", () => {
      isNew = true;
      return randomId();
    }) ?? (fallbackSession ??= randomId());
  return { id, isNew };
}

function visitorId(): string | undefined {
  if (readConsent() !== "analytics") return undefined;
  return store("local", "bbcare_vid", randomId);
}

function locale(): "en" | "ms" {
  return location.pathname.startsWith("/ms") ? "ms" : "en";
}

function pageType(path: string): string {
  const seg = path.split("/")[2] ?? "home";
  return seg || "home";
}

function flush(useBeacon = false) {
  if (timer) clearTimeout(timer);
  timer = null;
  if (queue.length === 0) return;
  const body = JSON.stringify({ events: queue.splice(0, 25) });
  if (useBeacon && navigator.sendBeacon) {
    navigator.sendBeacon("/api/e", new Blob([body], { type: "application/json" }));
  } else {
    fetch("/api/e", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => {});
  }
  if (queue.length > 0) flush(useBeacon);
}

export function track(name: string, props: Props = {}) {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(location.search);
  const ref = document.referrer && !document.referrer.startsWith(location.origin) ? document.referrer : undefined;
  queue.push({
    event_id: crypto.randomUUID(),
    name,
    occurred_at: new Date().toISOString(),
    session_id: sessionId().id,
    visitor_id: visitorId(),
    page_path: location.pathname,
    page_type: pageType(location.pathname),
    referrer: ref?.slice(0, 500),
    utm_source: params.get("utm_source")?.slice(0, 100) ?? undefined,
    utm_medium: params.get("utm_medium")?.slice(0, 100) ?? undefined,
    utm_campaign: params.get("utm_campaign")?.slice(0, 100) ?? undefined,
    locale: locale(),
    props,
  });
  if (queue.length >= 10) flush();
  else if (!timer) timer = setTimeout(() => flush(), 2000);
}

export function flushOnExit() {
  flush(true);
}
