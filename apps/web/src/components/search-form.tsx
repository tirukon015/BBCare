import type { Dictionary, Locale } from "@/i18n";
import { inputStyles } from "./ui";

export function SearchForm({ locale, t, defaultValue, category }: { locale: Locale; t: Dictionary; defaultValue?: string; category?: string }) {
  return (
    <form action={`/${locale}/search`} method="get" role="search" className="flex w-full flex-col gap-2 sm:flex-row">
      <label htmlFor="q" className="sr-only">{t.home.searchLabel}</label>
      <input id="q" name="q" type="search" required maxLength={200} defaultValue={defaultValue} placeholder={t.home.searchPlaceholder} className={inputStyles} autoComplete="off" />
      {category ? <input type="hidden" name="c" value={category} /> : null}
      <button type="submit" className="min-h-11 shrink-0 rounded-lg bg-olive px-5 text-sm font-semibold text-white hover:bg-olive-dark" data-track="search.submit">
        {t.search.submit}
      </button>
    </form>
  );
}
