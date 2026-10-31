import { Search } from "lucide-react";
import type { Dictionary, Locale } from "@/i18n";
import { cx } from "./ui";

/** Site search. The large variant is the homepage hero search; both submit to the same results page. */
export function SearchForm({ locale, t, defaultValue, category, size = "md", filter }: { locale: Locale; t: Dictionary; defaultValue?: string; category?: string; size?: "md" | "lg"; filter?: string }) {
  const lg = size === "lg";
  return (
    <form action={`/${locale}/search`} method="get" role="search" className={cx("flex w-full items-center gap-2 rounded-full border border-line bg-white pl-4 pr-1.5 shadow-[var(--shadow-card)] focus-within:border-primary", lg ? "min-h-14" : "min-h-12")}>
      <Search className="h-5 w-5 shrink-0 text-muted" aria-hidden="true" />
      <label htmlFor="q" className="sr-only">{t.home.searchLabel}</label>
      <input id="q" name="q" type="search" required maxLength={200} defaultValue={defaultValue} placeholder={t.site.home.searchPlaceholder} autoComplete="off"
        className={cx("min-w-0 flex-1 bg-transparent py-2 text-ink outline-none placeholder:text-muted", lg ? "text-base" : "text-sm")} />
      {category ? <input type="hidden" name="c" value={category} /> : null}
      {filter ? <input type="hidden" name="f" value={filter} /> : null}
      <button type="submit" data-track="search.submit" aria-label={t.search.submit}
        className={cx("inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-primary font-semibold text-white hover:bg-primary-dark", lg ? "h-11 px-5 text-sm" : "h-9 px-4 text-sm")}>
        <span className="hidden sm:inline">{t.search.submit}</span><Search className="h-4 w-4 sm:hidden" aria-hidden="true" />
      </button>
    </form>
  );
}
