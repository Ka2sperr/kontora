import type { Locale } from "@/i18n/config";
import { formatMoney, formatSignedMoney, moneyFromDto } from "@/i18n/format";
import type { MoneyDto } from "@/http/response";

/**
 * Kwota na ekranie.
 *
 * Dwie rzeczy, ktore ten komponent gwarantuje w kazdym miejscu aplikacji:
 *
 * 1. **Cyfry tabelaryczne** (`kwota`), zeby kolumny kwot wyrownywaly sie co do
 *    znaku. W widoku finansowym niewyrownana kolumna to pierwsza rzecz, ktora
 *    widac — i wyglada jak usterka, nawet gdy liczby sa poprawne.
 * 2. **Znak niezalezny od koloru**. Kwoty ujemne i dodatnie roznia sie znakiem,
 *    a nie tylko barwa. Wymog dostepnosci z sekcji 10, ktory przy okazji jest
 *    poprawna ksiegowoscia.
 */

export interface KwotaProps {
  readonly value: MoneyDto;
  readonly locale: Locale;
  /** Jawny plus przy uznaniach. Wlaczony tam, gdzie kierunek jest trescia. */
  readonly signed?: boolean;
  readonly className?: string;
}

export function Kwota({ value, locale, signed = false, className = "" }: KwotaProps) {
  const money = moneyFromDto(value);
  const negative = money.amountMinor < 0n;
  const positive = money.amountMinor > 0n;

  const kolor = negative
    ? "text-stempel"
    : positive
      ? "text-zielen"
      : "text-atrament-slaby";

  return (
    <span className={`kwota ${kolor} ${className}`}>
      {signed ? formatSignedMoney(money, locale) : formatMoney(money, locale)}
    </span>
  );
}

/** Kwota w naglowku — wiekszy stopien, krój naglowkowy, bez koloryzowania. */
export function KwotaGlowna({ value, locale }: KwotaProps) {
  return (
    <span className="kwota font-naglowek text-3xl text-atrament sm:text-4xl">
      {formatMoney(moneyFromDto(value), locale)}
    </span>
  );
}
