import type { Currency } from "@/domain/money/currency";
import { assertCurrency, minorUnitExponent } from "@/domain/money/currency";
import { type Money, money } from "@/domain/money/money";
import type { Locale } from "@/i18n/config";

/**
 * Formatowanie kwot — jedyne miejsce, w ktorym `bigint` staje sie tekstem dla
 * czlowieka (zasada nienaruszalna nr 1: formatowanie wylacznie w warstwie
 * prezentacji, przez `Intl.NumberFormat`).
 *
 * Kluczowy szczegol: kwota nie przechodzi przez `Number`. `Intl.NumberFormat`
 * przyjmuje ciag znakow i formatuje go z dokladnoscia dziesietna, wiec
 * 90 071 992 547 409,93 zl wyswietla sie poprawnie — podczas gdy ta sama wartosc
 * zamieniona na `number` zaokraglilaby sie w ciszy.
 */

/**
 * Zamienia jednostki minor na dziesietny ciag znakow, bez arytmetyki na `number`.
 *
 * Typ zwracany to `${number}`, a nie `string`, bo tego wymaga `Intl.NumberFormat`
 * dla wejscia tekstowego — i bo to prawda o tej wartosci. Rzutowanie ponizej jest
 * jedynym miejscem, w ktorym ta prawda jest deklarowana zamiast wywnioskowana:
 * TypeScript nie sledzi ksztaltu ciagu przez `padStart` i `slice`.
 */
export function toDecimalString(
  amountMinor: bigint,
  currency: Currency,
): `${number}` {
  const exponent = minorUnitExponent(currency);

  if (exponent === 0) {
    return amountMinor.toString() as `${number}`;
  }

  const negative = amountMinor < 0n;
  const digits = (negative ? -amountMinor : amountMinor).toString().padStart(exponent + 1, "0");
  const whole = digits.slice(0, digits.length - exponent);
  const fraction = digits.slice(digits.length - exponent);

  return `${negative ? "-" : ""}${whole}.${fraction}` as `${number}`;
}

const formatters = new Map<string, Intl.NumberFormat>();

function formatterFor(locale: Locale, currency: Currency): Intl.NumberFormat {
  const key = `${locale}:${currency}`;
  const existing = formatters.get(key);

  if (existing !== undefined) {
    return existing;
  }

  const exponent = minorUnitExponent(currency);
  // Tworzenie `Intl.NumberFormat` jest kosztowne, a lista transakcji wola
  // formatowanie kilkadziesiat razy na render.
  const created = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
  });

  formatters.set(key, created);

  return created;
}

/**
 * Kwota z odpowiedzi HTTP zamieniona na wartosc domenowa.
 *
 * Jedyne miejsce, w ktorym ciag znakow z sieci staje sie `Money`. Waluta
 * przechodzi przez `assertCurrency`, wiec kod spoza obslugiwanej listy wybucha
 * tutaj, a nie kilka warstw dalej przy formatowaniu. Bez tej funkcji kazdy
 * komponent rzutowalby walute na wlasna reke i pierwsza literowka w API
 * przeszlaby az na ekran.
 */
export function moneyFromDto(dto: {
  readonly amountMinor: string;
  readonly currency: string;
}): Money {
  return money(BigInt(dto.amountMinor), assertCurrency(dto.currency));
}

export function formatMoney(money: Money, locale: Locale): string {
  // `format` przyjmuje ciag znakow (Intl.NumberFormat v3) i formatuje go z pelna
  // dokladnoscia dziesietna. Przejscie przez `Number` zaokraglaloby kwoty powyzej
  // dziewieciu biliardow groszy — w ciszy, bo `Number` nie zglasza utraty precyzji.
  return formatterFor(locale, money.currency).format(
    toDecimalString(money.amountMinor, money.currency),
  );
}

/**
 * Kwota ze znakiem jawnym takze dla wartosci dodatnich.
 *
 * Wymog dostepnosci (sekcja 10): kwoty ujemne i dodatnie nie moga roznic sie
 * wylacznie kolorem. Znak niesie te sama informacje co kolor i dziala takze przy
 * daltonizmie, w druku i przy wysokim kontrascie.
 */
export function formatSignedMoney(money: Money, locale: Locale): string {
  const formatted = formatMoney(money, locale);

  return money.amountMinor > 0n ? `+${formatted}` : formatted;
}

export function formatDate(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

export function formatDateTime(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/** IBAN w grupach po cztery znaki — tak, jak sie go przepisuje. */
export function formatIban(iban: string): string {
  return iban.replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim();
}
