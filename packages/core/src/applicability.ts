/**
 * Decide whether a knowledge revision applies to a customer's product context.
 * A revision applies when any of its applicability rows matches.
 */

export interface ApplicabilityRow {
  categoryId: string | null;
  modelId: string | null;
  variantId: string | null;
  firmwareVersions: string[] | null;
}

export interface ProductContext {
  categoryId: string | null;
  modelId: string | null;
  variantId: string | null;
  firmware: string | null;
}

export type MatchLevel = "exact" | "model" | "category" | "none";

export function matchApplicability(rows: readonly ApplicabilityRow[], ctx: ProductContext): MatchLevel {
  let best: MatchLevel = "none";
  const rank: Record<MatchLevel, number> = { none: 0, category: 1, model: 2, exact: 3 };
  for (const row of rows) {
    let level: MatchLevel = "none";
    if (row.modelId) {
      if (ctx.modelId !== row.modelId) continue;
      if (row.variantId && ctx.variantId && row.variantId !== ctx.variantId) continue;
      if (row.firmwareVersions && row.firmwareVersions.length > 0) {
        // Firmware-specific guidance only applies when the customer's firmware is known and listed.
        if (!ctx.firmware || !row.firmwareVersions.includes(ctx.firmware)) continue;
        level = "exact";
      } else {
        level = row.variantId && ctx.variantId === row.variantId ? "exact" : "model";
      }
    } else if (row.categoryId) {
      if (ctx.categoryId && ctx.categoryId !== row.categoryId) continue;
      level = "category";
    }
    if (rank[level] > rank[best]) best = level;
  }
  return best;
}
