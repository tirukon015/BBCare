/**
 * Personal-data scrubbing for free text stored outside support transcripts
 * (search queries, feedback comments, analytics properties).
 */

const PATTERNS: ReadonlyArray<[RegExp, string]> = [
  // Email addresses
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]"],
  // Malaysian MyKad: YYMMDD-PB-###G, with or without dashes or spaces
  [/\b\d{6}[-\s]?\d{2}[-\s]?\d{4}\b/g, "[id]"],
  // Malaysian and international phone numbers: +60, 60, 0 prefixes, 9 to 12 digits
  [/(?<![\w])(?:\+?6?0)[\s-]?1\d[\s-]?\d{3,4}[\s-]?\d{4}\b/g, "[phone]"],
  [/(?<![\w])\+\d[\d\s-]{7,16}\d\b/g, "[phone]"],
  // Card-like or account-like digit runs (10 or more digits, allowing separators)
  [/\b(?:\d[\s-]?){10,19}\b/g, "[number]"],
];

const IPV4 = /(?<![\w.])(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?![\w.])/g;

/**
 * Public IPv4 addresses can identify a customer; private router addresses (192.168.x.x,
 * 10.x, 172.16-31.x) are useful for support and are kept. Values whose first octet is
 * below 11 are treated as firmware versions (for example 3.0.0.4), not addresses.
 */
function scrubPublicIpv4(input: string): string {
  return input.replace(IPV4, (match, a: string, b: string) => {
    const o1 = Number(a);
    const o2 = Number(b);
    const octets = match.split(".").map(Number);
    if (octets.some((o) => o > 255)) return match;
    if (o1 < 11) return match;
    if (o1 === 192 && o2 === 168) return match;
    if (o1 === 172 && o2 >= 16 && o2 <= 31) return match;
    if (o1 === 169 && o2 === 254) return match;
    if (o1 === 127) return match;
    return "[ip]";
  });
}

export function scrubPersonalData(input: string): string {
  let out = scrubPublicIpv4(input);
  for (const [pattern, replacement] of PATTERNS) out = out.replace(pattern, replacement);
  return out;
}

export function containsPersonalData(input: string): boolean {
  return scrubPersonalData(input) !== input;
}

/** Truncate an IPv4 address to /24 or an IPv6 address to /48 for short-lived security logs. */
export function truncateIp(ip: string): string {
  if (ip.includes(".")) {
    const parts = ip.split(".");
    if (parts.length === 4) return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
  }
  if (ip.includes(":")) {
    const parts = ip.split(":").filter((p, i) => p !== "" || i === 0);
    return `${parts.slice(0, 3).join(":")}::`;
  }
  return "unknown";
}
