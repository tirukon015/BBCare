/** Rules that decide whether a product listing may be shown to customers. */

export const LISTING_DOMAINS = ["www.bbtech.shop", "bbtech.shop", "shopee.com.my"] as const;

export function isAllowedListingUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  return (
    url.protocol === "https:" &&
    (LISTING_DOMAINS as readonly string[]).includes(url.hostname) &&
    url.username === "" &&
    url.password === ""
  );
}

export interface ListingState {
  status: "unverified" | "active" | "broken" | "delisted";
  url: string;
  lastVerifiedAt: Date | null;
}

export interface EligibilityPolicy {
  verificationWindowDays: number;
  now?: Date;
}

export type EligibilityResult = { eligible: true } | { eligible: false; reason: string };

export function listingEligibility(
  listing: ListingState,
  compatibilityVerified: boolean,
  policy: EligibilityPolicy,
): EligibilityResult {
  if (listing.status !== "active") return { eligible: false, reason: `status_${listing.status}` };
  if (!isAllowedListingUrl(listing.url)) return { eligible: false, reason: "domain_not_allowed" };
  if (!listing.lastVerifiedAt) return { eligible: false, reason: "never_verified" };
  const now = policy.now ?? new Date();
  const ageDays = (now.getTime() - listing.lastVerifiedAt.getTime()) / 86_400_000;
  if (ageDays > policy.verificationWindowDays) return { eligible: false, reason: "verification_stale" };
  if (!compatibilityVerified) return { eligible: false, reason: "compatibility_unverified" };
  return { eligible: true };
}

export interface Observation {
  source: "shopee_api" | "storefront_api" | "manual_authorized";
  observedAt: Date;
}

/** Price or stock is shown only from an authorized source observed within the TTL. */
export function isObservationFresh(obs: Observation | null, ttlHours: number, now = new Date()): boolean {
  if (!obs) return false;
  return (now.getTime() - obs.observedAt.getTime()) / 3_600_000 <= ttlHours;
}
