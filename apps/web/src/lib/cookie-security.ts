/**
 * Whether cookies get the Secure attribute. Always on for staging and production (served over
 * HTTPS); otherwise follows BBCARE_BASE_URL. Safari refuses Secure cookies over plain http,
 * even on localhost, so tying this to NODE_ENV broke http test and preview environments.
 */
export function secureCookies(): boolean {
  const env = process.env.BBCARE_ENV;
  if (env === "production" || env === "staging") return true;
  return (process.env.BBCARE_BASE_URL ?? "").startsWith("https://");
}
