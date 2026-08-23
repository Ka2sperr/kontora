import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { AccountKind, AccountStatus } from "@/domain/accounts/account";
import {
  type AccountId,
  type TransactionId,
  type UserId,
  accountId,
  transactionId,
} from "@/domain/ids";
import { assertCurrency } from "@/domain/money/currency";
import { money } from "@/domain/money/money";
import type { LedgerEntryDraft, TransactionKind } from "@/domain/ledger/transaction";
import type {
  AccountQueries,
  AccountSummary,
  SpendingByCategory,
  TransactionFilter,
  TransactionListItem,
  TransactionPage,
} from "@/domain/ports/queries";
import type { DbExecutor } from "@/infrastructure/db/executor";
import { accounts, ledgerEntries } from "@/infrastructure/db/schema";

interface AccountRow {
  id: string;
  displayName: string;
  iban: string | null;
  currency: string;
  kind: AccountKind;
  status: AccountStatus;
  balanceCachedMinor: bigint;
  creditLimitMinor: bigint | null;
}

function toSummary(row: AccountRow): AccountSummary {
  const currency = assertCurrency(row.currency.trim());

  return {
    id: accountId(row.id),
    displayName: row.displayName,
    iban: row.iban?.trim() ?? null,
    currency,
    kind: row.kind,
    status: row.status,
    // Listy kont czytaja pamiec podreczna. Testy integracyjne pilnuja, ze zgadza
    // sie z ksiega; decyzje o pieniadzach i tak licza saldo od nowa.
    balance: money(row.balanceCachedMinor, currency),
    creditLimit:
      row.creditLimitMinor === null ? null : money(row.creditLimitMinor, currency),
  };
}

export class DrizzleAccountQueries implements AccountQueries {
  constructor(private readonly db: DbExecutor) {}

  async listForUser(user: UserId): Promise<readonly AccountSummary[]> {
    const rows = await this.db
      .select()
      .from(accounts)
      .where(eq(accounts.userId, user))
      .orderBy(asc(accounts.openedAt));

    return rows.map((row) => toSummary(row as AccountRow));
  }

  async findForUser(
    user: UserId,
    account: AccountId,
  ): Promise<AccountSummary | null> {
    // Warunek na wlascicielu jest czescia zapytania, nie sprawdzeniem po odczycie.
    // Sprawdzenie po odczycie da sie kiedys pominac; brakujacy warunek w WHERE
    // widac w kazdym przegladzie.
    const rows = await this.db
      .select()
      .from(accounts)
      .where(and(eq(accounts.id, account), eq(accounts.userId, user)))
      .limit(1);

    return rows[0] === undefined ? null : toSummary(rows[0] as AccountRow);
  }

  async listTransactions(filter: TransactionFilter): Promise<TransactionPage> {
    const conditions = [sql`le.account_id = ${filter.accountId}::uuid`];

    if (filter.from !== undefined) {
      conditions.push(sql`t.booked_at >= ${filter.from.toISOString()}::timestamptz`);
    }

    if (filter.to !== undefined) {
      conditions.push(sql`t.booked_at <= ${filter.to.toISOString()}::timestamptz`);
    }

    if (filter.category !== undefined) {
      conditions.push(sql`t.category = ${filter.category}`);
    }

    if (filter.minMinor !== undefined) {
      conditions.push(sql`abs(le.amount_minor) >= ${filter.minMinor.toString()}::bigint`);
    }

    if (filter.maxMinor !== undefined) {
      conditions.push(sql`abs(le.amount_minor) <= ${filter.maxMinor.toString()}::bigint`);
    }

    if (filter.query !== undefined && filter.query.length > 0) {
      // ILIKE z ucieczka znakow wieloznacznych. Bez niej wpisanie "100%" w
      // wyszukiwarke pasowaloby do wszystkiego zaczynajacego sie od "100".
      const pattern = `%${escapeLike(filter.query)}%`;

      conditions.push(
        sql`(t.title ILIKE ${pattern} OR coalesce(t.counterparty_name, '') ILIKE ${pattern} OR coalesce(t.merchant, '') ILIKE ${pattern})`,
      );
    }

    if (filter.cursor !== undefined) {
      conditions.push(sql`le.id < ${filter.cursor}::bigint`);
    }

    // Pobieramy o jeden wiecej, niz prosi wolajacy. Obecnosc tego dodatkowego
    // wiersza mowi, czy jest nastepna strona — bez osobnego zapytania liczacego.
    const limit = filter.limit + 1;

    /*
     * Typ opisuje to, co sterownik NAPRAWDE zwraca dla surowego zapytania, a nie
     * to, co byloby wygodne.
     *
     * `db.execute` omija mapowanie Drizzle, wiec `timestamptz` wraca jako ciag
     * znakow, mimo ze `db.select` na tej samej kolumnie daje `Date`. Wpisanie tu
     * `Date` bylo obietnica, ktorej nikt nie sprawdza — kompilator ja przyjmowal,
     * a `bookedAt.toISOString()` wybuchalo dopiero na produkcji. Konwersja jest
     * ponizej, jawna.
     *
     * `amount_minor` wraca jako `bigint`, bo sterownik jest tak skonfigurowany
     * (client.ts). Uwaga na przyszlosc: `SUM(bigint)` w Postgresie ma typ
     * `numeric` i wraca jako ciag znakow — kazde sumowanie potrzebuje jawnego
     * `::bigint`, tak jak w `spendingByCategory` ponizej.
     */
    const rows = await this.db.execute<{
      entry_id: bigint;
      transaction_id: string;
      kind: TransactionKind;
      title: string;
      counterparty_name: string | null;
      counterparty_iban: string | null;
      category: string | null;
      merchant: string | null;
      booked_at: string;
      amount_minor: bigint;
      currency: string;
    }>(sql`
      select le.id as entry_id,
             t.id as transaction_id,
             t.kind,
             t.title,
             t.counterparty_name,
             t.counterparty_iban,
             t.category,
             t.merchant,
             t.booked_at,
             le.amount_minor,
             le.currency
      from ledger_entries le
      join transactions t on t.id = le.transaction_id
      where ${sql.join(conditions, sql` and `)}
      order by le.id desc
      limit ${limit}
    `);

    const page = rows.slice(0, filter.limit);
    const nextCursor =
      rows.length > filter.limit ? (page.at(-1)?.entry_id.toString() ?? null) : null;

    const entriesByTransaction = await this.entriesForTransactions(
      page.map((row) => row.transaction_id),
    );

    const items: TransactionListItem[] = page.map((row) => ({
      id: transactionId(row.transaction_id),
      kind: row.kind,
      title: row.title,
      counterpartyName: row.counterparty_name,
      counterpartyIban: row.counterparty_iban?.trim() ?? null,
      category: row.category,
      merchant: row.merchant,
      bookedAt: new Date(row.booked_at),
      amount: money(row.amount_minor, assertCurrency(row.currency.trim())),
      entries: entriesByTransaction.get(row.transaction_id) ?? [],
    }));

    return { items, nextCursor };
  }

