import { DomainError } from "@/domain/errors";

/** Waluty obslugiwane przez system (PLN + zestaw z tabel NBP z sekcji 8). */
export const SUPPORTED_CURRENCIES = [
  "PLN",
  "EUR",
  "USD",
  "GBP",
  "CHF",
  "CZK",
  "NOK",
  "SEK",
] as const;

export type Currency = (typeof SUPPORTED_CURRENCIES)[number];

/**
 * Wykladnik jednostki minor zgodnie z ISO 4217. Dzisiaj kazda obslugiwana
 * waluta ma 2 miejsca, ale ta tabela istnieje zamiast stalej `100`, bo ISO 4217
 * zna waluty z 0 miejscami (JPY, HUF w praktyce rozliczen) i 3 miejscami (BHD,
 * TND). Zaszycie dzielenia przez 100 w formatowaniu oznaczaloby, ze dodanie
 * pierwszej takiej waluty wymaga polowania po calym kodzie.
 */
const MINOR_UNIT_EXPONENTS: Readonly<Record<Currency, number>> = {
  PLN: 2,
  EUR: 2,
  USD: 2,
  GBP: 2,
  CHF: 2,
  CZK: 2,
  NOK: 2,
  SEK: 2,
};

export function isCurrency(value: string): value is Currency {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(value);
}

export function minorUnitExponent(currency: Currency): number {
  return MINOR_UNIT_EXPONENTS[currency];
}

/**
 * Zamienia dowolny string na `Currency` albo rzuca. Uzywane tam, gdzie waluta
 * przychodzi z bazy lub z zewnetrznego API — czyli poza kontrola typow.
 */
export function assertCurrency(value: string): Currency {
  if (!isCurrency(value)) {
    throw new DomainError(
      "UNSUPPORTED_CURRENCY",
      `Waluta ${value} nie jest obslugiwana`,
    );
  }

  return value;
}
