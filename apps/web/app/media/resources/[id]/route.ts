import { getFile } from "@/lib/storage";
import { getResourceFile } from "@/modules/router/service";

export const dynamic = "force-dynamic";

const SAFE_TYPES = /^(image\/(png|jpeg|webp|gif)|video\/(mp4|webm)|application\/pdf)$/;

/** Serves a library resource only after it is approved. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const r = await getResourceFile((await params).id);
  if (!r || !SAFE_TYPES.test(r.mimeType)) return new Response("Not found", { status: 404 });
  const bytes = await getFile(r.storageKey).catch(() => null);
  if (!bytes) return new Response("Not found", { status: 404 });
  const safeName = r.name.replace(/[^\w.-]+/g, "_").slice(0, 80);
  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": r.mimeType,
      "content-disposition": `${r.mimeType === "application/pdf" ? "attachment" : "inline"}; filename="${safeName}"`,
      "cache-control": "public, max-age=3600",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
    },
  });
}
