/**
 * i18n od poczatku, nie doklejone pozniej (sekcja 10).
 *
 * Bez biblioteki. Zakres jest znany i zamkniety: dwa jezyki, slowniki w repo,
 * brak tlumaczen ladowanych zdalnie i brak odmiany przez przypadki poza liczba
 * mnoga. `next-intl` rozwiazywalby problemy, ktorych tu nie ma, kosztem
 * konfiguracji routingu i middleware.
 *
 * Kluczowe jest to, ze teksty NIE mieszkaja w komponentach. Wyciagniecie ich
 * pozniej z pieciu ekranow to praca, ktorej nikt nigdy nie wykonuje.
 */
export const LOCALES = ["pl", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "pl";

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

/**
 * Wybor jezyka na podstawie naglowka `Accept-Language`.
 *
 * Celowo uproszczone: bierzemy pierwszy obslugiwany jezyk, ignorujac wagi `q`.
 * Pelna negocjacja ma znaczenie przy kilkunastu jezykach; przy dwoch dodaje kodu
 * bez zmiany wyniku.
 */
export function negotiateLocale(acceptLanguage: string | null): Locale {
  if (acceptLanguage === null) {
    return DEFAULT_LOCALE;
  }

  for (const part of acceptLanguage.split(",")) {
    const tag = part.split(";")[0]?.trim().toLowerCase() ?? "";
    const base = tag.split("-")[0] ?? "";

    if (isLocale(base)) {
      return base;
    }
  }

  return DEFAULT_LOCALE;
}
