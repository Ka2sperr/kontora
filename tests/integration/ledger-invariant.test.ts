import { randomUUID } from "node:crypto";
import fc from "fast-check";
import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import {
  receiveIncoming,
  transferExternal,
  transferInternal,
} from "@/application/ledger/transfer";
import { isDomainError } from "@/domain/errors";
import type { AccountId } from "@/domain/ids";
import { closeDatabase, db } from "@/infrastructure/db/client";
import {
  createAccount,
  createUser,
  deps,
  pln,
} from "../helpers/fixtures";

/**
 * Test krytyczny nr 2 z sekcji 12: dla dowolnego zestawu transakcji suma zapisow
 * grupowana po transakcji i walucie wynosi zero.
 *
 * Wersja property-based na prawdziwej bazie. Nie generuje danych do wstawienia,
 * tylko losowe *sekwencje operacji* — bo niezmiennik ma sie utrzymac po dowolnym
 * przeplocie wplat, przelewow wewnetrznych i wychodzacych, w tym takich, ktore
 * zostaly odrzucone w polowie.
 */

afterAll(async () => {
  await closeDatabase();
});

type Operation =
  | { readonly type: "incoming"; readonly account: 0 | 1 | 2; readonly amount: bigint }
  | {
      readonly type: "internal";
      readonly from: 0 | 1 | 2;
      readonly to: 0 | 1 | 2;
      readonly amount: bigint;
    }
  | { readonly type: "external"; readonly from: 0 | 1 | 2; readonly amount: bigint };

const accountIndex = fc.constantFrom<0 | 1 | 2>(0, 1, 2);
const amount = fc.bigInt({ min: 1n, max: 500_00n });

const operation: fc.Arbitrary<Operation> = fc.oneof(
  fc.record({
    type: fc.constant("incoming" as const),
    account: accountIndex,
    amount,
  }),
  fc.record({
    type: fc.constant("internal" as const),
    from: accountIndex,
    to: accountIndex,
    amount,
  }),
  fc.record({
    type: fc.constant("external" as const),
    from: accountIndex,
    amount,
  }),
);

async function apply(
  accounts: readonly AccountId[],
  op: Operation,
): Promise<void> {
  const key = `prop-${randomUUID()}`;

  const at = (index: 0 | 1 | 2): AccountId => {
    const account = accounts[index];

    if (account === undefined) {
      throw new Error("Brak konta o podanym indeksie.");
    }

    return account;
  };

  try {
    if (op.type === "incoming") {
      await receiveIncoming(deps, {
        idempotencyKey: key,
        toAccountId: at(op.account),
        amount: pln(op.amount),
        title: "Wplata",
      });

      return;
    }

    if (op.type === "internal") {
      await transferInternal(deps, {
        idempotencyKey: key,
        fromAccountId: at(op.from),
        toAccountId: at(op.to),
        amount: pln(op.amount),
        title: "Przelew wewnetrzny",
        initiatedBy: null,
      });

      return;
    }

    await transferExternal(deps, {
      idempotencyKey: key,
      fromAccountId: at(op.from),
      amount: pln(op.amount),
      title: "Przelew zewnetrzny",
      counterpartyName: "Odbiorca testowy",
      counterpartyIban: "PL61109010140000071219812874",
      initiatedBy: null,
    });
  } catch (error) {
    // Odrzucenia sa czescia scenariusza, nie jego awaria. Losowa sekwencja
    // operacji z pewnoscia trafi na brak srodkow i na przelew na samego siebie —
    // i wlasnie po tych odrzuceniach ksiega musi zostac zbilansowana.
    const expected =
      isDomainError(error, "INSUFFICIENT_FUNDS") ||
      isDomainError(error, "SAME_ACCOUNT_TRANSFER");

    if (!expected) {
      throw error;
    }
  }
}

async function unbalancedTransactionCount(): Promise<number> {
  const rows = await db.execute<{ count: bigint }>(
    sql`select count(*)::bigint as count from (
          select transaction_id
          from ledger_entries
          group by transaction_id, currency
          having sum(amount_minor) <> 0
        ) as unbalanced`,
  );

  return Number(rows[0]?.count ?? 0n);
}

describe("niezmiennik ksiegi", () => {
  it("dowolna sekwencja operacji zostawia kazda transakcje zbilansowana per waluta", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(operation, { minLength: 1, maxLength: 12 }),
        async (operations) => {
          const owner = await createUser();
          const accounts = [
            await createAccount({ owner }),
            await createAccount({ owner }),
            await createAccount({ owner }),
          ];

          for (const op of operations) {
            await apply(accounts, op);
          }

          // Sprawdzenie obejmuje CALA tabele, nie tylko konta z tego przebiegu.
          // Jedna niezbilansowana transakcja gdziekolwiek w bazie psuje ksiege
          // niezaleznie od tego, kto ja utworzyl.
          expect(await unbalancedTransactionCount()).toBe(0);
        },
      ),
      // Kazdy przebieg to kilkanascie transakcji na prawdziwej bazie. Trzydziesci
      // przebiegow to okolo dwustu transakcji — dosc, zeby trafic na ciekawe
      // przeploty, i na tyle malo, zeby CI nie stal.
      { numRuns: 30 },
    );
  });

  it("suma calej ksiegi wynosi zero w kazdej walucie", async () => {
    // Wniosek z powyzszego, ale wart osobnej asercji: skoro kazda transakcja
    // bilansuje sie do zera, to bilansuje sie tez cala ksiega. Gdyby ta asercja
    // padla przy zielonej poprzedniej, znaczyloby to, ze ktos wstawil zapisy bez
    // naglowka transakcji.
    const rows = await db.execute<{ currency: string; total: bigint }>(
      sql`select currency, sum(amount_minor)::bigint as total
          from ledger_entries group by currency`,
    );

    for (const row of rows) {
      expect(row.total).toBe(0n);
    }
  });
});
