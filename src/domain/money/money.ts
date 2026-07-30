import { DomainError } from "@/domain/errors";
import type { Currency } from "@/domain/money/currency";

/**
 * Kwota pieniezna. Zawsze `bigint` w jednostkach minor (grosze, centy) plus
 * waluta — nigdy `number`, nigdy kwota bez waluty. Typ jest niemutowalny, wiec
 * kazda operacja zwraca nowa wartosc; nie da sie przypadkiem zmodyfikowac kwoty
 * trzymanej gdzies indziej.
 */
export interface Money {
  readonly amountMinor: bigint;
  readonly currency: Currency;
}

export function money(amountMinor: bigint, currency: Currency): Money {
  return { amountMinor, currency };
}

export function zero(currency: Currency): Money {
  return { amountMinor: 0n, currency };
}

function assertSameCurrency(left: Money, right: Money): void {
  if (left.currency !== right.currency) {
    throw new DomainError(
      "CURRENCY_MISMATCH",
      `Nie mozna wykonac operacji na kwotach w roznych walutach: ${left.currency} i ${right.currency}`,
    );
  }
}

export function add(left: Money, right: Money): Money {
  assertSameCurrency(left, right);
  return money(left.amountMinor + right.amountMinor, left.currency);
}

export function subtract(left: Money, right: Money): Money {
  assertSameCurrency(left, right);
  return money(left.amountMinor - right.amountMinor, left.currency);
}

export function negate(value: Money): Money {
  return money(-value.amountMinor, value.currency);
}

export function absolute(value: Money): Money {
  return value.amountMinor < 0n ? negate(value) : value;
}

export function isZero(value: Money): boolean {
  return value.amountMinor === 0n;
}

export function isNegative(value: Money): boolean {
  return value.amountMinor < 0n;
}

export function isPositive(value: Money): boolean {
  return value.amountMinor > 0n;
}

export function compare(left: Money, right: Money): -1 | 0 | 1 {
  assertSameCurrency(left, right);

  if (left.amountMinor < right.amountMinor) {
    return -1;
  }

  if (left.amountMinor > right.amountMinor) {
    return 1;
  }

  return 0;
}

/**
 * Suma kwot. Waluta jest parametrem, a nie wnioskiem z pierwszego elementu,
 * celowo: sprawdzenie niezmiennika ksiegi ("suma wpisow per waluta wynosi 0")
 * musi dawac zdefiniowany wynik takze dla pustego zbioru wpisow.
 */
export function sum(values: readonly Money[], currency: Currency): Money {
  return values.reduce<Money>((total, value) => add(total, value), zero(currency));
}
