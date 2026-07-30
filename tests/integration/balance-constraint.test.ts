import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { closeDatabase, db } from "@/infrastructure/db/client";
import { fullErrorMessage } from "@/infrastructure/db/postgres-errors";
import { createAccount, createUser } from "../helpers/fixtures";

/**
 * Dowod, ze niezmiennik sumy zerowej zyje w bazie, a nie tylko w
 * `assertBalanced`.
 *
 * Zapisy wstawiane sa tu surowym SQL-em, z pominieciem calej warstwy aplikacji —
 * bo pytanie brzmi "co sie stanie, gdy ktos ominie aplikacje", a nie "czy
 * aplikacja sprawdza to, co sprawdza".
 */

afterAll(async () => {
  await closeDatabase();
});

async function insertTransactionHeader(): Promise<string> {
  const rows = await db.execute<{ id: string }>(
    sql`insert into transactions (idempotency_key, kind, title)
        values (${`raw-${randomUUID()}`}, 'internal_transfer', 'Zapis surowym SQL-em')
        returning id`,
  );

  const id = rows[0]?.id;

  if (id === undefined) {
    throw new Error("Nie udalo sie utworzyc naglowka transakcji.");
  }

  return id;
}

describe("wyzwalacz niezmiennika sumy zerowej", () => {
  it("odrzuca transakcje z jednym zapisem przy zatwierdzeniu", async () => {
    const owner = await createUser();
    const account = await createAccount({ owner });

    const attempt = db.transaction(async (tx) => {
      const rows = await tx.execute<{ id: string }>(
        sql`insert into transactions (idempotency_key, kind, title)
            values (${`raw-${randomUUID()}`}, 'internal_transfer', 'Jednostronny zapis')
            returning id`,
      );
      const transactionId = rows[0]?.id;

      await tx.execute(
        sql`insert into ledger_entries (transaction_id, account_id, currency, amount_minor)
            values (${transactionId}, ${account}, 'PLN', 10000)`,
      );
    });

    await expect(attempt).rejects.toThrow();

    try {
      await attempt;
    } catch (error) {
      expect(fullErrorMessage(error)).toMatch(/nie bilansuje sie/i);
    }
  });

  it("przepuszcza zapisy niezbilansowane w trakcie, byle zbilansowane na koniec", async () => {
    // Sprawdzenie jest odroczone do COMMIT i musi takie zostac. Po pierwszym
    // INSERT transakcja jest z definicji niezbilansowana — wersja natychmiastowa
    // odrzucalaby kazdy poprawny przelew.
    const owner = await createUser();
    const from = await createAccount({ owner });
    const to = await createAccount({ owner });

    await db.transaction(async (tx) => {
      const rows = await tx.execute<{ id: string }>(
        sql`insert into transactions (idempotency_key, kind, title)
            values (${`raw-${randomUUID()}`}, 'internal_transfer', 'Zapisy po kolei')
            returning id`,
      );
      const transactionId = rows[0]?.id;

      await tx.execute(
        sql`insert into ledger_entries (transaction_id, account_id, currency, amount_minor)
            values (${transactionId}, ${from}, 'PLN', -10000)`,
      );

      // W tym momencie suma wynosi -10000. Gdyby wyzwalacz byl natychmiastowy,
      // tutaj wlasnie by wybuchl.
      await tx.execute(
        sql`insert into ledger_entries (transaction_id, account_id, currency, amount_minor)
            values (${transactionId}, ${to}, 'PLN', 10000)`,
      );
    });

    const balances = await db.execute<{ total: bigint }>(
      sql`select coalesce(sum(amount_minor), 0)::bigint as total
          from ledger_entries where account_id in (${from}, ${to})`,
    );

    expect(balances[0]?.total).toBe(0n);
  });

  it("odrzuca zapis w walucie innej niz waluta konta", async () => {
    // Zlozony klucz obcy na (account_id, currency). Taki zapis zbilansowalby sie
    // w swojej walucie i przeszedl przez sprawdzenie sumy — a mimo to bylby
    // bezsensowny.
    const owner = await createUser();
    const account = await createAccount({ owner, currency: "PLN" });
    const transactionId = await insertTransactionHeader();

    const attempt = db.execute(
      sql`insert into ledger_entries (transaction_id, account_id, currency, amount_minor)
          values (${transactionId}, ${account}, 'EUR', 10000)`,
    );

    await expect(attempt).rejects.toThrow();

    try {
      await attempt;
    } catch (error) {
      expect(fullErrorMessage(error)).toMatch(
        /ledger_entries_account_currency_fk/i,
      );
    }
  });

  it("odrzuca zapis na kwote zerowa", async () => {
    const owner = await createUser();
    const account = await createAccount({ owner });
    const transactionId = await insertTransactionHeader();

    const attempt = db.execute(
      sql`insert into ledger_entries (transaction_id, account_id, currency, amount_minor)
          values (${transactionId}, ${account}, 'PLN', 0)`,
    );

    await expect(attempt).rejects.toThrow();

    try {
      await attempt;
    } catch (error) {
      expect(fullErrorMessage(error)).toMatch(/amount_not_zero/i);
    }
  });
});
