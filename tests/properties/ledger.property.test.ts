import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { isDomainError } from "@/domain/errors";
import { money } from "@/domain/money/money";
import {
  type LedgerEntryDraft,
  assertBalanced,
  currenciesOf,
  netChangeFor,
} from "@/domain/ledger/transaction";
import { planInternalTransfer } from "@/domain/ledger/transfer";
import { id, lockedAccount } from "../helpers/accounts";

/**
 * Test krytyczny nr 2 z sekcji 12 w wersji czysto domenowej.
 *
 * Wersja na bazie danych (tests/integration/ledger-invariant.test.ts) sprawdza to
 * samo na prawdziwym Postgresie, ale wolniej i na mniejszej liczbie przebiegow.
 * Ta wersja robi tysiac przebiegow w ulamku sekundy, wiec to ona ma szanse trafic
 * na przypadek brzegowy.
 */

const A = "aaaaaaaa-0000-4000-8000-000000000001";
const B = "bbbbbbbb-0000-4000-8000-000000000002";

const amountMinor = fc.bigInt({ min: 1n, max: 10n ** 12n });

describe("wlasciwosci przelewu wewnetrznego", () => {
  it("kazdy zaplanowany przelew jest zbilansowany", () => {
    fc.assert(
      fc.property(amountMinor, amountMinor, (balance, amount) => {
        const from = lockedAccount({ id: A, balanceMinor: balance });
        const to = lockedAccount({ id: B });

        try {
          const entries = planInternalTransfer({
            from,
            to,
            amount: money(amount, "PLN"),
          });

          expect(() => assertBalanced(entries)).not.toThrow();
        } catch (error) {
          // Brak srodkow jest poprawnym wynikiem, nie awaria wlasciwosci.
          if (!isDomainError(error, "INSUFFICIENT_FUNDS")) {
            throw error;
          }
        }
      }),
      { numRuns: 1_000 },
    );
  });

  it("przelew przenosi dokladnie tyle, ile zabiera", () => {
    fc.assert(
      fc.property(amountMinor, (amount) => {
        const entries = planInternalTransfer({
          from: lockedAccount({ id: A, balanceMinor: amount }),
          to: lockedAccount({ id: B }),
          amount: money(amount, "PLN"),
        });

        const taken = netChangeFor(entries, id(A), "PLN").amountMinor;
        const given = netChangeFor(entries, id(B), "PLN").amountMinor;

        expect(taken).toBe(-given);
        expect(given).toBe(amount);
      }),
      { numRuns: 1_000 },
    );
  });

  it("dowolny zestaw zbilansowanych transakcji pozostaje zbilansowany po polaczeniu", () => {
    // Wlasciwosc, na ktorej opiera sie asercja "suma calej ksiegi wynosi zero":
    // ksiega to konkatenacja transakcji, wiec bilansuje sie wtedy i tylko wtedy,
    // gdy bilansuje sie kazda z nich.
    const balancedTransaction = fc
      .array(
        fc.record({
          account: fc.constantFrom(A, B),
          amount: fc.bigInt({ min: -(10n ** 9n), max: 10n ** 9n }),
        }),
        { minLength: 1, maxLength: 6 },
      )
      .map((raw): readonly LedgerEntryDraft[] => {
        const partial = raw
          .filter((item) => item.amount !== 0n)
          .map((item) => ({
            accountId: id(item.account),
            amount: money(item.amount, "PLN"),
          }));

        const closing = partial.reduce(
          (total, item) => total + item.amount.amountMinor,
          0n,
        );

        return [
          ...partial,
          { accountId: id(A), amount: money(-closing, "PLN") },
        ];
      });

    fc.assert(
      fc.property(
        fc.array(balancedTransaction, { minLength: 1, maxLength: 20 }),
        (transactions) => {
          for (const entries of transactions) {
            expect(() => assertBalanced(entries)).not.toThrow();
          }

          const ledger = transactions.flat();
          const total = ledger.reduce(
            (sum, entry) => sum + entry.amount.amountMinor,
            0n,
          );

          expect(total).toBe(0n);
          expect(currenciesOf(ledger)).toEqual(["PLN"]);
        },
      ),
      { numRuns: 500 },
    );
  });
});
