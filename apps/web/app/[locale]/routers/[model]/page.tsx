import { redirect } from "next/navigation";
import { CUSTOMER_SUPPORT_MODES } from "@bbcare/core";

export const dynamic = "force-dynamic";

/**
 * The customer release supports Mesh Connection only, so choosing a router goes straight to its
 * Mesh Connection problems. The mode segment stays in the URL and the data model so staff tools and
 * a later release can add other categories without changing identifiers.
 */
export default async function RouterModelPage({ params }: { params: Promise<{ locale: string; model: string }> }) {
  const { locale, model } = await params;
  redirect(`/${locale}/routers/${model}/${CUSTOMER_SUPPORT_MODES[0]}`);
}
