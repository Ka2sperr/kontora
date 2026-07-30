import { describe, expect, it } from "vitest";
import { DomainError } from "@/domain/errors";
import {
  assertCurrency,
  isCurrency,
  minorUnitExponent,
} from "@/domain/money/currency";
import {
  absolute,
  add,
  compare,
  isNegative,
  isPositive,
  isZero,
  money,
  negate,
  subtract,
  sum,
  zero,
} from "@/domain/money/money";

describe("waluty", () => {
  it("rozpoznaje obslugiwane kody ISO 4217", () => {
    expect(isCurrency("PLN")).toBe(true);
    expect(isCurrency("EUR")).toBe(true);
    expect(isCurrency("pln")).toBe(false);
    expect(isCurrency("XYZ")).toBe(false);
  });

  it("zna wykladnik jednostki minor", () => {
    expect(minorUnitExponent("PLN")).toBe(2);
  });

  it("odrzuca nieobslugiwana walute z kodem bledu", () => {
    expect(() => assertCurrency("XYZ")).toThrowError(DomainError);
    try {
      assertCurrency("XYZ");
      expect.unreachable("assertCurrency powinno rzucic");
    } catch (error) {
      expect((error as DomainError).code).toBe("UNSUPPORTED_CURRENCY");
    }
  });
});

describe("arytmetyka kwot", () => {
  it("dodaje i odejmuje w jednostkach minor", () => {
    const stoZlotych = money(10_000n, "PLN");
    const dwadziescia = money(2_000n, "PLN");

    expect(add(stoZlotych, dwadziescia).amountMinor).toBe(12_000n);
    expect(subtract(stoZlotych, dwadziescia).amountMinor).toBe(8_000n);
  });

  it("nie traci precyzji na kwotach przekraczajacych Number.MAX_SAFE_INTEGER", () => {
    // 90 071 992 547 409,93 PLN — poza zasiegiem bezpiecznej arytmetyki `number`.
    const duza = money(9_007_199_254_740_993n, "PLN");

    expect(add(duza, money(1n, "PLN")).amountMinor).toBe(9_007_199_254_740_994n);
    // Ten sam rachunek na `number` cicho zwrocilby wartosc parzysta.
    expect(Number(duza.amountMinor) + 1).not.toBe(9_007_199_254_740_994);
  });

  it("odmawia mieszania walut", () => {
    const zlote = money(10_000n, "PLN");
    const euro = money(10_000n, "EUR");

    expect(() => add(zlote, euro)).toThrowError(DomainError);
    expect(() => subtract(zlote, euro)).toThrowError(DomainError);
    expect(() => compare(zlote, euro)).toThrowError(DomainError);
  });

  it("zachowuje znak i wartosc bezwzgledna", () => {
    const debet = money(-4_235n, "PLN");

    expect(isNegative(debet)).toBe(true);
    expect(isPositive(debet)).toBe(false);
    expect(absolute(debet).amountMinor).toBe(4_235n);
    expect(negate(debet).amountMinor).toBe(4_235n);
    expect(isZero(zero("PLN"))).toBe(true);
  });

  it("porzadkuje kwoty", () => {
    expect(compare(money(1n, "PLN"), money(2n, "PLN"))).toBe(-1);
    expect(compare(money(2n, "PLN"), money(2n, "PLN"))).toBe(0);
    expect(compare(money(3n, "PLN"), money(2n, "PLN"))).toBe(1);
  });

  it("sumuje pusty zbior do zera w podanej walucie", () => {
    // Wymog niezmiennika ksiegi: suma wpisow per waluta musi byc zdefiniowana
    // takze wtedy, gdy dana waluta nie wystepuje w transakcji.
    expect(sum([], "EUR")).toEqual({ amountMinor: 0n, currency: "EUR" });
  });

  it("sumuje zbilansowany zestaw wpisow do zera", () => {
    const entries = [
      money(-10_000n, "PLN"),
      money(4_235n, "PLN"),
      money(5_765n, "PLN"),
    ];

    expect(isZero(sum(entries, "PLN"))).toBe(true);
  });
});
