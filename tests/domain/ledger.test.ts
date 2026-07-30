import { describe, expect, it } from "vitest";
import { DomainError } from "@/domain/errors";
import { money } from "@/domain/money/money";
import {
  assertBalanced,
  currenciesOf,
  netChangeFor,
} from "@/domain/ledger/transaction";
import {
  planExternalTransfer,
  planInternalTransfer,
} from "@/domain/ledger/transfer";
import { id, lockedAccount } from "../helpers/accounts";

const A = "aaaaaaaa-0000-4000-8000-000000000001";
const B = "bbbbbbbb-0000-4000-8000-000000000002";
const SETTLEMENT = "cccccccc-0000-4000-8000-000000000003";

function pln(amountMinor: bigint) {
  return money(amountMinor, "PLN");
}

describe("niezmiennik zbilansowania", () => {
  it("przepuszcza zestaw sumujacy sie do zera", () => {
    expect(() =>
      assertBalanced([
        { accountId: id(A), amount: pln(-10_000n) },
        { accountId: id(B), amount: pln(10_000n) },
      ]),
    ).not.toThrow();
  });

  it("odrzuca zestaw, ktory sie nie bilansuje", () => {
    expect(() =>
      assertBalanced([
        { accountId: id(A), amount: pln(-10_000n) },
        { accountId: id(B), amount: pln(9_999n) },
      ]),
    ).toThrowError(DomainError);
  });

  it("odrzuca transakcje bez zapisow", () => {
    expect(() => assertBalanced([])).toThrowError(/bez zapisow/i);
  });

  it("bilansuje kazda walute osobno", () => {
    // Przewalutowanie 100 EUR na 430 PLN. Zsumowane razem daje 42 000 — i
    // wlasnie dlatego suma liczy sie per waluta. Wersja "wszystko razem" musialaby
    // znac kurs, zeby cokolwiek stwierdzic, a ksiega kursow nie zna.
    const entries = [
      { accountId: id(A), amount: money(-10_000n, "EUR") },
      { accountId: id(SETTLEMENT), amount: money(10_000n, "EUR") },
      { accountId: id(B), amount: pln(42_355n) },
      { accountId: id(SETTLEMENT), amount: pln(645n) },
      { accountId: id(A), amount: pln(-43_000n) },
    ];

    expect(() => assertBalanced(entries)).not.toThrow();
    expect(currenciesOf(entries)).toEqual(["EUR", "PLN"]);
  });

  it("odrzuca zestaw zbilansowany tylko pozornie, w jednej z dwoch walut", () => {
    expect(() =>
      assertBalanced([
        { accountId: id(A), amount: money(-10_000n, "EUR") },
        { accountId: id(B), amount: money(10_000n, "EUR") },
        { accountId: id(A), amount: pln(-100n) },
      ]),
    ).toThrowError(/PLN/);
  });

  it("liczy zmiane salda konta w podanej walucie", () => {
    const entries = [
      { accountId: id(A), amount: pln(-10_000n) },
      { accountId: id(A), amount: money(5_000n, "EUR") },
      { accountId: id(B), amount: pln(10_000n) },
    ];

    expect(netChangeFor(entries, id(A), "PLN").amountMinor).toBe(-10_000n);
    expect(netChangeFor(entries, id(A), "EUR").amountMinor).toBe(5_000n);
    expect(netChangeFor(entries, id(B), "EUR").amountMinor).toBe(0n);
  });
});

