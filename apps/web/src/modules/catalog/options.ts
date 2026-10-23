import "server-only";
import { db } from "@/lib/db";

export async function catalogOptions() {
  const sql = db();
  const [categories, models, sources] = await Promise.all([
    sql<{ id: string; slug: string; name_en: string }[]>`SELECT id, slug, name_en FROM catalog.categories ORDER BY sort_order`,
    sql<{ id: string; display_name: string; category_id: string; brand: string }[]>`
      SELECT m.id, m.display_name, m.category_id, b.name AS brand FROM catalog.product_models m JOIN catalog.brands b ON b.id = m.brand_id ORDER BY b.name, m.display_name`,
    sql<{ id: string; title: string; status: string }[]>`SELECT id, title, status FROM knowledge.sources WHERE status <> 'rejected' ORDER BY created_at DESC LIMIT 300`,
  ]);
  return { categories, models, sources };
}