  /**
   * Zapisy wszystkich transakcji ze strony jednym zapytaniem.
   *
   * Wersja z zapytaniem na transakcje bylaby prostsza i dawalaby dwadziescia
   * zapytan na strone historii — klasyczne N+1, ktore na maszynie deweloperskiej
   * jest niewidoczne, a na produkcji przy trzydziestu milisekundach opoznienia
   * dodaje sekunde.
   */
  private async entriesForTransactions(
    ids: readonly string[],
  ): Promise<Map<string, TransactionListItem["entries"]>> {
    const grouped = new Map<string, TransactionListItem["entries"]>();

    if (ids.length === 0) {
      return grouped;
    }

    const rows = await this.db
      .select({
        transactionId: ledgerEntries.transactionId,
        accountId: ledgerEntries.accountId,
        accountName: accounts.displayName,
        amountMinor: ledgerEntries.amountMinor,
        currency: ledgerEntries.currency,
      })
      .from(ledgerEntries)
      .innerJoin(accounts, eq(accounts.id, ledgerEntries.accountId))
      // `inArray` buduje zapytanie z parametrami. Sklejanie identyfikatorow w
      // tekst zapytania dzialaloby tak samo, bo pochodza z bazy — ale zostawialoby
      // wzorzec, ktory ktos skopiuje w miejsce, gdzie dane pochodza od uzytkownika.
      .where(inArray(ledgerEntries.transactionId, [...ids]))
      .orderBy(asc(ledgerEntries.id));

    for (const row of rows) {
      const existing = grouped.get(row.transactionId) ?? [];

      grouped.set(row.transactionId, [
        ...existing,
        {
          accountId: accountId(row.accountId),
          accountName: row.accountName,
          amount: money(row.amountMinor, assertCurrency(row.currency.trim())),
        },
      ]);
    }

    return grouped;
  }

  async entriesOfTransaction(
    transaction: TransactionId,
  ): Promise<readonly LedgerEntryDraft[]> {
    const rows = await this.db
      .select({
        accountId: ledgerEntries.accountId,
        amountMinor: ledgerEntries.amountMinor,
        currency: ledgerEntries.currency,
      })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.transactionId, transaction))
      .orderBy(asc(ledgerEntries.id));

    return rows.map((row) => ({
      accountId: accountId(row.accountId),
      amount: money(row.amountMinor, assertCurrency(row.currency.trim())),
    }));
  }

  async spendingByCategory(
    user: UserId,
    months: number,
  ): Promise<readonly SpendingByCategory[]> {
    // Tylko obciazenia (kwota ujemna) i tylko konta tego uzytkownika. Przelewy
    // miedzy wlasnymi kontami maja kategorie "przelewy wlasne" i sa wykluczane z
    // analityki wydatkow — inaczej przesuniecie pieniedzy na oszczednosciowe
    // wygladaloby jak wydatek.
    const rows = await this.db.execute<{
      category: string;
      month: string;
      total: bigint;
      currency: string;
    }>(sql`
      select coalesce(t.category, 'inne') as category,
             to_char(date_trunc('month', t.booked_at), 'YYYY-MM') as month,
             sum(-le.amount_minor)::bigint as total,
             le.currency
      from ledger_entries le
      join transactions t on t.id = le.transaction_id
      join accounts a on a.id = le.account_id
      where a.user_id = ${user}::uuid
        and le.amount_minor < 0
        and coalesce(t.category, '') <> 'przelewy wlasne'
        and t.booked_at >= date_trunc('month', now()) - make_interval(months => ${months})
      group by 1, 2, 4
      order by 2 desc, 3 desc
    `);

    return rows.map((row) => ({
      category: row.category,
      month: row.month,
      total: money(row.total, assertCurrency(row.currency.trim())),
    }));
  }
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}
