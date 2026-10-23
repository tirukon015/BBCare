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

/** Heuristic language detection between English and Malay. Defaults to the fallback. */
export function detectLanguage(input: string, fallback: "en" | "ms" = "en"): "en" | "ms" {
  const tokens = normalizeForSearch(input).split(" ").filter(Boolean);
  if (tokens.length === 0) return fallback;
  const malay = tokens.filter((t) => MALAY_MARKERS.has(t)).length;
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
  const terms = new Set<string>();
  const add = (phrase: string) => {
    for (const token of phrase.split(/[\s./+-]+/)) {
      const clean = token.replace(/[^\p{L}\p{N}]/gu, "");
      if (clean.length >= 2 && !STOP_WORDS.has(clean)) terms.add(clean);
    }
  };
  add(normalized);
  for (const syn of synonymTerms(normalized)) add(syn);
  // Keep "tidak boleh" style negations meaningful by adding the combined synonym tokens above.
  const list = [...terms].slice(0, maxTerms);
  if (list.length === 0) return null;
  return list.map((t) => `${t}:*`).join(" | ");
}
