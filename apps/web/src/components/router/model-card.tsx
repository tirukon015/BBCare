import Link from "next/link";
import type { Dictionary, Locale } from "@/i18n";
import type { RouterModel } from "@/modules/router/service";
import { Badge } from "../ui";

const BRAND_ACCENT: Record<string, string> = { "TP-Link": "var(--color-olive)", Kaon: "var(--color-ink-soft)", Huawei: "var(--color-warn)" };

/**
 * Model photo when staff verified one. Otherwise a placeholder drawn for this specific model (its
 * ECR code and model number on a generic outline), clearly labelled as awaiting a verified photo.
 * It is never a product photo, so it cannot be mistaken for the real device.
 */
export function ModelImage({ model, t, size = "md" }: { model: RouterModel; t: Dictionary; size?: "md" | "lg" }) {
  const box = size === "lg" ? "h-40 w-40" : "h-28 w-28";
  if (model.imageUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- served from our own verified-media route
    return <img src={model.imageUrl} alt={model.name} className={`${box} shrink-0 rounded-lg border border-line bg-white object-contain`} />;
  }
  const accent = BRAND_ACCENT[model.brand] ?? "var(--color-ink-soft)";
  return (
    <div className={`${box} flex shrink-0 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-line bg-white p-2 text-center`}
      role="img" aria-label={`${model.name}: ${t.router.imagePending}`} data-testid="image-pending" data-ecr={model.ecr}>
      <svg viewBox="0 0 64 40" className="w-3/4" aria-hidden="true">
        <line x1="16" y1="12" x2="12" y2="2" stroke={accent} strokeWidth="2" strokeLinecap="round" />
        <line x1="48" y1="12" x2="52" y2="2" stroke={accent} strokeWidth="2" strokeLinecap="round" />
        <rect x="4" y="12" width="56" height="22" rx="5" fill="none" stroke={accent} strokeWidth="2" />
        <text x="32" y="27.5" textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--color-ink)" fontFamily="ui-monospace, monospace">{model.ecr}</text>
      </svg>
      <span className="text-[11px] font-semibold leading-tight text-ink">{model.modelNumber}</span>
      <span className="text-[10px] leading-tight text-ink-soft">{t.router.imagePending}</span>
    </div>
  );
}

export function RouterModelGrid({ models, locale, t }: { models: RouterModel[]; locale: Locale; t: Dictionary }) {
  // Never render a silently empty catalogue: say so and give a way to reach staff.
  if (models.length === 0) {
    return (
      <div role="alert" className="rounded-[var(--radius-card)] border border-danger-soft bg-danger-soft p-5 text-sm text-danger" data-testid="router-catalogue-unavailable">
        <p className="font-semibold">{t.router.catalogueUnavailable}</p>
        <p className="mt-1">{t.router.catalogueUnavailableBody} <Link href={`/${locale}/support?escalate=1`} className="underline">{t.home.humanCta}</Link></p>
      </div>
    );
  }
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="router-models">
      {models.map((m) => (
        <li key={m.ecr}>
          <Link href={`/${locale}/routers/${m.slug}`} className="flex h-full items-center gap-4 rounded-[var(--radius-card)] border border-line bg-white p-4 hover:border-olive" data-track="router.pick_model" data-testid="router-model">
            <ModelImage model={m} t={t} />
            <span className="min-w-0">
              <span className="block text-xs uppercase tracking-wide text-muted">{m.brand}</span>
              <span className="block font-semibold">{m.name}</span>
              <span className="mt-1 flex flex-wrap gap-1"><Badge>{t.router.ecr}: <span className="ml-1 font-mono">{m.ecr}</span></Badge></span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
