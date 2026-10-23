import "server-only";
import { detectPromptInjection, MAX_UPLOAD_BYTES, sanitizeFilename, sha256Hex, sniffFileType } from "@bbcare/core";
import { db } from "@/lib/db";
import { putFile } from "@/lib/storage";
import { extractText } from "@/lib/extract";
import { audit } from "@/modules/audit/service";
import type { StaffUser } from "@/modules/identity/service";

export type UploadResult = { ok: true; id: string; injectionFlags: number } | { ok: false; reason: "too_large" | "type_not_allowed" | "duplicate" | "extract_failed" | "empty" };

export async function addSource(
  user: StaffUser,
  input: { kind: string; title: string; publisher?: string; url?: string; licenseNote?: string; file?: File | null; text?: string },
): Promise<UploadResult> {
  const sql = db();
  let mediaId: string | null = null;
  let extracted = input.text?.trim() ?? "";
  let hash: string | null = null;
  if (input.file && input.file.size > 0) {
    if (input.file.size > MAX_UPLOAD_BYTES) return { ok: false, reason: "too_large" };
    const bytes = new Uint8Array(await input.file.arrayBuffer());
    const type = sniffFileType(bytes, input.file.name);
    if (!type) return { ok: false, reason: "type_not_allowed" };
    hash = sha256Hex(Buffer.from(bytes));
    const [dup] = await sql`SELECT 1 FROM knowledge.sources WHERE sha256 = ${hash}`;
    if (dup) return { ok: false, reason: "duplicate" };
    try {
      extracted = await extractText(type, bytes);
    } catch {
      return { ok: false, reason: "extract_failed" };
    }
    const ext = type === "text" ? "txt" : type;
    const key = await putFile(bytes, ext);
    const mime = type === "pdf" ? "application/pdf" : type === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "text/plain";
    const [m] = await sql<{ id: string }[]>`
      INSERT INTO knowledge.media_assets (storage_key, original_name, mime_type, size_bytes, sha256, uploaded_by)
      VALUES (${key}, ${sanitizeFilename(input.file.name)}, ${mime}, ${bytes.length}, ${hash}, ${user.id}) RETURNING id`;
    mediaId = m!.id;
  } else if (extracted) {
    hash = sha256Hex(extracted);
  }
  if (!extracted && !input.url) return { ok: false, reason: "empty" };
  const flags = detectPromptInjection(extracted);
  const [s] = await sql<{ id: string }[]>`
    INSERT INTO knowledge.sources (kind, title, publisher, url, license_note, sha256, media_asset_id, extracted_text, injection_flag, created_by)
    VALUES (${input.kind}, ${input.title}, ${input.publisher ?? null}, ${input.url ?? null}, ${input.licenseNote ?? null}, ${hash}, ${mediaId},
            ${extracted.slice(0, 2_000_000) || null}, ${flags.length > 0}, ${user.id}) RETURNING id`;
  await audit({ actorId: user.id, action: "sources.add", entityType: "source", entityId: s!.id, summary: { kind: input.kind, file: !!mediaId, injectionFlags: flags.length } });
  return { ok: true, id: s!.id, injectionFlags: flags.length };
}

export async function reviewSource(user: StaffUser, id: string, status: "approved" | "rejected", trust: "unverified" | "reviewed" | "authoritative") {
  await db()`UPDATE knowledge.sources SET status = ${status}, trust_level = ${trust}, reviewed_by = ${user.id} WHERE id = ${id}`;
  await audit({ actorId: user.id, action: "sources.review", entityType: "source", entityId: id, summary: { status, trust } });
}
