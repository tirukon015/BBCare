import "server-only";
import type { AllowedType } from "@bbcare/core";

/** Extract plain text from an uploaded document. Runs only on validated types. */
export async function extractText(type: AllowedType, bytes: Uint8Array): Promise<string> {
  if (type === "text") return new TextDecoder("utf-8").decode(bytes);
  if (type === "pdf") {
    const { extractText: pdfText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { text } = await pdfText(pdf, { mergePages: false });
    return (Array.isArray(text) ? text.map((t, i) => `\n\n[Page ${i + 1}]\n${t}`).join("") : String(text)).trim();
  }
  const mammoth = await import("mammoth");
  const r = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
  return r.value.trim();
}
