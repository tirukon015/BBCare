import { isLocale, type Locale } from "@bbcare/core/locale";
import { en, type Dictionary } from "./en";
import { ms } from "./ms";

const dictionaries: Record<Locale, Dictionary> = { en, ms };

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}

export function localeOrDefault(value: string | undefined): Locale {
  return isLocale(value) ? value : "en";
}

export function otherLocale(locale: Locale): Locale {
  return locale === "en" ? "ms" : "en";
}

export type { Dictionary, Locale };
