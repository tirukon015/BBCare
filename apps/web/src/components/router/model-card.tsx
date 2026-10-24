import Link from "next/link";
import type { Dictionary, Locale } from "@/i18n";
import type { RouterModel } from "@/modules/router/service";
import { Badge } from "../ui";

/** Model photo when staff verified one; otherwise a neutral placeholder that says so. */
export function ModelImage({ model, t, size = "md" }: { model: RouterModel; t: Dictionary; size?: "md" | "lg" }) {
  const box = size === "lg" ? "h-40 w-40" : "h-24 w-24";
  if (model.imageUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- served from our own verified-media route
    return <img src={model.imageUrl} alt={model.name} className={`${box} shrink-0 rounded-lg border border-line bg-white object-contain`} />;
  }
  return (
    <div className={`${box} flex shrink-0 items-center justify-center rounded-lg border border-dashed border-line bg-white p-2 text-center text-xs text-ink-soft`} data-testid="image-pending">
      {t.router.imagePending}
    </div>
  );
}

export function RouterModelGrid({ models, locale, t }: { models: RouterModel[]; locale: Locale; t: Dictionary }) {
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
