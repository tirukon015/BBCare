/** Browser-side consent state. Stored in a first-party cookie for 180 days. */
export const CONSENT_COOKIE = "bbcare_consent";
export const CONSENT_VERSION = "2026-10";

export type ConsentChoice = "analytics" | "essential";

export function readConsent(): ConsentChoice | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|; )bbcare_consent=([^;]+)/);
  if (!m) return null;
  const [version, choice] = decodeURIComponent(m[1]!).split(":");
  if (version !== CONSENT_VERSION) return null;
  return choice === "analytics" ? "analytics" : choice === "essential" ? "essential" : null;
}

export async function saveConsent(analytics: boolean): Promise<void> {
  const choice: ConsentChoice = analytics ? "analytics" : "essential";
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${CONSENT_COOKIE}=${encodeURIComponent(`${CONSENT_VERSION}:${choice}`)}; Max-Age=${180 * 86400}; Path=/; SameSite=Lax${secure}`;
  if (!analytics) {
    try {
      localStorage.removeItem("bbcare_vid");
    } catch {}
  }
  try {
    await fetch("/api/consent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ analytics, version: CONSENT_VERSION }),
      keepalive: true,
    });
  } catch {}
  window.dispatchEvent(new CustomEvent("bbcare:consent", { detail: choice }));
}

/** Subscribe to consent changes (same tab via custom event, other tabs via focus). */
export function subscribeConsent(onChange: () => void): () => void {
  window.addEventListener("bbcare:consent", onChange);
  window.addEventListener("focus", onChange);
  return () => {
    window.removeEventListener("bbcare:consent", onChange);
    window.removeEventListener("focus", onChange);
  };
}
