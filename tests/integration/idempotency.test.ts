import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { transferInternal } from "@/application/ledger/transfer";
import { closeDatabase, db } from "@/infrastructure/db/client";
import {
  countEntries,
  createAccount,
  createUser,
  deps,
  fund,
  ledgerBalance,
  pln,
} from "../helpers/fixtures";

/** Test krytyczny nr 3 z sekcji 12. */

afterAll(async () => {
  await closeDatabase();
});

async function transactionsWithKey(key: string): Promise<number> {
  const rows = await db.execute<{ count: bigint }>(
    sql`select count(*)::bigint as count from transactions where idempotency_key = ${key}`,
  );

  return Number(rows[0]?.count ?? 0n);
}

describe("idempotencja", () => {
  it("dziesiec rownoleglych zadan z tym samym kluczem daje jedna transakcje i dziesiec identycznych odpowiedzi", async () => {
    const owner = await createUser();
    const from = await createAccount({ owner });
    const to = await createAccount({ owner });

    await fund(from, pln(1_000_00n));

    const key = `idem-${randomUUID()}`;

    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        transferInternal(deps, {
          idempotencyKey: key,
          fromAccountId: from,
          toAccountId: to,
          amount: pln(250_00n),
          title: "Przelew powtorzony dziesieciokrotnie",
          initiatedBy: null,
        }),
      ),
    );

    const ids = new Set(results.map((result) => result.id));

    expect(ids.size).toBe(1);
    expect(await transactionsWithKey(key)).toBe(1);

    // Pieniadze przeszly dokladnie raz. Gdyby idempotencja opierala sie na
    // sprawdzeniu "czy klucz juz istnieje" zamiast na ograniczeniu UNIQUE, czesc
    // z tych dziesieciu zadan przeszlaby przez sprawdzenie rownoczesnie i konto
    // zostaloby obciazone kilka razy.
    expect(await ledgerBalance(to)).toBe(250_00n);
    expect(await countEntries(to)).toBe(1);
  });

  it("powtorzenie po zakonczeniu pierwszego zadania zwraca ten sam wynik", async () => {
    const owner = await createUser();
    const from = await createAccount({ owner });
    const to = await createAccount({ owner });

    await fund(from, pln(500_00n));

    const key = `idem-seq-${randomUUID()}`;
    const input = {
      idempotencyKey: key,
      fromAccountId: from,
      toAccountId: to,
      amount: pln(100_00n),
      title: "Klient ponowil po timeoucie",
      initiatedBy: null,
    };

    const first = await transferInternal(deps, input);
    const second = await transferInternal(deps, input);

    expect(second.id).toBe(first.id);
    expect(second.entries).toHaveLength(2);
    expect(await ledgerBalance(to)).toBe(100_00n);
  });

  it("odrzucony przelew zwalnia klucz, wiec ponowienie po zasileniu konta przechodzi", async () => {
    // Wycofana transakcja nie zostawia sladu, takze w postaci zajetego klucza.
    // Alternatywa — zapamietywanie odrzucen — oznaczalaby, ze klient, ktory
    // zaplacil rachunek sekunde po przelewie przychodzacym, musi wymyslic nowy
    // klucz, zeby sprobowac ponownie (ADR-007).
    const owner = await createUser();
    const from = await createAccount({ owner });
    const to = await createAccount({ owner });

    const key = `idem-retry-${randomUUID()}`;
    const input = {
      idempotencyKey: key,
      fromAccountId: from,
      toAccountId: to,
      amount: pln(50_00n),
      title: "Proba przed zasileniem",
      initiatedBy: null,
    };

    await expect(transferInternal(deps, input)).rejects.toThrow(
      /wystarczajacych srodkow/i,
    );
    expect(await transactionsWithKey(key)).toBe(0);

    await fund(from, pln(50_00n));

    const booked = await transferInternal(deps, input);

    expect(booked.entries).toHaveLength(2);
    expect(await ledgerBalance(to)).toBe(50_00n);
  });
});
