import { getFile } from "@/lib/storage";
import { getModelImage } from "@/modules/router/service";

export const dynamic = "force-dynamic";

/** Serves a router model photo only after staff verified it. Unverified photos are never public. */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const image = await getModelImage((await params).slug);
  if (!image || !/^image\/(png|jpeg|webp)$/.test(image.mimeType)) return new Response("Not found", { status: 404 });
  const bytes = await getFile(image.storageKey).catch(() => null);
  if (!bytes) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": image.mimeType,
      "cache-control": "public, max-age=3600",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
    },
  });
}
