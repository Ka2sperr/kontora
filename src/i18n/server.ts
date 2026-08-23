import { cookies, headers } from "next/headers";
import { DEFAULT_LOCALE, type Locale, isLocale, negotiateLocale } from "@/i18n/config";
import { type Dictionary, dictionaryFor } from "@/i18n/dictionaries";

export const LOCALE_COOKIE = "kontora_jezyk";

/**
 * Aktywny jezyk zadania.
 *
 * Kolejnosc jest istotna: jawny wybor uzytkownika (ciasteczko) wygrywa z
 * ustawieniem przegladarki. Ktos, kto przelaczyl jezyk recznie, zrobil to
 * swiadomie i nie chce, zeby `Accept-Language` cofalo mu ten wybor przy kazdym
 * wejsciu.
 */
export async function currentLocale(): Promise<Locale> {
  const chosen = (await cookies()).get(LOCALE_COOKIE)?.value;

  if (chosen !== undefined && isLocale(chosen)) {
    return chosen;
  }

  const accept = (await headers()).get("accept-language");

  return accept === null ? DEFAULT_LOCALE : negotiateLocale(accept);
}

export async function currentDictionary(): Promise<{
  readonly locale: Locale;
  readonly t: Dictionary;
}> {
  const locale = await currentLocale();

  return { locale, t: dictionaryFor(locale) };
}
