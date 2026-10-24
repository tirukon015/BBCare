import Link from "next/link";
import type { Dictionary, Locale } from "@/i18n";
import type { RouterModel } from "@/modules/router/service";
import { Badge, Notice } from "../ui";
import { ModelImage } from "./model-card";

export function ModelHeader({ model, locale, t, compact = false }: { model: RouterModel; locale: Locale; t: Dictionary; compact?: boolean }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      {compact ? null : <ModelImage model={model} t={t} size="lg" />}
      <div className="min-w-0">
        <p className="text-sm uppercase tracking-wide text-muted">{model.brand}</p>
        <h1 className="text-3xl font-bold tracking-tight" data-testid="model-name">{model.name}</h1>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
          <Badge>{t.router.ecr}: <span className="ml-1 font-mono" data-testid="model-ecr">{model.ecr}</span></Badge>
          <Link href={`/${locale}/routers`} className="text-olive underline">{t.router.changeModel}</Link>
        </p>
        {model.identityNote && !compact ? (
          <div className="mt-3 max-w-2xl"><Notice role="note"><strong>{t.router.identityNote}:</strong> {model.identityNote}</Notice></div>
        ) : null}
      </div>
    </div>
  );
}