describe("przelew wewnetrzny", () => {
  it("obciaza zrodlo i uznaje cel", () => {
    const entries = planInternalTransfer({
      from: lockedAccount({ id: A, balanceMinor: 50_000n }),
      to: lockedAccount({ id: B }),
      amount: pln(10_000n),
    });

    expect(entries).toEqual([
      { accountId: id(A), amount: pln(-10_000n) },
      { accountId: id(B), amount: pln(10_000n) },
    ]);
  });

  it("odrzuca przelew na to samo konto", () => {
    expect(() =>
      planInternalTransfer({
        from: lockedAccount({ id: A, balanceMinor: 50_000n }),
        to: lockedAccount({ id: A, balanceMinor: 50_000n }),
        amount: pln(1_000n),
      }),
    ).toThrowError(/rozne/i);
  });

  it("odrzuca przelew miedzy roznymi walutami", () => {
    expect(() =>
      planInternalTransfer({
        from: lockedAccount({ id: A, currency: "EUR", balanceMinor: 50_000n }),
        to: lockedAccount({ id: B, currency: "PLN" }),
        amount: money(10_000n, "EUR"),
      }),
    ).toThrowError(/wymiany walut/i);
  });

  it("odrzuca przelew z konta zamrozonego", () => {
    expect(() =>
      planInternalTransfer({
        from: lockedAccount({ id: A, balanceMinor: 50_000n, status: "frozen" }),
        to: lockedAccount({ id: B }),
        amount: pln(1_000n),
      }),
    ).toThrowError(/frozen/);
  });

  it("odrzuca przelew ponad saldo", () => {
    expect(() =>
      planInternalTransfer({
        from: lockedAccount({ id: A, balanceMinor: 999n }),
        to: lockedAccount({ id: B }),
        amount: pln(1_000n),
      }),
    ).toThrowError(/wystarczajacych srodkow/i);
  });

  it("dopuszcza zejscie do limitu kredytowego", () => {
    const entries = planInternalTransfer({
      from: lockedAccount({
        id: A,
        kind: "credit",
        balanceMinor: 0n,
        creditLimitMinor: 50_000n,
      }),
      to: lockedAccount({ id: B }),
      amount: pln(50_000n),
    });

    expect(entries[0]?.amount.amountMinor).toBe(-50_000n);
  });

  it("odrzuca kwote zerowa i ujemna", () => {
    const from = lockedAccount({ id: A, balanceMinor: 50_000n });
    const to = lockedAccount({ id: B });

    expect(() => planInternalTransfer({ from, to, amount: pln(0n) })).toThrowError(
      /dodatnia/i,
    );
    expect(() =>
      planInternalTransfer({ from, to, amount: pln(-100n) }),
    ).toThrowError(/dodatnia/i);
  });
});

describe("przelew zewnetrzny", () => {
  it("stawia po drugiej stronie konto rozrachunkowe banku", () => {
    const entries = planExternalTransfer({
      from: lockedAccount({ id: A, balanceMinor: 50_000n }),
      settlement: lockedAccount({
        id: SETTLEMENT,
        kind: "internal",
        internalCode: "BANK_SETTLEMENT_PLN",
      }),
      amount: pln(10_000n),
    });

    expect(entries).toEqual([
      { accountId: id(A), amount: pln(-10_000n) },
      { accountId: id(SETTLEMENT), amount: pln(10_000n) },
    ]);
  });

  it("nie pozwala postawic po drugiej stronie konta klienta", () => {
    expect(() =>
      planExternalTransfer({
        from: lockedAccount({ id: A, balanceMinor: 50_000n }),
        settlement: lockedAccount({ id: B }),
        amount: pln(10_000n),
      }),
    ).toThrowError(/kontem wewnetrznym/i);
  });

  it("pozwala kontu rozrachunkowemu zejsc ponizej zera", () => {
    // Konto wewnetrzne nie ma limitu i celowo bywa ujemne — ujemna pozycja banku
    // to informacja ksiegowa, nie debet klienta.
    const entries = planExternalTransfer({
      from: lockedAccount({
        id: SETTLEMENT,
        kind: "internal",
        internalCode: "BANK_SETTLEMENT_PLN",
        balanceMinor: 0n,
      }),
      settlement: lockedAccount({
        id: B,
        kind: "internal",
        internalCode: "BANK_FEE_INCOME_PLN",
      }),
      amount: pln(10_000n),
    });

    expect(entries[0]?.amount.amountMinor).toBe(-10_000n);
  });
});
