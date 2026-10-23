/** Upload validation helpers. File types are decided by content (magic bytes), not by name. */

export type AllowedType = "pdf" | "docx" | "text";

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

export function sniffFileType(bytes: Uint8Array, filename: string): AllowedType | null {
  const startsWith = (sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (startsWith([0x25, 0x50, 0x44, 0x46, 0x2d])) return "pdf"; // %PDF-
  if (startsWith([0x50, 0x4b, 0x03, 0x04]) && /\.docx$/i.test(filename)) {
    // A DOCX is a ZIP containing word/document.xml; check the central directory names.
    const text = new TextDecoder("latin1").decode(bytes.subarray(0, Math.min(bytes.length, 2_000_000)));
    return text.includes("word/document.xml") ? "docx" : null;
  }
  if (/\.(txt|md|markdown)$/i.test(filename)) {
    const sample = bytes.subarray(0, Math.min(bytes.length, 65_536));
    if (sample.includes(0)) return null; // binary
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(sample);
      return "text";
    } catch {
      return null;
    }
  }
  return null;
}

/** Safe storage name: random key plus a fixed extension; the original name is metadata only. */
export function sanitizeFilename(name: string): string {
  return name.normalize("NFKC").replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 120) || "file";
}

const INJECTION_PATTERNS = [
  /ignore (all |any |the )?(previous|prior|above) (instructions|prompts?)/i,
  /disregard (the |all )?(system|previous) (prompt|instructions)/i,
  /you are now (a|an|in) /i,
  /system prompt/i,
  /\bas an ai (language )?model\b/i,
  /reveal (your|the) (instructions|prompt|system)/i,
  /abaikan (semua )?arahan (sebelum|terdahulu)/i,
  /<\s*\/?\s*(system|assistant|instructions?)\s*>/i,
  /\b(BEGIN|END) (SYSTEM|PROMPT)\b/,
];

/** Flag text that looks like instructions aimed at an AI model, for reviewer attention. */
export function detectPromptInjection(text: string): string[] {
  return INJECTION_PATTERNS.filter((p) => p.test(text)).map((p) => p.source);
}
