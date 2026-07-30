import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { transferInternal } from "@/application/ledger/transfer";
import type { AccountId } from "@/domain/ids";
import { closeDatabase, db } from "@/infrastructure/db/client";
import {
  cachedBalance,
  createAccount,
  createUser,
  deps,
  fund,
  ledgerBalance,
  pln,
} from "../helpers/fixtures";

/**
 * Test krytyczny nr 1 z sekcji 12 — najwazniejszy test w tym repozytorium.
 *
 * Dwiescie rownoleglych przelewow miedzy dwoma kontami. Polowa w jedna strone,
 * polowa w druga — i to jest sedno. Przy przelewach idacych tylko w jedna strone
 * kolejnosc blokowania nie ma znaczenia, bo wszyscy siegaja po konta w tej samej
 * kolejnosci. Zakleszczenie rodzi sie dopiero wtedy, gdy jedna transakcja trzyma
 * konto A i czeka na B, a druga trzyma B i czeka na A. Test jednokierunkowy
 * przechodzilby takze bez `ORDER BY id`, czyli nie sprawdzalby niczego.
 *
 * Sprawdzane sa trzy wlasciwosci:
 *  - pieniadze nie gina i sie nie mnoza (suma sald bez zmian),
 *  - liczba zaksiegowanych transakcji rowna sie liczbie udanych zadan,
 *  - saldo podreczne zgadza sie z ksiega po calym zamieszaniu.
 */

const TRANSFERS_EACH_WAY = 100;
const AMOUNT_MINOR = 1_00n;
const OPENING_BALANCE = 1_000_00n;

afterAll(async () => {
  await closeDatabase();
});

async function bookedTransactionCount(prefix: string): Promise<number> {
  const rows = await db.execute<{ count: bigint }>(
    sql`select count(*)::bigint as count
        from transactions
        where idempotency_key like ${`${prefix}%`}`,
  );

  return Number(rows[0]?.count ?? 0n);
}

describe("dwiescie rownoleglych przelewow", () => {
  it("nie gubi i nie mnozy pieniedzy", async () => {
    const owner = await createUser();
    const a: AccountId = await createAccount({ owner });
    const b: AccountId = await createAccount({ owner });

    await fund(a, pln(OPENING_BALANCE));
    await fund(b, pln(OPENING_BALANCE));

    const openingTotal = (await ledgerBalance(a)) + (await ledgerBalance(b));

    expect(openingTotal).toBe(OPENING_BALANCE * 2n);

    const prefix = `conc-${randomUUID()}`;

    const requests = Array.from({ length: TRANSFERS_EACH_WAY * 2 }, (_, index) => {
      const forward = index % 2 === 0;

      return transferInternal(deps, {
        idempotencyKey: `${prefix}-${index}`,
        fromAccountId: forward ? a : b,
        toAccountId: forward ? b : a,
        amount: pln(AMOUNT_MINOR),
        title: `Przelew rownolegly ${index}`,
        initiatedBy: null,
      });
    });

    const results = await Promise.allSettled(requests);
    const succeeded = results.filter(
      (result) => result.status === "fulfilled",
    ).length;
    const failures = results.filter((result) => result.status === "rejected");

    // Kazde zadanie ma pokrycie w saldzie (1000 zl przy przelewach po 1 zl), wiec
    // odrzucenie oznaczaloby zakleszczenie albo timeout, a nie brak srodkow.
    // Powod pierwszego niepowodzenia trafia do komunikatu, zeby nie trzeba bylo
    // zgadywac z samej liczby.
    expect(
      failures.map((failure) =>
        failure.status === "rejected" ? String(failure.reason) : "",
      ),
    ).toEqual([]);
    expect(succeeded).toBe(TRANSFERS_EACH_WAY * 2);

    const balanceA = await ledgerBalance(a);
    const balanceB = await ledgerBalance(b);

    expect(balanceA + balanceB).toBe(openingTotal);
    // Ruch jest symetryczny, wiec salda koncowe rownaja sie poczatkowym. To
    // mocniejsza asercja niz sama suma: przy zgubionym zapisie suma moglaby sie
    // zgadzac, gdyby zgubiona byla cala transakcja, ale ta asercja i tak by padla.
    expect(balanceA).toBe(OPENING_BALANCE);
    expect(balanceB).toBe(OPENING_BALANCE);

    expect(await bookedTransactionCount(prefix)).toBe(succeeded);

    expect(await cachedBalance(a)).toBe(balanceA);
    expect(await cachedBalance(b)).toBe(balanceB);
  });
});
