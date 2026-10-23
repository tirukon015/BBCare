/**
 * Text normalization shared by indexing and querying. Both sides must use the same
 * functions so that lexical search matches consistently.
 */

const COMBINING_MARKS = /[̀-ͯ]/g;

/** Lowercase, strip accents, collapse whitespace, remove most punctuation. */
export function normalizeText(input: string): string {
  return input
    .normalize("NFKD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s.\-/+]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Canonical form for model numbers: uppercase alphanumerics only.
 * "rt-ax86u pro" and "RT AX86U-Pro" both become "RTAX86UPRO".
 */
export function normalizeModelNumber(input: string): string {
  return input
    .normalize("NFKD")
    .replace(COMBINING_MARKS, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

/**
 * Colloquial and abbreviated Malay (and common Manglish) mapped to standard forms.
 * Keys are matched as whole words after normalizeText.
 */
export const MALAY_COLLOQUIAL: Readonly<Record<string, string>> = {
  x: "tidak",
  tak: "tidak",
  tk: "tidak",
  xde: "tiada",
  takde: "tiada",
  tade: "tiada",
  xleh: "tidak boleh",
  xboleh: "tidak boleh",
  takleh: "tidak boleh",
  tkleh: "tidak boleh",
  blh: "boleh",
  leh: "boleh",
  sy: "saya",
  sye: "saya",
  aku: "saya",
  sbb: "sebab",
  utk: "untuk",
  dgn: "dengan",
  dh: "sudah",
  dah: "sudah",
  sdh: "sudah",
  da: "sudah",
  nk: "hendak",
  nak: "hendak",
  mcm: "macam",
  camne: "macam mana",
  camana: "macam mana",
  mcmmana: "macam mana",
  pastu: "selepas itu",
  lps: "lepas",
  jgn: "jangan",
  tlg: "tolong",
  tolong: "tolong",
  lmbt: "lambat",
  lembab: "lambat",
  slow: "lambat",
  bgs: "bagus",
  pls: "please",
  plz: "please",
  wifi: "wifi",
  "wi-fi": "wifi",
  internet: "internet",
  line: "sambungan",
  lappy: "laptop",
  lptop: "laptop",
  komputer: "laptop",
  bateri: "battery",
  batt: "battery",
  cas: "charge",
  caj: "charge",
  panas: "overheat",
  hang: "freeze",
  restart: "restart",
  reset: "reset",
  rosak: "rosak",
};

/** Bilingual synonyms used to expand search queries (both directions). */
export const SEARCH_SYNONYMS: ReadonlyArray<ReadonlyArray<string>> = [
  ["wifi", "wireless", "tanpa wayar"],
  ["lambat", "slow", "perlahan", "lag"],
  ["sambungan", "connection", "connect", "line"],
  ["tidak boleh", "cannot", "can't", "unable"],
  ["battery", "bateri"],
  ["charge", "charging", "cas", "caj", "mengecas"],
  ["overheat", "overheating", "panas", "hot"],
  ["freeze", "hang", "stuck", "tergantung"],
  ["password", "kata laluan"],
  ["firmware", "perisian tegar"],
  ["screen", "skrin", "display", "paparan"],
  ["keyboard", "papan kekunci"],
  ["update", "kemas kini", "upgrade"],
  ["setup", "set up", "persediaan", "pemasangan", "install"],
  ["reset", "tetapan semula"],
  ["router", "penghala"],
  ["speed", "kelajuan"],
];

/** Expand colloquial Malay tokens to standard forms. */
export function expandColloquial(normalized: string): string {
  return normalized
    .split(" ")
    .map((token) => MALAY_COLLOQUIAL[token] ?? token)
    .join(" ");
}

/** Full normalization for search text: normalizeText + colloquial expansion. */
export function normalizeForSearch(input: string): string {
  return expandColloquial(normalizeText(input));
}

/** Return the query plus synonym alternatives found in it, without duplicates. */
export function synonymTerms(normalized: string): string[] {
  const terms = new Set<string>();
  const padded = ` ${normalized} `;
  for (const group of SEARCH_SYNONYMS) {
    if (group.some((term) => padded.includes(` ${term} `))) {
      for (const term of group) terms.add(term);
    }
  }
  return [...terms];
}

const MALAY_MARKERS = new Set([
  "saya", "tidak", "boleh", "macam", "mana", "tiada", "sudah", "hendak", "nak", "untuk", "dengan",
  "kenapa", "bagaimana", "apa", "ini", "itu", "yang", "dan", "atau", "tolong", "sebab", "lambat",
  "sambungan", "cara", "masalah", "bila", "tetapan", "kata", "laluan", "rosak", "ke", "di", "lagi",
  "selepas", "jangan", "perlahan", "skrin", "mengecas", "penghala",
]);

/** Colloquial keys that are Malay (excludes English words such as "slow" or "reset"). */
const MALAY_SHORT_FORMS = new Set([
  "x", "tak", "tk", "xde", "takde", "tade", "xleh", "xboleh", "takleh", "tkleh", "blh", "leh", "sy", "sye", "sbb", "utk",
  "dgn", "dh", "dah", "sdh", "da", "nk", "mcm", "camne", "camana", "mcmmana", "pastu", "lps", "jgn", "tlg", "lmbt", "lembab",
  "bgs", "bateri", "cas", "caj", "panas", "rosak", "komputer", "aku", "sgt", "je", "lah", "pun", "punya",
]);

/** Heuristic language detection between English and Malay. Defaults to the fallback. */
export function detectLanguage(input: string, fallback: "en" | "ms" = "en"): "en" | "ms" {
  const tokens = normalizeText(input).split(" ").filter((t) => /\p{L}/u.test(t));
  if (tokens.length === 0) return fallback;
  const malay = tokens.filter((t) => MALAY_MARKERS.has(t) || MALAY_SHORT_FORMS.has(t)).length;
  const ratio = malay / tokens.length;
  if (ratio >= 0.25) return "ms";
  if (ratio === 0 && tokens.length >= 3) return "en";
  return malay > 0 && tokens.length < 3 ? "ms" : fallback;
}

/** Candidate model-number tokens in free text, such as "RT-AX86U" or "X1 Carbon". */
export function extractModelCandidates(input: string): string[] {
  const matches = input.match(/\b[A-Za-z]{1,6}[- ]?[A-Za-z]*\d{1,5}[A-Za-z0-9-]*\b/g) ?? [];
  return [...new Set(matches.map(normalizeModelNumber).filter((m) => m.length >= 3))];
}

const STOP_WORDS = new Set([
  // English
  "a", "an", "the", "is", "are", "am", "was", "be", "to", "of", "and", "or", "in", "on", "at", "for",
  "my", "me", "i", "it", "its", "this", "that", "with", "do", "does", "how", "what", "why", "can",
  "please", "help", "hi", "hello", "keeps", "get", "got", "have", "has", "not", "no",
  // Malay
  "saya", "ini", "itu", "yang", "dan", "atau", "di", "ke", "dari", "pada", "untuk", "dengan", "ada",
  "apa", "kenapa", "bagaimana", "macam", "mana", "tolong", "boleh", "hendak", "sudah", "lagi", "je",
  "ke", "lah", "pun", "sgt", "sangat", "nak", "dia", "kita", "kami", "awak", "anda",
]);

/**
 * Build a Postgres tsquery string with OR semantics and prefix matching from free text.
 * Includes bilingual synonyms. Returns null when nothing searchable remains.
 */
export function buildTsQuery(input: string, maxTerms = 16): string | null {
  const normalized = normalizeForSearch(input);
  const clean = (token: string) => token.replace(/[^\p{L}\p{N}]/gu, "");
  const terms = new Set<string>();
  const addToken = (token: string) => {
    const c = clean(token);
    if (c.length < 2 || STOP_WORDS.has(c)) return;
    // Prefix matching only for 3+ characters; short tokens match exactly.
    terms.add(c.length >= 3 ? `${c}:*` : c);
  };
  for (const token of normalized.split(/[\s./+-]+/)) addToken(token);
  for (const syn of synonymTerms(normalized)) {
    const words = syn.split(/\s+/).map(clean).filter(Boolean);
    if (words.length === 1) addToken(words[0]!);
    else if (words.length > 1) terms.add(`(${words.join(" <-> ")})`);
  }
  const list = [...terms].slice(0, maxTerms);
  return list.length ? list.join(" | ") : null;
}

const CATEGORY_WORDS: Record<"router" | "laptop", RegExp> = {
  laptop: /\b(laptop|lappy|lptop|notebook|komputer riba|komputer|macbook|chromebook|bateri laptop)\b/i,
  router: /\b(router|penghala|modem|mesh|wifi|wi-fi|wireless|access point|4g router|5g router)\b/i,
};

/** Detect an explicit product category mentioned in the text, if exactly one is mentioned. */
export function detectCategory(input: string): "router" | "laptop" | null {
  const laptop = CATEGORY_WORDS.laptop.test(input);
  const router = CATEGORY_WORDS.router.test(input);
  if (laptop && !router) return "laptop";
  if (router && !laptop) return "router";
  return null;
}

/**
 * Concept groups for a query: each content word with its synonyms. Used to measure how much
 * of the customer's question a passage actually covers.
 */
export function queryTermGroups(input: string): string[][] {
  const normalized = normalizeForSearch(input);
  const groups: string[][] = [];
  for (const raw of normalized.split(/[\s./+-]+/)) {
    const token = raw.replace(/[^\p{L}\p{N}]/gu, "");
    if (token.length < 2 || STOP_WORDS.has(token)) continue;
    const syns = SEARCH_SYNONYMS.find((g) => g.includes(token)) ?? [];
    groups.push([...new Set([token, ...syns.map((x) => normalizeText(x))])]);
  }
  return groups;
}

/** Fraction of concept groups with at least one variant present (word-prefix match) in text. */
export function termCoverage(groups: string[][], text: string): number {
  if (groups.length === 0) return 0;
  const hay = ` ${normalizeForSearch(text).replace(/[^\p{L}\p{N}\s]/gu, " ")} `;
  const compact = hay.replace(/\s+/g, "");
  const hit = groups.filter((g) =>
    g.some((v) => {
      const c = v.replace(/[^\p{L}\p{N}\s]/gu, "");
      return hay.includes(` ${c}`) || (/\d/.test(c) && compact.includes(c.replace(/\s+/g, "")));
    }),
  ).length;
  return hit / groups.length;
}
