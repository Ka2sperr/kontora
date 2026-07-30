import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Currency } from "@/domain/money/currency";
import { add, isZero, money, negate, sum } from "@/domain/money/money";

/**
 * Wlasciwosci arytmetyki kwot. To rozgrzewka przed testem property-based na
 * niezmienniku ksiegi z Etapu 1 (sekcja 12 punkt 2) — ten sam mechanizm,
 * mniejszy zakres.
 */

const CURRENCY: Currency = "PLN";

// Zakres z zapasem: 10^15 groszy to 10 bilionow zlotych, wiecej niz jakikolwiek
// realny stan konta, a nadal daleko od granic bigint.
const amountMinor = fc.bigInt({ min: -(10n ** 15n), max: 10n ** 15n });
const amount = amountMinor.map((value) => money(value, CURRENCY));

describe("wlasciwosci arytmetyki kwot", () => {
  it("dodawanie jest przemienne", () => {
    fc.assert(
      fc.property(amount, amount, (a, b) => {
        expect(add(a, b).amountMinor).toBe(add(b, a).amountMinor);
      }),
    );
  });

  it("dodawanie jest laczne", () => {
    fc.assert(
      fc.property(amount, amount, amount, (a, b, c) => {
        expect(add(add(a, b), c).amountMinor).toBe(add(a, add(b, c)).amountMinor);
      }),
    );
  });

  it("kwota i jej negacja zeruja sie — dowolnie duza kwota", () => {
    fc.assert(
      fc.property(amount, (a) => {
        expect(isZero(add(a, negate(a)))).toBe(true);
      }),
    );
  });

  it("kazdy zestaw wpisow uzupelniony o kwote domykajaca sumuje sie do zera", () => {
    fc.assert(
      fc.property(fc.array(amount, { maxLength: 50 }), (entries) => {
        const closing = negate(sum(entries, CURRENCY));
        expect(isZero(sum([...entries, closing], CURRENCY))).toBe(true);
      }),
    );
  });
});
